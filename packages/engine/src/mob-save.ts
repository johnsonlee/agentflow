import { createSquidState, SQUID, type SquidState } from "./aquatics";
import { SPIDER, MOB_SPECS, createMob, type Mob, type MobKind } from "./entities";
import type { ItemStack } from "./inventory";
import { WORLD_BORDER, type Vec3 } from "./math";
import { sanitizePendingMobLoot } from "./mob-loot";

/** JSON-safe semantic state. Native path-search objects and derived graph caches are never saved. */
export interface MobSnapshot {
  squidState?: SquidState;
  id: number;
  kind: MobKind;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  /** NPC invulnerability is an explicit token; JSON.stringify(Infinity) would silently yield null. */
  health: number | "invulnerable";
  onGround: boolean;
  thinkTimer: number;
  walking: boolean;
  hurtTimer: number;
  attackTimer?: number;
  spiderAngerSeconds?: number;
  burnTimer?: number;
  burning?: boolean;
  detourTimer?: number;
  detourSign?: number;
  stuckTimer?: number;
  name?: string;
  dialogue?: string;
  /** Absence means unresolved; an empty array is a resolved zero result awaiting successful delivery. */
  pendingLoot?: ItemStack[];
}
export interface MobStateData { nextId: number; records: MobSnapshot[] }
export interface SanitizedMobState { data: MobStateData; invalid: number; present: boolean }
const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (value: Record<string, unknown>, key: string): unknown => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const vector = (value: unknown, velocity = false): value is Vec3 => plain(value) && finite(own(value, "x")) && finite(own(value, "y")) && finite(own(value, "z")) &&
  Math.abs(value.x as number) <= (velocity ? 256 : WORLD_BORDER) && Math.abs(value.z as number) <= (velocity ? 256 : WORLD_BORDER) && Math.abs(value.y as number) <= (velocity ? 256 : 1024);
const optionalTimers = ["attackTimer", "burnTimer", "detourTimer", "stuckTimer"] as const;

function readMob(raw: unknown): MobSnapshot | null {
  if (!plain(raw)) return null;
  const id = own(raw, "id"), kind = own(raw, "kind"), position = own(raw, "position"), velocity = own(raw, "velocity"), yaw = own(raw, "yaw"), health = own(raw, "health"), onGround = own(raw, "onGround"), thinkTimer = own(raw, "thinkTimer"), walking = own(raw, "walking"), hurtTimer = own(raw, "hurtTimer");
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1 || id >= Number.MAX_SAFE_INTEGER || typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(MOB_SPECS, kind) || !vector(position) || !vector(velocity, true) || !finite(yaw) || typeof onGround !== "boolean" || !finite(thinkTimer) || typeof walking !== "boolean" || !finite(hurtTimer) || hurtTimer < 0) return null;
  const spec = MOB_SPECS[kind as MobKind];
  if (kind === "npc" ? health !== "invulnerable" : !finite(health) || health <= 0 || health > spec.maxHealth) return null;
  const result: MobSnapshot = { id, kind: kind as MobKind, position: { ...position }, velocity: { ...velocity }, yaw, health: health as MobSnapshot["health"], onGround, thinkTimer, walking, hurtTimer };
  for (const field of optionalTimers) {
    const value = own(raw, field);
    if (value !== undefined) { if (!finite(value)) return null; result[field] = value; }
  }
  if (Object.prototype.hasOwnProperty.call(raw, "spiderAngerSeconds")) {
    const anger = own(raw, "spiderAngerSeconds");
    if (kind !== "spider" || !finite(anger) || anger < 0 || anger > SPIDER.angerDuration) return null;
    result.spiderAngerSeconds = anger;
  }
  if (Object.prototype.hasOwnProperty.call(raw, "squidState")) {
    const state = own(raw, "squidState");
    if (kind !== "squid" || !plain(state)) return null;
    const air = own(state, "airRemaining"), damage = own(state, "damageAccumulator"), direction = own(state, "swimDirection"), pitch = own(state, "pitch"), decision = own(state, "decisionTimer");
    if (!finite(air) || air < 0 || air > SQUID.airSupply || !finite(damage) || damage < 0 || damage >= 2 || !vector(direction, true) || Math.hypot(direction.x, direction.y, direction.z) > 1.000001 || !finite(pitch) || Math.abs(pitch) > Math.PI / 2 || !finite(decision) || decision < 0 || decision > SQUID.decisionSeconds || Object.keys(state).some(key => !["airRemaining", "damageAccumulator", "swimDirection", "pitch", "decisionTimer"].includes(key))) return null;
    result.squidState = { airRemaining: air, damageAccumulator: damage, swimDirection: { ...direction }, pitch, decisionTimer: decision };
  } else if (kind === "squid") result.squidState = createSquidState();
  const burning = own(raw, "burning"), detourSign = own(raw, "detourSign");
  if (burning !== undefined) { if (typeof burning !== "boolean") return null; result.burning = burning; }
  if (detourSign !== undefined) { if (detourSign !== -1 && detourSign !== 1) return null; result.detourSign = detourSign; }
  if (kind === "npc") {
    const name = own(raw, "name"), dialogue = own(raw, "dialogue");
    if (typeof name !== "string" || name.length > 64 || typeof dialogue !== "string" || dialogue.length > 2000) return null;
    result.name = name; result.dialogue = dialogue;
  }
  const pending = own(raw, "pendingLoot");
  if (pending !== undefined) {
    const stacks = sanitizePendingMobLoot(kind as MobKind, pending);
    if (stacks === null) return null; // Never drop the roll and silently let this owner reroll.
    result.pendingLoot = stacks;
  }
  return result;
}

