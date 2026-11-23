import { AGENT_TEXT_LIMITS, AgentTextError, lexAgentText, textFail, type AgentTextLanguage, type TextDiagnostic, type TextToken } from "./text-lexer";
import { readProgramCondition } from "./block-condition";
import { validateProgram, type CodeBlock, type CodeProgram } from "./codebuilder";
import type { AgentCommand, AgentDirection } from "./agent";
export { AGENT_TEXT_LIMITS, type AgentTextLanguage, type TextDiagnostic } from "./text-lexer";
export type AgentTextResult = { ok: true; program: CodeProgram } | { ok: false; diagnostics: TextDiagnostic[] };
export interface AgentTextMetadata { name: string; trigger: CodeProgram["trigger"] }
const directions: Readonly<Record<string, AgentDirection>> = Object.freeze({ FORWARD: "forward", BACK: "back", LEFT: "left", RIGHT: "right", UP: "up", DOWN: "down" });
// Counter bindings are syntactic only. They cannot shadow any API/constant token or
// language keyword, including contextual/future reserved words in this strict subset.
const commonCounterNames = new Set(["agent", "AgentDetection", "TurnDirection", "FORWARD", "BACK", "LEFT", "RIGHT", "UP", "DOWN", "LEFT_TURN", "RIGHT_TURN", "Block", "BLOCK", "Redstone", "REDSTONE"]);
const keywordCounters: Readonly<Record<AgentTextLanguage, ReadonlySet<string>>> = {
  javascript: new Set("await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield async of get set using eval arguments undefined NaN Infinity".split(" ")),
  python: new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type range __debug__".split(" ")),
};
const plain = (v: unknown): v is object => typeof v === "object" && v !== null && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
function metadata(raw: unknown): AgentTextMetadata {
  const at = { line: 1, column: 1 };
  if (!plain(raw)) textFail(at, "Program metadata must supply a name and trigger", "metadata");
  const d = Object.getOwnPropertyDescriptors(raw);
  if (Reflect.ownKeys(d).length !== 2 || !d.name || !("value" in d.name) || !d.trigger || !("value" in d.trigger) ||
      typeof d.name.value !== "string" || !d.name.value.trim() || d.name.value.length > 80 || !plain(d.trigger.value)) textFail(at, "Invalid host-controlled program metadata", "metadata");
  const t = Object.getOwnPropertyDescriptors(d.trigger.value);
  if (!t.type || !("value" in t.type)) textFail(at, "Invalid host-controlled trigger", "metadata");
  if (t.type.value === "run" && Reflect.ownKeys(t).length === 1) return { name: d.name.value, trigger: { type: "run" } };
  if (t.type.value === "chat" && Reflect.ownKeys(t).length === 2 && t.command && "value" in t.command && typeof t.command.value === "string" && /^[a-z0-9_-]{1,32}$/.test(t.command.value)) return { name: d.name.value, trigger: { type: "chat", command: t.command.value } };
  return textFail(at, "Invalid host-controlled trigger", "metadata");
}
/** Parses only the documented body-only JS / four-space Python subset. It never evaluates source,
 * dispatches commands, imports code, grants inventory, saves text or exposes any host capability.
 * Unsupported tails fail the whole compilation: a partial program is never returned. */
