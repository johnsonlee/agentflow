import { sanitizePlayerStatus, type PlayerStatus } from "../simulation/status-effects";
import { inspectSparklerState, isSparklerId } from "../ownership/sparkler-state";
import { sanitizeStack } from "./savecheck";
import { inspectGlowState } from "../ownership/glow-stick-state";
import { sanitizePlayerState, validatePlayerDeathOwnership, type PlayerStateData } from "../simulation/player-death";
import type { BalloonsData } from "../ownership/balloons";
import type { LeashData } from "../ownership/leashes";
import type { MobStateData } from "./mob-save";
import type { WorldDropsData } from "../ownership/world-drops";
import type { SnowballProjectilesData } from "../simulation/snowball-projectiles";
import { sanitizeFarmingState, type FarmingState } from "../simulation/farming";
import type { BlockEdit } from "../world/world";
import type { InventoryData, ItemStack } from "../ownership/inventory";
import { sanitizeInventoryPending } from "./savecheck";
import type { GameMode } from "../world/rules";
import { clampPosition, type Vec3 } from "../core/math";
import type { HungerState } from "../simulation/hunger";
import type { FurnaceState } from "../crafting/smelting";
import type { Chalkboard } from "../education/chalkboard";
import type { AgentState } from "../automation/agent";
import type { CodeProgram } from "../automation/codebuilder";

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  name: string;
  seed: number;
  mode: GameMode;
  timeOfDay: number;
  /** `position` is null when a damaged save had none (the game then uses the spawn point). */
  player: { position: Vec3 | null; yaw: number; pitch: number; flying: boolean };
  inventory: InventoryData;
  /** Held/crafting stacks, recovered through the inventory UI after loading. */
  inventoryPending?: ItemStack[];
  edits: BlockEdit[];
  /** Game rules: mob/daylight default true; keepInventory defaults false (also in legacy saves). */
  gamerules?: { doMobSpawning: boolean; doDaylightCycle: boolean; keepInventory?: boolean };
  /** Optional v1 health/death lifecycle; invalid present data is reported before overwrite. */
  playerState?: PlayerStateData;
  /** Derived read-only diagnostic, never trusted from serialized JSON or written by the game. */
  playerStateOwnershipInvalid?: boolean;
  /** Derived from RAW owners before repair, never trusted from serialized JSON or written. */
  glowOwnershipIssues?: GlowOwnershipIssue[];
  /** Raw Sparkler/offhand diagnostics before any owner repair; caller preserves original text. */
  sparklerOwnershipIssues?: GlowOwnershipIssue[];
  /** Education Edition NPCs placed in the world (optional for older saves). */
  npcs?: Array<{ x: number; y: number; z: number; yaw: number; name: string; dialogue: string }>;
  /** Survival hunger (optional for older saves; defaults to full). */
  hunger?: HungerState;
  /** Active-play-only status owner; absent legacy/empty saves have no effect. */
  playerStatus?: PlayerStatus;
  /** Derived from raw JSON before sanitation; never trusted or serialized. */
  playerStatusInvalid?: boolean;
  /** Education Edition Agent and Code Builder programs (optional for older saves). */
  agent?: AgentState;
  programs?: CodeProgram[];
  /** Education Edition chalkboards (optional for older saves). */
  chalkboards?: Chalkboard[];
  /** Furnaces with their contents and progress (optional for older saves). */
  furnaces?: Array<{ x: number; y: number; z: number; state: FurnaceState }>;
  /** Pending redstone ticks (optional; sanitized by `sanitizeScheduled` on load). */
  redstone?: unknown;
  farming?: FarmingState;
  /** Optional v1 world-owned items; WorldDrops validates and reports corrupt records before save overwrite. */
  worldDrops?: WorldDropsData;
  /** Optional v1 live mob owners; validated separately without truncating valid records. */
  mobs?: MobStateData;
  /** World-owned Lead units; strict loader validates raw sections and deferred references. */
  leashes?: LeashData;
  /** Whole colored balloon products with strict ownership validation. */
  balloons?: BalloonsData;
  /** Consumed in-flight snowballs; strict loader reports present corruption before overwrite. */
  snowballProjectiles?: SnowballProjectilesData;
}