/** No valid-record cap: every record is read, duplicate/malformed owners are counted explicitly. */
export function sanitizeMobState(raw: unknown): SanitizedMobState {
  const data: MobStateData = { nextId: 1, records: [] }, present = raw !== undefined;
  if (!present) return { data, invalid: 0, present };
  try {
    if (!plain(raw) || !Array.isArray(own(raw, "records"))) return { data, invalid: 1, present };
    const ids = new Set<number>(); let invalid = 0, maximum = 0;
    for (const candidate of own(raw, "records") as unknown[]) {
      const mob = readMob(candidate);
      if (!mob || ids.has(mob.id)) { invalid++; continue; }
      ids.add(mob.id); maximum = Math.max(maximum, mob.id); data.records.push(mob);
    }
    const next = own(raw, "nextId");
    if (typeof next === "number" && Number.isSafeInteger(next) && next > maximum && next <= Number.MAX_SAFE_INTEGER) data.nextId = next;
    else { data.nextId = maximum + 1; invalid++; }
    return { data, invalid, present };
  } catch {
    data.nextId = data.records.reduce((maximum, mob) => Math.max(maximum, mob.id), 0) + 1;
    return { data, invalid: 1, present };
  }
}

/** Captures detached supported fields only; invalid live state refuses saving rather than losing ownership. */
export function mobSnapshot(mob: Mob, pendingLoot?: ItemStack[]): MobSnapshot {
  const raw: Record<string, unknown> = {
    id: mob.id, kind: mob.kind, position: { ...mob.position }, velocity: { ...mob.velocity }, yaw: mob.yaw,
    health: mob.kind === "npc" && mob.health === Infinity ? "invulnerable" : mob.health, onGround: mob.onGround, thinkTimer: mob.thinkTimer,
    walking: mob.walking, hurtTimer: mob.hurtTimer,
  };
  for (const field of [...optionalTimers, "spiderAngerSeconds", "burning", "detourSign"] as const) if (mob[field] !== undefined) raw[field] = mob[field];
  if (mob.squidState !== undefined) raw.squidState = mob.squidState;
  if (mob.kind === "npc") { raw.name = mob.name ?? "NPC"; raw.dialogue = mob.dialogue ?? ""; }
  if (pendingLoot !== undefined) raw.pendingLoot = pendingLoot;
  const result = readMob(raw);
  if (!result) throw new Error("Cannot snapshot invalid live mob state");
  return result;
}

/** Rehydrates an already sanitized record with its final stable ID before any view is registered. */
export function restoreMobSnapshot(snapshot: MobSnapshot): Mob {
  const saved = readMob(snapshot);
  if (!saved) throw new Error("Cannot restore invalid mob snapshot");
  const mob = createMob(saved.id, saved.kind, saved.position, { yaw: saved.yaw, name: saved.name, dialogue: saved.dialogue });
  if (saved.squidState) mob.squidState = { ...saved.squidState, swimDirection: { ...saved.squidState.swimDirection } };
  mob.velocity = { ...saved.velocity }; mob.health = saved.health === "invulnerable" ? Infinity : saved.health;
  mob.onGround = saved.onGround; mob.thinkTimer = saved.thinkTimer; mob.walking = saved.walking; mob.hurtTimer = saved.hurtTimer;
  for (const field of [...optionalTimers, "spiderAngerSeconds", "burning", "detourSign"] as const) if (saved[field] !== undefined) (mob as unknown as Record<string, unknown>)[field] = saved[field];
  return mob;
}
