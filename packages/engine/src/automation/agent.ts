import {writablePlacementCell,placementCellsWithinWorld}from"../world/placement-bounds";
import {hayAxisOf,hayPlacementId} from "../catalog/hay-block";
import {inspectCaneItemOwner} from '../ownership/cane-items';
import {SUGAR_CANE_ITEM_ID} from '../catalog/cane-profile';
import { harvestOwnerSnapshot } from "../ownership/harvest-owner";
import {reserveHarvestSource} from "../world/harvest-source";
import { joinLeashRefundSink, type ReleaseAttempt } from "../ownership/leashes";
import { placementIntersectsFenceGeometry } from "../catalog/block-geometry";
import { bodyBox } from "../simulation/physics";
/**
 * Education Edition Agent: a small robot that belongs to the player and runs Code Builder
 * commands one at a time. It occupies one block cell, flies (doesn't fall), can't pass through
 * solid blocks, carries a 27-slot inventory, and obeys Allow/Deny/Border like a survival player
 * (it can't build or break in Deny areas).
 */
import type { DropSink } from "../ownership/world-drops";
import { cloneStack, insertStackIntoSlots } from "../ownership/stack";
import { extinguishFire } from "../simulation/fire";
import { blockDrops, netherWartAge } from "../simulation/farming";
import { AIR, tryBlockById, blockById, blockId, isSolid } from "../catalog/blocks";
import { FACING_DIRS } from "../education/chalkboard";
import type { ItemStack } from "../ownership/inventory";
import { isKnownId, placedBlockOf } from "../catalog/items";
import { doorPartner, orientedPlacement } from "../simulation/redstone";
import { WORLD_HEIGHT } from "../world/chunk";
import { WORLD_BORDER, type Vec3 } from "../core/math";
import { canBreak, canBuildAt, extraCellsFree, hasSupport, plantNetherWart, plantSugarCane } from "../world/rules";
import type { World } from "../world/world";

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
  | { op: "drop"; slot: number; dir?: AgentDirection; quantity?: number }
  | { op: "collect"; filterId?: number };

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
  /** Acquires scoped external ownership before planning a block destruction; busy must refuse. */
  beginDestroyOwnership?(x: number, y: number, z: number): ReleaseAttempt;
  /** Optional live player feet for new fence placement/connection overlap checks. */
  playerFeet?(): Vec3;
  /** New physical mode; absent preserves legacy direct inventory-transfer behavior. */
  worldDrop?: DropSink;
  /** Deterministic engine-test seam only; browser production does not inject harvest outcomes. */
  gravelRand?: () => number;
  /** Detached external contents join the same destruction batch, never a second receiver. */
  destroyContents?(x: number, y: number, z: number): readonly ItemStack[];
  collect?(agent: AgentState, filterId?: number): number;
  /** Hits a mob in the cell; returns true if one was there. */
  attack?(x: number, y: number, z: number): boolean;
  /** Hands a stack to the player (the Agent's "drop"); returns how many didn't fit. */
  giveToPlayer?(stack: ItemStack): number;
  /** Atomically preflight external block contents before destruction. */
  beforeDestroy?(x: number, y: number, z: number): boolean;
  /** Recover external contents only after a committed destruction. */
  afterDestroy?(x: number, y: number, z: number): void;
}

export function createAgent(x: number, y: number, z: number, facing = 2): AgentState {
  return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), facing, slots: new Array(AGENT_SLOTS).fill(null), selected: 0 };
}

/**
 * Finds a safe nearby teleport cell, preferring the player's left and a floor.
 * Search is deliberately local (radius 3, two levels above/below); an Agent can
 * fly, so a clear unsupported cell is a fallback. Facing is left to the caller.
 */
