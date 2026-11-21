import { balloonColorOf } from "./balloon-colors";
import { blockById, blockId } from "./blocks";
import { BLOCK_COLLISION_ORIGIN_BELOW } from "./block-geometry";
import { WORLD_HEIGHT } from "./chunk";
import { MOB_SPECS, type Mob } from "./entities";
import { HOTBAR_SIZE, type Inventory, type ItemStack } from "./inventory";
import { maxStackOf } from "./items";
import { MAX_Y, MIN_Y, WORLD_BORDER, type Vec3 } from "./math";
import { bodyBox, boxCollides, moveAxis, substeps } from "./physics";
import type { GameMode } from "./rules";
import { joinLeashRefundSink, type LeashContext, type ReleaseAttempt, type ReleaseLease } from "./leashes";
import type { DropSink } from "./world-drops";

/** Application units (blocks, seconds, mass1), NOT active Education calibration.
 * Retained native references: body .4, no gravity, lift vector1.6; generic soft2/max10.
 * Buoyancy48 exceeds application gravity32. A capped extension spring alone pulls the actor.
 */
export const BALLOON_PROFILE = Object.freeze({ width: .4, height: .4, softDistance: 2, breakDistance: 10, buoyancy: 48, spring: 48, maxPull: 64, maxRise: 3, drag: 2, attachReach: 4, maxRecords: 128 });
export type BalloonTarget = { kind: "mob"; mobId: number } | { kind: "fence"; x: number; y: number; z: number };
export interface BalloonRecord {
  key: number; itemId: number; target: BalloonTarget; phase: "active" | "refund-pending";
  position: Vec3; velocity: Vec3; lastAnchor: Vec3; reason?: "actor-removed" | "anchor-removed";
}
export interface BalloonsData { version: 1; nextKey: number; records: BalloonRecord[] }
interface Owned { record: BalloonRecord; revision: number; referencesChecked: boolean; fenceChecked: boolean }
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) && !Object.getOwnPropertySymbols(v).length && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => "value" in d);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.getOwnPropertyNames(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const denseArray = (v: unknown): v is unknown[] => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && !Object.getOwnPropertySymbols(v).length && Object.getOwnPropertyNames(v).length === v.length + 1 && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => "value" in d);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const safe = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) < Number.MAX_SAFE_INTEGER;
const vector = (v: unknown): v is Vec3 => plain(v) && exact(v, ["x", "y", "z"]) && finite(v.x) && finite(v.y) && finite(v.z);
const position = (v: unknown): v is Vec3 => vector(v) && Math.abs(v.x) <= WORLD_BORDER && Math.abs(v.z) <= WORLD_BORDER && v.y >= MIN_Y && v.y <= MAX_Y;
const velocity = (v: unknown): v is Vec3 => vector(v) && Math.abs(v.x) <= 64 && Math.abs(v.y) <= 64 && Math.abs(v.z) <= 64;
const coord = (v: Record<string, unknown>) => ["x", "y", "z"].every(k => Number.isInteger(v[k])) && Math.abs(v.x as number) <= WORLD_BORDER && Math.abs(v.z as number) <= WORLD_BORDER && (v.y as number) >= 0 && (v.y as number) < WORLD_HEIGHT;
const validTarget = (v: unknown): v is BalloonTarget => plain(v) && (v.kind === "mob" ? exact(v, ["kind", "mobId"]) && safe(v.mobId) : v.kind === "fence" && exact(v, ["kind", "x", "y", "z"]) && coord(v));
const copy = (p: Vec3): Vec3 => ({ x: p.x, y: p.y, z: p.z });
const copyRecord = (r: BalloonRecord): BalloonRecord => ({ ...r, target: { ...r.target }, position: copy(r.position), velocity: copy(r.velocity), lastAnchor: copy(r.lastAnchor) });
const same = (a: Vec3, b: Vec3) => a.x === b.x && a.y === b.y && a.z === b.z;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const supported = (m: Mob) => m.kind === "pig" || m.kind === "sheep" || m.kind === "chicken";
const living = (m: Mob) => supported(m) && finite(m.health) && m.health > 0 && m.health <= MOB_SPECS[m.kind].maxHealth && position(m.position);
const matches = (ctx: LeashContext, id: number) => ctx.mobs.filter(m => m.id === id);
const loaded = (ctx: LeashContext, p: Vec3) => ctx.getLoadedBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) !== undefined;
/** Match ordinary collision origins, including raised fences and their neighbor-dependent arms.
 * The swept union is conservative: any unknown dependency suspends the entire operation.
 */
