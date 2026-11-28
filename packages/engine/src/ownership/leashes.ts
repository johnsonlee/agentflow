import { isAdultCow } from "../simulation/cows";
import { blockId } from "../catalog/blocks";
import { WORLD_HEIGHT } from "../world/chunk";
import { MOB_SPECS, type Mob } from "../simulation/entities";
import type { Inventory, ItemStack } from "./inventory";
import { HOTBAR_SIZE } from "./inventory";
import { maxStackOf, stackId } from "../catalog/items";
import { MAX_Y, MIN_Y, WORLD_BORDER, type Vec3 } from "../core/math";
import type { GameMode } from "../world/rules";
import { cloneStack } from "./stack";
import type { DropSink } from "./world-drops";

/** Explicit horizontal-following application model, not measured native leash defaults or forces. */
export const LEASH_PROFILE = Object.freeze({ softDistance: 4, strongDistance: 6, breakDistance: 10, maxPullSpeed: 6, pullGain: 3, attachReach: 4, retieReach: 4, maxRecords: 128, maxDt: .1 });
export type LeashAnchor = { kind: "player" } | { kind: "fence"; x: number; y: number; z: number };
export interface LeashRecord { key: number; targetMobId: number; anchor: LeashAnchor; phase: "active" | "refund-pending"; lastPosition: Vec3; reason?: "actor-removed" | "anchor-removed" }
export interface LeashData { version: 1; nextKey: number; records: LeashRecord[] }
export interface LeashContext { mobs: readonly Mob[]; player: Vec3; getLoadedBlock(x: number, y: number, z: number): number | undefined }
export interface ReleaseLease {
  readonly refundStacks: readonly ItemStack[];
  valid(): boolean;
  /** Trusted nonthrowing assignments only; caller invokes this only after its one receiver commits. */
  consumeAfterReceiverCommit(): void;
  cancel(): void;
}
export type ReleaseAttempt = { kind: "none" } | { kind: "refused"; reason: string } | { kind: "ready"; lease: ReleaseLease };
export interface OwnershipGuard { valid(): boolean; afterReceiverCommit(): void }
interface Owned { record: LeashRecord; revision: number; referencesChecked: boolean; fenceChecked: boolean }
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) && Object.getOwnPropertySymbols(v).length === 0 && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => "value" in d);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.getOwnPropertyNames(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const safe = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) < Number.MAX_SAFE_INTEGER;
const position = (v: unknown): v is Vec3 => plain(v) && exact(v, ["x", "y", "z"]) && finite(v.x) && finite(v.y) && finite(v.z) && Math.abs(v.x) <= WORLD_BORDER && Math.abs(v.z) <= WORLD_BORDER && v.y >= MIN_Y && v.y <= MAX_Y;
const coordinate = (v: unknown): v is { x: number; y: number; z: number } => plain(v) && ["x", "y", "z"].every(k => Number.isInteger(v[k])) && Math.abs(v.x as number) <= WORLD_BORDER && Math.abs(v.z as number) <= WORLD_BORDER && (v.y as number) >= 0 && (v.y as number) < WORLD_HEIGHT;
const copyPosition = (p: Vec3): Vec3 => ({ x: p.x, y: p.y, z: p.z });
const copyRecord = (r: LeashRecord): LeashRecord => ({ ...r, anchor: { ...r.anchor }, lastPosition: copyPosition(r.lastPosition) });
const supported = (m: Mob) => m.kind === "pig" || m.kind === "sheep" || m.kind === "chicken" || isAdultCow(m);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const matches = (ctx: LeashContext, id: number) => ctx.mobs.filter(m => m.id === id);
const living = (mob: Mob) => supported(mob) && finite(mob.health) && mob.health > 0 && mob.health <= MOB_SPECS[mob.kind].maxHealth && position(mob.position);
const loaded = (ctx: LeashContext, p: Vec3) => ctx.getLoadedBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) !== undefined;
const samePosition = (a: Vec3, b: Vec3) => a.x === b.x && a.y === b.y && a.z === b.z;
const anchorPosition = (r: LeashRecord, ctx: LeashContext): Vec3 | null => r.anchor.kind === "player" ? (position(ctx.player) && loaded(ctx, ctx.player) ? ctx.player : null)
  : ctx.getLoadedBlock(r.anchor.x, r.anchor.y, r.anchor.z) === blockId("oak_fence") ? { x: r.anchor.x + .5, y: r.anchor.y + .75, z: r.anchor.z + .5 } : null;

