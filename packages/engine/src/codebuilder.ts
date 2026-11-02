/**
 * Code Builder (block mode): programs are trees of command blocks and `repeat N` loops, started by
 * "run" or by a chat command. A runner walks the tree with an explicit stack, yielding one Agent
 * command at a time, so the game can animate each step and Stop can interrupt at any point.
 */
import { AGENT_DIRECTIONS, type AgentCommand, type AgentDirection } from "./agent";

/**
 * Program blocks: Agent commands; `repeat N`; `if <Agent detects a block in DIR> then .. else ..`;
 * and `repeat until <Agent detects a block in DIR>`.
 */
export type CodeBlock =
  | { type: "command"; cmd: AgentCommand }
  | { type: "repeat"; times: number; body: CodeBlock[] }
  | { type: "if"; dir: AgentDirection; then: CodeBlock[]; else: CodeBlock[] }
  | { type: "until"; dir: AgentDirection; body: CodeBlock[] };

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
  until?: AgentDirection;
}

/** Answers "does the Agent detect a (solid) block in this direction?" at the moment it's asked. */
export type DetectFn = (dir: AgentDirection) => boolean;

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
  constructor(program: CodeProgram, readonly stepLimit = DEFAULT_STEP_LIMIT, private readonly detect: DetectFn = () => false) {
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

  /** The next Agent command, or null when finished, stopped or failed. */
  next(): AgentCommand | null {
    while (!this.done) {
      const top = this.stack[this.stack.length - 1];
      if (top.index >= top.blocks.length) {
        if (top.until !== undefined) {
          if (!this.count()) return null;
          if (this.detect(top.until)) this.stack.pop();
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
      if (block.type === "if") {
        if (!this.count()) return null;
        const branch = this.detect(block.dir) ? block.then : block.else;
        if (branch.length > 0) this.stack.push({ blocks: branch, index: 0, remaining: 1 });
        continue;
      }
      if (block.type === "until") {
        if (!this.count()) return null;
        if (!this.detect(block.dir)) this.stack.push({ blocks: block.body, index: 0, remaining: Infinity, until: block.dir });
        continue;
      }
      if (!this.count()) return null;
      return block.cmd;
    }
    return null;
  }
}

const OPS: Record<string, (c: Record<string, unknown>) => boolean> = {
  move: (c) => AGENT_DIRECTIONS.includes(c.dir as AgentDirection),
  place: (c) => AGENT_DIRECTIONS.includes(c.dir as AgentDirection),
  destroy: (c) => AGENT_DIRECTIONS.includes(c.dir as AgentDirection),
  detect: (c) => AGENT_DIRECTIONS.includes(c.dir as AgentDirection),
  inspect: (c) => AGENT_DIRECTIONS.includes(c.dir as AgentDirection),
  attack: (c) => AGENT_DIRECTIONS.includes(c.dir as AgentDirection),
  turn: (c) => c.side === "left" || c.side === "right",
  select: (c) => Number.isInteger(c.slot) && (c.slot as number) >= 0 && (c.slot as number) < 27,
  drop: (c) => Number.isInteger(c.slot) && (c.slot as number) >= 0 && (c.slot as number) < 27,
  collect: () => true,
};

/**
 * Checks a program's structure (from the editor, a save or anywhere else) defensively, and returns
 * a list of problems (empty = valid). Never throws, whatever the input.
 */
export function validateProgram(p: unknown): string[] {
  const problems: string[] = [];
  const prog = p as Partial<CodeProgram> | null;
  if (!prog || typeof prog !== "object") return ["Not a program"];
  if (typeof prog.name !== "string") problems.push("Missing program name");
  const t = prog.trigger as { type?: unknown; command?: unknown } | undefined;
  if (!t || (t.type !== "run" && !(t.type === "chat" && typeof t.command === "string" && t.command.length > 0))) problems.push("Invalid trigger");
  const dirOk = (d: unknown) => AGENT_DIRECTIONS.includes(d as AgentDirection);
  const visit = (blocks: unknown, depth: number): void => {
    if (!Array.isArray(blocks)) {
      problems.push("Blocks must be a list");
      return;
    }
    if (depth > MAX_NESTING) {
      problems.push(`Loops and ifs can be nested at most ${MAX_NESTING} deep`);
      return;
    }
    for (const raw of blocks) {
      const b = raw as Record<string, unknown> | null;
      if (!b || typeof b !== "object") problems.push("Invalid block");
      else if (b.type === "repeat") {
        if (!(typeof b.times === "number" && b.times >= 0 && b.times <= MAX_REPEAT)) problems.push(`repeat must be 0-${MAX_REPEAT}`);
        visit(b.body, depth + 1);
      } else if (b.type === "if") {
        if (!dirOk(b.dir)) problems.push(`Unknown direction ${String(b.dir)}`);
        visit(b.then, depth + 1);
        visit(b.else, depth + 1);
      } else if (b.type === "until") {
        if (!dirOk(b.dir)) problems.push(`Unknown direction ${String(b.dir)}`);
        visit(b.body, depth + 1);
      } else if (b.type === "command") {
        const c = b.cmd as Record<string, unknown> | null;
        const check = c && typeof c === "object" ? OPS[String(c.op)] : undefined;
        if (!check) problems.push(`Unknown command ${String(c?.op)}`);
        else if (!check(c!)) problems.push(c!.dir !== undefined && !dirOk(c!.dir) ? `Unknown direction ${String(c!.dir)}` : `Invalid ${String(c!.op)} parameters`);
      } else problems.push(`Unknown block ${String(b.type)}`);
    }
  };
  visit(prog.blocks, 0);
  return problems;
}

/** Loads programs from a save: keeps the valid ones and reports the ones dropped. */
export function loadPrograms(raw: unknown): { programs: CodeProgram[]; errors: string[] } {
  if (!Array.isArray(raw)) return { programs: [], errors: raw === undefined ? [] : ["Saved programs were not a list"] };
  const programs: CodeProgram[] = [];
  const errors: string[] = [];
  raw.forEach((p, i) => {
    const problems = validateProgram(p);
    if (problems.length === 0) programs.push(p as CodeProgram);
    else errors.push(`Program ${i + 1}${typeof (p as { name?: unknown })?.name === "string" ? ` "${(p as CodeProgram).name}"` : ""}: ${problems[0]}`);
  });
  return { programs, errors };
}

/** Every run path goes through here: a runner for a valid program, or the reason it can't run. */
export function startProgram(program: unknown, stepLimit = DEFAULT_STEP_LIMIT, detect?: DetectFn): { runner: ProgramRunner } | { error: string } {
  const problems = validateProgram(program);
  if (problems.length > 0) return { error: problems[0] };
  return { runner: new ProgramRunner(program as CodeProgram, stepLimit, detect) };
}
