import{composterParts}from './composter';
import{woodSlabBounds}from './wood-slabs';
import { blockById, isSolid } from "./blocks";
import type { BlockGetter } from "../simulation/physics";

export type LocalBox = readonly [number, number, number, number, number, number];
export interface GeometryBox { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
/** Bounded application geometry, not a measurement of native fence collision. */
export const MAX_BLOCK_COLLISION_HEIGHT = 1.5;
export const BLOCK_COLLISION_ORIGIN_BELOW = Math.ceil(MAX_BLOCK_COLLISION_HEIGHT) - 1;
export const FENCE_CONNECTIONS = { north: 1, east: 2, south: 4, west: 8 } as const;
const FULL: LocalBox = Object.freeze([0, 0, 0, 1, 1, 1]);
export interface BrewingStandPart { readonly box: LocalBox; readonly texture: "brewing_stand_base" | "brewing_stand_rod" }
/** Original application dimensions, not measured Education collision or geometry. The three
 * low feet, connecting struts, post and T rack share the exact same render/solid/target parts. */
export const BREWING_STAND_PARTS: readonly BrewingStandPart[] = Object.freeze([
  { box: [5/16,0,11/16,11/16,2/16,15/16], texture: "brewing_stand_base" },
  { box: [1/16,0,1/16,6/16,2/16,6/16], texture: "brewing_stand_base" },
  { box: [10/16,0,1/16,15/16,2/16,6/16], texture: "brewing_stand_base" },
  { box: [7/16,0,4/16,9/16,1/16,13/16], texture: "brewing_stand_base" },
  { box: [4/16,0,3/16,12/16,1/16,5/16], texture: "brewing_stand_base" },
  { box: [7/16,1/16,7/16,9/16,14/16,9/16], texture: "brewing_stand_rod" },
  { box: [3/16,8/16,3/16,13/16,10/16,5/16], texture: "brewing_stand_rod" },
  { box: [7/16,8/16,4/16,9/16,10/16,13/16], texture: "brewing_stand_rod" },
].map(part => Object.freeze({box:Object.freeze(part.box) as LocalBox,texture:part.texture as BrewingStandPart["texture"]})));
const BREWING_STAND_BOXES: readonly LocalBox[] = Object.freeze(BREWING_STAND_PARTS.map(part=>part.box));
const DIRECTIONS = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]] as const;

/** Explicit local policy: same fence or an opaque solid full cube, excluding glass/thin shapes. */
export function fenceConnections(get: BlockGetter, x: number, y: number, z: number, idOverride?: number): number {
  const id = idOverride ?? get(x, y, z);
  if (blockById(id).shape !== "fence") return 0;
  let mask = 0;
  for (const [dx, dz, bit] of DIRECTIONS) {
    const adjacent = get(x + dx, y, z + dz), def = blockById(adjacent);
    if (adjacent === id || (def.solid && !def.transparent && def.shape === "cube" && !def.collisionBox)) mask |= bit;
  }
  return mask;
}

function fenceBoxes(mask: number, collision: boolean): LocalBox[] {
  const boxes: LocalBox[] = [[6 / 16, 0, 6 / 16, 10 / 16, collision ? 1.5 : 1, 10 / 16]];
  const stripe0 = collision ? 6 / 16 : 7 / 16, stripe1 = collision ? 10 / 16 : 9 / 16;
  const levels = collision ? [[0, 1.5]] : [[6 / 16, 9 / 16], [12 / 16, 15 / 16]];
  for (const [bottom, top] of levels) {
    if (mask & 1) boxes.push([stripe0, bottom, 0, stripe1, top, 6 / 16]);
    if (mask & 2) boxes.push([10 / 16, bottom, stripe0, 1, top, stripe1]);
    if (mask & 4) boxes.push([stripe0, bottom, 10 / 16, stripe1, top, 1]);
    if (mask & 8) boxes.push([0, bottom, stripe0, 6 / 16, top, stripe1]);
  }
  return boxes;
}