const knownBody = (ctx: LeashContext, p: Vec3, width: number, height: number, to: Vec3 = p): boolean => {
  if (!position(p) || !position(to)) return false;
  const a = bodyBox(p, width, height), b = bodyBox(to, width, height), eps = 1e-6;
  const x0 = Math.floor(Math.min(a.minX, b.minX) + eps), x1 = Math.floor(Math.max(a.maxX, b.maxX) - eps);
  const y0 = Math.floor(Math.min(a.minY, b.minY) + eps) - BLOCK_COLLISION_ORIGIN_BELOW, y1 = Math.floor(Math.max(a.maxY, b.maxY) - eps);
  const z0 = Math.floor(Math.min(a.minZ, b.minZ) + eps), z1 = Math.floor(Math.max(a.maxZ, b.maxZ) - eps);
  if (x1 - x0 > 8 || y1 - y0 > 8 || z1 - z0 > 8) return false;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const id = ctx.getLoadedBlock(x, y, z);
    if (id === undefined) return false;
    if (blockById(id).shape === "fence") for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      if (ctx.getLoadedBlock(x + dx, y, z + dz) === undefined) return false;
    }
  }
  return true;
};
const knownMobBody = (ctx: LeashContext, target: BalloonTarget): boolean => {
  if (target.kind !== "mob") return true;
  const actors = matches(ctx, target.mobId), mob = actors[0];
  return actors.length === 1 && living(mob) && knownBody(ctx, mob.position, MOB_SPECS[mob.kind].width, MOB_SPECS[mob.kind].height);
};
const collisionGetter = (ctx: LeashContext) => (x: number, y: number, z: number) => ctx.getLoadedBlock(x, y, z) ?? blockId("stone");
const anchorFor = (t: BalloonTarget, ctx: LeashContext): Vec3 | null => {
  if (t.kind === "fence") return ctx.getLoadedBlock(t.x, t.y, t.z) === blockId("oak_fence") ? { x: t.x + .5, y: t.y + .75, z: t.z + .5 } : null;
  const actors = matches(ctx, t.mobId), mob = actors[0];
  return actors.length === 1 && living(mob) && loaded(ctx, mob.position) ? { x: mob.position.x, y: mob.position.y + MOB_SPECS[mob.kind].height, z: mob.position.z } : null;
};
function readData(raw: unknown): BalloonsData | null {
  if (!plain(raw) || !exact(raw, ["version", "nextKey", "records"]) || raw.version !== 1 || !Number.isSafeInteger(raw.nextKey) || (raw.nextKey as number) < 1 || (raw.nextKey as number) > Number.MAX_SAFE_INTEGER || !denseArray(raw.records) || raw.records.length > BALLOON_PROFILE.maxRecords) return null;
  const keys = new Set<number>(), mobs = new Set<number>(), records: BalloonRecord[] = [];
  for (const r of raw.records) {
    if (!plain(r) || (r.phase !== "active" && r.phase !== "refund-pending") || !exact(r, r.phase === "active" ? ["key", "itemId", "target", "phase", "position", "velocity", "lastAnchor"] : ["key", "itemId", "target", "phase", "position", "velocity", "lastAnchor", "reason"]) || !safe(r.key) || keys.has(r.key) || !finite(r.itemId) || !balloonColorOf(r.itemId) || !validTarget(r.target) || !position(r.position) || !position(r.lastAnchor) || !velocity(r.velocity)) return null;
    if (r.target.kind === "mob") { if (mobs.has(r.target.mobId)) return null; mobs.add(r.target.mobId); }
    if (r.phase === "refund-pending" && (r.reason !== "actor-removed" && r.reason !== "anchor-removed" || r.reason === "actor-removed" && r.target.kind !== "mob" || r.reason === "anchor-removed" && r.target.kind !== "fence")) return null;
    keys.add(r.key); records.push(copyRecord(r as unknown as BalloonRecord));
  }
  return records.some(r => r.key >= (raw.nextKey as number)) ? null : { version: 1, nextKey: raw.nextKey as number, records };
}

