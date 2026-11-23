import { readProgramCondition, type BlockCondition } from "./block-condition";
import { isKnownId } from "../catalog/items";
/**
 * Code Builder (block mode): programs are trees of command blocks and `repeat N` loops, started by
 * "run" or by a chat command. A runner walks the tree with an explicit stack, yielding one Agent
 * command at a time, so the game can animate each step and Stop can interrupt at any point.
 */
import { AGENT_DIRECTIONS, type AgentCommand, type AgentDirection } from "./agent";

/**
 * Program blocks: Agent commands; `repeat N`; `if <Agent detects a block in DIR> then .. else ..`;
 * and `repeat until <Agent detects a block in DIR>`. An optional named condition compares
 * exact application block states; absent means the original any-solid predicate.
 */
export type CodeBlock =
  | { type: "command"; cmd: AgentCommand }
  | { type: "repeat"; times: number; body: CodeBlock[] }
  | { type: "if-item-count"; slot:number; equals:number; then:CodeBlock[]; else:CodeBlock[] }
  | { type: "if-item-space"; slot:number; equals:number; then:CodeBlock[]; else:CodeBlock[] }
  | { type: "if"; dir: AgentDirection; condition?: BlockCondition; then: CodeBlock[]; else: CodeBlock[] }
  | { type: "until"; dir: AgentDirection; condition?: BlockCondition; body: CodeBlock[] };

export interface CodeProgram {
  name: string;
  /** "run" (the Run button) or a chat command word that starts it, e.g. "build" for "build". */
  trigger: { type: "run" } | { type: "chat"; command: string };
  blocks: CodeBlock[];
}

export const MAX_REPEAT = 100;
/** Maximum nesting of loops / if blocks. */
export const MAX_NESTING = 4;
/**
 * Steps a program may take. Every unit of interpreter work counts: Agent commands, condition
 * checks, loop iterations and blocks entered, so total work, and the work done inside any single
 * next() call, is bounded by this.
 */
export const DEFAULT_STEP_LIMIT = 1000;

interface Frame {
  blocks: CodeBlock[];
  index: number;
  remaining: number;
  /** repeat-until: loop until the Agent detects a block in this direction. */
  until?: { dir: AgentDirection; condition?: BlockCondition };
}

/** Answers "does the Agent detect a (solid) block in this direction?" at the moment it's asked. */
export type DetectFn = (dir: AgentDirection) => boolean;
/** Undefined means the target cannot be inspected (unloaded, outside the world or unavailable). */
export type InspectBlockFn = (dir: AgentDirection) => string | undefined;

export type ItemCountFn = (slot:number) => number | undefined;
export type ItemSpaceFn = (slot:number) => number | undefined;

export class ProgramRunner {
  private readonly stack: Frame[];
  steps = 0;
  stopped = false;
  error: string | null = null;

  /**
   * `detect` is called when a condition is reached, after all earlier commands have run, so it
   * sees the current world. Every condition check counts towards `stepLimit` too, so a
   * repeat-until that never becomes true still ends.
   */
  constructor(program: CodeProgram, readonly stepLimit = DEFAULT_STEP_LIMIT, private readonly detect: DetectFn = () => false, private readonly inspect?: InspectBlockFn, private readonly itemCount?:ItemCountFn, private readonly itemSpace?:ItemSpaceFn) {
    this.stack = [{ blocks: program.blocks, index: 0, remaining: 1 }];
  }

  get done(): boolean {
    return this.stopped || this.error !== null || this.stack.length === 0;
  }

  stop(): void {
    this.stopped = true;
  }

  /** Counts a step; false (with an error) once the limit is exceeded. */
  private count(): boolean {
    this.steps++;
    if (this.steps <= this.stepLimit) return true;
    this.error = `Stopped: more than ${this.stepLimit} steps`;
    return false;
  }

  private matches(block: { dir: AgentDirection; condition?: BlockCondition }): boolean | null {
    const condition = readProgramCondition(block);
    if (condition.kind === "invalid") { this.error = "Stopped: invalid block condition"; return null; }
    if (condition.kind === "legacy") return this.detect(block.dir);
    const name = this.inspect?.(block.dir);
    if (name === undefined) { this.error = "Stopped: load the Agent's target before inspecting a specific block"; return null; }
    return name === condition.name;
  }