/** Legacy solid collision boxes unchanged; fence collision fills rail gaps and extends to1.5. */
export function blockCollisionBoxes(get: BlockGetter, x: number, y: number, z: number, idOverride?: number): readonly LocalBox[] {
  const id = idOverride ?? get(x, y, z), def = blockById(id);
  if (!isSolid(id)) return [];
  const compost=composterParts(id);if(compost)return compost.map(p=>p.box);
  const slab=woodSlabBounds(id);if(slab)return [slab];
  if (def.shape === "brewing_stand") return BREWING_STAND_BOXES;
  return def.shape === "fence" ? fenceBoxes(fenceConnections(get, x, y, z, id), true) : [def.collisionBox ?? FULL];
}

/** Legacy targeting remains full-cell. New fence and stand shapes target their visible parts. */
export function blockSelectionBoxes(get: BlockGetter, x: number, y: number, z: number, idOverride?: number): readonly LocalBox[] {
  const id = idOverride ?? get(x, y, z);
  const compost=composterParts(id);if(compost)return compost.map(p=>p.box);
  const slab=woodSlabBounds(id);if(slab)return[slab];
  if (blockById(id).shape === "brewing_stand") return BREWING_STAND_BOXES;
  if(blockById(id).name==="chest")return [blockById(id).box!];
  if(blockById(id).shape==="cane")return [[.15,0,.15,.85,1,.85]];
  return blockById(id).shape === "fence" ? fenceBoxes(fenceConnections(get, x, y, z, id), false) : [FULL];
}

/** Shared new multipart bounds; legacy shape-specific rendering stays untouched. */
export function blockRenderBoxes(get: BlockGetter, x: number, y: number, z: number, idOverride?: number): readonly LocalBox[] {
  const id = idOverride ?? get(x, y, z), def = blockById(id);
  if (def.shape === "brewing_stand") return BREWING_STAND_BOXES;
  const compost=composterParts(id);if(compost)return compost.map(p=>p.box);
  return def.shape === "fence" ? fenceBoxes(fenceConnections(get, x, y, z, id), false) : [def.box ?? FULL];
}

export function boxIntersectsBlockGeometry(get: BlockGetter, body: GeometryBox, x: number, y: number, z: number, idOverride?: number): boolean {
  const eps = 1e-6;
  return blockCollisionBoxes(get, x, y, z, idOverride).some(b => body.maxX > x + b[0] + eps && body.minX < x + b[3] - eps &&
    body.maxY > y + b[1] + eps && body.minY < y + b[4] - eps && body.maxZ > z + b[2] + eps && body.minZ < z + b[5] - eps);
}

/** Bounded fence-only body probe for spawn/fallback integration without changing legacy solids. */
export function boxIntersectsFences(get: BlockGetter, body: GeometryBox): boolean {
  const eps = 1e-6;
  const x0 = Math.floor(body.minX + eps), y0 = Math.floor(body.minY + eps), z0 = Math.floor(body.minZ + eps);
  const nx = Math.floor(body.maxX - eps) - x0, ny = Math.floor(body.maxY - eps) - y0, nz = Math.floor(body.maxZ - eps) - z0;
  if (![nx, ny, nz].every(n => n >= 0 && n <= 8)) return true;
  for (let dx = 0; dx <= nx; dx++) for (let dy = -BLOCK_COLLISION_ORIGIN_BELOW; dy <= ny; dy++) for (let dz = 0; dz <= nz; dz++) {
    const x = x0 + dx, y = y0 + dy, z = z0 + dz, id = get(x, y, z);
    if (blockById(id).shape === "fence" && boxIntersectsBlockGeometry(get, body, x, y, z, id)) return true;
  }
  return false;
}

/** Prospective new/neighbor fence arms are checked before any placement writes or item consumption. */
export function placementIntersectsFenceGeometry(get: BlockGetter, cells: ReadonlyArray<readonly [number, number, number, number]>, body: GeometryBox): boolean {
  const overlay = new Map(cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
  const prospective: BlockGetter = (x, y, z) => overlay.get(`${x},${y},${z}`) ?? get(x, y, z);
  const seen = new Set<string>();
  for (const [x, y, z] of cells) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const px = x + dx, pz = z + dz, key = `${px},${y},${pz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = prospective(px, y, pz);
    if (blockById(id).shape === "fence" && boxIntersectsBlockGeometry(prospective, body, px, y, pz, id)) return true;
  }
  return false;
}