export function findAgentPosition(world: Pick<World, "getBlock">, player: Vec3, yaw: number): Vec3 | null {
  if (![player.x, player.y, player.z, yaw].every(Number.isFinite) ||
    Math.abs(player.x) > WORLD_BORDER || Math.abs(player.z) > WORLD_BORDER ||
    player.y < 0 || player.y >= WORLD_HEIGHT) return null;
  const px = Math.floor(player.x), pz = Math.floor(player.z);
  // Physics can leave feet a few ulps below an integer floor; don't round real slopes/heights.
  const py = Math.floor(player.y + 1e-5);
  const leftX = Math.floor(player.x - Math.cos(yaw)), leftZ = Math.floor(player.z + Math.sin(yaw));
  const columns: { x: number; z: number }[] = [];
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const x = px + dx, z = pz + dz;
    if ((dx === 0 && dz === 0) || Math.abs(x) > WORLD_BORDER || Math.abs(z) > WORLD_BORDER) continue;
    columns.push({ x, z });
  }
  columns.sort((a, b) =>
    ((a.x - leftX) ** 2 + (a.z - leftZ) ** 2) - ((b.x - leftX) ** 2 + (b.z - leftZ) ** 2));
  let flying: Vec3 | null = null;
  for (const dy of [0, 1, -1, 2, -2]) {
    const y = py + dy;
    if (y < 0 || y + 1 >= WORLD_HEIGHT) continue;
    for (const { x, z } of columns) {
      if (isSolid(world.getBlock(x, y, z)) || isSolid(world.getBlock(x, y + 1, z))) continue;
      // Agent integer grid policy: air above a1.5-high fence is not a safe teleport cell.
      if (y > 0 && blockById(world.getBlock(x, y - 1, z)).shape === "fence") continue;
      const spot = { x, y, z };
      if (y > 0 && isSolid(world.getBlock(x, y - 1, z))) return spot;
      flying ??= spot;
    }
  }
  return flying;
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

import { freshStack } from "../ownership/glow-stick-state";



function addToAgent(agent: AgentState, stack: ItemStack): number {
  return insertStackIntoSlots(agent.slots, stack);
}