  /** The next Agent command, or null when finished, stopped or failed. */
  next(): AgentCommand | null {
    while (!this.done) {
      const top = this.stack[this.stack.length - 1];
      if (top.index >= top.blocks.length) {
        if (top.until !== undefined) {
          if (!this.count()) return null;
          const match = this.matches(top.until);
          if (match === null) return null;
          if (match) this.stack.pop();
          else top.index = 0;
          continue;
        }
        top.remaining--;
        if (top.remaining > 0) {
          // Each loop iteration is a step, so nested loops can't spin without counting.
          if (!this.count()) return null;
          top.index = 0;
        } else this.stack.pop();
        continue;
      }
      const block = top.blocks[top.index++];
      if (block.type === "repeat") {
        if (!this.count()) return null;
        const times = Math.max(0, Math.min(MAX_REPEAT, Math.floor(block.times)));
        if (times > 0 && block.body.length > 0) this.stack.push({ blocks: block.body, index: 0, remaining: times });
        continue;
      }
      if (block.type === "if-item-count" || block.type === "if-item-space") {
        if(!this.count())return null;
        const space=block.type==='if-item-space';
        let value:number|undefined;try{value=(space?this.itemSpace:this.itemCount)?.(block.slot);}catch{value=undefined;}
        if(this.stopped||this.error!==null)return null;
        if(!Number.isSafeInteger(value)||value!<0){this.error=`Stopped: Agent item ${space?'space':'count'} unavailable`;return null;}
        const branch=value===block.equals?block.then:block.else;
        if(branch.length)this.stack.push({blocks:branch,index:0,remaining:1});
        continue;
      }
      if (block.type === "if") {
        if (!this.count()) return null;
        const match = this.matches(block);
        if (match === null) return null;
        const branch = match ? block.then : block.else;
        if (branch.length > 0) this.stack.push({ blocks: branch, index: 0, remaining: 1 });
        continue;
      }
      if (block.type === "until") {
        if (!this.count()) return null;
        const match = this.matches(block);
        if (match === null) return null;
        if (!match) {
          const condition = readProgramCondition(block);
          if (condition.kind === "invalid") { this.error = "Stopped: invalid block condition"; return null; }
          const until = condition.kind === "named" ? { dir: block.dir, condition: { type: "block-is" as const, name: condition.name } } : { dir: block.dir };
          this.stack.push({ blocks: block.body, index: 0, remaining: Infinity, until });
        }
        continue;
      }
      if (!this.count()) return null;
      return block.cmd;
    }
    return null;
  }
}

const isDir = (d: unknown): d is AgentDirection => typeof d === "string" && (AGENT_DIRECTIONS as readonly string[]).includes(d);
const isSlot = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 27;
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
/** Own (not inherited) property, so names like "constructor" or "__proto__" never resolve. */
const own = (o: Record<string, unknown>, key: string): unknown => ((() => {const d=Object.getOwnPropertyDescriptor(o,key);return d&&"value"in d?d.value:undefined;})());

/** Allowed Agent commands and their parameter checks (a Map: no prototype keys). */
const OPS = new Map<string, (c: Record<string, unknown>) => boolean>([
  ["teleport-to-player",c=>Reflect.ownKeys(c).length===1&&Object.getOwnPropertyDescriptor(c,"op")?.value==="teleport-to-player"],
  ["move", (c) => isDir(own(c, "dir"))],
  ["place", (c) => isDir(own(c, "dir"))],
  ["till", (c) => isDir(own(c, "dir"))],
  ["destroy", (c) => isDir(own(c, "dir"))],
  ["detect", (c) => isDir(own(c, "dir"))],
  ["inspect", (c) => isDir(own(c, "dir"))],
  ["attack", (c) => isDir(own(c, "dir"))],
  ["turn", (c) => own(c, "side") === "left" || own(c, "side") === "right"],
  ["transfer",(c)=>Number.isSafeInteger(own(c,"quantity"))&&(own(c,"quantity") as number)>0&&isSlot(own(c,"sourceSlot"))&&isSlot(own(c,"destinationSlot"))],
  ["select", (c) => isSlot(own(c, "slot"))],
  ["drop", (c) => isSlot(own(c, "slot")) && (own(c, "dir") === undefined || isDir(own(c, "dir"))) && (own(c, "quantity") === undefined || (Number.isSafeInteger(own(c, "quantity")) && (own(c, "quantity") as number) > 0))],
  ["collect", (c) => own(c, "filterId") === undefined || (typeof own(c, "filterId") === "number" && isKnownId(own(c, "filterId") as number))],
]);

/**
 * Checks a program's structure (from the editor, a save or anywhere else) with strict, own-property
 * type checks, and returns a list of problems (empty = valid). Total: never throws, whatever the input.
 */
export function validateProgram(p: unknown): string[] {
  try {
    return checkProgram(p);
  } catch {
    return ["Not a valid program"];
  }
}

