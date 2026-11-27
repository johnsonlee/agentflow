import{diagnoseRawBookOwnership}from'./book-ownership';
import { Inventory, type InventoryData } from "../ownership/inventory";
import { loadPrograms } from "../automation/codebuilder";
import { sanitizeAgent, sanitizeHunger, sanitizeInventoryPending } from "./savecheck";
import { parseSave, serializeSave, SAVE_VERSION, type SaveData } from "./save";
import { readDimensionArchive } from "./dimension-save";
import { DIMENSION_WORLD_KEYS } from "./dimension-world";
import { createDimensionGeneratedBlockProbe } from "../world/dimension-probe";
import { sanitizePlayerState, validatePlayerDeathOwnership } from "../simulation/player-death";

/** Application import limits, not Minecraft .mcworld compatibility limits. */
export const MAX_WORLD_SAVE_BYTES = 8 * 1024 * 1024;
export const MAX_WORLD_SAVE_DEPTH = 128;
export const MAX_WORLD_SAVE_NODES = 250_000;
export interface WorldSaveImport {
  readonly raw: string;
  readonly name: string;
  readonly mode: "creative" | "survival";
  readonly seed: number;
  readonly bytes: number;
}
const globals = ["version", "name", "mode", "timeOfDay", "inventory", "inventoryPending", "playerState", "hunger", "agent", "programs", "gamerules", "dimensions", "playerStatus", "codeWorkspace"];
const allowed = new Set<string>([...globals, ...DIMENSION_WORLD_KEYS]);
// Complete fields emitted by current Game.captureSaveData. Optional extensions remain optional.
const required = ["version", "name", "seed", "generatorVersion", "fluids", "mode", "timeOfDay", "player", "inventory", "inventoryPending", "playerState", "snowballProjectiles", "worldDrops", "leashes", "balloons", "edits", "mobs", "npcs", "hunger", "chalkboards", "agent", "programs", "chests", "brewingStands", "furnaces", "gamerules", "redstone", "farming", "caneGrowth"];
type ObjectData = Record<string, unknown>;
const object = (v: unknown): v is ObjectData => v !== null && typeof v === "object" && !Array.isArray(v);
function refuse(section: string): never { throw new Error(`This backup has unsupported or damaged ${section}. Your current world is unchanged.`); }
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && equal(a[k], b[k]));
}

/** Bound parsing and reject duplicate decoded member names before JSON.parse can erase an owner. */
function inspectJSON(text: string): void {
  let i = 0, nodes = 0;
  const space = () => { while (/[\x20\t\r\n]/.test(text[i] ?? "!") && i < text.length) i++; };
  const string = (): string => {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === "\\") { i++; continue; }
      if (c === '"') return JSON.parse(text.slice(start, i)) as string;
    }
    return refuse("JSON text");
  };
  const value = (depth: number): void => {
    if (depth > MAX_WORLD_SAVE_DEPTH || ++nodes > MAX_WORLD_SAVE_NODES) throw new Error("This backup exceeds the supported JSON depth or record limit. Your current world is unchanged.");
    space(); const c = text[i];
    if (c === "{") {
      i++; space(); const keys = new Set<string>();
      if (text[i] === "}") { i++; return; }
      while (i < text.length) {
        space(); if (text[i] !== '"') refuse("JSON text");
        const key = string(); if (keys.has(key)) throw new Error("This backup contains duplicate JSON fields. Your current world is unchanged."); keys.add(key);
        space(); if (text[i++] !== ":") refuse("JSON text"); value(depth + 1); space();
        const end = text[i++]; if (end === "}") return; if (end !== ",") refuse("JSON text");
      }
      refuse("JSON text");
    } else if (c === "[") {
      i++; space(); if (text[i] === "]") { i++; return; }
      while (i < text.length) { value(depth + 1); space(); const end = text[i++]; if (end === "]") return; if (end !== ",") refuse("JSON text"); }
      refuse("JSON text");
    } else if (c === '"') { string(); }
    else {
      const start = i; while (i < text.length && !/[\x20\t\r\n,}\]]/.test(text[i])) i++;
      if (start === i) refuse("JSON text");
      // The native parser checks the primitive grammar, escapes and finite owner values below.
    }
  };
  value(0); space(); if (i !== text.length) refuse("JSON text");
}

/** Validate a complete current application export without creating a Game, repairing owners,
 * writing storage, or changing the selected bytes. Older/foreign/recovery exports are refused.
 * The validation-only archive forces existing strict active-world checks for flat saves too. */