/** Executes one Agent command against the world. */
export function runAgentCommand(world: World, agent: AgentState, cmd: AgentCommand, env: AgentEnv = {}): AgentResult {
  if(world.blockSourceLeaseBusy&&cmd.op!=="detect"&&cmd.op!=="inspect")return {ok:false,message:"World source is reserved"};
  const target = (dir: AgentDirection) => {
    const [dx, dy, dz] = agentStep(agent, dir);
    return { x: agent.x + dx, y: agent.y + dy, z: agent.z + dz };
  };
  switch (cmd.op) {
    case "move": {
      const t = target(cmd.dir);
      if (t.y < 0 || t.y >= WORLD_HEIGHT) return { ok: false, message: "Can't move out of the world" };
      if (Math.abs(t.x) > WORLD_BORDER || Math.abs(t.z) > WORLD_BORDER) return { ok: false, message: "That's beyond the world border" };
      if (isSolid(world.getBlock(t.x, t.y, t.z)) || (t.y > 0 && blockById(world.getBlock(t.x, t.y - 1, t.z)).shape === "fence")) return { ok: false, message: "Blocked" };
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
      if(!writablePlacementCell(t.x,t.y,t.z))return {ok:false,message:"Can't place outside the world"};
      const stack=agent.slots[agent.selected];
      if(inspectCaneItemOwner(stack).kind==='invalid')return{ok:false,message:'Invalid Sugar Cane item'};
      if(stack?.id===SUGAR_CANE_ITEM_ID)return{ok:plantSugarCane(world,agent,'survival',t.x,t.y,t.z,AGENT_SLOTS,AGENT_SLOTS),message:'Sugar Cane needs an empty spot on supported soil beside water'};
      let placed = stack ? placedBlockOf(stack.id) : null;
      if(placed!==null&&hayAxisOf(placed)!==null)placed=hayPlacementId({x:t.x-agent.x,y:t.y-agent.y,z:t.z-agent.z});
      const cells:Array<[number,number,number,number]>|null=placed===null?null:orientedPlacement(placed,t.x,t.y,t.z,agent.facing)??[[t.x,t.y,t.z,placed]];
      if(cells&&!placementCellsWithinWorld(cells))return {ok:false,message:"That placement would extend outside the world"};
      const here = world.getBlock(t.x, t.y, t.z);
      if (here !== AIR && !tryBlockById(here)?.replaceable && tryBlockById(here)?.shape !== "liquid") return { ok: false, message: "Something is in the way" };
      if(stack?.id===842)return {ok:plantNetherWart(world,agent,"survival",t.x,t.y,t.z,AGENT_SLOTS,AGENT_SLOTS),message:"Wart requires Soul Sand and an unchanged owned item"};
      // Blocks, and items that place a block (redstone dust, doors, lab products).
      // Stateful glow has no block metadata owner. Refuse before world writes or source debit.
      if (stack && (Object.prototype.hasOwnProperty.call(stack, "glow") || Object.prototype.hasOwnProperty.call(stack, "sparkler"))) return { ok: false, message: "Stateful Glow sticks and Sparklers cannot be placed" };
      if (!stack || placed === null || cells === null) return { ok: false, message: "No block in the selected slot" };
      // Education Edition: the Agent obeys Allow/Deny like a survival player.
      if (!canBuildAt(world, "survival", t.x, t.y, t.z)) return { ok: false, message: "Building isn't allowed here (Deny)" };
      // Same support rules as the player: dust, buttons, plates and repeaters need a solid block below.
      if (!hasSupport(world, blockById(placed), t.x, t.y, t.z, here)) return { ok: false, message: "That needs a block to stand on" };
      // Repeaters point the way the Agent faces; doors face it and need the cell above (inside the world).
      if (!extraCellsFree(world, cells)) return { ok: false, message: "Something is in the way" };
      // New fence only: fixed centered.6x1 Agent footprint, not a retrofit of legacy actor physics.
      const get = world.getBlock.bind(world), feet = env.playerFeet?.();
      if (placementIntersectsFenceGeometry(get, cells, bodyBox({ x: agent.x + .5, y: agent.y, z: agent.z + .5 }, .6, 1)) ||
        (feet && placementIntersectsFenceGeometry(get, cells, bodyBox(feet)))) return { ok: false, message: "Fence would overlap an actor" };
      for (const [cx, cy, cz, id] of cells) world.setBlock(cx, cy, cz, id);
      stack.count--;
      if (stack.count <= 0) agent.slots[agent.selected] = null;
      return { ok: true };
    }
    case "destroy": {
      const t = target(cmd.dir);
      const id = world.getBlock(t.x, t.y, t.z);
      if (id === AIR) return { ok: false, message: "Nothing to destroy" };
      if (!canBreak(world, "survival", t.x, t.y, t.z)) return { ok: false, message: "Can't destroy that here" };
      if (id === blockId("fire")) return { ok: extinguishFire(world, t.x, t.y, t.z), message: "Fire extinguished" };
      const source=reserveHarvestSource(world,t.x,t.y,t.z);
      if(!source)return {ok:false,message:"Harvest source is unavailable"};
      try {
      const selected=agent.selected,slots=agent.slots,owner=harvestOwnerSnapshot(slots,selected,AGENT_SLOTS);
      if(!owner)return {ok:false,message:id===blockId("gravel")?"Invalid gravel harvest owner":"Invalid harvest owner"};
      const attempt = env.beginDestroyOwnership?.(t.x, t.y, t.z) ?? { kind: "none" as const };
      if (attempt.kind === "refused") return { ok: false, message: attempt.reason };
      const lease = attempt.kind === "ready" ? attempt.lease : null;
      try {
        if (lease && !env.worldDrop) return { ok: false, message: "Leashed sources require atomic world drops" };
        const above = source.above;
        const contents = env.worldDrop ? env.destroyContents?.(t.x, t.y, t.z) ?? [] : [];
        const contentsSource = JSON.stringify(contents);
        const gravel = id === blockId("gravel");
        const gravelPlan = gravel ? world.gravelHarvests.plan(t.x, t.y, t.z, env.gravelRand) : null;
        if (gravel && !gravelPlan) return { ok: false, message: "Cannot resolve gravel harvest" };
        const drops = [...(gravelPlan ? [gravelPlan.stack] : blockDrops(id)), ...source.dependents.flatMap(c=>blockDrops(c.id)), ...contents];
        const trial = { ...agent, slots: agent.slots.map((stack) => stack ? cloneStack(stack) : null) };
        const partner=source.partner,partnerId=source.partnerId;
        const sourceValid = () => {
          try {
            return source.valid() && (!gravel||gravelPlan!.valid()) && agent.slots === slots && agent.selected === selected && owner() && (!lease || lease.valid()) && world.getBlock(t.x, t.y, t.z) === id && world.getBlock(t.x, t.y + 1, t.z) === above &&
              (!partner || world.getBlock(...partner) === partnerId) && JSON.stringify(env.destroyContents?.(t.x, t.y, t.z) ?? []) === contentsSource;
          } catch { return false; }
        };
        if (!sourceValid()) return { ok: false, message: "Gravel source changed" };
        if (env.worldDrop) {
          const sink = lease ? joinLeashRefundSink(lease, env.worldDrop, sourceValid) : env.worldDrop;
          const batch = sink(drops, { x: t.x + .5, y: t.y + .5, z: t.z + .5 });
          if (!batch || !sourceValid() || !batch.commit()) return { ok: false, message: "Cannot reserve world drops" };
        } else {
          if (drops.some((stack) => addToAgent(trial, stack) > 0)) return { ok: false, message: "Agent inventory is full" };
          if (env.beforeDestroy?.(t.x, t.y, t.z) === false) return { ok: false, message: "Block contents do not fit" };
          if (!sourceValid()) return { ok: false, message: "Gravel source changed" };
        }
        const committed=source.commit(()=>{if(!env.worldDrop)for(const stack of drops)addToAgent(agent,stack);});
        if(!committed)return {ok:false,message:"Harvest source changed"};
        env.afterDestroy?.(t.x,t.y,t.z);return {ok:true};
      } finally { lease?.cancel(); }
      } finally {source.release();}
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
      if (!Number.isInteger(cmd.slot) || cmd.slot < 0 || cmd.slot >= AGENT_SLOTS ||
        (cmd.dir !== undefined && !AGENT_DIRECTIONS.includes(cmd.dir)) ||
        (cmd.quantity !== undefined && (!Number.isSafeInteger(cmd.quantity) || cmd.quantity <= 0))) return { ok: false, message: "Invalid drop command" };
      const stack = agent.slots[cmd.slot];
      if (!stack) return { ok: false, message: "That slot is empty" };
      const amount = Math.min(stack.count, cmd.quantity ?? stack.count);
      if (env.worldDrop) {
        const t = target(cmd.dir ?? "forward");
        const batch = env.worldDrop([cloneStack(stack, amount)], { x: t.x + .5, y: t.y + .25, z: t.z + .5 });
        if (!batch || !batch.commit()) return { ok: false, message: "Cannot reserve world drops" };
        agent.slots[cmd.slot] = amount < stack.count ? cloneStack(stack, stack.count - amount) : null;
      } else {
        if (cmd.dir !== undefined || cmd.quantity !== undefined) return { ok: false, message: "World drops unavailable" };
        if (!env.giveToPlayer) return { ok: false, message: "No player to give it to" };
        const left = env.giveToPlayer(cloneStack(stack));
        if (!Number.isInteger(left) || left < 0 || left > stack.count) return { ok: false, message: "Invalid receiver remainder" };
        agent.slots[cmd.slot] = left > 0 ? cloneStack(stack, left) : null;
      }
      return { ok: true };
    }
    case "collect": {
      if (cmd.filterId !== undefined && !isKnownId(cmd.filterId)) return { ok: false, message: "Unknown collect item" };
      const collected = env.collect?.(agent, cmd.filterId) ?? 0;
      return { ok: true, value: collected > 0, message: collected > 0 ? `Collected ${collected}` : "Nothing to collect" };
    }
    default:
      // Never reached for validated programs; still a defined result for anything else.
      return { ok: false, message: "Unknown command" };
  }
}

/** Gives the Agent items (e.g. the player hands it building blocks). */
export function giveAgent(agent: AgentState, stack: ItemStack): number;
export function giveAgent(agent: AgentState, id: number, count: number): number;
export function giveAgent(agent: AgentState, stackOrId: ItemStack | number, count?: number): number {
  return addToAgent(agent, typeof stackOrId === "number" ? freshStack(stackOrId, count ?? 0) : stackOrId);
}

