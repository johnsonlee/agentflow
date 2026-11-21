import { AIR, blockId, isOpaque, tryBlockById } from "../catalog/blocks";
import { WORLD_BORDER } from "../core/math";
import { WORLD_HEIGHT } from "../world/chunk";
import { canBuildAt, type GameMode } from "../world/rules";
import type { BlockEdit, World } from "../world/world";
import type { Inventory, ItemStack } from "../ownership/inventory";
import { IGNITION_DURABILITY, IGNITION_TOOL_ID, inspectIgnitionOwner } from "../ownership/ignition-tool";

/** All numerical fire behavior here is an explicit bounded application model. */
export const FIRE_LIFETIME_SECONDS = 15;
export const FIRE_MAX_RECORDS = 256;
export const FIRE_DAMAGE_PER_SECOND = 1;
export interface FireRecord { x: number; y: number; z: number; remaining: number }
export interface FireData { version: 1; records: FireRecord[]; contactSeconds: number }
export interface FireBox { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
export interface IgnitionHit { x: number; y: number; z: number; normal: { x: number; y: number; z: number } }
const fireId = () => blockId("fire");
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const coord = (x: number, y: number, z: number) => [x, y, z].every(Number.isSafeInteger) && Math.abs(x) <= WORLD_BORDER && Math.abs(z) <= WORLD_BORDER && y > 0 && y < WORLD_HEIGHT;
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const dataOnly = (v: unknown, names: string[]): v is Record<string, unknown> => plain(v) && Reflect.ownKeys(v).length === names.length && Reflect.ownKeys(v).every(k => typeof k === "string" && names.includes(k) && "value" in Object.getOwnPropertyDescriptor(v, k)!);
const empty = (): FireData => ({ version: 1, records: [], contactSeconds: 0 });

/** Present corruption is never repaired into an immortal/reset fire. */
export function sanitizeFireState(raw: unknown): { data: FireData; invalid: boolean; present: boolean } {
  if (raw === undefined) return { data: empty(), invalid: false, present: false };
  try {
    if (!dataOnly(raw, ["version", "records", "contactSeconds"]) || raw.version !== 1 || !Array.isArray(raw.records) || raw.records.length > FIRE_MAX_RECORDS ||
      !Number.isFinite(raw.contactSeconds) || (raw.contactSeconds as number) < 0 || (raw.contactSeconds as number) >= 1) throw Error("invalid fire section");
    if (Reflect.ownKeys(raw.records).length !== raw.records.length + 1) throw Error("invalid records array");
    const seen = new Set<string>(), records: FireRecord[] = [];
    for (let i = 0; i < raw.records.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(raw.records, String(i));
      if (!descriptor || !("value" in descriptor)) throw Error("invalid record descriptor");
      const record = descriptor.value;
      if (!dataOnly(record, ["x", "y", "z", "remaining"]) || !coord(record.x as number, record.y as number, record.z as number) ||
        !Number.isFinite(record.remaining) || (record.remaining as number) <= 0 || (record.remaining as number) > FIRE_LIFETIME_SECONDS) throw Error("invalid fire record");
      const k = key(record.x as number, record.y as number, record.z as number);
      if (seen.has(k)) throw Error("duplicate fire");
      seen.add(k); records.push({ x: record.x as number, y: record.y as number, z: record.z as number, remaining: record.remaining as number });
    }
    if (records.length === 0 && raw.contactSeconds !== 0) throw Error("orphan contact time");
    return { data: { version: 1, records, contactSeconds: raw.contactSeconds as number }, invalid: false, present: true };
  } catch { return { data: empty(), invalid: true, present: true }; }
}

function supported(world: World, x: number, y: number, z: number): boolean {
  const id = world.getLoadedBlock(x, y - 1, z);
  return id !== undefined && isOpaque(id) && tryBlockById(id)?.solid === true;
}
function validBox(box: FireBox | null): box is FireBox {
  if (!box || ![box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ].every(Number.isFinite)) return false;
  return box.maxX > box.minX && box.maxY > box.minY && box.maxZ > box.minZ && box.maxX - box.minX <= 8 && box.maxY - box.minY <= 8 && box.maxZ - box.minZ <= 8;
}
function overlaps(box: FireBox, r: FireRecord): boolean {
  return box.minX < r.x + 1 && box.maxX > r.x && box.minY < r.y + 1 && box.maxY > r.y && box.minZ < r.z + 1 && box.maxZ > r.z;
}

/** World-owned state; unloaded cells pause without generating terrain. */
export class FireSystem {
  private readonly records = new Map<string, FireRecord>();
  private contactSeconds = 0;
  constructor(private readonly world: World) {}
  clear(): void { this.records.clear(); this.contactSeconds = 0; }
  exportState(): FireData { return { version: 1, records: [...this.records.values()].map(r => ({ ...r })), contactSeconds: this.contactSeconds }; }
  hasCapacity(): boolean { return this.records.size < FIRE_MAX_RECORDS; }
  /** Trusted finalizer used only after the actual block write, before observer callbacks. */
  commit(x: number, y: number, z: number): void { this.records.set(key(x, y, z), { x, y, z, remaining: FIRE_LIFETIME_SECONDS }); }
  /** A real source change invalidates the old owner. No-op same-ID writes do not call this. */
  blockChanged(x: number, y: number, z: number): void {
    this.records.delete(key(x, y, z));
    const above = this.records.get(key(x, y + 1, z));
    if (above) this.extinguish(x, y + 1, z);
    if (this.records.size === 0) this.contactSeconds = 0;
  }
  extinguish(x: number, y: number, z: number): boolean {
    if (!coord(x, y, z) || this.world.getLoadedBlock(x, y, z) !== fireId()) return false;
    let done = false;
    try { this.world.setBlock(x, y, z, AIR, () => { done = true; }); } catch { /* postcommit observer cannot roll back source */ }
    return done;
  }
  restore(raw: unknown, edits: readonly BlockEdit[] = this.world.exportEdits()): { invalid: boolean; present: boolean } {
    this.clear(); const result = sanitizeFireState(raw);
    const edited = new Map<string, number>();
    for (const edit of edits) if (Array.isArray(edit) && edit.length === 4) edited.set(key(edit[0], edit[1], edit[2]), edit[3]);
    const actualFire = new Set([...edited.entries()].filter(([, id]) => id === fireId()).map(([k]) => k));
    let invalid = result.invalid;
    if (!invalid) for (const r of result.data.records) {
      const k = key(r.x, r.y, r.z);
      if (!actualFire.has(k) || this.world.getBlock(r.x, r.y, r.z) !== fireId() || !supported(this.world, r.x, r.y, r.z)) { invalid = true; break; }
      actualFire.delete(k);
    }
    if (actualFire.size > 0) invalid = true;
    if (!invalid) {
      for (const r of result.data.records) this.records.set(key(r.x, r.y, r.z), { ...r });
      this.contactSeconds = result.data.contactSeconds;
    }
    return { invalid, present: result.present };
  }
  /** Caller invokes only in active gameplay; null means no vulnerable survival player. */
  update(dt: number, box: FireBox | null = null): number {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) return 0;
    const previousContact = this.contactSeconds;
    let contact = false, unknownContact = false, contactDuration = 0;
    for (const r of [...this.records.values()]) {
      if (this.records.get(key(r.x, r.y, r.z)) !== r) continue;
      const id = this.world.getLoadedBlock(r.x, r.y, r.z);
      if (id === undefined) { if (validBox(box) && overlaps(box, r)) unknownContact = true; continue; }
      if (id !== fireId()) { this.records.delete(key(r.x, r.y, r.z)); continue; }
      if (!supported(this.world, r.x, r.y, r.z)) { this.extinguish(r.x, r.y, r.z); continue; }
      if (validBox(box) && overlaps(box, r)) { contact = true; contactDuration = Math.max(contactDuration, Math.min(dt, r.remaining)); }
      r.remaining -= dt;
      if (r.remaining <= 0) this.extinguish(r.x, r.y, r.z);
    }
    if (!contact) { this.contactSeconds = unknownContact ? previousContact : 0; return 0; }
    const elapsed = previousContact + contactDuration, damage = Math.floor(elapsed + 1e-9) * FIRE_DAMAGE_PER_SECOND;
    this.contactSeconds = this.records.size ? Math.max(0, elapsed - damage / FIRE_DAMAGE_PER_SECOND) : 0;
    return damage;
  }
}

