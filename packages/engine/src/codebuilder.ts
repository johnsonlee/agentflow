/**
 * Code Builder (block mode): programs are trees of command blocks and `repeat N` loops, started by
 * "run" or by a chat command. A runner walks the tree with an explicit stack, yielding one Agent
 * command at a time, so the game can animate each step and Stop can interrupt at any point.
 */
import { AGENT_DIRECTIONS, type AgentCommand } from "./agent";

export type CodeBlock = { type: "command"; cmd: AgentCommand } | { type: "repeat"; times: number; body: CodeBlock[] };

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
}

export class ProgramRunner {
  private readonly stack: Frame[];
  steps = 0;
  stopped = false;
  error: string | null = null;

  constructor(program: CodeProgram, readonly stepLimit = DEFAULT_STEP_LIMIT) {
    this.stack = [{ blocks: program.blocks, index: 0, remaining: 1 }];
  }

  get done(): boolean {
    return this.stopped || this.error !== null || this.stack.length === 0;
  }

  stop(): void {
    this.stopped = true;
  }

  /** The next Agent command, or null when finished, stopped or failed. */
  next(): AgentCommand | null {
    while (!this.done) {
      const top = this.stack[this.stack.length - 1];
      if (top.index >= top.blocks.length) {
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
      this.steps++;
      if (this.steps > this.stepLimit) {
        this.error = `Stopped: more than ${this.stepLimit} steps`;
        return null;
      }
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
      } else if ("dir" in b.cmd && !AGENT_DIRECTIONS.includes(b.cmd.dir)) problems.push(`Unknown direction ${String(b.cmd.dir)}`);
    }
  };
  visit(p.blocks, 0);
  return problems;
}
