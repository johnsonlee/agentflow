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
export const DEFAULT_STEP_LIMIT = 500;

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
        if (top.remaining > 0) top.index = 0;
        else this.stack.pop();
        continue;
      }
      const block = top.blocks[top.index++];
      if (block.type === "repeat") {
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

/** Checks a program's structure (e.g. one loaded from a save) and returns a list of problems. */
export function validateProgram(p: CodeProgram): string[] {
  const problems: string[] = [];
  const visit = (blocks: CodeBlock[], depth: number) => {
    if (depth > 8) problems.push("Loops are nested too deeply");
    for (const b of blocks) {
      if (b.type === "repeat") {
        if (!(b.times >= 0 && b.times <= MAX_REPEAT)) problems.push(`repeat must be 0-${MAX_REPEAT}`);
        visit(b.body, depth + 1);
      } else if (b.type === "if") {
        if (!AGENT_DIRECTIONS.includes(b.dir)) problems.push(`Unknown direction ${String(b.dir)}`);
        visit(b.then, depth + 1);
        visit(b.else, depth + 1);
      } else if (b.type === "until") {
        if (!AGENT_DIRECTIONS.includes(b.dir)) problems.push(`Unknown direction ${String(b.dir)}`);
        visit(b.body, depth + 1);
      } else if ("dir" in b.cmd && !AGENT_DIRECTIONS.includes(b.cmd.dir)) problems.push(`Unknown direction ${String(b.cmd.dir)}`);
    }
  };
  visit(p.blocks, 0);
  return problems;
}
