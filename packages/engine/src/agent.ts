/**
 * Education Edition Agent: a small robot that belongs to the player and runs Code Builder
 * commands one at a time. It occupies one block cell, flies (doesn't fall), can't pass through
 * solid blocks, carries a 27-slot inventory, and obeys Allow/Deny/Border like a survival player
 * (it can't build or break in Deny areas).
 */
import { AIR, BLOCKS, blockById, isSolid } from "./blocks";
import { FACING_DIRS } from "./chalkboard";
import type { ItemStack } from "./inventory";
import { dropCount, dropOf, isItem } from "./items";
import { WORLD_HEIGHT } from "./chunk";
import { canBreak, canBuildAt } from "./rules";
import type { World } from "./world";

export const AGENT_SLOTS = 27;

export type AgentDirection = "forward" | "back" | "left" | "right" | "up" | "down";
export const AGENT_DIRECTIONS: readonly AgentDirection[] = ["forward", "back", "left", "right", "up", "down"];

export type AgentCommand =
  | { op: "move"; dir: AgentDirection }
  | { op: "turn"; side: "left" | "right" }
  | { op: "place"; dir: AgentDirection }
  | { op: "destroy"; dir: AgentDirection }
  | { op: "detect"; dir: AgentDirection }
  | { op: "inspect"; dir: AgentDirection }
  | { op: "attack"; dir: AgentDirection }
  | { op: "select"; slot: number }
  | { op: "drop"; slot: number }
  | { op: "collect" };

export interface AgentState {
  x: number;
  y: number;
  z: number;
  /** Index into FACING_DIRS (0 = +Z, 1 = -X, 2 = -Z, 3 = +X). */
  facing: number;
  slots: (ItemStack | null)[];
  /** Selected slot (0-26) used for placing. */
  selected: number;
}

export interface AgentResult {
  ok: boolean;
  /** detect: whether a solid block is there; inspect: the block's name. */
  value?: boolean | string;
  message?: string;
}

/** Hooks into the game for commands that touch mobs or the player. */
export interface AgentEnv {
  /** Hits a mob in the cell; returns true if one was there. */
  attack?(x: number, y: number, z: number): boolean;
  /** Hands a stack to the player (the Agent's "drop"); returns how many didn't fit. */
  giveToPlayer?(stack: ItemStack): number;
}

export function createAgent(x: number, y: number, z: number, facing = 2): AgentState {
  return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), facing, slots: new Array(AGENT_SLOTS).fill(null), selected: 0 };
}

/** World-space step for a direction relative to the Agent's facing. */
export function agentStep(agent: AgentState, dir: AgentDirection): readonly [number, number, number] {
  const [fx, fz] = FACING_DIRS[agent.facing];
  switch (dir) {
    case "forward": return [fx, 0, fz];
    case "back": return [-fx, 0, -fz];
    // Looking along (fx, fz), the right-hand side is (-fz, fx).
    case "right": return [-fz, 0, fx];
    case "left": return [fz, 0, -fx];
    case "up": return [0, 1, 0];
    case "down": return [0, -1, 0];
  }
}

function addToAgent(agent: AgentState, id: number, count: number): number {
  let left = count;
  for (const s of agent.slots) if (left > 0 && s && s.id === id && s.count < 64) {
    const n = Math.min(64 - s.count, left);
    s.count += n;
    left -= n;
  }
  for (let i = 0; i < agent.slots.length && left > 0; i++) if (!agent.slots[i]) {
    const n = Math.min(64, left);
    agent.slots[i] = { id, count: n };
    left -= n;
  }
  return left;
}

/** Executes one Agent command against the world. */
export function runAgentCommand(world: World, agent: AgentState, cmd: AgentCommand, env: AgentEnv = {}): AgentResult {
  const target = (dir: AgentDirection) => {
    const [dx, dy, dz] = agentStep(agent, dir);
    return { x: agent.x + dx, y: agent.y + dy, z: agent.z + dz };
  };
  switch (cmd.op) {
    case "move": {
      const t = target(cmd.dir);
      if (t.y < 0 || t.y >= WORLD_HEIGHT) return { ok: false, message: "Can't move out of the world" };
      if (isSolid(world.getBlock(t.x, t.y, t.z))) return { ok: false, message: "Blocked" };
      agent.x = t.x;
      agent.y = t.y;
      agent.z = t.z;
      return { ok: true };
    }
    case "turn":
      agent.facing = (agent.facing + (cmd.side === "left" ? 3 : 1)) % 4;
      return { ok: true };
    case "place": {
      const t = target(cmd.dir);
      const here = world.getBlock(t.x, t.y, t.z);
      if (here !== AIR && !BLOCKS[here].needsSupport && BLOCKS[here].shape !== "liquid") return { ok: false, message: "Something is in the way" };
      const stack = agent.slots[agent.selected];
      if (!stack || isItem(stack.id)) return { ok: false, message: "No block in the selected slot" };
      // Education Edition: the Agent obeys Allow/Deny like a survival player.
      if (!canBuildAt(world, "survival", t.x, t.y, t.z)) return { ok: false, message: "Building isn't allowed here (Deny)" };
      world.setBlock(t.x, t.y, t.z, stack.id);
      stack.count--;
      if (stack.count <= 0) agent.slots[agent.selected] = null;
      return { ok: true };
    }
    case "destroy": {
      const t = target(cmd.dir);
      const id = world.getBlock(t.x, t.y, t.z);
      if (id === AIR) return { ok: false, message: "Nothing to destroy" };
      if (!canBreak(world, "survival", t.x, t.y, t.z)) return { ok: false, message: "Can't destroy that here" };
      world.setBlock(t.x, t.y, t.z, AIR);
      // The Agent collects what it destroys (Education Edition).
      addToAgent(agent, dropOf(id), dropCount(id));
      return { ok: true };
    }
    case "detect": {
      const t = target(cmd.dir);
      return { ok: true, value: isSolid(world.getBlock(t.x, t.y, t.z)) };
    }
    case "inspect": {
      const t = target(cmd.dir);
      return { ok: true, value: blockById(world.getBlock(t.x, t.y, t.z)).name };
    }
    case "attack": {
      const t = target(cmd.dir);
      return env.attack?.(t.x, t.y, t.z) ? { ok: true } : { ok: false, message: "Nothing to attack" };
    }
    case "select":
      if (!Number.isInteger(cmd.slot) || cmd.slot < 0 || cmd.slot >= AGENT_SLOTS) return { ok: false, message: "Slot must be 1-27" };
      agent.selected = cmd.slot;
      return { ok: true };
    case "drop": {
      const stack = agent.slots[cmd.slot];
      if (!stack) return { ok: false, message: "That slot is empty" };
      if (!env.giveToPlayer) return { ok: false, message: "No player to give it to" };
      const left = env.giveToPlayer({ ...stack });
      agent.slots[cmd.slot] = left > 0 ? { ...stack, count: left } : null;
      return { ok: true };
    }
    case "collect":
      // Items never lie on the ground in this game (drops go straight to an inventory).
      return { ok: true, value: false, message: "Nothing to collect" };
    default:
      // Never reached for validated programs; still a defined result for anything else.
      return { ok: false, message: "Unknown command" };
  }
}

/** Gives the Agent items (e.g. the player hands it building blocks). */
export function giveAgent(agent: AgentState, id: number, count: number): number {
  return addToAgent(agent, id, count);
}