/** A detached, writable selected-owner ACK; never invokes stack getters/setters. */
function selectedIgnition(inventory: Inventory): { valid: () => boolean; next: ItemStack | null } | null {
  const slotsDescriptor = Object.getOwnPropertyDescriptor(inventory, "slots"), selectedDescriptor = Object.getOwnPropertyDescriptor(inventory, "selected");
  if (!slotsDescriptor || !("value" in slotsDescriptor) || !selectedDescriptor || !("value" in selectedDescriptor)) return null;
  const slots = slotsDescriptor.value, selected = selectedDescriptor.value;
  if (!Array.isArray(slots) || slots.length !== 36 || !Number.isInteger(selected) || selected < 0 || selected >= 9) return null;
  const cell = Object.getOwnPropertyDescriptor(slots, String(selected));
  if (!cell || !("value" in cell) || cell.writable !== true) return null;
  const source = cell.value;
  if (!plain(source) || Object.getOwnPropertyDescriptor(source, "id")?.value !== IGNITION_TOOL_ID || inspectIgnitionOwner(source).kind === "invalid") return null;
  const count = Object.getOwnPropertyDescriptor(source, "count"), damage = Object.getOwnPropertyDescriptor(source, "damage");
  if (count?.writable !== true || damage && damage.writable !== true || !damage && !Object.isExtensible(source)) return null;
  const wear = damage?.value ?? 0;
  const valid = () => {
    const currentSlots = Object.getOwnPropertyDescriptor(inventory, "slots"), currentSelected = Object.getOwnPropertyDescriptor(inventory, "selected"), currentCell = Object.getOwnPropertyDescriptor(slots, String(selected));
    return currentSlots?.value === slots && currentSelected?.value === selected && currentCell?.value === source && currentCell?.writable === true &&
      Object.getOwnPropertyDescriptor(source, "id")?.value === IGNITION_TOOL_ID && Object.getOwnPropertyDescriptor(source, "count")?.value === 1 && Object.getOwnPropertyDescriptor(source, "count")?.writable === true &&
      (Object.getOwnPropertyDescriptor(source, "damage")?.value ?? 0) === wear && (damage ? Object.getOwnPropertyDescriptor(source, "damage")?.writable === true : !Object.prototype.hasOwnProperty.call(source, "damage") && Object.isExtensible(source)) && inspectIgnitionOwner(source).kind !== "invalid";
  };
  return { valid, next: wear + 1 >= IGNITION_DURABILITY ? null : { id: IGNITION_TOOL_ID, count: 1, damage: wear + 1 } };
}

