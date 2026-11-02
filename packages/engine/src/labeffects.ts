/**
 * Education Edition Lab Table product effects, each bounded to a small radius and a block limit:
 * the heat block melts snow and ice, the ice bomb freezes water, super fertilizer grows plants.
 */
import { AIR, blockId } from "./blocks";
import { nameOf } from "./items";
import type { World } from "./world";

export const EFFECT_RADIUS = 3;
/** Most blocks one use may change. */
export const EFFECT_LIMIT = 64;
/** Most plants one super fertilizer grows. */
export const FERTILIZER_LIMIT = 12;

const WATER = blockId("water");
const ICE = blockId("ice");
const SNOW = blockId("snow");
const SNOWY_GRASS = blockId("snowy_grass");
const GRASS = blockId("grass");
const TALL_GRASS = blockId("tall_grass");
const FLOWERS = [blockId("dandelion"), blockId("poppy")];

/** Cells within `r` of (x, y, z), nearest first (ties in a fixed order). */
function cellsAround(x: number, y: number, z: number, r: number): [number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy + dz * dz;
        if (d <= r * r) out.push([x + dx, y + dy, z + dz, d]);
      }
  out.sort((a, b) => a[3] - b[3]);
  return out.map(([cx, cy, cz]) => [cx, cy, cz]);
}

/** Replaces blocks per `swap` around a point, nearest first, at most EFFECT_LIMIT. Returns the count. */
function transform(world: World, x: number, y: number, z: number, swap: ReadonlyMap<number, number>): number {
  if (![x, y, z].every(Number.isInteger)) return 0;
  let changed = 0;
  for (const [cx, cy, cz] of cellsAround(x, y, z, EFFECT_RADIUS)) {
    if (changed >= EFFECT_LIMIT) break;
    const to = swap.get(world.getBlock(cx, cy, cz));
    if (to === undefined) continue;
    world.setBlock(cx, cy, cz, to);
    changed++;
  }
  return changed;
}

/** Heat block: melts snow (to air), snowy grass (to grass) and ice (to water) nearby. */
export function meltAround(world: World, x: number, y: number, z: number): number {
  return transform(world, x, y, z, new Map([[SNOW, AIR], [SNOWY_GRASS, GRASS], [ICE, WATER]]));
}

/** Ice bomb: freezes water nearby into ice. */
export function freezeAround(world: World, x: number, y: number, z: number): number {
  return transform(world, x, y, z, new Map([[WATER, ICE]]));
}

/**
 * Super fertilizer on a grass block: grows tall grass and flowers on open grass nearby (like bone
 * meal). Returns the number of plants grown (0 if the target isn't grass).
 */
export function fertilizeAround(world: World, x: number, y: number, z: number, rand: () => number = Math.random): number {
  if (![x, y, z].every(Number.isInteger) || world.getBlock(x, y, z) !== GRASS) return 0;
  let grown = 0;
  for (const [cx, cy, cz] of cellsAround(x, y, z, EFFECT_RADIUS)) {
    if (grown >= FERTILIZER_LIMIT) break;
    if (world.getBlock(cx, cy, cz) !== GRASS || world.getBlock(cx, cy + 1, cz) !== AIR) continue;
    // The target itself always grows; others with a chance, as bone meal scatters.
    if (grown > 0 && rand() >= 0.6) continue;
    const r = rand();
    world.setBlock(cx, cy + 1, cz, r < 0.7 ? TALL_GRASS : FLOWERS[r < 0.85 ? 0 : 1]);
    grown++;
  }
  return grown;
}

/**
 * Using a Lab Table product on a targeted block (`hit` = the block, `x/y/z + normal` = the cell in
 * front of it). Returns blocks changed, or -1 if the item has no use effect there.
 */
export function useLabProduct(
  world: World,
  itemId: number,
  hit: { x: number; y: number; z: number; normal: { x: number; y: number; z: number } },
  rand: () => number = Math.random,
): number {
  const name = nameOf(itemId);
  if (name === "ice_bomb") return freezeAround(world, hit.x + hit.normal.x, hit.y + hit.normal.y, hit.z + hit.normal.z);
  if (name === "super_fertilizer") return world.getBlock(hit.x, hit.y, hit.z) === GRASS ? fertilizeAround(world, hit.x, hit.y, hit.z, rand) : -1;
  return -1;
}