function readData(raw: unknown): LeashData | null {
  if (!plain(raw) || !exact(raw, ["version", "nextKey", "records"]) || raw.version !== 1 || !Number.isSafeInteger(raw.nextKey) || (raw.nextKey as number) < 1 || (raw.nextKey as number) > Number.MAX_SAFE_INTEGER || !Array.isArray(raw.records) || raw.records.length > LEASH_PROFILE.maxRecords) return null;
  const keys = new Set<number>(), targets = new Set<number>(), records: LeashRecord[] = [];
  for (const r of raw.records) {
    if (!plain(r) || (r.phase !== "active" && r.phase !== "refund-pending") || !exact(r, r.phase === "active" ? ["key", "targetMobId", "anchor", "phase", "lastPosition"] : ["key", "targetMobId", "anchor", "phase", "lastPosition", "reason"]) || !safe(r.key) || !safe(r.targetMobId) || keys.has(r.key) || targets.has(r.targetMobId) || !position(r.lastPosition) || !plain(r.anchor)) return null;
    const a = r.anchor;
    if (!(a.kind === "player" ? exact(a, ["kind"]) : a.kind === "fence" && exact(a, ["kind", "x", "y", "z"]) && coordinate(a))) return null;
    if (r.phase === "refund-pending" && (r.reason !== "actor-removed" && r.reason !== "anchor-removed" || r.reason === "anchor-removed" && a.kind !== "fence")) return null;
    keys.add(r.key); targets.add(r.targetMobId); records.push(copyRecord(r as unknown as LeashRecord));
  }
  if (records.some(r => r.key >= (raw.nextKey as number))) return null;
  return { version: 1, nextKey: raw.nextKey as number, records };
}

/** Each record owns exactly one ordinary Lead. Creative attachment creates one explicit copied unit.
 * World ownership survives mode changes, player death/respawn and view disposal; no teardown refunds.
 */
