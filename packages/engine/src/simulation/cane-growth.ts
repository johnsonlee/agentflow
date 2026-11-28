import { AIR, blockId } from "../catalog/blocks";
import { CANE_APP_PROFILE, CANE_PLANT_ID } from "../catalog/cane-profile";
import { hash3 } from "../core/random";
import { emptyCaneGrowthState, readCaneGrowthState, type CaneGrowthState } from "../persistence/cane-growth-state";
import { CHUNK_SIZE, WORLD_HEIGHT, type Chunk } from "../world/chunk";
import type { BlockEdit, World, WorldCellSnapshot } from "../world/world";

/** Deliberately bounded application policy; none of these constants are native calibration. */
export const CANE_GROWTH_CHANCE = 1 / 30;
export const CANE_GROWTH_SALT = 0x43475257;
export const CANE_GROWTH_BATCH_LIMIT = 256;
export const CANE_GROWTH_SCAN_LIMIT = 4096;
export const CANE_GROWTH_SCAN_CHUNK_LIMIT = 16;
export const CANE_GROWTH_STEP_LIMIT = 60;
type Position = readonly [number, number, number];
interface Scan { cx: number; cz: number; chunk: Chunk; index: number }
export interface CaneGrowthPlan { root: Position; edits: readonly BlockEdit[]; expected: readonly WorldCellSnapshot[] }

/** One new upper cell, strict placement-compatible support, and loaded-only dependency witnesses. */
export function planCaneGrowth(world: World, x: number, y: number, z: number): CaneGrowthPlan | null {
  if (![x, y, z].every(Number.isSafeInteger) || y < 1 || y >= WORLD_HEIGHT || world.getLoadedBlock(x, y, z) !== CANE_PLANT_ID) return null;
  let root = y;
  while (root > 0 && world.getLoadedBlock(x, root - 1, z) === CANE_PLANT_ID) root--;
  if (root < 1) return null;
  const expected: WorldCellSnapshot[] = [];
  const take = (bx: number, by: number, bz: number) => { const cell = world.captureCell(bx, by, bz); if (cell) expected.push(cell); return cell; };
  const soil = take(x, root - 1, z);
  if (!soil || ![blockId("sand"), blockId("dirt"), blockId("grass")].includes(soil.id)) return null;
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => take(x + dx, root - 1, z + dz));
  if (neighbors.some(cell => !cell) || !neighbors.some(cell => cell!.id === blockId("water"))) return null;
  let top = root;
  while (top < WORLD_HEIGHT && world.getLoadedBlock(x, top, z) === CANE_PLANT_ID) {
    if (top - root + 1 >= CANE_APP_PROFILE.maximumColumn) return null;
    const cell = take(x, top++, z); if (!cell || cell.id !== CANE_PLANT_ID) return null;
  }
  const target = take(x, top, z);
  if (!target || target.id !== AIR) return null;
  return { root: [x, root, z], edits: [[x, top, z, CANE_PLANT_ID]], expected };
}

/** Loaded simulation opportunities are checkpointed; wall-clock time and unloaded terrain never age. */
export class CaneGrowthSystem {
  private state: CaneGrowthState;
  private readonly roots = new Map<string, Position>();
  // Remember identity without retaining unloaded terrain through this scheduler.
  private readonly seenChunks = new WeakSet<Chunk>();
  private readonly scans = new Map<string, Scan>();
  private readonly unsubscribe: readonly (() => void)[];
  private updating = false;
  private disposed = false;