function checkProgram(p: unknown): string[] {
  const problems: string[] = [];
  if (!isPlainObject(p)) return ["Not a program"];
  if (typeof own(p, "name") !== "string") problems.push("Missing program name");
  const t = own(p, "trigger");
  const tType = isPlainObject(t) ? own(t, "type") : undefined;
  const tCommand = isPlainObject(t) ? own(t, "command") : undefined;
  if (!(tType === "run" || (tType === "chat" && typeof tCommand === "string" && /^[a-z0-9_-]{1,32}$/.test(tCommand)))) problems.push("Invalid trigger");
  let count = 0;
  const visit = (blocks: unknown, depth: number): void => {
    if (!Array.isArray(blocks)) {
      problems.push("Blocks must be a list");
      return;
    }
    if (depth > MAX_NESTING) {
      problems.push(`Loops and ifs can be nested at most ${MAX_NESTING} deep`);
      return;
    }
    for (const b of blocks) {
      if (++count > 2000) {
        problems.push("Too many blocks");
        return;
      }
      if (!isPlainObject(b)) {
        problems.push("Invalid block");
        continue;
      }
      const type = own(b, "type");
      if (type === "repeat") {
        const times = own(b, "times");
        if (!(typeof times === "number" && Number.isInteger(times) && times >= 0 && times <= MAX_REPEAT)) problems.push(`repeat must be 0-${MAX_REPEAT}`);
        visit(own(b, "body"), depth + 1);
      } else if (type === "if-item-count" || type === "if-item-space") {
        const descriptors=Object.getOwnPropertyDescriptors(b);
        const fields=['type','slot','equals','then','else'];
        if(Reflect.ownKeys(descriptors).length!==fields.length||fields.some(key=>!descriptors[key]||!('value'in descriptors[key]))) {problems.push(`Invalid ${type.slice(3)} condition fields`);continue;}
        if(!isSlot(own(b,'slot'))||!Number.isSafeInteger(own(b,'equals'))||(own(b,'equals') as number)<0)problems.push(`Invalid ${type.slice(3)} slot or equality`);
        visit(own(b,'then'),depth+1);visit(own(b,'else'),depth+1);
      } else if (type === "if") {
        if (!isDir(own(b, "dir"))) problems.push(`Unknown direction ${String(own(b, "dir"))}`);
        if (readProgramCondition(b).kind === "invalid") problems.push("Invalid specific block condition");
        visit(own(b, "then"), depth + 1);
        visit(own(b, "else"), depth + 1);
      } else if (type === "until") {
        if (!isDir(own(b, "dir"))) problems.push(`Unknown direction ${String(own(b, "dir"))}`);
        if (readProgramCondition(b).kind === "invalid") problems.push("Invalid specific block condition");
        visit(own(b, "body"), depth + 1);
      } else if (type === "command") {
        const c = own(b, "cmd");
        const op = isPlainObject(c) ? own(c, "op") : undefined;
        const check = typeof op === "string" ? OPS.get(op) : undefined;
        if (!isPlainObject(c) || !check) problems.push(`Unknown command ${typeof op === "string" ? op : String(typeof op)}`);
        else if (!check(c)) {
          const dir = own(c, "dir");
          problems.push(dir !== undefined && !isDir(dir) ? `Unknown direction ${String(dir)}` : `Invalid ${op} parameters`);
        }
      } else problems.push(`Unknown block ${typeof type === "string" ? type : String(typeof type)}`);
    }
  };
  visit(own(p, "blocks"), 0);
  return problems;
}

/** Loads programs from a save: keeps the valid ones and reports the ones dropped. */
export function loadPrograms(raw: unknown): { programs: CodeProgram[]; errors: string[] } {
  try {
    if (!Array.isArray(raw)) return { programs: [], errors: raw === undefined ? [] : ["Saved programs were not a list"] };
    const programs: CodeProgram[] = [];
    const errors: string[] = [];
    raw.forEach((p, i) => {
      const problems = validateProgram(p);
      if (problems.length === 0) programs.push(p as CodeProgram);
      else {
        const name = isPlainObject(p) && typeof own(p, "name") === "string" ? ` "${own(p, "name") as string}"` : "";
        errors.push(`Program ${i + 1}${name}: ${problems[0]}`);
      }
    });
    return { programs, errors };
  } catch {
    return { programs: [], errors: ["Saved programs could not be read"] };
  }
}

/** Every run path goes through here: a runner for a valid program, or the reason it can't run. */
export function startProgram(program: unknown, stepLimit = DEFAULT_STEP_LIMIT, detect?: DetectFn, inspect?: InspectBlockFn, itemCount?:ItemCountFn, itemSpace?:ItemSpaceFn): { runner: ProgramRunner } | { error: string } {
  const problems = validateProgram(program);
  if (problems.length > 0) return { error: problems[0] };
  return { runner: new ProgramRunner(program as CodeProgram, stepLimit, detect, inspect, itemCount, itemSpace) };
}
