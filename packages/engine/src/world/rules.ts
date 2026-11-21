import type { OwnershipGuard } from "../ownership/leashes";
import { placementIntersectsFenceGeometry } from "../catalog/block-geometry";
import type { DropSink } from "../ownership/world-drops";
import { AIR, tryBlockById, blockById, blockId, isOpaque, type BlockDef } from "../catalog/blocks";
import { WORLD_HEIGHT } from "./chunk";
import { Inventory, type ItemStack } from "../ownership/inventory";
import { placedBlockOf, toolOf, type ToolSpec } from "../catalog/items";
import { blockDrops, farmlandId, farmlandMoisture, wheatAge } from "../simulation/farming";
import { meltAround } from "../crafting/labeffects";
import { doorPartner, orientedPlacement } from "../simulation/redstone";
import { bodyOverlapsBlock, playerBox } from "../simulation/physics";
import type { Vec3 } from "../core/math";
import type { World } from "./world";

export type GameMode = "creative" | "survival";

const ALLOW = blockId("allow");
const DENY = blockId("deny");
const WATER = blockId("water");
const HEAT_BLOCK = blockId("placed_heat_block");

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
  if (id === blockId("snow")) return tool?.kind === "shovel";
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
 * Breaks a block with the selected hotbar item. Survival harvests go to the optional world sink
 * or the legacy inventory receiver, and a held tool wears by one use, breaking when spent.
 * Plants resting on the block are broken too. Returns false if the action is not allowed.
 */
export function breakBlock(world: World, inventory: Inventory, mode: GameMode, x: number, y: number, z: number, rand: () => number = Math.random, externalDrops: readonly ItemStack[] = [], sink?: DropSink, ownershipGuard?: OwnershipGuard): boolean {
  if (ownershipGuard && (!sink || !ownershipGuard.valid())) return false;
  if (!canBreak(world, mode, x, y, z)) return false;
  const id = world.getBlock(x, y, z), above = world.getBlock(x, y + 1, z);
  const tool = toolOf(inventory.selectedStack()?.id);
  const selected = inventory.selected, selectedSource = ownershipGuard ? JSON.stringify(inventory.selectedStack()) : "";
  const guardedPartner = ownershipGuard ? doorPartner(world, x, y, z) : null;
  const partnerId = guardedPartner ? world.getBlock(...guardedPartner) : null;
  const sourceValid = () => {
    if (!ownershipGuard) return true;
    try {
      return ownershipGuard.valid() && world.getBlock(x, y, z) === id && world.getBlock(x, y + 1, z) === above &&
        (!guardedPartner || world.getBlock(...guardedPartner) === partnerId) && inventory.selected === selected && JSON.stringify(inventory.selectedStack()) === selectedSource;
    } catch { return false; }
  };
  const supported = tryBlockById(above)?.needsSupport === true;
  const drops: ItemStack[] = [...(mode === "survival" ? [
    ...(canHarvest(id, tool) ? blockDrops(id, rand) : []), ...(supported ? blockDrops(above, rand) : []),
  ] : []), ...externalDrops];
  // Optional world receiver stages the complete resolved batch before source removal.
  if (sink) {
    const batch = sink(drops, { x: x + .5, y: y + .5, z: z + .5 });
    if (!batch || !sourceValid() || !sourceValid() || !batch.commit()) return false;
    // Guard finalizers are trusted synchronous nonthrowing assignments, never receiver callbacks.
    ownershipGuard?.afterReceiverCommit();
  } else {
    const trial = Inventory.fromJSON(inventory.toJSON());
    if (drops.some((stack) => trial.addStack(stack) > 0)) return false;
  }
  const partner = ownershipGuard ? guardedPartner : doorPartner(world, x, y, z);
  world.setBlock(x, y, z, AIR);
  if (partner) world.setBlock(partner[0], partner[1], partner[2], AIR);
  if (supported) world.setBlock(x, y + 1, z, AIR);
  if (!sink) for (const stack of drops) inventory.addStack(stack);
  if (mode === "survival" && tool && blockById(id).hardness > 0) inventory.damageSelected(1);
  return true;
}

