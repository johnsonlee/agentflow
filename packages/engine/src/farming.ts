/** Seeded loaded-only wheat simulation. Cadence and fertility are explicit approximations, not an Education equivalence claim. */
import { AIR, tryBlockById, blockId } from "./blocks";
import { WORLD_HEIGHT } from "./chunk";
import type { ItemStack } from "./inventory";
import { dropCount, dropOf, stackId } from "./items";
import { hash3 } from "./random";
import type { World } from "./world";

const FARMLAND = blockId("farmland_0"), WHEAT = blockId("wheat_0");
const WATER = blockId("water"), DIRT = blockId("dirt"), TALL_GRASS = blockId("tall_grass");
export function farmlandMoisture(id: number): number | null { return Number.isInteger(id) && id >= FARMLAND && id < FARMLAND + 8 ? id - FARMLAND : null; }
export function wheatAge(id: number): number | null { return Number.isInteger(id) && id >= WHEAT && id < WHEAT + 8 ? id - WHEAT : null; }
export function farmlandId(moisture: number): number {
  if (!Number.isInteger(moisture) || moisture < 0 || moisture > 7) throw new RangeError("Farmland moisture must be 0–7");
  return FARMLAND + moisture;
}
export function wheatId(age: number): number {
  if (!Number.isInteger(age) || age < 0 || age > 7) throw new RangeError("Wheat age must be 0–7");
  return WHEAT + age;
}

/** Null delegates to the existing ordinary drop. Tall grass uses 1/8 seed chance; ripe wheat uses three 4/7 seed trials. */
export function farmDrops(id: number, rand: () => number = Math.random): ItemStack[] | null {
  const age = wheatAge(id), seeds = stackId("wheat_seeds");
  if (id === TALL_GRASS) return rand() < 1 / 8 ? [{ id: seeds, count: 1 }] : [];
  if (age === null) return null;
  if (age < 7) return [{ id: seeds, count: 1 }];
  let count = 0;
  for (let i = 0; i < 3; i++) if (rand() < 4 / 7) count++;
  return [{ id: stackId("wheat"), count: 1 }, ...(count ? [{ id: seeds, count }] : [])];
}
export function blockDrops(id: number, rand: () => number = Math.random): ItemStack[] {
  const farm = farmDrops(id, rand);
  if (farm !== null) return farm;
  const count = dropCount(id);
  return count > 0 ? [{ id: dropOf(id), count }] : [];
}

/** Water may be at soil height or one above, in the inclusive four-block horizontal square. */
export function hasFarmWater(world: World, x: number, y: number, z: number): boolean {
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 1; dy++) {
    if (world.getLoadedBlock(x + dx, y + dy, z + dz) === WATER) return true;
  }
  return false;
}
export function matureCrop(world: World, x: number, y: number, z: number): number {
  const id = world.getLoadedBlock(x, y, z), age = id === undefined ? null : wheatAge(id);
  if (age === null || age === 7 || farmlandMoisture(world.getLoadedBlock(x, y - 1, z) ?? AIR) === null) return 0;
  world.setBlock(x, y, z, wheatId(7));
  return 1;
}

export interface FarmingState { version: 1; tick: number; accumulator: number; cursor: number }
export function sanitizeFarmingState(raw: unknown): FarmingState {
  const fallback: FarmingState = { version: 1, tick: 0, accumulator: 0, cursor: 0 };
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return fallback;
  const obj = raw as Record<string, unknown>;
  const own = (key: string) => Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
  const tick = own("tick"), accumulator = own("accumulator"), cursor = own("cursor");
  if (own("version") !== 1 || typeof tick !== "number" || !Number.isSafeInteger(tick) || tick < 0 || tick > 1e9 ||
    typeof accumulator !== "number" || !Number.isFinite(accumulator) || accumulator < 0 || accumulator > 86400 ||
    typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 0 || cursor > 1e9) return fallback;
  return { version: 1, tick, accumulator, cursor };
}