/** Each record owns one entire colored product, including its crafting Lead; never another Lead. */
export class BalloonStore {
  private readonly owners = new Map<number, Owned>();
  private nextKey = 1;
  private issues = 0;
  private locked = false;
  private leaseToken: object | null = null;
  private closed = false;
  constructor(raw?: unknown) {
    if (raw === undefined) return;
    try {
      const data = readData(raw);
      if (!data) { this.issues = 1; return; }
      this.nextKey = data.nextKey;
      for (const record of data.records) this.owners.set(record.key, { record, revision: 0, referencesChecked: false, fenceChecked: record.target.kind === "mob" });
    } catch { this.issues = 1; }
  }
  get loadIssues(): number { return this.issues; }
  get busy(): boolean { return this.locked || this.leaseToken !== null; }
  get records(): BalloonRecord[] { return [...this.owners.values()].map(o => copyRecord(o.record)); }
  private available() { return !this.busy && !this.closed && !this.issues; }
  toJSON(): BalloonsData {
    if (this.busy || this.closed || this.issues || [...this.owners.values()].some(o => !o.referencesChecked)) throw new Error("Cannot save unresolved, damaged or busy balloon ownership");
    return { version: 1, nextKey: this.nextKey, records: this.records };
  }
  private initialReferences(ctx: LeashContext): void {
    for (const o of this.owners.values()) {
      const r = o.record;
      if (!o.referencesChecked) {
        if (r.target.kind === "mob") {
          const actors = matches(ctx, r.target.mobId);
          if (actors.length > 1 || actors.length === 1 && !living(actors[0]) || r.phase === "active" && actors.length !== 1) { this.issues++; continue; }
        }
        o.referencesChecked = true;
      }
      if (r.phase === "active" && r.target.kind === "fence" && !o.fenceChecked) {
        const id = ctx.getLoadedBlock(r.target.x, r.target.y, r.target.z);
        if (id === undefined) continue;
        if (id !== blockId("oak_fence")) { this.issues++; continue; }
        o.fenceChecked = true;
      }
    }
  }
  validateCrossReferences(ctx: LeashContext): number {
    if (!this.available()) return this.issues;
    this.locked = true;
    try { this.initialReferences(ctx); } catch { this.issues++; } finally { this.locked = false; }
    return this.issues;
  }
  attachFromInventory(inv: Inventory, mode: GameMode, target: BalloonTarget, ctx: LeashContext): boolean {
    if (!this.available()) return false;
    this.locked = true;
    try {
      this.initialReferences(ctx);
      const selected = inv.selected, slots = inv.slots;
      if (this.issues || !validTarget(target) || !position(ctx.player) || !loaded(ctx, ctx.player) || !Number.isInteger(selected) || selected < 0 || selected >= HOTBAR_SIZE || (mode !== "creative" && mode !== "survival") || this.owners.size >= BALLOON_PROFILE.maxRecords || this.nextKey >= Number.MAX_SAFE_INTEGER) return false;
      if (target.kind === "mob" && [...this.owners.values()].some(o => o.record.target.kind === "mob" && o.record.target.mobId === target.mobId)) return false;
      const anchor = anchorFor(target, ctx);
      if (!anchor || !position(anchor) || distance(anchor, ctx.player) > BALLOON_PROFILE.attachReach) return false;
      const p = { x: anchor.x, y: anchor.y + BALLOON_PROFILE.softDistance, z: anchor.z };
      if (!knownBody(ctx, p, .4, .4) || !knownMobBody(ctx, target) || boxCollides(collisionGetter(ctx), bodyBox(p, .4, .4))) return false;
      // Capture external reads before publication; the following source checks/assignments are local.
      if (!same(anchor, anchorFor(target, ctx) ?? { x: NaN, y: NaN, z: NaN }) || !knownBody(ctx, p, .4, .4) || !knownMobBody(ctx, target) || boxCollides(collisionGetter(ctx), bodyBox(p, .4, .4)) || !Array.isArray(slots) || inv.selected !== selected || inv.slots !== slots) return false;
      const source = slots[selected];
      if (!plain(source) || !exact(source, ["id", "count"]) || !finite(source.id) || !balloonColorOf(source.id) || !Number.isSafeInteger(source.count) || (source.count as number) < 1 || (source.count as number) > maxStackOf(source.id)) return false;
      const slot = Object.getOwnPropertyDescriptor(slots, String(selected)), count = Object.getOwnPropertyDescriptor(source, "count");
      if (!slot || !("value" in slot) || slot.value !== source || (source.count === 1 ? !slot.writable : !count?.writable)) return false;
      const key = this.nextKey++;
      this.owners.set(key, { record: { key, itemId: source.id, target: { ...target }, phase: "active", position: p, velocity: { x: 0, y: 0, z: 0 }, lastAnchor: copy(anchor) }, revision: 0, referencesChecked: true, fenceChecked: true });
      if (mode === "survival") { if (source.count === 1) slots[selected] = null; else (source as unknown as ItemStack).count--; }
      return true;
    } catch { return false; } finally { this.locked = false; }
  }
  beginRelease(keys: readonly number[], ctx: LeashContext, reserveEmpty = false): ReleaseAttempt {
    if (!this.available()) return { kind: "refused", reason: "Balloon ownership is busy, damaged or closed" };
    this.locked = true;
    try {
      this.initialReferences(ctx);
      if (this.issues || keys.length > BALLOON_PROFILE.maxRecords || new Set(keys).size !== keys.length || keys.some(k => !safe(k))) return { kind: "refused", reason: "Invalid balloon source" };
      if (!keys.length && !reserveEmpty) return { kind: "none" };
      const selected = keys.map(k => this.owners.get(k));
      if (selected.some(o => !o || !o.referencesChecked || o.record.phase === "active" && !o.fenceChecked)) return { kind: "refused", reason: "Unresolved balloon source" };
      const owners = selected as Owned[];
      const captures = owners.map(o => {
        const t = o.record.target, actors = t.kind === "mob" ? matches(ctx, t.mobId) : [];
        if (actors.length > 1 || t.kind === "mob" && o.record.phase === "active" && actors.length !== 1) throw new Error("Ambiguous balloon actor");
        const mob = actors[0];
        return { o, revision: o.revision, mob, health: mob?.health, position: mob ? copy(mob.position) : null, block: t.kind === "fence" ? ctx.getLoadedBlock(t.x, t.y, t.z) : null };
      });
      const token = {}; let finished = false;
      const lease: ReleaseLease = {
        get refundStacks() { return owners.map(o => ({ id: o.record.itemId, count: 1 })); },
        valid: () => {
          if (finished || this.closed || this.issues || this.leaseToken !== token) return false;
          try { return captures.every(c => {
            if (this.owners.get(c.o.record.key) !== c.o || c.o.revision !== c.revision) return false;
            const t = c.o.record.target;
            if (t.kind === "fence") return ctx.getLoadedBlock(t.x, t.y, t.z) === c.block;
            const actors = matches(ctx, t.mobId);
            return c.mob ? actors.length === 1 && actors[0] === c.mob && c.mob.health === c.health && same(c.mob.position, c.position!) : actors.length === 0;
          }); } catch { return false; }
        },
        consumeAfterReceiverCommit: () => {
          if (finished || this.leaseToken !== token) return;
          for (const o of owners) this.owners.delete(o.record.key);
          finished = true; this.leaseToken = null;
        },
        cancel: () => { if (finished) return; finished = true; if (this.leaseToken === token) this.leaseToken = null; },
      };
      this.leaseToken = token;
      return { kind: "ready", lease };
    } catch { return { kind: "refused", reason: "Cannot capture balloon ownership" }; } finally { this.locked = false; }
  }
  /** Explicit destruction consumes the whole product and publishes zero items. */
  pop(key: number, ctx: LeashContext): boolean {
    const attempt = this.beginRelease([key], ctx);
    if (attempt.kind !== "ready") return false;
    try { if (!attempt.lease.valid()) return false; attempt.lease.consumeAfterReceiverCommit(); return true; }
    finally { attempt.lease.cancel(); }
  }
  protectsMob(id: number): boolean { return [...this.owners.values()].some(o => o.record.target.kind === "mob" && o.record.target.mobId === id); }
  private reconcile(ctx: LeashContext): void {
    this.initialReferences(ctx);
    if (this.issues) return;
    for (const o of this.owners.values()) {
      const r = o.record;
      if (r.phase !== "active") continue;
      if (r.target.kind === "mob") {
        const actors = matches(ctx, r.target.mobId);
        if (actors.length !== 1 || !living(actors[0])) { r.phase = "refund-pending"; r.reason = "actor-removed"; o.revision++; continue; }
      } else if (o.fenceChecked) {
        const id = ctx.getLoadedBlock(r.target.x, r.target.y, r.target.z);
        if (id !== undefined && id !== blockId("oak_fence")) { r.phase = "refund-pending"; r.reason = "anchor-removed"; o.revision++; continue; }
      }
      const anchor = anchorFor(r.target, ctx);
      if (anchor && knownBody(ctx, r.position, .4, .4) && knownMobBody(ctx, r.target) && !same(anchor, r.lastAnchor)) { r.lastAnchor = copy(anchor); o.revision++; }
    }
  }
  reconcileLoadedReferences(ctx: LeashContext): void {
    if (!this.available()) return;
    this.locked = true;
    try { this.reconcile(ctx); } catch { /* Unknown state retains ownership. */ } finally { this.locked = false; }
  }
  externalAcceleration(mob: Mob, ctx: LeashContext): Vec3 {
    const zero = { x: 0, y: 0, z: 0 };
    if (!this.available()) return zero;
    this.locked = true;
    try {
      const o = [...this.owners.values()].find(o => o.record.target.kind === "mob" && o.record.target.mobId === mob.id);
      if (!o || !o.referencesChecked || !o.fenceChecked || o.record.phase !== "active" || !living(mob) || matches(ctx, mob.id).length !== 1 || matches(ctx, mob.id)[0] !== mob || !knownBody(ctx, mob.position, MOB_SPECS[mob.kind].width, MOB_SPECS[mob.kind].height) || !knownBody(ctx, o.record.position, .4, .4)) return zero;
      const anchor = anchorFor(o.record.target, ctx);
      if (!anchor) return zero;
      const p = o.record.position, d = distance(p, anchor);
      if (d <= BALLOON_PROFILE.softDistance || d > BALLOON_PROFILE.breakDistance) return zero;
      const force = Math.min(BALLOON_PROFILE.maxPull, (d - BALLOON_PROFILE.softDistance) * BALLOON_PROFILE.spring);
      return { x: (p.x - anchor.x) / d * force, y: (p.y - anchor.y) / d * force, z: (p.z - anchor.z) / d * force };
    } catch { return zero; } finally { this.locked = false; }
  }
  /** Unknown cells suspend all motion and age. Only known distance/boundary excess destructively pops. */
  update(dt: number, ctx: LeashContext, sink: DropSink): void {
    if (!this.available() || !finite(dt) || dt <= 0) return;
    const refunds: number[] = [], pops: number[] = [];
    this.locked = true;
    try {
      this.reconcile(ctx);
      if (this.issues) return;
      const { n, h } = substeps(dt);
      for (const o of this.owners.values()) {
        const r = o.record;
        if (!knownBody(ctx, r.position, .4, .4)) continue;
        if (r.phase === "refund-pending") { refunds.push(r.key); continue; }
        const anchor = anchorFor(r.target, ctx);
        if (!anchor || !o.fenceChecked || !knownMobBody(ctx, r.target) || !knownBody(ctx, r.position, .4, .4)) continue;
        if (distance(r.position, anchor) > BALLOON_PROFILE.breakDistance) { pops.push(r.key); continue; }
        for (let i = 0; i < n; i++) {
          const p = copy(r.position), v = copy(r.velocity), d = distance(p, anchor);
          const tension = d > BALLOON_PROFILE.softDistance ? Math.min(BALLOON_PROFILE.maxPull, (d - BALLOON_PROFILE.softDistance) * BALLOON_PROFILE.spring) : 0;
          const old = copy(v);
          v.x += ((d ? (anchor.x - p.x) / d * tension : 0) - BALLOON_PROFILE.drag * v.x) * h;
          v.y = Math.max(-64, Math.min(BALLOON_PROFILE.maxRise, v.y + (BALLOON_PROFILE.buoyancy + (d ? (anchor.y - p.y) / d * tension : 0) - BALLOON_PROFILE.drag * v.y) * h));
          v.z += ((d ? (anchor.z - p.z) / d * tension : 0) - BALLOON_PROFILE.drag * v.z) * h;
          const projected = { x: p.x + (old.x + v.x) / 2 * h, y: p.y + (old.y + v.y) / 2 * h, z: p.z + (old.z + v.z) / 2 * h };
          if (!position(projected)) { pops.push(r.key); break; }
          if (!knownBody(ctx, p, .4, .4, projected)) break;
          const get = collisionGetter(ctx);
          if (moveAxis(get, p, "x", (old.x + v.x) / 2 * h, .4, .4)) v.x = 0;
          if (moveAxis(get, p, "z", (old.z + v.z) / 2 * h, .4, .4)) v.z = 0;
          if (moveAxis(get, p, "y", (old.y + v.y) / 2 * h, .4, .4)) v.y = 0;
          r.position = p; r.velocity = v; o.revision++;
        }
      }
    } catch { return; } finally { this.locked = false; }
    for (const key of pops) this.pop(key, ctx);
    for (const key of refunds) {
      const r = this.owners.get(key)?.record;
      if (!r) continue;
      const attempt = this.beginRelease([key], ctx);
      if (attempt.kind !== "ready") continue;
      try { joinLeashRefundSink(attempt.lease, sink)([], copy(r.position))?.commit(); }
      catch { /* Receiver refusal leaves a durable intact product for retry. */ }
      finally { attempt.lease.cancel(); }
    }
  }
  dispose(): void { if (!this.busy) this.closed = true; }
}