/** Hoe use obeys build rules and consumes durability only after a successful transformation. */
export function tillSoil(world: World, inventory: Inventory, mode: GameMode,
  hit: { x: number; y: number; z: number; normal: { x: number; y: number; z: number } }): boolean {
  const { x, y, z, normal } = hit;
  if (![x, y, z].every(Number.isInteger) || y < 0 || y >= WORLD_HEIGHT - 1 || normal.y < 0 ||
    toolOf(inventory.selectedStack()?.id)?.kind !== "hoe") return false;
  const id = world.getBlock(x, y, z);
  if ((id !== blockId("grass") && id !== blockId("dirt")) || world.getBlock(x, y + 1, z) !== AIR || !canBuildAt(world, mode, x, y, z)) return false;
  world.setBlock(x, y, z, farmlandId(0));
  if (mode === "survival") inventory.damageSelected(1);
  return true;
}

/**
 * Whether block `def` may go at (x, y, z), whose current block is `target`: plants and redstone
 * parts need a solid opaque block below; torches need an opaque neighbour (not above), and only
 * waterproof ones go in water. Shared by players and the Agent.
 */
export function hasSupport(world: World, def: BlockDef, x: number, y: number, z: number, target: number): boolean {
  if (wheatAge(def.id) !== null) return target === AIR && farmlandMoisture(world.getBlock(x, y - 1, z)) !== null;
  if (def.needsSupport) {
    const below = blockById(world.getBlock(x, y - 1, z));
    if (!below.solid || below.transparent) return false;
  }
  // Torches stand on a block top or hang on a block side (never on a ceiling), as in Minecraft.
  if (def.shape === "torch") {
    // Only the underwater torch and glow sticks work in water (Education Edition).
    if (target === WATER && !def.waterproof) return false;
    const sides = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    if (!sides.some(([dx, dy, dz]) => isOpaque(world.getBlock(x + dx, y + dy, z + dz)))) return false;
  }
  return true;
}

/** Extra cells of a multi-cell placement (a door's upper half) must be free and inside the world. */
export function extraCellsFree(world: World, cells: ReadonlyArray<readonly [number, number, number, number]>): boolean {
  return cells.slice(1).every(([cx, cy, cz]) => cy >= 0 && cy < WORLD_HEIGHT && world.getBlock(cx, cy, cz) === AIR);
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
  /** Direction the player looks (0-3, as FACING_VECTORS): orients repeaters and doors. */
  look = 0,
): boolean {
  if (![x, y, z].every(Number.isInteger) || y < 0 || y >= WORLD_HEIGHT) return false;
  const stack = inventory.selectedStack();
  // Items place nothing, except Lab Table products that place a block (heat block, glow stick, ...).
  // Explicit activation state has no block-owned representation; preserve the held unit.
  // Metadata-less legacy green retains its existing placement behavior.
  if (stack && (Object.prototype.hasOwnProperty.call(stack, "glow") || Object.prototype.hasOwnProperty.call(stack, "sparkler"))) return false;
  const placed = stack ? placedBlockOf(stack.id) : null;
  if (!stack || placed === null) return false;
  const target = world.getBlock(x, y, z);
  if (target !== AIR && target !== WATER && !tryBlockById(target)?.replaceable) return false;
  const def = blockById(placed);
  if (def.solid && def.shape !== "fence" && bodyOverlapsBlock(playerFeet, x, y, z)) return false;
  if (!hasSupport(world, def, x, y, z, target)) return false;
  if (!canBuildAt(world, mode, x, y, z)) return false;
  // Repeaters point where the player looks; doors face the player and need the cell above free.
  const cells = orientedPlacement(placed, x, y, z, look);
  if (placementIntersectsFenceGeometry(world.getBlock.bind(world), cells ?? [[x, y, z, placed]], playerBox(playerFeet))) return false;
  if (cells) {
    // A door needs its upper cell free and inside the world (not at the top layer).
    if (!extraCellsFree(world, cells)) return false;
    for (const [cx, cy, cz] of cells.slice(1)) {
      if (!canBuildAt(world, mode, cx, cy, cz)) return false;
      if (blockById(cells[0][3]).solid && bodyOverlapsBlock(playerFeet, cx, cy, cz)) return false;
    }
    for (const [cx, cy, cz, id] of cells) world.setBlock(cx, cy, cz, id);
    if (mode === "survival") inventory.takeSelected();
    return true;
  }
  world.setBlock(x, y, z, placed);
  if (placed === HEAT_BLOCK) meltAround(world, x, y, z);
  if (mode === "survival") inventory.takeSelected();
  return true;
}
