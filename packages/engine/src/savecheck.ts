/**
 * Strict, total sanitizers for the optional save sections. Saves are user-editable JSON, so every
 * field is type-checked using own properties only (keys like "__proto__" or "constructor" never
 * resolve to built-ins). Invalid entries are dropped and counted; nothing here throws.
 */
import { AGENT_SLOTS, type AgentState } from "./agent";
import { CHALKBOARD_SIZES, type Chalkboard, type ChalkboardSize } from "./chalkboard";
import type { HungerState } from "./hunger";
import type { ItemStack } from "./inventory";
import { isKnownId, maxStackOf, toolOf } from "./items";
import { MAX_FOOD } from "./hunger";
import type { FurnaceState } from "./smelting";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const int = (v: unknown, lo = -1e7, hi = 1e7): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const num = (v: unknown, lo = -1e7, hi = 1e7): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** A valid stack, or null (for empty or invalid). */
export function sanitizeStack(raw: unknown): ItemStack | null {
  if (!isObj(raw)) return null;
  const id = own(raw, "id");
  const count = own(raw, "count");
  if (!int(id, 0, 100000) || !isKnownId(id) || !int(count, 1, 64)) return null;
  const s: ItemStack = { id, count: Math.min(count, maxStackOf(id)) };
  const damage = own(raw, "damage");
  if (toolOf(id) && int(damage, 0, 100000) && damage > 0) s.damage = damage;
  return s;
}

/** A saved Agent, or null if any field is invalid. */
export function sanitizeAgent(raw: unknown): AgentState | null {
  try {
    if (!isObj(raw)) return null;
    const x = own(raw, "x"), y = own(raw, "y"), z = own(raw, "z"), facing = own(raw, "facing"), selected = own(raw, "selected"), slots = own(raw, "slots");
    if (!int(x) || !int(y, 0, 1000) || !int(z) || !int(facing, 0, 3) || !int(selected, 0, AGENT_SLOTS - 1) || !Array.isArray(slots)) return null;
    const clean: (ItemStack | null)[] = new Array(AGENT_SLOTS).fill(null);
    slots.slice(0, AGENT_SLOTS).forEach((s, i) => (clean[i] = sanitizeStack(s)));
    return { x, y, z, facing, selected, slots: clean };
  } catch {
    return null;
  }
}

/** Valid chalkboards (size must be one of the three; text clamped). */
export function sanitizeChalkboards(raw: unknown): { boards: Chalkboard[]; dropped: number } {
  const boards: Chalkboard[] = [];
  let dropped = 0;
  try {
    if (!Array.isArray(raw)) return { boards, dropped: raw === undefined ? 0 : 1 };
    for (const b of raw) {
      const size = isObj(b) ? own(b, "size") : undefined;
      if (
        !isObj(b) || typeof size !== "string" || !Object.prototype.hasOwnProperty.call(CHALKBOARD_SIZES, size) ||
        !int(own(b, "x")) || !int(own(b, "y"), 0, 1000) || !int(own(b, "z")) || !int(own(b, "facing"), 0, 3) ||
        typeof own(b, "standing") !== "boolean" || typeof own(b, "text") !== "string" || typeof own(b, "locked") !== "boolean"
      ) {
        dropped++;
        continue;
      }
      const s = size as ChalkboardSize;
      boards.push({
        x: own(b, "x") as number, y: own(b, "y") as number, z: own(b, "z") as number, size: s, facing: own(b, "facing") as number,
        standing: own(b, "standing") as boolean, text: (own(b, "text") as string).slice(0, CHALKBOARD_SIZES[s].maxChars), locked: own(b, "locked") as boolean,
      });
    }
  } catch {
    dropped++;
  }
  return { boards, dropped };
}

