import type { BlockEdit } from "./world";
import type { ItemStack } from "./inventory";
import type { GameMode } from "./rules";
import type { Vec3 } from "./math";
import type { HungerState } from "./hunger";
import type { FurnaceState } from "./smelting";
import type { Chalkboard } from "./chalkboard";

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  name: string;
  seed: number;
  mode: GameMode;
  timeOfDay: number;
  player: { position: Vec3; yaw: number; pitch: number; flying: boolean };
  inventory: { slots: (ItemStack | null)[]; selected: number };
  edits: BlockEdit[];
  /** Game rules (optional for older saves; both default to true). */
  gamerules?: { doMobSpawning: boolean; doDaylightCycle: boolean };
  /** Education Edition NPCs placed in the world (optional for older saves). */
  npcs?: Array<{ x: number; y: number; z: number; yaw: number; name: string; dialogue: string }>;
  /** Survival hunger (optional for older saves; defaults to full). */
  hunger?: HungerState;
  /** Education Edition chalkboards (optional for older saves). */
  chalkboards?: Chalkboard[];
  /** Furnaces with their contents and progress (optional for older saves). */
  furnaces?: Array<{ x: number; y: number; z: number; state: FurnaceState }>;
}

export function serializeSave(data: Omit<SaveData, "version">): string {
  return JSON.stringify({ version: SAVE_VERSION, ...data });
}

/** Parses and validates a save; throws on malformed data. */
export function parseSave(text: string): SaveData {
  const data = JSON.parse(text) as Partial<SaveData>;
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${String(data.version)}`);
  if (typeof data.seed !== "number" || !Array.isArray(data.edits) || !data.player || !data.inventory) {
    throw new Error("Malformed save data");
  }
  if (data.mode !== "creative" && data.mode !== "survival") throw new Error("Malformed game mode");
  return data as SaveData;
}