export class LeashStore {
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
      for (const record of data.records) this.owners.set(record.key, { record, revision: 0, referencesChecked: false, fenceChecked: record.anchor.kind === "player" });
    } catch { this.issues = 1; }
  }
  get loadIssues(): number { return this.issues; }
  get busy(): boolean { return this.locked || this.leaseToken !== null; }
  get records(): LeashRecord[] { return [...this.owners.values()].map(o => copyRecord(o.record)); }
  toJSON(): LeashData {
    if (this.busy || this.closed || this.issues || [...this.owners.values()].some(o => !o.referencesChecked)) throw new Error("Cannot save unresolved, damaged or busy leash ownership");
    return { version: 1, nextKey: this.nextKey, records: this.records };
  }
  private available(): boolean { return !this.busy && !this.closed && this.issues === 0; }
  private initialReferences(ctx: LeashContext): void {
    for (const o of this.owners.values()) {
      const r = o.record;
      if (!o.referencesChecked) {
        const actors = matches(ctx, r.targetMobId);
        if (actors.length > 1 || actors.length === 1 && !living(actors[0]) || r.phase === "active" && actors.length !== 1) { this.issues++; continue; }
        o.referencesChecked = true;
      }
      if (r.phase === "active" && r.anchor.kind === "fence" && !o.fenceChecked) {
        const id = ctx.getLoadedBlock(r.anchor.x, r.anchor.y, r.anchor.z);
        if (id === undefined) continue; // An initial unresolved anchor is not missing air.
        if (id !== blockId("oak_fence")) { this.issues++; continue; }
        o.fenceChecked = true;
      }
    }
  }
  /** Initial/deferred references diagnose corruption; raw active orphans are never healed into refunds. */
  validateCrossReferences(ctx: LeashContext): number {
    if (!this.available()) return this.issues;
    this.locked = true;
    try { this.initialReferences(ctx); } catch { this.issues++; } finally { this.locked = false; }
    return this.issues;
  }
  attachFromInventory(inv: Inventory, mode: GameMode, target: Mob, ctx: LeashContext): boolean {
    if (!this.available()) return false;
    this.locked = true;
    try {
      this.initialReferences(ctx);
      const selected = inv.selected, slots = inv.slots;
      if (this.issues || !Number.isInteger(selected) || selected < 0 || selected >= HOTBAR_SIZE || (mode !== "survival" && mode !== "creative") || this.owners.size >= LEASH_PROFILE.maxRecords || this.nextKey >= Number.MAX_SAFE_INTEGER || !safe(target.id) || !living(target) || !position(ctx.player)) return false;
      const actor = matches(ctx, target.id);
      if (actor.length !== 1 || actor[0] !== target || !loaded(ctx, target.position) || !loaded(ctx, ctx.player) || distance(target.position, ctx.player) > LEASH_PROFILE.attachReach || [...this.owners.values()].some(o => o.record.targetMobId === target.id)) return false;
      if (!living(target) || matches(ctx, target.id).length !== 1 || !Array.isArray(slots) || inv.selected !== selected || inv.slots !== slots) return false;
      const source = slots[selected];
      if (!plain(source) || !exact(source, ["id", "count"]) || source.id !== stackId("lead_rope") || !Number.isSafeInteger(source.count) || (source.count as number) < 1 || (source.count as number) > maxStackOf(source.id as number)) return false;
      const slot = Object.getOwnPropertyDescriptor(slots, String(selected));
      const count = Object.getOwnPropertyDescriptor(source, "count");
      if (!slot || !("value" in slot) || slot.value !== source || (source.count === 1 ? slot.writable !== true : count?.writable !== true)) return false;
      // Trusted assignments only: no callback between allocating one world unit and consuming one source.
      const key = this.nextKey++;
      this.owners.set(key, { record: { key, targetMobId: target.id, anchor: { kind: "player" }, phase: "active", lastPosition: copyPosition(target.position) }, revision: 0, referencesChecked: true, fenceChecked: true });
      if (mode === "survival") {
        if ((source.count as number) === 1) slots[selected] = null;
        else (source as unknown as ItemStack).count--;
      }
      return true;
    } catch { return false; } finally { this.locked = false; }
  }
  retieToFence(keys: readonly number[], coord: { x: number; y: number; z: number }, ctx: LeashContext): boolean {
    if (!this.available()) return false;
    this.locked = true;
    try {
      this.initialReferences(ctx);
      if (this.issues || !coordinate(coord) || !exact(coord as unknown as Record<string, unknown>, ["x", "y", "z"]) || !position(ctx.player) || distance(ctx.player, { x: coord.x + .5, y: coord.y + .75, z: coord.z + .5 }) > LEASH_PROFILE.retieReach || ctx.getLoadedBlock(coord.x, coord.y, coord.z) !== blockId("oak_fence") || !keys.length || keys.length > LEASH_PROFILE.maxRecords || new Set(keys).size !== keys.length) return false;
      const selected: Owned[] = [];
      for (const key of keys) {
        const o = this.owners.get(key);
        if (!o || o.record.phase !== "active" || !o.referencesChecked) return false;
        const a = o.record.anchor, actors = matches(ctx, o.record.targetMobId);
        if (a.kind !== "player" && (a.x !== coord.x || a.y !== coord.y || a.z !== coord.z) || actors.length !== 1 || !living(actors[0]) || !loaded(ctx, actors[0].position)) return false;
        selected.push(o);
      }
      for (const o of selected) { o.record.anchor = { kind: "fence", ...coord }; o.fenceChecked = true; o.revision++; }
      return true;
    } catch { return false; } finally { this.locked = false; }
  }
  beginRelease(keys: readonly number[], ctx: LeashContext, reserveEmpty = false): ReleaseAttempt {
    // Busy MUST NOT be interpreted as an unowned source by any destruction adapter.
    if (!this.available()) return { kind: "refused", reason: "Leash ownership is busy, damaged or closed" };
    this.locked = true;
    try {
      this.initialReferences(ctx);
      if (this.issues || keys.length > LEASH_PROFILE.maxRecords || new Set(keys).size !== keys.length || keys.some(k => !safe(k))) return { kind: "refused", reason: "Invalid leash release source" };
      if (!keys.length && !reserveEmpty) return { kind: "none" };
      const selected = keys.map(k => this.owners.get(k));
      if (selected.some(o => !o || !o.referencesChecked || o.record.phase === "active" && !o.fenceChecked)) return { kind: "refused", reason: "Missing or unresolved leash source" };
      const owners = selected as Owned[];
      const captures = owners.map(o => {
        const actors = matches(ctx, o.record.targetMobId);
        if (actors.length > 1 || o.record.phase === "active" && actors.length !== 1) throw new Error("Ambiguous leash target");
        const mob = actors[0];
        return { o, revision: o.revision, mob, health: mob?.health, position: mob ? copyPosition(mob.position) : null,
          anchorBlock: o.record.anchor.kind === "fence" ? ctx.getLoadedBlock(o.record.anchor.x, o.record.anchor.y, o.record.anchor.z) : null };
      });
      const token = {}, leadId = stackId("lead_rope"); let finished = false;
      const valid = () => {
        if (finished || this.closed || this.issues || this.leaseToken !== token) return false;
        try {
          return captures.every(c => {
            if (this.owners.get(c.o.record.key) !== c.o || c.o.revision !== c.revision) return false;
            const actors = matches(ctx, c.o.record.targetMobId);
            if (c.mob ? actors.length !== 1 || actors[0] !== c.mob || c.mob.health !== c.health || !samePosition(c.mob.position, c.position!) : actors.length !== 0) return false;
            const a = c.o.record.anchor;
            return a.kind !== "fence" || ctx.getLoadedBlock(a.x, a.y, a.z) === c.anchorBlock;
          });
        } catch { return false; }
      };
      const lease: ReleaseLease = {
        get refundStacks() { return owners.map(() => ({ id: leadId, count: 1 })); }, valid,
        consumeAfterReceiverCommit: () => {
          if (finished || this.leaseToken !== token) return;
          // No context, world, sink, event or UI callbacks are permitted after receiver publication.
          for (const o of owners) this.owners.delete(o.record.key);
          finished = true; this.leaseToken = null;
        },
        cancel: () => { if (finished) return; finished = true; if (this.leaseToken === token) this.leaseToken = null; },
      };
      this.leaseToken = token;
      return { kind: "ready", lease };
    } catch { return { kind: "refused", reason: "Cannot capture leash release ownership" }; } finally { this.locked = false; }
  }
  protectsMob(id: number): boolean { return [...this.owners.values()].some(o => o.record.targetMobId === id); }
  private reconcile(ctx: LeashContext): void {
    this.initialReferences(ctx);
    if (this.issues) return;
    for (const o of this.owners.values()) {
      const r = o.record;
      if (r.phase !== "active") continue;
      const actors = matches(ctx, r.targetMobId), mob = actors[0];
      if (actors.length !== 1 || !mob || !supported(mob)) { r.phase = "refund-pending"; r.reason = "actor-removed"; o.revision++; continue; }
      if (position(mob.position) && loaded(ctx, mob.position) && !samePosition(mob.position, r.lastPosition)) { r.lastPosition = copyPosition(mob.position); o.revision++; }
      if (r.anchor.kind === "fence" && o.fenceChecked) {
        const id = ctx.getLoadedBlock(r.anchor.x, r.anchor.y, r.anchor.z);
        if (id !== undefined && id !== blockId("oak_fence")) { r.phase = "refund-pending"; r.reason = "anchor-removed"; o.revision++; }
      }
    }
  }
  reconcileLoadedReferences(ctx: LeashContext): void {
    if (!this.available()) return;
    this.locked = true;
    try { this.reconcile(ctx); } catch { /* Unknown external state retains every owner until next tick. */ } finally { this.locked = false; }
  }
  movementBias(mob: Mob, ctx: LeashContext): Vec3 {
    const zero = { x: 0, y: 0, z: 0 };
    if (!this.available()) return zero;
    this.locked = true;
    try {
      const o = [...this.owners.values()].find(o => o.record.targetMobId === mob.id);
      if (!o || !o.referencesChecked || !o.fenceChecked || o.record.phase !== "active" || (matches(ctx, mob.id).length !== 1 || matches(ctx, mob.id)[0] !== mob) || !living(mob) || !loaded(ctx, mob.position)) return zero;
      const anchor = anchorPosition(o.record, ctx);
      if (!anchor) return zero;
      const dx = anchor.x - mob.position.x, dz = anchor.z - mob.position.z, d = Math.hypot(dx, dz);
      if (d <= LEASH_PROFILE.softDistance) return zero;
      const speed = Math.min(LEASH_PROFILE.maxPullSpeed, (d - LEASH_PROFILE.softDistance) * LEASH_PROFILE.pullGain);
      return { x: dx / d * speed, y: 0, z: dz / d * speed };
    } catch { return zero; } finally { this.locked = false; }
  }
  /** Called only by the active game tick. Unloaded sources retain age-free ownership and no force. */
  update(dt: number, ctx: LeashContext, sink: DropSink): void {
    if (!this.available() || !finite(dt) || dt <= 0) return;
    const ready: number[] = [];
    this.locked = true;
    try {
      this.reconcile(ctx);
      if (this.issues) return;
      for (const o of this.owners.values()) {
        const r = o.record;
        if (!loaded(ctx, r.lastPosition)) continue;
        if (r.phase === "refund-pending") { ready.push(r.key); continue; }
        const actor = matches(ctx, r.targetMobId)[0], anchor = anchorPosition(r, ctx);
        if (actor && position(actor.position) && loaded(ctx, actor.position) && anchor && distance(actor.position, anchor) > LEASH_PROFILE.breakDistance) ready.push(r.key);
      }
    } catch { return; } finally { this.locked = false; }
    for (const key of ready) {
      const record = this.owners.get(key)?.record;
      if (!record) continue;
      const attempt = this.beginRelease([key], ctx);
      if (attempt.kind !== "ready") continue;
      try { const batch = joinLeashRefundSink(attempt.lease, sink)([], copyPosition(record.lastPosition)); batch?.commit(); }
      catch { /* A refusing/throwing atomic receiver has not published; retain source for a later tick. */ }
      finally { attempt.lease.cancel(); }
    }
  }
  dispose(): void { if (this.busy) return; this.closed = true; }
}

/** Exactly one receiver plan/commit for upstream loot plus all Lead units, never two receivers. */
export function joinLeashRefundSink(lease: ReleaseLease, sink: DropSink, sourceStillValid: () => boolean = () => true): DropSink {
  return (stacks, position, velocity) => {
    if (!lease.valid() || !sourceStillValid()) return null;
    const batch = sink([...stacks.map(s => cloneStack(s)), ...lease.refundStacks.map(s => cloneStack(s))], copyPosition(position), velocity ? copyPosition(velocity) : undefined);
    if (!batch || !lease.valid() || !sourceStillValid()) return null;
    let used = false;
    return { commit: () => {
      if (used) return false;
      used = true;
      if (!lease.valid() || !sourceStillValid() || !lease.valid()) return false;
      if (!batch.commit()) return false;
      lease.consumeAfterReceiverCommit();
      return true;
    } };
  };
}