/** Valid furnaces with sanitized stacks. */
export function sanitizeFurnaces(raw: unknown): { furnaces: Array<{ x: number; y: number; z: number; state: FurnaceState }>; dropped: number } {
  const furnaces: Array<{ x: number; y: number; z: number; state: FurnaceState }> = [];
  let dropped = 0;
  try {
    if (!Array.isArray(raw)) return { furnaces, dropped: raw === undefined ? 0 : 1 };
    for (const f of raw) {
      const st = isObj(f) ? own(f, "state") : undefined;
      if (!isObj(f) || !isObj(st) || !int(own(f, "x")) || !int(own(f, "y"), 0, 1000) || !int(own(f, "z")) ||
        !num(own(st, "burnLeft"), 0, 1000) || !num(own(st, "burnTotal"), 0, 1000) || !num(own(st, "progress"), 0, 1)) {
        dropped++;
        continue;
      }
      furnaces.push({
        x: own(f, "x") as number, y: own(f, "y") as number, z: own(f, "z") as number,
        state: {
          input: sanitizeStack(own(st, "input")), fuel: sanitizeStack(own(st, "fuel")), output: sanitizeStack(own(st, "output")),
          burnLeft: own(st, "burnLeft") as number, burnTotal: own(st, "burnTotal") as number, progress: own(st, "progress") as number,
        },
      });
    }
  } catch {
    dropped++;
  }
  return { furnaces, dropped };
}

/** Valid saved NPCs. */
export function sanitizeNpcs(raw: unknown): Array<{ x: number; y: number; z: number; yaw: number; name: string; dialogue: string }> {
  const out: Array<{ x: number; y: number; z: number; yaw: number; name: string; dialogue: string }> = [];
  try {
    if (!Array.isArray(raw)) return out;
    for (const n of raw) {
      if (!isObj(n) || !num(own(n, "x")) || !num(own(n, "y"), -100, 1000) || !num(own(n, "z")) || !num(own(n, "yaw"), -1e4, 1e4) ||
        typeof own(n, "name") !== "string" || typeof own(n, "dialogue") !== "string") continue;
      out.push({
        x: own(n, "x") as number, y: own(n, "y") as number, z: own(n, "z") as number, yaw: own(n, "yaw") as number,
        name: (own(n, "name") as string).slice(0, 64), dialogue: (own(n, "dialogue") as string).slice(0, 2000),
      });
    }
  } catch {
    // Keep what was valid.
  }
  return out;
}

/** Saved hunger, or null if invalid. */
export function sanitizeHunger(raw: unknown): HungerState | null {
  if (!isObj(raw)) return null;
  const food = own(raw, "food"), saturation = own(raw, "saturation"), exhaustion = own(raw, "exhaustion"), timer = own(raw, "timer");
  if (!num(food, 0, MAX_FOOD) || !num(saturation, 0, MAX_FOOD) || !num(exhaustion, 0, 40) || !num(timer, 0, 1e6)) return null;
  return { food, saturation, exhaustion, timer };
}

/** Valid block edits: integer coordinates inside the world and a known block id. */
export function sanitizeEdits(raw: unknown): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  try {
    if (!Array.isArray(raw)) return out;
    for (const e of raw) {
      if (!Array.isArray(e) || e.length !== 4) continue;
      const [x, y, z, id] = e as unknown[];
      if (int(x) && int(y, 0, 1000) && int(z) && int(id, 0, 255) && isKnownId(id)) out.push([x, y, z, id]);
    }
  } catch {
    // Keep what was valid.
  }
  return out;
}

/** A Camera & Portfolio photo (stored separately from the world save). */
export interface PhotoData {
  id: string;
  dataUrl: string;
  caption: string;
  takenAt: string;
}

/**
 * Portfolio entries from storage: id and image data URL are required (an image data URL only);
 * caption and timestamp are repaired. Malformed entries are dropped and counted.
 */
export function sanitizePhotos(raw: unknown, max = 50): { photos: PhotoData[]; dropped: number } {
  const photos: PhotoData[] = [];
  let dropped = 0;
  try {
    if (!Array.isArray(raw)) return { photos, dropped: raw === undefined || raw === null ? 0 : 1 };
    for (const p of raw) {
      const id = isObj(p) ? own(p, "id") : undefined;
      const url = isObj(p) ? own(p, "dataUrl") : undefined;
      if (!isObj(p) || typeof id !== "string" || id.length === 0 || id.length > 64 || typeof url !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(url)) {
        dropped++;
        continue;
      }
      const caption = own(p, "caption");
      const takenAt = own(p, "takenAt");
      photos.push({
        id,
        dataUrl: url,
        caption: typeof caption === "string" ? caption.slice(0, 200) : "",
        takenAt: typeof takenAt === "string" && !Number.isNaN(Date.parse(takenAt)) ? takenAt : new Date(0).toISOString(),
      });
      if (photos.length >= max) break;
    }
  } catch {
    dropped++;
  }
  return { photos, dropped };
}
