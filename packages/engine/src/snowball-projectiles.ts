import { blockById } from "./blocks";
import { BLOCK_COLLISION_ORIGIN_BELOW, MAX_BLOCK_COLLISION_HEIGHT, blockCollisionBoxes, type LocalBox } from "./block-geometry";
import { MAX_Y, MIN_Y, WORLD_BORDER, type Vec3 } from "./math";
import type { Inventory } from "./inventory";
import type { GameMode } from "./rules";
import { maxStackOf, stackId } from "./items";
export interface SnowballBox { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
type Box = SnowballBox;

/** Application calibration of native power1.5/gravity.03 at20Hz; not measured Education physics.
 * Lifetime, capacity and backlog limits are application bounds; water has no special drag here. */
export const SNOWBALL_PROJECTILE_PROFILE = Object.freeze({ radius: .125, launchSpeed: 30, gravity: 12, maxAgeSeconds: 10, maxActive: 128, maxDt: .25, maxStep: 1 / 120 });
export interface SnowballProjectile { key: number; position: Vec3; velocity: Vec3; ageSeconds: number }
export interface SnowballProjectilesData { version: 1; nextKey: number; records: SnowballProjectile[] }
export interface SnowballImpact { key: number; position: Vec3; kind: "block" | "mob" | "expired" | "boundary"; mobId?: number; particleCount: 6 }
export interface SnowballTarget { id: number; box: Box }
interface LoadedWorld { getLoadedBlock(x: number, y: number, z: number): number | undefined }
const copy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
const clone = (r: SnowballProjectile): SnowballProjectile => ({ key: r.key, position: copy(r.position), velocity: copy(r.velocity), ageSeconds: r.ageSeconds });
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const vector = (v: unknown): v is Vec3 => obj(v) && finite(own(v, "x")) && finite(own(v, "y")) && finite(own(v, "z"));
const validPosition = (v: unknown): v is Vec3 => vector(v) && Math.abs(v.x) <= WORLD_BORDER && Math.abs(v.z) <= WORLD_BORDER && v.y >= MIN_Y && v.y <= MAX_Y;
const validVelocity = (v: unknown): v is Vec3 => vector(v) && Math.hypot(v.x, v.y, v.z) <= SNOWBALL_PROJECTILE_PROFILE.launchSpeed + SNOWBALL_PROJECTILE_PROFILE.gravity * SNOWBALL_PROJECTILE_PROFILE.maxAgeSeconds + 1e-8;
const key = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const own = (v: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(v, k) ? v[k] : undefined;

/** Segment versus radius-expanded AABB. Returns the earliest fraction, including an inside start. */
function contact(a: Vec3, b: Vec3, box: Box): number | null {
  let lo = 0, hi = 1;
  for (const [axis, min, max] of [["x", "minX", "maxX"], ["y", "minY", "maxY"], ["z", "minZ", "maxZ"]] as const) {
    const delta = b[axis] - a[axis], lower = box[min] - SNOWBALL_PROJECTILE_PROFILE.radius, upper = box[max] + SNOWBALL_PROJECTILE_PROFILE.radius;
    if (Math.abs(delta) < 1e-12) { if (a[axis] < lower || a[axis] > upper) return null; continue; }
    const t0 = (lower - a[axis]) / delta, t1 = (upper - a[axis]) / delta;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    if (lo > hi) return null;
  }
  return lo <= 1 && hi >= 0 ? lo : null;
}
function validBox(b: unknown): b is Box {
  if (!obj(b)) return false;
  return ["minX", "minY", "minZ", "maxX", "maxY", "maxZ"].every(k => finite(b[k])) &&
    (b.minX as number) <= (b.maxX as number) && (b.minY as number) <= (b.maxY as number) && (b.minZ as number) <= (b.maxZ as number) &&
    (b.maxX as number) - (b.minX as number) <= 8 && (b.maxY as number) - (b.minY as number) <= 8 && (b.maxZ as number) - (b.minZ as number) <= 8;
}

/** Consumed thrown-item ownership. It never creates pickup items or mutates a target's health. */
export class SnowballProjectiles {
  readonly loadIssues: number;
  private shots: SnowballProjectile[] = [];
  private nextKey = 1;
  private disposed = false;
  constructor(private readonly world: LoadedWorld, raw?: unknown) {
    if (raw === undefined) { this.loadIssues = 0; return; }
    let valid = obj(raw) && own(raw, "version") === 1 && key(own(raw, "nextKey")) && Array.isArray(own(raw, "records"));
    const rows = valid ? own(raw as Record<string, unknown>, "records") as unknown[] : [];
    const seen = new Set<number>();
    valid &&= rows.length <= SNOWBALL_PROJECTILE_PROFILE.maxActive;
    if (valid) for (const row of rows) {
      if (!obj(row) || !key(own(row, "key")) || seen.has(row.key as number) || !validPosition(own(row, "position")) || !validVelocity(own(row, "velocity")) || !finite(own(row, "ageSeconds")) || (row.ageSeconds as number) < 0 || (row.ageSeconds as number) >= SNOWBALL_PROJECTILE_PROFILE.maxAgeSeconds || Math.hypot((row.velocity as unknown as Vec3).x, (row.velocity as unknown as Vec3).y, (row.velocity as unknown as Vec3).z) > SNOWBALL_PROJECTILE_PROFILE.launchSpeed + SNOWBALL_PROJECTILE_PROFILE.gravity * (row.ageSeconds as number) + 1e-8 || (row.key as number) >= (own(raw as Record<string, unknown>, "nextKey") as number)) { valid = false; break; }
      seen.add(row.key as number);
    }
    this.loadIssues = valid ? 0 : 1;
    if (valid) { this.nextKey = (raw as unknown as SnowballProjectilesData).nextKey; this.shots = (rows as SnowballProjectile[]).map(clone); }
  }
  get records(): readonly SnowballProjectile[] { return this.shots.map(clone); }
  toJSON(): SnowballProjectilesData { return { version: 1, nextKey: this.nextKey, records: this.shots.map(clone) }; }
  spawn(position: Vec3, direction: Vec3): number | null {
    if (this.disposed || this.loadIssues || !validPosition(position) || !vector(direction) || this.shots.length >= SNOWBALL_PROJECTILE_PROFILE.maxActive || this.nextKey >= Number.MAX_SAFE_INTEGER) return null;
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!Number.isFinite(length) || length < 1e-12) return null;
    const id = this.nextKey++;
    this.shots.push({ key: id, position: copy(position), velocity: { x: direction.x / length * SNOWBALL_PROJECTILE_PROFILE.launchSpeed, y: direction.y / length * SNOWBALL_PROJECTILE_PROFILE.launchSpeed, z: direction.z / length * SNOWBALL_PROJECTILE_PROFILE.launchSpeed }, ageSeconds: 0 });
    return id;
  }
  update(dt: number, targets: readonly SnowballTarget[] = []): SnowballImpact[] {
    if (this.disposed || !finite(dt) || dt <= 0) return [];
    // A long frame advances at most .25s. The omitted backlog is explicitly discarded, never teleported.
    const duration = Math.min(dt, SNOWBALL_PROJECTILE_PROFILE.maxDt), n = Math.ceil(duration / SNOWBALL_PROJECTILE_PROFILE.maxStep), h = duration / n;
    const eligible = targets.slice(0, 1024).filter(t => key(t.id) && validBox(t.box));
    const impacts: SnowballImpact[] = [];
    const awaitingLoadedCells = new Set<number>();
    for (let step = 0; step < n; step++) {
      const survivors: SnowballProjectile[] = [];
      for (const shot of this.shots) {
        if (awaitingLoadedCells.has(shot.key)) { survivors.push(shot); continue; }
        const delta = Math.min(h, SNOWBALL_PROJECTILE_PROFILE.maxAgeSeconds - shot.ageSeconds), a = shot.position;
        const b = { x: a.x + shot.velocity.x * delta, y: a.y + shot.velocity.y * delta - .5 * SNOWBALL_PROJECTILE_PROFILE.gravity * delta * delta, z: a.z + shot.velocity.z * delta };
        let best = Infinity, kind: SnowballImpact["kind"] = "block", mobId: number | undefined, unknown = false;
        const x0 = Math.floor(Math.min(a.x, b.x) - SNOWBALL_PROJECTILE_PROFILE.radius), x1 = Math.floor(Math.max(a.x, b.x) + SNOWBALL_PROJECTILE_PROFILE.radius);
        const y0 = Math.floor(Math.min(a.y, b.y) - SNOWBALL_PROJECTILE_PROFILE.radius), y1 = Math.floor(Math.max(a.y, b.y) + SNOWBALL_PROJECTILE_PROFILE.radius);
        const z0 = Math.floor(Math.min(a.z, b.z) - SNOWBALL_PROJECTILE_PROFILE.radius), z1 = Math.floor(Math.max(a.z, b.z) + SNOWBALL_PROJECTILE_PROFILE.radius);
        for (let x = x0; x <= x1; x++) for (let y = y0 - BLOCK_COLLISION_ORIGIN_BELOW; y <= y1; y++) for (let z = z0; z <= z1; z++) {
          const id = this.world.getLoadedBlock(x, y, z);
          // Unknown cells could contain an above-origin fence. Conservative pause retains the
          // flight owner rather than inventing an impact or generating a chunk.
          let uncertain = id === undefined;
          const geometryGet = (gx: number, gy: number, gz: number) => {
            const adjacent = this.world.getLoadedBlock(gx, gy, gz);
            if (adjacent === undefined) { uncertain = true; return 1; }
            return adjacent;
          };
          const boxes: readonly LocalBox[] = id === undefined ? [[0, 0, 0, 1, MAX_BLOCK_COLLISION_HEIGHT, 1]] : blockCollisionBoxes(geometryGet, x, y, z, id);
          // A known fence next to unloaded terrain is conservatively connected until loaded;
          // even a definite post contact waits if its neighbor geometry is unresolved.
          for (const bounds of boxes) {
            const at = contact(a, b, { minX: x + bounds[0], minY: y + bounds[1], minZ: z + bounds[2], maxX: x + bounds[3], maxY: y + bounds[4], maxZ: z + bounds[5] });
            if (at !== null && at < best) { best = at; kind = "block"; unknown = uncertain; }
          }
        }
        for (const target of eligible) {
          const at = contact(a, b, target.box);
          if (at !== null && at < best - 1e-12) { best = at; kind = "mob"; mobId = target.id; unknown = false; }
        }
        // Consumed owners must survive Continue before chunk generation is ready. Unknown
        // terrain freezes this entire substep, including gravity/age, without generating cells.
        if (unknown) { awaitingLoadedCells.add(shot.key); survivors.push(shot); continue; }
        shot.ageSeconds += delta;
        if (best !== Infinity) {
          impacts.push({ key: shot.key, position: { x: a.x + (b.x - a.x) * best, y: a.y + (b.y - a.y) * best, z: a.z + (b.z - a.z) * best }, kind, ...(kind === "mob" ? { mobId } : {}), particleCount: 6 });
          continue;
        }
        shot.position = b; shot.velocity.y -= SNOWBALL_PROJECTILE_PROFILE.gravity * delta;
        if (!validPosition(b) || shot.ageSeconds >= SNOWBALL_PROJECTILE_PROFILE.maxAgeSeconds - 1e-12) { impacts.push({ key: shot.key, position: copy(b), kind: validPosition(b) ? "expired" : "boundary", particleCount: 6 }); continue; }
        survivors.push(shot);
      }
      this.shots = survivors;
    }
    return impacts;
  }
  dispose(): void { this.disposed = true; this.shots = []; }
}

/** The flight record is allocated before exactly one survival item leaves its selected slot. */
export function tryThrowSnowball(inventory: Inventory, mode: GameMode, position: Vec3, direction: Vec3, store: SnowballProjectiles): number | null {
  const selected = inventory.selectedStack();
  if (!selected || selected.id !== stackId("snowball") || !Number.isSafeInteger(selected.count) || selected.count < 1 || selected.count > maxStackOf(selected.id) || (mode !== "survival" && mode !== "creative")) return null;
  const id = store.spawn(position, direction);
  if (id !== null && mode === "survival") inventory.takeSelected();
  return id;
}
