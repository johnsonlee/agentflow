import { AIR } from "../catalog/blocks";
import type { ItemStack } from "./inventory";
import { baseStackId, durabilityOf, isKnownId } from "../catalog/items";
import { WORLD_BORDER, type Vec3 } from "../core/math";
import { bodyBox, boxCollides, GRAVITY, moveAxis, TERMINAL_VELOCITY } from "../simulation/physics";
import { sanitizeStack } from "../persistence/savecheck";
import { cloneStack, stackLimit, stacksCompatible } from "./stack";
import { inspectItemState } from "./item-state";
import { WORLD_HEIGHT } from "../world/chunk";
import type { World } from "../world/world";

/** Original application model; only general five-minute lifetime has primary support.
 * Loaded-only timing, dimensions, radii, delay and collision dynamics are not Education measurements.
 */
export const WORLD_DROP_PROFILE = Object.freeze({ bodySize: .25, pickupDelay: .5, pickupRadius: .75, mergeRadius: .5, lifetime: 300 });
export interface DroppedItemRecord {
  key: number; stack: ItemStack; position: Vec3; velocity: Vec3; ageSeconds: number; pickupDelaySeconds: number;
}
export interface WorldDropsData { nextKey: number; records: DroppedItemRecord[] }
/** A one-use synchronous reservation. False must leave both source and receiver unchanged. */
export interface DropBatch { commit(): boolean }
export type DropSink = (stacks: readonly ItemStack[], position: Vec3, velocity?: Vec3) => DropBatch | null;
type LoadedWorld = Pick<World, "getLoadedBlock">;
const plain = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const own = (x: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(x, k) ? x[k] : undefined;
const finite = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
const vector = (x: unknown, velocity = false): x is Vec3 => plain(x) && finite(own(x, "x"), velocity ? -256 : -WORLD_BORDER, velocity ? 256 : WORLD_BORDER) && finite(own(x, "z"), velocity ? -256 : -WORLD_BORDER, velocity ? 256 : WORLD_BORDER) && finite(own(x, "y"), velocity ? -256 : -1024, velocity ? 256 : 1024);
const copyRecord = (r: DroppedItemRecord): DroppedItemRecord => ({ ...r, stack: cloneStack(r.stack), position: { ...r.position }, velocity: { ...r.velocity } });
function validStack(raw: unknown, bulk = false): ItemStack | null {
  if (!plain(raw)) return null;
  const id = own(raw, "id"), count = own(raw, "count"), damage = own(raw, "damage");
  if (typeof id !== "number" || id === AIR || !isKnownId(id) || !Number.isSafeInteger(count) || (count as number) <= 0) return null;
  const durability = durabilityOf(id);
  if (damage !== undefined && (!Number.isInteger(damage) || (damage as number) < 0 || durability === null || (damage as number) >= durability)) return null;
  // Inspect ORIGINAL ownership before normalizing count for sanitation. Active bulk must not
  // become multiple valid singletons through the count1 validation shortcut.
  if (inspectItemState(raw, bulk).kind === "invalid") return null;
  if (!bulk && (count as number) > stackLimit(raw as unknown as ItemStack)) return null;
  const clean = sanitizeStack({ ...raw, count: 1 });
  if (!clean) return null;
  const book = own(raw, "book");
  // Invalid metadata is diagnosed, never silently repaired into another world-owned object.
  if (book !== undefined && (!plain(book) || !Array.isArray(own(book, "pages")) || (JSON.stringify(clean.book?.pages) !== JSON.stringify(own(book, "pages")) || clean.book?.title !== own(book, "title") || clean.book?.author !== own(book, "author")))) return null;
  return cloneStack(clean, count as number);
}

function readWorldDrops(raw: unknown): { data: WorldDropsData; invalid: number } {
  const data: WorldDropsData = { nextKey: 1, records: [] };
  if (raw === undefined) return { data, invalid: 0 };
  if (!plain(raw) || !Array.isArray(own(raw, "records"))) return { data, invalid: 1 };
  let invalid = 0, maximum = 0; const keys = new Set<number>();
  for (const r of own(raw, "records") as unknown[]) {
    if (!plain(r)) { invalid++; continue; }
    const key = own(r, "key"), stack = validStack(own(r, "stack")), position = own(r, "position"), velocity = own(r, "velocity"), age = own(r, "ageSeconds"), delay = own(r, "pickupDelaySeconds");
    if (typeof key !== "number" || !Number.isSafeInteger(key) || key < 1 || key >= Number.MAX_SAFE_INTEGER || keys.has(key) || !stack || !vector(position) || !vector(velocity, true) || !finite(age, 0, WORLD_DROP_PROFILE.lifetime) || !finite(delay, 0, WORLD_DROP_PROFILE.lifetime)) { invalid++; continue; }
    keys.add(key); maximum = Math.max(maximum, key);
    data.records.push({ key, stack, position: { ...position }, velocity: { ...velocity }, ageSeconds: age, pickupDelaySeconds: delay });
  }
  const next = own(raw, "nextKey");
  if (typeof next === "number" && Number.isSafeInteger(next) && next > maximum && next <= Number.MAX_SAFE_INTEGER) data.nextKey = next;
  else { data.nextKey = maximum + 1; invalid++; }
  return { data, invalid };
}

export function sanitizeWorldDrops(raw: unknown): { data: WorldDropsData; invalid: number } {
  try { return readWorldDrops(raw); } catch { return { data: { nextKey: 1, records: [] }, invalid: 1 }; }
}

/** Persistent authoritative stacks. Rendering/unloading never owns or deletes them. */
export class WorldDrops {
  private readonly items = new Map<number, DroppedItemRecord>();
  private nextKey = 1;
  private disposed = false;
  private transferring = false;
  readonly loadIssues: number;
  constructor(private readonly world: LoadedWorld, raw?: unknown) {
    const loaded = sanitizeWorldDrops(raw); this.loadIssues = loaded.invalid; this.nextKey = loaded.data.nextKey;
    for (const r of loaded.data.records) this.items.set(r.key, r);
  }
  get records(): DroppedItemRecord[] { return [...this.items.values()].map(copyRecord); }
  toJSON(): WorldDropsData { return { nextKey: this.nextKey, records: this.records }; }
  dispose(): void { this.disposed = true; }

  planSpawnBatch(stacks: readonly ItemStack[], position: Vec3, velocity: Vec3 = { x: 0, y: 0, z: 0 }): DropBatch | null {
    if (this.disposed || !vector(position) || !vector(velocity, true) || !Array.isArray(stacks)) return null;
    const clean: ItemStack[] = []; let needed = 0;
    for (const s of stacks) {
      const stack = validStack(s, true); if (!stack) return null;
      needed += Math.ceil(stack.count / stackLimit(stack)); if (!Number.isSafeInteger(needed)) return null;
      clean.push(stack);
    }
    // Allocation refusal is explicit and leaves the source owner intact; never truncate a suffix.
    if (needed > 100000 || this.nextKey + needed > Number.MAX_SAFE_INTEGER) return null;
    const p = { ...position }, v = { ...velocity }; let used = false;
    return { commit: () => {
      if (used || this.disposed || this.nextKey + needed > Number.MAX_SAFE_INTEGER) return false;
      used = true;
      const records: DroppedItemRecord[] = []; let key = this.nextKey;
      for (const s of clean) for (let left = s.count; left > 0;) {
        const n = Math.min(left, stackLimit(s)); left -= n;
        records.push({ key: key++, stack: cloneStack(s, n), position: { ...p }, velocity: { ...v }, ageSeconds: 0, pickupDelaySeconds: WORLD_DROP_PROFILE.pickupDelay });
      }
      for (const r of records) this.items.set(r.key, r);
      this.nextKey = key; return true;
    } };
  }
  spawnBatch(stacks: readonly ItemStack[], position: Vec3, velocity?: Vec3): boolean { return this.planSpawnBatch(stacks, position, velocity)?.commit() ?? false; }

  private loaded(p: Vec3): boolean {
    const b = bodyBox(p, WORLD_DROP_PROFILE.bodySize, WORLD_DROP_PROFILE.bodySize);
    for (let x = Math.floor(b.minX + 1e-6); x <= Math.floor(b.maxX - 1e-6); x++) for (let z = Math.floor(b.minZ + 1e-6); z <= Math.floor(b.maxZ - 1e-6); z++) for (let y = Math.floor(b.minY + 1e-6); y <= Math.floor(b.maxY - 1e-6); y++) if (this.world.getLoadedBlock(x, Math.max(0, Math.min(WORLD_HEIGHT - 1, y)), z) === undefined) return false;
    return true;
  }
  update(dt: number): void {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;
    const active: DroppedItemRecord[] = [];
    for (const r of this.items.values()) {
      if (!this.loaded(r.position)) continue;
      const duration = Math.min(dt, WORLD_DROP_PROFILE.lifetime - r.ageSeconds);
      const steps = Math.max(1, Math.ceil(duration * 60)); const h = duration / steps;
      for (let i = 0; i < steps; i++) {
        const get = (x: number, y: number, z: number) => this.world.getLoadedBlock(x, y, z) ?? 1; // Unloaded is a collision boundary, never generated air.
        r.velocity.y = Math.max(-TERMINAL_VELOCITY, r.velocity.y - GRAVITY * h);
        for (const axis of ["x", "z", "y"] as const) {
          const trial = { ...r.position };
          if (moveAxis(get, trial, axis, r.velocity[axis] * h, WORLD_DROP_PROFILE.bodySize, WORLD_DROP_PROFILE.bodySize)) r.velocity[axis] = 0;
          if (Math.abs(trial.x) <= WORLD_BORDER && Math.abs(trial.z) <= WORLD_BORDER && this.loaded(trial)) r.position = trial;
          else r.velocity[axis] = 0;
          if (r.position.y < -1024) { r.position.y = -1024; r.velocity.y = 0; }
        }
        // Original ground-friction model, independent of rendering offsets.
        r.velocity.x *= Math.exp(-4 * h); r.velocity.z *= Math.exp(-4 * h);
      }
      r.ageSeconds += duration; r.pickupDelaySeconds = Math.max(0, r.pickupDelaySeconds - duration);
      if (r.ageSeconds >= WORLD_DROP_PROFILE.lifetime) this.items.delete(r.key); else active.push(r);
    }
    for (let i = 0; i < active.length; i++) {
      const a = active[i]; if (!this.items.has(a.key)) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j]; if (!this.items.has(b.key) || !stacksCompatible(a.stack, b.stack) || Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) > WORLD_DROP_PROFILE.mergeRadius) continue;
        const n = Math.min(stackLimit(a.stack) - a.stack.count, b.stack.count); if (n <= 0) continue;
        a.stack.count += n; b.stack.count -= n;
        a.ageSeconds = b.ageSeconds = Math.max(a.ageSeconds, b.ageSeconds);
        a.pickupDelaySeconds = b.pickupDelaySeconds = Math.max(a.pickupDelaySeconds, b.pickupDelaySeconds);
        if (b.stack.count === 0) this.items.delete(b.key);
      }
    }
  }
  tryPickup(position: Vec3, receive: (stack: ItemStack) => number, filterId?: number): number {
    if (this.disposed || this.transferring || !vector(position) || (filterId !== undefined && !isKnownId(filterId))) return 0;
    let collected = 0; this.transferring = true;
    try {
      for (const r of this.items.values()) {
      if (r.pickupDelaySeconds > 0 || !this.loaded(r.position) || (filterId !== undefined && r.stack.id !== baseStackId(filterId)) || Math.hypot(r.position.x - position.x, r.position.y - position.y, r.position.z - position.z) > WORLD_DROP_PROFILE.pickupRadius) continue;
      // Do not collect through an occupied body. Liquid/fire special effects are intentionally absent.
      if (boxCollides((x, y, z) => this.world.getLoadedBlock(x, y, z) ?? 1, bodyBox(r.position, WORLD_DROP_PROFILE.bodySize, WORLD_DROP_PROFILE.bodySize))) continue;
      const left = receive(cloneStack(r.stack));
      if (!Number.isInteger(left) || left < 0 || left > r.stack.count) throw new Error("Invalid world-drop receiver remainder");
      const n = r.stack.count - left; collected += n;
      if (left === 0) this.items.delete(r.key); else r.stack.count = left;
    }
    return collected;
    } finally { this.transferring = false; }
  }
}