export function serializeSave(data: Omit<SaveData, "version">): string {
  const { glowOwnershipIssues: _derivedIssues, sparklerOwnershipIssues: _sparklerIssues, playerStatusInvalid: _statusInvalid, ...owned } = data;
  const status = sanitizePlayerStatus(owned.playerStatus);
  if (_statusInvalid || status.invalid) throw new Error("Cannot serialize invalid player status");
  if (status.data.poison) owned.playerStatus = status.data; else delete owned.playerStatus;
  return JSON.stringify({ version: SAVE_VERSION, ...owned });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export interface GlowOwnershipIssue { path: string; reason: string }

/** Scan raw owners before sanitizeInventoryPending/fromJSON/Agent/furnace loaders can drop state.
 * This produces diagnostics only; Game must preserve the original raw text and block overwrite. */
function diagnoseRawActivationOwnership(raw: unknown, field: "glow" | "sparkler"): GlowOwnershipIssue[] {
  const issues: GlowOwnershipIssue[] = [];
  if (!isObj(raw)) return issues;
  const check = (value: unknown, path: string, supported = true) => {
    if (typeof value !== "object" || value === null) return;
    // New Sparkler identities require recovery even when their legacy metadata is absent.
    const legacySparkler = field === "sparkler" && isObj(value) && typeof own(value, "id") === "number" && isSparklerId(own(value, "id") as number);
    if (!(field in value) && !legacySparkler) return;
    const state = field === "glow" ? inspectGlowState(value) : inspectSparklerState(value);
    if (state.kind === "invalid") issues.push({ path, reason: state.reason });
    else if (!supported) issues.push({ path, reason: `stateful ${field} owner would be discarded or is unsupported` });
  };
  // A malformed known owner container is itself a recovery issue. Do not search arbitrary
  // descendants for glow: preserve the entire original envelope even when its contents are opaque.
  const object = (value: unknown, path: string, optional = true): Obj | null => {
    if (value === undefined && optional) return null;
    if (!isObj(value)) { issues.push({ path, reason: "invalid owned-item envelope; expected plain object" }); return null; }
    return value;
  };
  const array = (value: unknown, path: string, optional = true): unknown[] | null => {
    if (value === undefined && optional) return null;
    if (!Array.isArray(value)) { issues.push({ path, reason: "invalid owned-item container; expected array" }); return null; }
    return value;
  };
  const list = (value: unknown, path: string, limit: number, envelope = true, supported = true, optional = true) => {
    array(value, path, optional)?.forEach((stack, index) => check(stack, `${path}[${index}]`, envelope && supported && index < limit));
  };
  const integer = (value: unknown, low = -1e7, high = 1e7) => typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;
  const number = (value: unknown, low: number, high: number) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
  const inventory = object(own(raw, "inventory"), "inventory");
  if (inventory) {
    list(own(inventory, "slots"), "inventory.slots", 36);
    if (field === "sparkler" && Object.prototype.hasOwnProperty.call(inventory, "offhand")) {
      const rawOffhand = own(inventory, "offhand");
      if (rawOffhand !== null) {
        const clean = sanitizeStack(rawOffhand);
        if (!clean || !isSparklerId(clean.id)) issues.push({ path: "inventory.offhand", reason: "invalid or unsupported offhand owner" });
        else check(rawOffhand, "inventory.offhand");
      }
    }
    const equipment = object(own(inventory, "equipment"), "inventory.equipment");
    if (equipment) for (const key of Object.keys(equipment))
      check(own(equipment, key), `inventory.equipment.${key}`, false); // Glow is never armor.
  }
  list(own(raw, "inventoryPending"), "inventoryPending", 10);
  const agent = object(own(raw, "agent"), "agent");
  if (agent) {
    if (field === "sparkler" && Object.prototype.hasOwnProperty.call(agent, "offhand"))
      issues.push({ path: "agent.offhand", reason: "Agent offhand is an unsupported owner" });
    const valid = integer(own(agent, "x")) && integer(own(agent, "y"), 0, 1000) && integer(own(agent, "z"))
      && integer(own(agent, "facing"), 0, 3) && integer(own(agent, "selected"), 0, 26);
    if (!valid) issues.push({ path: "agent", reason: "invalid owned-item Agent envelope" });
    list(own(agent, "slots"), "agent.slots", 27, valid, true, false);
  }
  const furnaceCoordinates = new Map<string, number>();
  array(own(raw, "furnaces"), "furnaces")?.forEach((value, index) => {
    const furnace = object(value, `furnaces[${index}]`, false); if (!furnace) return;
    const state = object(own(furnace, "state"), `furnaces[${index}].state`, false); if (!state) return;
    if (integer(own(furnace, "x")) && integer(own(furnace, "y"), 0, 1000) && integer(own(furnace, "z"))) {
      // Game keys loaded furnace owners by coordinates. A later same-key entry must not
      // silently replace an earlier owned state, even when the later entry is empty.
      const key = JSON.stringify([own(furnace, "x"), own(furnace, "y"), own(furnace, "z")]);
      const first = furnaceCoordinates.get(key);
      if (first !== undefined) issues.push({ path: `furnaces[${index}]`, reason: `duplicate owned-item furnace coordinates; first owner at furnaces[${first}]` });
      else furnaceCoordinates.set(key, index);
    }
    const valid = integer(own(furnace, "x")) && integer(own(furnace, "y"), 0, 1000) && integer(own(furnace, "z"))
      && number(own(state, "burnLeft"), 0, 1000) && number(own(state, "burnTotal"), 0, 1000) && number(own(state, "progress"), 0, 1);
    if (!valid) issues.push({ path: `furnaces[${index}]`, reason: "invalid owned-item furnace envelope" });
    for (const key of ["input", "fuel", "output"]) check(own(state, key), `furnaces[${index}].state.${key}`, valid);
  });
  const drops = object(own(raw, "worldDrops"), "worldDrops");
  if (drops) array(own(drops, "records"), "worldDrops.records", false)?.forEach((value, index) => {
    const record = object(value, `worldDrops.records[${index}]`, false);
    if (record) check(own(record, "stack"), `worldDrops.records[${index}].stack`);
  });
  const mobs = object(own(raw, "mobs"), "mobs");
  if (mobs) array(own(mobs, "records"), "mobs.records", false)?.forEach((value, index) => {
    const record = object(value, `mobs.records[${index}]`, false);
    if (record) list(own(record, "pendingLoot"), `mobs.records[${index}].pendingLoot`, Infinity, true, false);
  }); // Existing mob loot tables never produce glow; do not relax their allowlists.
  return issues;
}

export function diagnoseRawGlowOwnership(raw: unknown): GlowOwnershipIssue[] { return diagnoseRawActivationOwnership(raw, "glow"); }
export function diagnoseRawSparklerOwnership(raw: unknown): GlowOwnershipIssue[] { return diagnoseRawActivationOwnership(raw, "sparkler"); }

/**
 * Parses a save and rebuilds it field by field with strict, own-property checks. A save is
 * rejected (with a clear message) only if it isn't JSON, has an unsupported version or has no
 * usable seed. Every other top-level field is repaired to a safe default instead (e.g. an invalid
 * game mode becomes creative), so a damaged save stays reachable. Optional sections are passed on
 * as-is and sanitized by their own loaders (savecheck.ts, loadPrograms).
 */
export function parseSave(text: string): SaveData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Save is not valid JSON");
  }
  if (!isObj(raw)) throw new Error("Malformed save data");
  const version = own(raw, "version");
  if (version !== SAVE_VERSION) throw new Error(`Unsupported save version ${String(version)}`);
  const seed = own(raw, "seed");
  if (!finite(seed)) throw new Error("Malformed save data: missing seed");

  // Must precede sanitizeInventoryPending and all downstream owner loaders.
  const glowOwnershipIssues = diagnoseRawGlowOwnership(raw);
  const sparklerOwnershipIssues = diagnoseRawSparklerOwnership(raw);
  const name = own(raw, "name");
  const mode = own(raw, "mode");
  const time = own(raw, "timeOfDay");
  const player = isObj(own(raw, "player")) ? (own(raw, "player") as Obj) : {};
  const pos = isObj(own(player, "position")) ? (own(player, "position") as Obj) : {};
  // Positions are clamped into the world border (huge x/z could otherwise hang block loops).
  const position = finite(own(pos, "x")) && finite(own(pos, "y")) && finite(own(pos, "z"))
    ? clampPosition({ x: own(pos, "x") as number, y: own(pos, "y") as number, z: own(pos, "z") as number })
    : null;
  const inventory = isObj(own(raw, "inventory")) ? (own(raw, "inventory") as Obj) : {};
  const rules = isObj(own(raw, "gamerules")) ? (own(raw, "gamerules") as Obj) : {};
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  const save: SaveData = {
    version: SAVE_VERSION,
    name: typeof name === "string" && name.trim() !== "" ? name.slice(0, 64) : "Untitled World",
    // Seeds are 32-bit integers (the generator hashes them as such); this is the identity for valid saves.
    seed: seed | 0,
    mode: mode === "survival" ? "survival" : "creative",
    timeOfDay: finite(time) ? (time >= 0 && time < 1 ? time : ((time % 1) + 1) % 1) : 0.05,
    player: {
      position,
      yaw: finite(own(player, "yaw")) ? (own(player, "yaw") as number) % (Math.PI * 2) : 0,
      pitch: finite(own(player, "pitch")) ? Math.max(-1.57, Math.min(1.57, own(player, "pitch") as number)) : 0,
      flying: bool(own(player, "flying"), false),
    },
    inventory: {
      slots: Array.isArray(own(inventory, "slots")) ? (own(inventory, "slots") as InventoryData["slots"]) : [],
      selected: Number.isInteger(own(inventory, "selected")) ? (own(inventory, "selected") as number) : 0,
      ...(Object.prototype.hasOwnProperty.call(inventory, "offhand") ? { offhand: own(inventory, "offhand") as InventoryData["offhand"] } : {}),
      ...(isObj(own(inventory, "equipment")) ? { equipment: own(inventory, "equipment") as InventoryData["equipment"] } : {}),
    },
    inventoryPending: sanitizeInventoryPending(own(raw, "inventoryPending")),
    farming: sanitizeFarmingState(own(raw, "farming")),
    edits: Array.isArray(own(raw, "edits")) ? (own(raw, "edits") as BlockEdit[]) : [],
    gamerules: { doMobSpawning: bool(own(rules, "doMobSpawning"), true), doDaylightCycle: bool(own(rules, "doDaylightCycle"), true), keepInventory: bool(own(rules, "keepInventory"), false) },
  };
  if (glowOwnershipIssues.length) save.glowOwnershipIssues = glowOwnershipIssues;
  if (sparklerOwnershipIssues.length) save.sparklerOwnershipIssues = sparklerOwnershipIssues;
  const status = sanitizePlayerStatus(own(raw, "playerStatus"));
  if (status.invalid) save.playerStatusInvalid = true;
  else if (status.data.poison) save.playerStatus = status.data;
  // Optional sections: passed through for their own sanitizers.
  for (const key of ["npcs", "hunger", "agent", "programs", "chalkboards", "furnaces", "redstone", "worldDrops", "mobs", "leashes", "playerState", "snowballProjectiles", "balloons"] as const) {
    const v = own(raw, key);
    if (v !== undefined) (save as unknown as Obj)[key] = v;
  }
  // Diagnose raw ownership before the regular legacy loaders can repair/truncate it. The game
  // must preserve the original save instead of overwriting a pending/completed death with loss.
  if (sanitizePlayerState(own(raw, "playerState")).data.death && !validatePlayerDeathOwnership(own(raw, "inventory"), own(raw, "inventoryPending"))) save.playerStateOwnershipInvalid = true;
  return save;
}