export function inspectWorldSaveImport(bytes: Uint8Array): WorldSaveImport {
  if (!bytes.byteLength || bytes.byteLength > MAX_WORLD_SAVE_BYTES) throw new Error("Choose an application world backup of 8 MiB or smaller.");
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error("This backup is not valid UTF-8. Your current world is unchanged."); }
  try { inspectJSON(raw); } catch (error) { if (error instanceof SyntaxError) refuse("JSON text"); throw error; }
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return refuse("JSON text"); }
  if (!object(data)) refuse("world data");
  if (Object.keys(data).some(k => !allowed.has(k)) || required.some(k => !Object.hasOwn(data, k))) refuse("export fields; choose a complete JSON backup exported by this application");
  if (data.version !== SAVE_VERSION || !Number.isInteger(data.seed) || (data.seed as number) < -2147483648 || (data.seed as number) > 2147483647) refuse("version or seed");
  if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 64 || data.mode !== "creative" && data.mode !== "survival") refuse("name or game mode");
  if (typeof data.timeOfDay !== "number" || !Number.isFinite(data.timeOfDay) || data.timeOfDay < 0 || data.timeOfDay >= 1) refuse("world time");
  if(diagnoseRawBookOwnership(data).length)refuse('Book ownership');
  const probe = createDimensionGeneratedBlockProbe();
  const archive = readDimensionArchive(data.dimensions ?? { version: 1, active: "overworld", inactive: {}, links: [] }, data, probe);
  if (archive.kind !== "valid") refuse("world owners or dimension references");
  // Game restores modern actors when present and otherwise uses legacy NPCs. A current
  // export mirrors NPCs; independently valid but divergent caches would lose legacy actors.
  for (const world of [data, ...Object.values(archive.data.inactive)]) {
    if (!world || !object(world.mobs) || !Array.isArray(world.mobs.records) || world.npcs === undefined) continue;
    const mirror = world.mobs.records.filter(mob => object(mob) && mob.kind === "npc").map(mob => ({
      x: mob.position.x, y: mob.position.y, z: mob.position.z, yaw: mob.yaw,
      name: mob.name ?? "NPC", dialogue: mob.dialogue ?? "", ...(mob.npcActions ? { npcActions: mob.npcActions } : {}),
    }));
    if (!equal(world.npcs, mirror)) refuse("conflicting NPC records");
  }
  const inventory = Inventory.fromJSON(data.inventory as InventoryData).toJSON();
  if (!equal(data.inventory, inventory)) refuse("inventory or equipment");
  if (!equal(data.inventoryPending, sanitizeInventoryPending(data.inventoryPending))) refuse("pending inventory items");
  if (!equal(data.agent, sanitizeAgent(data.agent))) refuse("Agent or carried items");
  if (!equal(data.hunger, sanitizeHunger(data.hunger))) refuse("hunger state");
  const life = sanitizePlayerState(data.playerState);
  if (life.invalid || !equal(data.playerState, life.data) || life.data.health === 0 && (!validatePlayerDeathOwnership(data.inventory, data.inventoryPending) || data.playerStatus !== undefined)) refuse("player health or death ownership");
  const programs = loadPrograms(data.programs);
  if (programs.errors.length || !equal(data.programs, programs.programs)) refuse("saved programs");
  const rules = data.gamerules;
  if (!object(rules) || Object.keys(rules).sort().join(",") !== "doDaylightCycle,doMobSpawning,keepInventory" || Object.values(rules).some(v => typeof v !== "boolean")) refuse("game rules");
  let save: SaveData;
  try {
    save = parseSave(raw, probe);
    for (const [key, value] of Object.entries(save)) if ((key.endsWith("Invalid") && value === true) || key.endsWith("OwnershipIssues") && Array.isArray(value) && value.length) refuse("recovery data");
    // A current export must survive the shared parser/serializer without losing any section.
    // Wrapped yaw is equivalent orientation and already normalized by ordinary Continue.
    const normalized = JSON.parse(serializeSave(save, probe)) as ObjectData;
    const comparison = { ...data, player: { ...(data.player as ObjectData), yaw: save.player.yaw } };
    if (!equal(comparison, normalized)) refuse("data that would be repaired or discarded");
  } catch (error) { if (error instanceof Error && error.message.includes("Your current world is unchanged")) throw error; return refuse("recovery data"); }
  return Object.freeze({ raw, name: data.name, mode: data.mode, seed: data.seed as number, bytes: bytes.byteLength });
}
