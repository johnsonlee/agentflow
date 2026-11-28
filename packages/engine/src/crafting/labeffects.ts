/**
 * Education Edition Lab Table product effects, each bounded to a small radius and a block limit:
 * the heat block melts snow and ice, the ice bomb freezes water, super fertilizer grows plants.
 */
import { AIR, blockId } from "../catalog/blocks";
import { matureCrop, farmlandMoisture, wheatAge, wheatId } from "../simulation/farming";
import { nameOf } from "../catalog/items";
import type { BlockEdit, WorldCellSnapshot, World } from "../world/world";

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
  if(world.blockSourceLeaseBusy)return 0;
  if (![x, y, z].every(Number.isInteger)) return 0;
  let changed = 0;
  for (const [cx, cy, cz] of cellsAround(x, y, z, EFFECT_RADIUS)) {
    if (changed >= EFFECT_LIMIT) break;
    const to = swap.get(world.getBlock(cx, cy, cz));
    if (to === undefined) continue;
    const cell=world.captureCell(cx,cy,cz);
    if(cell&&world.commitBlockBatch([[cx,cy,cz,to]],undefined,[cell]))changed++;
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
  if(world.blockSourceLeaseBusy)return 0;
  if (![x, y, z].every(Number.isInteger) || world.getBlock(x, y, z) !== GRASS) return 0;
  let grown = 0;
  for (const [cx, cy, cz] of cellsAround(x, y, z, EFFECT_RADIUS)) {
    if (grown >= FERTILIZER_LIMIT) break;
    if (world.getBlock(cx, cy, cz) !== GRASS || world.getBlock(cx, cy + 1, cz) !== AIR) continue;
    // The target itself always grows; others with a chance, as bone meal scatters.
    if (grown > 0 && rand() >= 0.6) continue;
    const r = rand();
    const target=world.captureCell(cx,cy+1,cz),soil=world.captureCell(cx,cy,cz);
    if(target&&soil&&world.commitBlockBatch([[cx,cy+1,cz,r < 0.7 ? TALL_GRASS : FLOWERS[r < 0.85 ? 0 : 1]]],undefined,[soil,target]))grown++;
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
  if(world.blockSourceLeaseBusy)return 0;
  const name = nameOf(itemId);
  if (name === "ice_bomb") return freezeAround(world, hit.x + hit.normal.x, hit.y + hit.normal.y, hit.z + hit.normal.z);
  if (name === "super_fertilizer") {
    const id = world.getBlock(hit.x, hit.y, hit.z);
    if (wheatAge(id) !== null) return matureCrop(world, hit.x, hit.y, hit.z);
    return id === GRASS ? fertilizeAround(world, hit.x, hit.y, hit.z, rand) : -1;
  }
  return -1;
}


export interface LabProductHit { x:number; y:number; z:number; normal:{x:number;y:number;z:number} }
export interface LabProductPlan { supported:boolean; edits:readonly BlockEdit[]; expected:readonly WorldCellSnapshot[] }
/** Loaded-only effect planning. Captures precede caller RNG; every observed dependency is witnessed.
 * Geometry, stable nearest-first order and random draw order preserve the existing application model. */
export function planLabProduct(world:World,itemId:number,hit:LabProductHit,rand:()=>number=Math.random):LabProductPlan {
 const empty=(supported:boolean):LabProductPlan=>({supported,edits:[],expected:[]});
 if(world.blockSourceLeaseBusy)return empty(true);
 if(!hit||!hit.normal||![hit.x,hit.y,hit.z,hit.normal.x,hit.normal.y,hit.normal.z].every(Number.isSafeInteger)||Math.abs(hit.normal.x)+Math.abs(hit.normal.y)+Math.abs(hit.normal.z)!==1)return empty(true);
 const name=nameOf(itemId);if(name!=="ice_bomb"&&name!=="super_fertilizer")return empty(false);
 const expected:WorldCellSnapshot[]=[],edits:BlockEdit[]=[];
 const take=(x:number,y:number,z:number)=>{const c=world.captureCell(x,y,z);if(c)expected.push(c);return c;};
 const target=take(hit.x,hit.y,hit.z);if(!target)return empty(true);
 if(name==="super_fertilizer"){
  const age=wheatAge(target.id);
  if(age!==null){const soil=take(hit.x,hit.y-1,hit.z);if(age<7&&soil&&farmlandMoisture(soil.id)!==null)edits.push([hit.x,hit.y,hit.z,wheatId(7)]);return{supported:true,edits,expected};}
  if(target.id!==GRASS)return empty(false);
 }
 const x=hit.x+(name==="ice_bomb"?hit.normal.x:0),y=hit.y+(name==="ice_bomb"?hit.normal.y:0),z=hit.z+(name==="ice_bomb"?hit.normal.z:0);
 // Snapshot the whole bounded search before any injected random callback can change a later cell.
 const cells=cellsAround(x,y,z,EFFECT_RADIUS).map(([cx,cy,cz])=>({cell:take(cx,cy,cz),above:name==="super_fertilizer"?take(cx,cy+1,cz):undefined}));
 for(const {cell,above}of cells){
  if(edits.length>=(name==="ice_bomb"?EFFECT_LIMIT:FERTILIZER_LIMIT))break;
  if(!cell)continue;
  if(name==="ice_bomb"){if(cell.id===WATER)edits.push([cell.x,cell.y,cell.z,ICE]);continue;}
  if(cell.id!==GRASS||above?.id!==AIR)continue;
  if(edits.length>0&&rand()>=.6)continue;
  const r=rand();edits.push([above.x,above.y,above.z,r<.7?TALL_GRASS:FLOWERS[r<.85?0:1]]);
 }
 return{supported:true,edits,expected};
}