export function compileAgentText(source: unknown, language: AgentTextLanguage, meta: AgentTextMetadata = { name: "Text program", trigger: { type: "run" } }): AgentTextResult {
  try {
    if (typeof source !== "string") textFail({ line: 1, column: 1 }, "Source must be text", "source");
    if (source.length > AGENT_TEXT_LIMITS.sourceBytes || new TextEncoder().encode(source).byteLength > AGENT_TEXT_LIMITS.sourceBytes) textFail({ line: 1, column: 1 }, "Source exceeds 16384 UTF-8 bytes", "limits");
    if (language !== "javascript" && language !== "python") textFail({ line: 1, column: 1 }, "Unsupported text language", "source");
    const nul = source.indexOf("\0");
    if (nul >= 0) { const prefix = source.slice(0, nul).split(/\r\n|\n|\r/); textFail({ line: prefix.length, column: prefix[prefix.length - 1].length + 1 }, "NUL is not supported in Agent text"); }
    const header = metadata(meta), parser = new TextParser(lexAgentText(source, language), language);
    const program: CodeProgram = { ...header, blocks: parser.parse() };
    const problems = validateProgram(program);
    if (problems.length) textFail(parser.location(), `Compiled program refused: ${problems[0]}`, "limits");
    return { ok: true, program };
  } catch (error) {
    return { ok: false, diagnostics: [error instanceof AgentTextError ? error.diagnostic : { line: 1, column: 1, endLine: 1, endColumn: 2, message: "Agent text could not be read", kind: "syntax" }] };
  }
}
class TextParser {
  private index = 0;
  private nodes = 0;
  private readonly counters = new Set<string>();
  constructor(private readonly tokens: TextToken[], private readonly language: AgentTextLanguage) {}
  location(): TextToken { return this.tokens[this.index]; }
  private take(value?: string, kind?: TextToken["kind"]): TextToken {
    const t = this.location();
    if ((value !== undefined && t.value !== value) || (kind !== undefined && t.kind !== kind)) textFail(t, `Expected ${value ?? kind}`);
    if (t.kind !== "eof") this.index++;
    return t;
  }
  private is(value: string): boolean { return this.location().value === value && this.location().kind !== "eof"; }
  private lines(): void { while (this.location().kind === "newline") this.take(); }
  private node<T extends CodeBlock>(block: T, at: TextToken): T {
    if (++this.nodes > AGENT_TEXT_LIMITS.nodes) textFail(at, "Compiled program exceeds 2000 blocks", "limits");
    return block;
  }
  parse(): CodeBlock[] { const blocks = this.list(0); this.take(undefined, "eof"); return blocks; }
  private list(depth: number, closing?: "}" | "dedent"): CodeBlock[] {
    if (depth > AGENT_TEXT_LIMITS.nesting) textFail(this.location(), "Text nesting exceeds four levels", "limits");
    const blocks: CodeBlock[] = []; this.lines();
    while (this.location().kind !== "eof" && !(closing === "}" && this.is("}")) && !(closing === "dedent" && this.location().kind === "dedent")) {
      blocks.push(...this.statement(depth)); this.lines();
    }
    return blocks;
  }
  private body(depth: number): CodeBlock[] {
    if (this.language === "javascript") { this.take("{"); const blocks = this.list(depth + 1, "}"); this.take("}"); return blocks; }
    this.take(":"); this.take(undefined, "newline"); this.take(undefined, "indent"); const blocks = this.list(depth + 1, "dedent"); this.take(undefined, "dedent"); return blocks;
  }
  private statement(depth: number): CodeBlock[] {
    const at = this.location();
    if (this.is("for")) return [this.forLoop(depth)];
    if (this.is("if")) {
      this.take("if"); if (this.language === "javascript") this.take("(");
      const condition = this.condition(); if (this.language === "javascript") this.take(")");
      const then = this.body(depth); this.lines(); let otherwise: CodeBlock[] = [];
      if (this.is("else")) { this.take("else"); otherwise = this.body(depth); }
      if("slot" in condition)return [this.node({type:"if-item-count",slot:condition.slot,equals:condition.equals,then,else:otherwise},at)];
      return [this.node({ type: "if", dir: condition.dir, ...(condition.name !== undefined ? { condition: { type: "block-is", name: condition.name } } : {}), then, else: otherwise }, at)];
    }
    if (!this.is("agent")) textFail(at, "Unsupported statement; only Agent commands, finite for and if/else are supported");
    this.take("agent"); this.take("."); const method = this.take(undefined, "id"); this.take("("); const commands: AgentCommand[] = [];
    if (method.value === (this.language === "javascript" ? "teleportToPlayer" : "teleport_to_player")) {
      this.take(")"); commands.push({op:"teleport-to-player"});
    } else if (method.value === "move") {
      const dir = this.direction(); this.take(","); const count = this.integer(0, 100); this.take(")");
      for (let i = 0; i < count; i++) commands.push({ op: "move", dir });
    } else if (method.value === "place" || method.value === "destroy" || method.value === "till") {
      const dir = this.direction(); this.take(")"); commands.push({ op: method.value, dir });
    } else if (method.value === "turn") {
      let side: "left" | "right";
      if (this.language === "python") { this.take("TurnDirection"); this.take("."); const t = this.take(undefined, "id"); if (t.value !== "LEFT" && t.value !== "RIGHT") textFail(t, "Expected TurnDirection.LEFT or RIGHT"); side = t.value === "LEFT" ? "left" : "right"; }
      else { const t = this.take(undefined, "id"); if (t.value !== "LEFT_TURN" && t.value !== "RIGHT_TURN") textFail(t, "Expected LEFT_TURN or RIGHT_TURN"); side = t.value === "LEFT_TURN" ? "left" : "right"; }
      this.take(")"); commands.push({ op: "turn", side });
    } else if (method.value === "transfer") {
      const quantity=this.integer(1,Number.MAX_SAFE_INTEGER);this.take(",");const source=this.integer(1,27);this.take(",");const destination=this.integer(1,27);this.take(")");
      commands.push({op:"transfer",quantity,sourceSlot:source-1,destinationSlot:destination-1});
    } else if (method.value === (this.language === "javascript" ? "setSlot" : "set_slot")) {
      const slot = this.integer(1, 27); this.take(")"); commands.push({ op: "select", slot: slot - 1 });
    } else textFail(method, "Unsupported Agent method in this text subset");
    this.endCommand(); return commands.map(cmd => this.node({ type: "command", cmd }, at));
  }
  private direction(): AgentDirection {
    const t = this.take(undefined, "id"); const value = Object.prototype.hasOwnProperty.call(directions, t.value) ? directions[t.value] : undefined;
    if (!value) textFail(t, "Expected FORWARD, BACK, LEFT, RIGHT, UP or DOWN"); return value;
  }
  private integer(min: number, max: number): number {
    const t = this.take(undefined, "number");
    if (!/^(0|[1-9][0-9]*)$/.test(t.value)) textFail(t, "Expected a decimal integer literal");
    const value = Number(t.value); if (!Number.isSafeInteger(value) || value < min || value > max) textFail(t, `Integer literal must be ${min}-${max}`, "limits"); return value;
  }
  private endCommand(): void {
    if (this.language === "javascript" && this.is(";")) { this.take(";"); return; }
    if (this.location().kind === "newline") { this.take(); return; }
    if (this.language === "javascript" && (this.is("}") || this.location().kind === "eof")) return;
    textFail(this.location(), this.language === "python" ? "Expected end of Python line" : "Expected semicolon or line ending");
  }
  private condition(): { dir: AgentDirection; name?: string } | {slot:number;equals:number} {
    this.take("agent"); this.take("."); const method = this.take(undefined, "id"); this.take("(");
    if(method.value===(this.language==="javascript"?"getItemCount":"get_item_count")){
      const slot=this.integer(1,27);this.take(")");this.take(this.language==="javascript"?"===":"==");const equals=this.integer(0,Number.MAX_SAFE_INTEGER);return{slot:slot-1,equals};
    }
    if (method.value === "detect") {
      this.take("AgentDetection"); this.take("."); this.take(this.language === "javascript" ? "Block" : "BLOCK"); this.take(","); const dir = this.direction(); this.take(")"); return { dir };
    }
    if (method.value === (this.language === "javascript" ? "blockIs" : "block_is")) {
      const name = this.take(undefined, "string");
      if (readProgramCondition({ condition: { type: "block-is", name: name.value } }).kind !== "named") textFail(name, "Unknown exact application block name");
      this.take(","); const dir = this.direction(); this.take(")"); return { dir, name: name.value };
    }
    return textFail(method, "Expected detect or the application-specific exact-block predicate");
  }
  private forLoop(depth: number): CodeBlock {
    const at = this.take("for"); let counter: TextToken, times: number;
    if (this.language === "javascript") {
      this.take("("); this.take("let"); counter = this.take(undefined, "id"); this.take("="); this.integer(0, 0); this.take(";"); this.take(counter.value, "id");
      const compare = this.take(); if (compare.value !== "<" && compare.value !== "<=") textFail(compare, "Expected < or <= with a finite literal bound");
      times = this.integer(0, compare.value === "<=" ? 99 : 100) + (compare.value === "<=" ? 1 : 0); this.take(";"); this.take(counter.value, "id"); this.take("++"); this.take(")");
    } else {
      counter = this.take(undefined, "id"); this.take("in"); this.take("range"); this.take("("); times = this.integer(0, 100); this.take(")");
    }
    if (commonCounterNames.has(counter.value) || keywordCounters[this.language].has(counter.value) || this.counters.has(counter.value)) textFail(counter, "Loop counters must be distinct, nonreserved header-only identifiers");
    this.counters.add(counter.value); let body: CodeBlock[];
    try { body = this.body(depth); } finally { this.counters.delete(counter.value); }
    return this.node({ type: "repeat", times, body }, at);
  }
}