  constructor(private readonly world: World, raw?: CaneGrowthState) {
    const checked = readCaneGrowthState(raw);
    if (checked.kind === "invalid") throw new Error(checked.reason);
    this.state = checked.kind === "valid" ? checked.data : emptyCaneGrowthState();
    for (const [cx, cz] of world.loadedChunkCoordinates()) this.queueChunk(cx, cz);
    for (const [x, y, z, id] of world.exportEdits()) if (id === CANE_PLANT_ID) this.remember(x, y, z);
    this.unsubscribe = [
      world.onChunkChanged((cx, cz) => { if (!this.disposed) this.queueChunk(cx, cz); }),
      world.onBlockChanged((x, y, z, id) => {
        if (this.disposed) return;
        if (id === CANE_PLANT_ID) this.remember(x, y, z);
        for (const [dx, dy, dz] of [[0, 0, 0], [0, -1, 0], [0, 1, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]) this.remember(x + dx, y + dy, z + dz);
      }),
    ];
  }

  private queueChunk(cx: number, cz: number): void {
    const chunk = this.world.captureCell(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE)?.chunk, key = `${cx},${cz}`;
    if (!chunk || this.seenChunks.has(chunk)) return;
    this.seenChunks.add(chunk); this.scans.set(key, { cx, cz, chunk, index: 0 });
  }

  private remember(x: number, y: number, z: number): void {
    if (y < 0 || y >= WORLD_HEIGHT || this.world.getLoadedBlock(x, y, z) !== CANE_PLANT_ID) return;
    while (y > 0 && this.world.getLoadedBlock(x, y - 1, z) === CANE_PLANT_ID) y--;
    this.roots.set(`${x},${y},${z}`, [x, y, z]);
  }

  private scanLoaded(): void {
    let remaining = CANE_GROWTH_SCAN_LIMIT, visited = 0;
    while (remaining > 0 && visited++ < CANE_GROWTH_SCAN_CHUNK_LIMIT && this.scans.size && !this.disposed) {
      const [key, scan] = this.scans.entries().next().value!;
      if (this.world.captureCell(scan.cx * CHUNK_SIZE, 0, scan.cz * CHUNK_SIZE)?.chunk !== scan.chunk) { this.scans.delete(key); continue; }
      const count = Math.min(remaining, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT - scan.index);
      for (let i = 0; i < count && !this.disposed; i++, scan.index++, remaining--) {
        const x = scan.cx * CHUNK_SIZE + scan.index % CHUNK_SIZE;
        const z = scan.cz * CHUNK_SIZE + Math.floor(scan.index / CHUNK_SIZE) % CHUNK_SIZE;
        const y = Math.floor(scan.index / (CHUNK_SIZE * CHUNK_SIZE));
        this.remember(x, y, z);
      }
      this.scans.delete(key);
      if (!this.disposed && scan.index < CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT) this.scans.set(key, scan);
    }
  }

  toJSON(): CaneGrowthState { return { ...this.state }; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; for (const stop of this.unsubscribe) stop();
    this.roots.clear(); this.scans.clear();
  }

  update(dt: number): void {
    if (this.disposed || this.updating || this.world.blockSourceLeaseBusy || !Number.isFinite(dt) || dt < 0 || dt > 86400) return;
    this.updating = true;
    try {
      this.scanLoaded(); if (this.disposed || this.world.blockSourceLeaseBusy) return;
      this.state.accumulator = Math.round(Math.min(86400, this.state.accumulator + dt) * 1e9) / 1e9;
      let steps = 0;
      while (this.state.accumulator + 1e-9 >= 1 && steps++ < CANE_GROWTH_STEP_LIMIT && !this.disposed && !this.world.blockSourceLeaseBusy) {
        this.state.accumulator = Math.max(0, this.state.accumulator - 1);
        this.state.tick = (this.state.tick + 1) % 1_000_000_001;
        const roots = [...this.roots.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        if (!roots.length) { this.state.cursor = 0; continue; }
        const start = this.state.cursor % roots.length, count = Math.min(roots.length, CANE_GROWTH_BATCH_LIMIT);
        const sampled = new Set<string>();
        for (let i = 0; i < count && !this.disposed && !this.world.blockSourceLeaseBusy; i++) {
          const [x, y, z] = roots[(start + i) % roots.length], key = `${x},${y},${z}`;
          // Publish the opportunity cursor before notifications can checkpoint the committed world.
          this.state.cursor = (start + i + 1) % roots.length;
          const id = this.world.getLoadedBlock(x, y, z);
          if (id === undefined) continue;
          if (id !== CANE_PLANT_ID) { this.roots.delete(key); continue; }
          // A lower stem may have been reinserted since an upper root was queued.
          // Normalize before sampling, so one physical root receives only one roll.
          let base = y;
          while (base > 0 && this.world.getLoadedBlock(x, base - 1, z) === CANE_PLANT_ID) base--;
          const actualKey = `${x},${base},${z}`;
          if (base !== y) { this.roots.delete(key); this.roots.set(actualKey, [x, base, z]); }
          if (sampled.has(actualKey)) continue;
          sampled.add(actualKey);
          if (hash3(this.world.seed ^ this.state.tick ^ CANE_GROWTH_SALT, x, base, z) >= CANE_GROWTH_CHANCE) continue;
          const plan = planCaneGrowth(this.world, x, base, z);
          if (!plan || this.disposed) continue;
          this.world.commitBlockBatch(plan.edits, undefined, plan.expected, () => !this.disposed);
        }
      }
    } finally { this.updating = false; }
  }
}