/** Sparse equivalent of one random sample per 4096-cell subchunk per 20Hz tick. */
export const CROP_SAMPLE_PROBABILITY = 1 - Math.pow(1 - 1 / 4096, 20);
export const FARMING_BATCH_LIMIT = 256;
export class FarmingSystem {
  private state: FarmingState;
  private readonly cells = new Map<string, readonly [number, number, number]>();
  private readonly unsubscribe: () => void;
  constructor(private readonly world: World, raw?: unknown) {
    this.state = sanitizeFarmingState(raw);
    const remember = (x: number, y: number, z: number, id: number) => {
      const key = `${x},${y},${z}`;
      if (farmlandMoisture(id) !== null || wheatAge(id) !== null) this.cells.set(key, [x, y, z]);
      else this.cells.delete(key);
    };
    for (const [x, y, z, id] of world.exportEdits()) remember(x, y, z, id);
    this.unsubscribe = world.onBlockChanged(remember);
  }
  dispose(): void { this.unsubscribe(); }
  toJSON(): FarmingState { return { ...this.state }; }
  update(dt: number, skyLight = 15): void {
    if (!Number.isFinite(dt) || dt < 0 || dt > 86400) return;
    skyLight = Number.isFinite(skyLight) ? Math.max(0, Math.min(15, skyLight)) : 0;
    this.state.accumulator = Math.round(Math.min(86400, this.state.accumulator + dt) * 1e9) / 1e9;
    let steps = 0;
    while (this.state.accumulator + 1e-9 >= 1 && steps++ < 60) {
      this.state.accumulator = Math.max(0, this.state.accumulator - 1);
      this.state.tick = (this.state.tick + 1) % 1_000_000_001;
      const cells = [...this.cells.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      if (!cells.length) { this.state.cursor = 0; continue; }
      const count = Math.min(cells.length, FARMING_BATCH_LIMIT), start = this.state.cursor % cells.length;
      for (let i = 0; i < count; i++) this.step(...cells[(start + i) % cells.length], skyLight);
      this.state.cursor = (start + count) % cells.length;
    }
  }
  private step(x: number, y: number, z: number, skyLight: number): void {
    const id = this.world.getLoadedBlock(x, y, z);
    if (id === undefined) return;
    const moisture = farmlandMoisture(id);
    const sample = hash3(this.world.seed ^ this.state.tick, x, y, z) < CROP_SAMPLE_PROBABILITY;
    if (moisture !== null) {
      const above = this.world.getLoadedBlock(x, y + 1, z);
      if (above === undefined) return;
      if (tryBlockById(above)?.solid) { this.world.setBlock(x, y, z, DIRT); return; }
      if (hasFarmWater(this.world, x, y, z)) {
        if (moisture < 7) this.world.setBlock(x, y, z, farmlandId(7));
      } else if (sample) {
        if (moisture > 0) this.world.setBlock(x, y, z, farmlandId(moisture - 1));
        else if (wheatAge(above) === null) this.world.setBlock(x, y, z, DIRT);
      }
      return;
    }
    const age = wheatAge(id);
    if (age === null) return;
    if (farmlandMoisture(this.world.getLoadedBlock(x, y - 1, z) ?? AIR) === null) {
      // Direct/Agent support harvesting awards drops transactionally. Unattributed world edits have no drop owner.
      this.world.setBlock(x, y, z, AIR);
      return;
    }
    if (!sample || age === 7 || y >= WORLD_HEIGHT - 1) return;
    const packed = this.world.getLight(x, y, z);
    const effective = Math.max(packed & 15, Math.min(packed >> 4, Math.max(0, Math.min(15, skyLight))));
    if (effective < 9) return;
    let fertility = 1;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const m = farmlandMoisture(this.world.getLoadedBlock(x + dx, y - 1, z + dz) ?? AIR);
      if (m !== null) fertility += (m > 0 ? 3 : 1) / (dx === 0 && dz === 0 ? 1 : 4);
    }
    const eastWest = wheatAge(this.world.getLoadedBlock(x - 1, y, z) ?? AIR) !== null || wheatAge(this.world.getLoadedBlock(x + 1, y, z) ?? AIR) !== null;
    const northSouth = wheatAge(this.world.getLoadedBlock(x, y, z - 1) ?? AIR) !== null || wheatAge(this.world.getLoadedBlock(x, y, z + 1) ?? AIR) !== null;
    const diagonal = [[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dx, dz]) => wheatAge(this.world.getLoadedBlock(x + dx, y, z + dz) ?? AIR) !== null);
    if ((eastWest && northSouth) || diagonal) fertility /= 2;
    if (hash3(this.world.seed ^ this.state.tick ^ 0x7f4a7c15, x, y, z) < 1 / (Math.floor(25 / fertility) + 1)) {
      this.world.setBlock(x, y, z, wheatId(age + 1));
    }
  }
}
