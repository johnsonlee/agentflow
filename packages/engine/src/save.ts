import type { BlockEdit } from "./world";
import type { ItemStack } from "./inventory";
import type { GameMode } from "./rules";
import { clampPosition, type Vec3 } from "./math";
import type { HungerState } from "./hunger";
import type { FurnaceState } from "./smelting";
import type { Chalkboard } from "./chalkboard";
import type { AgentState } from "./agent";
import type { CodeProgram } from "./codebuilder";

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  name: string;
  seed: number;
  mode: GameMode;
  timeOfDay: number;
  /** `position` is null when a damaged save had none (the game then uses the spawn point). */
  player: { position: Vec3 | null; yaw: number; pitch: number; flying: boolean };
  inventory: { slots: (ItemStack | null)[]; selected: number };
  edits: BlockEdit[];
  /** Game rules (optional for older saves; both default to true). */
  gamerules?: { doMobSpawning: boolean; doDaylightCycle: boolean };
  /** Education Edition NPCs placed in the world (optional for older saves). */
  npcs?: Array<{ x: number; y: number; z: number; yaw: number; name: string; dialogue: string }>;
  /** Survival hunger (optional for older saves; defaults to full). */
  hunger?: HungerState;
  /** Education Edition Agent and Code Builder programs (optional for older saves). */
  agent?: AgentState;
  programs?: CodeProgram[];
  /** Education Edition chalkboards (optional for older saves). */
  chalkboards?: Chalkboard[];
  /** Furnaces with their contents and progress (optional for older saves). */
  furnaces?: Array<{ x: number; y: number; z: number; state: FurnaceState }>;
}

export function serializeSave(data: Omit<SaveData, "version">): string {
  return JSON.stringify({ version: SAVE_VERSION, ...data });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

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
      slots: Array.isArray(own(inventory, "slots")) ? (own(inventory, "slots") as (ItemStack | null)[]) : [],
      selected: Number.isInteger(own(inventory, "selected")) ? (own(inventory, "selected") as number) : 0,
    },
    edits: Array.isArray(own(raw, "edits")) ? (own(raw, "edits") as BlockEdit[]) : [],
    gamerules: { doMobSpawning: bool(own(rules, "doMobSpawning"), true), doDaylightCycle: bool(own(rules, "doDaylightCycle"), true) },
  };
  // Optional sections: passed through for their own sanitizers.
  for (const key of ["npcs", "hunger", "agent", "programs", "chalkboards", "furnaces"] as const) {
    const v = own(raw, key);
    if (v !== undefined) (save as unknown as Obj)[key] = v;
  }
  return save;
}