/** Nearest finite .4 body slab hit. The caller compares block occlusion before acting. */
export function raycastBalloons(origin: Vec3, direction: Vec3, records: readonly BalloonRecord[], maxDistance: number): { key: number; distance: number } | null {
  if (!vector(origin) || !vector(direction) || !finite(maxDistance) || maxDistance < 0 || Math.hypot(direction.x, direction.y, direction.z) < 1e-9) return null;
  let hit: { key: number; distance: number } | null = null;
  for (const r of records) {
    if (r.phase !== "active" || !position(r.position) || !safe(r.key)) continue;
    let lo = 0, hi = hit?.distance ?? maxDistance;
    for (const axis of ["x", "y", "z"] as const) {
      const min = r.position[axis] - (axis === "y" ? 0 : .2), max = r.position[axis] + (axis === "y" ? .4 : .2), d = direction[axis], o = origin[axis];
      if (Math.abs(d) < 1e-9) { if (o < min || o > max) { hi = -1; break; } continue; }
      let a = (min - o) / d, b = (max - o) / d;
      if (a > b) [a, b] = [b, a];
      lo = Math.max(lo, a); hi = Math.min(hi, b);
      if (lo > hi) break;
    }
    if (lo <= hi && (!hit || lo < hit.distance)) hit = { key: r.key, distance: lo };
  }
  return hit;
}
