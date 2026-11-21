/**
 * Strict, total sanitizers for the optional save sections. Saves are user-editable JSON, so every
 * field is type-checked using own properties only (keys like "__proto__" or "constructor" never
 * resolve to built-ins). Invalid entries are dropped and counted; nothing here throws.
 */
import { inspectGlowState } from "../ownership/glow-stick-state";
import { BLOCK_ID_LIMIT } from "../core/ids";
import { isKnownBlockId } from "../catalog/blocks";
import { AGENT_SLOTS, type AgentState } from "../automation/agent";
import { CHALKBOARD_SIZES, type Chalkboard, type ChalkboardSize } from "../education/chalkboard";
import type { HungerState } from "../simulation/hunger";
import type { ItemStack } from "../ownership/inventory";
import { armorOf, baseStackId, durabilityOf, isKnownId, maxStackOf } from "../catalog/items";
import { MAX_FOOD } from "../simulation/hunger";
import { smeltResult, type FurnaceState } from "../crafting/smelting";

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
  if (!int(id, 0, 100000) || !isKnownId(id)) return null;
  // Hidden state blocks (powered dust, a pressed button, an open door half...) become their base item.
  const base = baseStackId(id);
  if (!int(count, 1, maxStackOf(base))) return null;
  const glow = inspectGlowState(raw);
  if (glow.kind === "invalid") return null;
  const s: ItemStack = { id: base, count };
  if (glow.kind === "inactive" || glow.kind === "active") s.glow = { state: glow.kind };
  // Tool wear: an integer below the tool's durability (anything else is dropped, i.e. a new tool).
  const damage = own(raw, "damage");
  const durability = durabilityOf(id);
  // New armor is strict: invalid wear must not silently repair damaged equipped pieces.
  if (armorOf(id) && damage !== undefined && !int(damage, 0, durability! - 1)) return null;
  if (durability !== null && int(damage, 1, durability - 1)) s.damage = damage;
  const book = own(raw, "book");
  if (isObj(book) && Array.isArray(own(book, "pages"))) {
    s.book = { pages: (own(book, "pages") as unknown[]).slice(0, 50).map((p) => typeof p === "string" ? p.slice(0, 256) : "") };
    if (typeof own(book, "title") === "string") s.book.title = (own(book, "title") as string).slice(0, 32);
    if (typeof own(book, "author") === "string") s.book.author = (own(book, "author") as string).slice(0, 32);
  }
  return s;
}

/** The inventory UI owns at most nine crafting cells and one held stack. */
export function sanitizeInventoryPending(raw: unknown): ItemStack[] {
  if (!Array.isArray(raw)) return [];
  const result: ItemStack[] = [];
  for (const value of raw.slice(0, 10)) {
    const stack = sanitizeStack(value);
    if (!stack || !isObj(value)) continue;
    result.push(stack);
  }
  return result;
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
      const state: FurnaceState = {
        input: sanitizeStack(own(st, "input")), fuel: sanitizeStack(own(st, "fuel")), output: sanitizeStack(own(st, "output")),
        burnLeft: own(st, "burnLeft") as number, burnTotal: own(st, "burnTotal") as number, progress: own(st, "progress") as number,
      };
      if (state.progress > 0) {
        const marker = own(st, "progressInputId"), id = state.input?.id;
        // Old saves cannot identify a previous input: retain legitimate work on the current one.
        // A corrupt explicit binding repairs only work progress, never the owned contents or fire.
        if (id === undefined || smeltResult(id) === null || (marker !== undefined && marker !== id)) state.progress = 0;
        else if (marker !== undefined) state.progressInputId = id; // Keep unmarked legacy saves structurally unchanged until their next tick.
      }
      furnaces.push({ x: own(f, "x") as number, y: own(f, "y") as number, z: own(f, "z") as number, state });
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
      if (int(x) && int(y, 0, 1000) && int(z) && int(id, 0, BLOCK_ID_LIMIT) && isKnownBlockId(id)) out.push([x, y, z, id]);
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