/** Main hand, top-only, loaded-air ignition. Browser target selection supplies ordinary reach. */
export function igniteFire(world: World, inventory: Inventory, mode: GameMode, hit: IgnitionHit): boolean {
  let committed = false;
  try {
    const owner = selectedIgnition(inventory); if (!owner) return false;
    const revision = world.blockMutationVersion;
    const { x, y, z, normal } = hit;
    if (!coord(x, y + 1, z) || normal.x !== 0 || normal.y !== 1 || normal.z !== 0 || !world.fires.hasCapacity()) return false;
    const source = world.getLoadedBlock(x, y, z);
    if (source === undefined || !supported(world, x, y + 1, z) || world.getLoadedBlock(x, y + 1, z) !== AIR || !canBuildAt(world, mode, x, y + 1, z) || !owner.valid()) return false;
    if (world.getLoadedBlock(x, y, z) !== source || world.getLoadedBlock(x, y + 1, z) !== AIR || !owner.valid() || !world.fires.hasCapacity() || world.blockMutationVersion !== revision) return false;
    const selected = inventory.selected;
    world.setBlock(x, y + 1, z, fireId(), () => {
      world.fires.commit(x, y + 1, z);
      if (mode === "survival") inventory.slots[selected] = owner.next;
      committed = true;
    });
  } catch { /* Refuse before commit; after commit an observer failure must not undo an owner. */ }
  return committed;
}
export function extinguishFire(world: World, x: number, y: number, z: number): boolean { return world.fires.extinguish(x, y, z); }
