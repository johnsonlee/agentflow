import { AIR, BLOCKS, blockById, blockId, isOpaque } from "./blocks";
import type { Inventory } from "./inventory";
import { dropCount, dropOf, isItem, toolOf, type ToolSpec } from "./items";
import { bodyOverlapsBlock } from "./physics";
import type { Vec3 } from "./math";
import type { World } from "./world";

export type GameMode = "creative" | "survival";

const ALLOW = blockId("allow");
const DENY = blockId("deny");
const WATER = blockId("water");

/**
 * Education Edition Allow/Deny semantics: building is permitted above an Allow block
 * and forbidden above a Deny block (the nearest one below wins). Creative players are
 * treated as world builders and are never restricted.
 */
export function canBuildAt(world: World, mode: GameMode, x: number, y: number, z: number): boolean {
  if (mode === "creative") return true;
  for (let by = y - 1; by >= 0; by--) {
    const id = world.getBlock(x, by, z);
    if (id === ALLOW) return true;
    if (id === DENY) return false;
  }
  return true;
}

export function canBreak(world: World, mode: GameMode, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  if (id === AIR || id === WATER) return false;
  if (mode === "survival" && !Number.isFinite(blockById(id).hardness)) return false;
  return canBuildAt(world, mode, x, y, z);
}

/** Minecraft: breaking a block you cannot harvest takes 5/1.5 times longer. */
const NO_HARVEST_PENALTY = 5 / 1.5;

/** Whether breaking the block with this tool (null = hand) yields a drop. */
export function canHarvest(id: number, tool: ToolSpec | null): boolean {
  const tier = blockById(id).harvestTier;
  if (!tier) return true;
  return tool !== null && tool.kind === "pickaxe" && tool.tier >= tier;
}

/** Seconds to break a block in the given mode, holding `tool` (null or omitted = hand). */
export function breakTime(mode: GameMode, id: number, tool: ToolSpec | null = null): number {
  if (mode === "creative") return 0;
  const def = blockById(id);
  const speed = tool && def.tool === tool.kind ? tool.speed : 1;
  return (def.hardness * (canHarvest(id, tool) ? 1 : NO_HARVEST_PENALTY)) / speed;
}

/**
 * Breaks a block with the selected hotbar item. In survival the drop goes into the inventory
 * (only if the held tool can harvest it), and a held tool wears by one use, breaking when spent.
 * Plants resting on the block are broken too. Returns false if the action is not allowed.
 */
export function breakBlock(world: World, inventory: Inventory, mode: GameMode, x: number, y: number, z: number): boolean {
  if (!canBreak(world, mode, x, y, z)) return false;
  const id = world.getBlock(x, y, z);
  const tool = toolOf(inventory.selectedStack()?.id);
  world.setBlock(x, y, z, AIR);
  if (mode === "survival") {
    if (canHarvest(id, tool)) inventory.add(dropOf(id), dropCount(id));
    // Minecraft: instantly broken blocks (hardness 0) do not wear tools.
    if (tool && blockById(id).hardness > 0) inventory.damageSelected(1);
  }
  const above = world.getBlock(x, y + 1, z);
  if (BLOCKS[above]?.needsSupport) {
    world.setBlock(x, y + 1, z, AIR);
    if (mode === "survival") inventory.add(above, 1);
  }
  return true;
}

/**
 * Places the selected hotbar block at (x, y, z). Fails if the target is occupied,
 * intersects the player, lacks support (plants) or is restricted by Allow/Deny.
 */
export function placeBlock(
  world: World,
  inventory: Inventory,
  mode: GameMode,
  x: number,
  y: number,
  z: number,
  playerFeet: Vec3,
): boolean {
  const stack = inventory.selectedStack();
  if (!stack || isItem(stack.id)) return false;
  const target = world.getBlock(x, y, z);
  if (target !== AIR && target !== WATER && !BLOCKS[target].needsSupport) return false;
  const def = blockById(stack.id);
  if (def.solid && bodyOverlapsBlock(playerFeet, x, y, z)) return false;
  if (def.needsSupport) {
    const below = blockById(world.getBlock(x, y - 1, z));
    if (!below.solid || below.transparent) return false;
  }
  // Torches stand on a block top or hang on a block side (never on a ceiling), as in Minecraft.
  if (def.shape === "torch") {
    const sides = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    if (!sides.some(([dx, dy, dz]) => isOpaque(world.getBlock(x + dx, y + dy, z + dz)))) return false;
  }
  if (!canBuildAt(world, mode, x, y, z)) return false;
  world.setBlock(x, y, z, stack.id);
  if (mode === "survival") inventory.takeSelected();
  return true;
}
