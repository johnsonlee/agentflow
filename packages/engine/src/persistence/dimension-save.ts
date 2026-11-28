import {diagnoseRawNpcActionOwnership as diagnoseRawNpcActions} from "./npc-action-ownership";
import{diagnoseRawBookOwnership}from './book-ownership';

import{diagnoseRawComposterOwnership}from './composter-ownership';
import{diagnoseRawWoodSlabOwnership}from './wood-slab-ownership';
import {diagnoseRawBoneMealOwnership} from './bone-meal-ownership';
import { readCaneGrowthState } from "./cane-growth-state";
import {diagnoseRawCaneOwnership} from './cane-ownership';
import {readChestOwners} from './chest-save';
import {readBrewingStandOwners} from "./brewing-save";
import {readBlazeOwners} from "./blaze-save";
import { DIMENSION_WORLD_KEYS, type DimensionId, type DimensionWorldState, type DimensionArchiveState } from "./dimension-world";
import { WORLD_BORDER, MIN_Y, MAX_Y, type Vec3 } from "../core/math";
import { WORLD_HEIGHT } from "../world/chunk";
import { blockId, isKnownBlockId, isOpaque, tryBlockById } from "../catalog/blocks";
import { isKnownId } from "../catalog/items";
import { sanitizeGeneratorVersion, type GeneratorVersion } from "../world/generator";
import { sanitizePortalState, validatePortalEdits, PORTAL_MAX_RECORDS, type PortalRecord } from "../simulation/portals";
import { sanitizeFireState } from "../simulation/fire";
import { sanitizeFluidState } from "../simulation/fluids";
import { sanitizeGravelHarvestState } from "../ownership/gravel-harvest";
import { sanitizeFarmingState } from "../simulation/farming";
import { sanitizeScheduled } from "../simulation/redstone";
import { sanitizeFurnaces, sanitizeChalkboards, sanitizeNpcs } from "./savecheck";
import { sanitizeMobState, restoreMobSnapshot } from "./mob-save";
import { sanitizeWorldDrops } from "../ownership/world-drops";
import { LeashStore } from "../ownership/leashes";
import {readCameras}from "../education/placed-camera";
import { BalloonStore } from "../ownership/balloons";
import { SnowballProjectiles } from "../simulation/snowball-projectiles";
import { smeltResult } from "../crafting/smelting";
import { chalkboardCells, CHALKBOARD_SIZES } from "../education/chalkboard";
import { diagnoseRawWartSupport, diagnoseRawBrewingItemOwnership, diagnoseRawWartOwnership, diagnoseRawPortalOwnership, diagnoseRawIgnitionOwnership, diagnoseRawBucketOwnership, diagnoseRawBottleOwnership, diagnoseRawGlowOwnership, diagnoseRawSparklerOwnership } from "./save";

type Obj = Record<string, unknown>;
export interface DimensionSaveIssue { path: string; reason: string }
export interface DimensionPortalEndpoint { dimension: DimensionId; portal: PortalRecord }
export interface DimensionPortalLink { from: DimensionPortalEndpoint; to: DimensionPortalEndpoint }
export interface DimensionsData extends DimensionArchiveState { links: DimensionPortalLink[] }
export type DimensionReadResult = { kind: "absent" } | { kind: "valid"; data: DimensionsData } | { kind: "invalid"; issues: DimensionSaveIssue[] };
/** Only primitive arguments cross this optional read-only generator boundary.
 * Edited cells always take precedence. Unknown generated references refuse validation. */
export type DimensionGeneratedBlockProbe = (dimension: DimensionId, seed: number, version: GeneratorVersion, x: number, y: number, z: number) => number | undefined;
const realm = (v: unknown): v is DimensionId => v === "overworld" || v === "nether";
const obj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const has = (o: Obj, k: string) => Object.hasOwn(o, k);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const at = (prefix: string, name: string) => prefix ? `${prefix}.${name}` : name;
const coord = (x: unknown, y: unknown, z: unknown) => Number.isSafeInteger(x) && Number.isSafeInteger(y) && Number.isSafeInteger(z) && Math.abs(x as number) <= WORLD_BORDER && Math.abs(z as number) <= WORLD_BORDER && (y as number) >= 0 && (y as number) < WORLD_HEIGHT;
class BadData extends Error { constructor(readonly path: string, reason: string) { super(reason); } }
function fail(path: string, reason: string): never { throw new BadData(path, reason); }

/** Read JSON data without invoking accessors, losing non-enumerable owners, or accepting sparse arrays. */
function copyJSON(value: unknown, path: string, ancestors = new Set<object>(), depth = 0): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || finite(value)) return value;
  if (typeof value !== "object" || depth > 64) return fail(path, "Expected finite JSON data within the supported nesting depth");
  if (ancestors.has(value)) return fail(path, "Cyclic saved data");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) return fail(path, "Sparse or extended saved array");
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        if (!d || !("value" in d) || !d.enumerable) return fail(`${path}[${i}]`, "Expected enumerable data array entry");
        out.push(copyJSON(d.value, `${path}[${i}]`, ancestors, depth + 1));
      }
      return out;
    }
    if (!obj(value)) return fail(path, "Expected plain saved-data object");
    const out: Obj = Object.create(null);
    for (const k of Reflect.ownKeys(value)) {
      const d = Object.getOwnPropertyDescriptor(value, k)!;
      if (typeof k !== "string" || !("value" in d) || !d.enumerable) return fail(path, "Expected enumerable data properties");
      out[k] = copyJSON(d.value, at(path, k), ancestors, depth + 1);
    }
    return out;
  } finally { ancestors.delete(value); }
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (!obj(a) || !obj(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && same(a[k], b[k]));
}
function canonicalEqual(raw: unknown, cleaned: unknown): boolean {
  try { return same(raw, JSON.parse(JSON.stringify(cleaned))); } catch { return false; }
}
function exact(value: unknown, keys: readonly string[]): value is Obj {
  return obj(value) && Object.keys(value).length === keys.length && keys.every(k => has(value, k));
}
function position(value: unknown): value is Vec3 {
  return exact(value, ["x", "y", "z"]) && finite(value.x) && finite(value.y) && finite(value.z) && Math.abs(value.x) <= WORLD_BORDER && Math.abs(value.z) <= WORLD_BORDER && value.y >= MIN_Y && value.y <= MAX_Y;
}
function activeProjection(raw: unknown): Obj {
  if (!obj(raw)) return fail("", "Expected active world data");
  const result: Obj = Object.create(null);
  for (const k of DIMENSION_WORLD_KEYS) {
    const d = Object.getOwnPropertyDescriptor(raw, k);
    if (!d) continue;
    if (!("value" in d) || !d.enumerable) return fail(k, "Expected enumerable active-world data");
    result[k] = copyJSON(d.value, k);
  }
  return result;
}

function readWorld(raw: unknown, dimension: DimensionId, prefix: string, issues: DimensionSaveIssue[], probe?: DimensionGeneratedBlockProbe): DimensionWorldState | null {
  const start = issues.length, add = (name: string, reason: string) => issues.push({ path: at(prefix, name), reason });
  if (!obj(raw)) { add("", "Expected stored world object"); return null; }
  for (const k of Object.keys(raw)) if (!(DIMENSION_WORLD_KEYS as readonly string[]).includes(k)) add(k, "Foreign global owner or unknown world field");
  if (!Number.isInteger(raw.seed) || (raw.seed as number) < -2147483648 || (raw.seed as number) > 2147483647) add("seed", "Expected signed 32-bit world seed");
  const player = raw.player;
  if (!exact(player, ["position", "yaw", "pitch", "flying"]) || !position(player.position) || !finite(player.yaw) || !finite(player.pitch) || player.pitch < -1.57 || player.pitch > 1.57 || typeof player.flying !== "boolean") add("player", "Malformed world-local player location");
  const generator = sanitizeGeneratorVersion(raw.generatorVersion);
  if (generator.invalid || dimension === "nether" && generator.present && generator.version !== 1) add("generatorVersion", "Unsupported world generator version for this realm");
  const cells = new Map<string, number>();
  if (!Array.isArray(raw.edits)) add("edits", "Expected complete block edit array");
  else raw.edits.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 4 || !coord(e[0], e[1], e[2]) || !isKnownBlockId(e[3])) { add(`edits[${i}]`, "Malformed or unknown physical block edit"); return; }
    const k = key(e[0], e[1], e[2]);
    if (cells.has(k)) add(`edits[${i}]`, "Duplicate physical cell owner"); else cells.set(k, e[3]);
  });
  if (issues.length !== start) return null;
  const seed = raw.seed as number, version = generator.present ? generator.version : 1, generated = new Map<string, number | undefined>();
  const block = (x: number, y: number, z: number): number | undefined => {
    if (!coord(x, y, z)) return undefined;
    const k = key(x, y, z); if (cells.has(k)) return cells.get(k);
    if (!generated.has(k)) { let id: unknown; try { id = probe?.(dimension, seed, version, x, y, z); } catch { id = undefined; } generated.set(k, isKnownBlockId(id) ? id : undefined); }
    return generated.get(k);
  };
  const section = (name: string, invalid: boolean, cleaned: unknown) => {
    if (!has(raw, name)) return true;
    if (invalid || !canonicalEqual(raw[name], cleaned)) { add(name, "Malformed archived state; refusing silent repair or dropped owners"); return false; }
    return true;
  };
  for (const diagnose of [diagnoseRawComposterOwnership, diagnoseRawWoodSlabOwnership, diagnoseRawBoneMealOwnership, diagnoseRawCaneOwnership, diagnoseRawBrewingItemOwnership, diagnoseRawWartOwnership, diagnoseRawPortalOwnership, diagnoseRawIgnitionOwnership, diagnoseRawBucketOwnership, diagnoseRawBottleOwnership, diagnoseRawGlowOwnership, diagnoseRawSparklerOwnership]) {
    for (const issue of diagnose(raw)) add(issue.path, issue.reason);
  }
  for(const issue of diagnoseRawWartSupport(raw,dimension,(_dimension,_seed,_version,x,y,z)=>block(x,y,z)))add(issue.path,issue.reason);
  const blaze=readBlazeOwners(raw);for(const issue of blaze.issues)add(issue.path,issue.reason);
  const chests=readChestOwners(raw,block);for(const issue of chests.issues)add(issue.path,issue.reason);
  const brewing=readBrewingStandOwners(raw,block);for(const issue of brewing.issues)add(issue.path,issue.reason);
  const portals = sanitizePortalState(raw.portals);
  if (!section("portals", portals.invalid, portals.data) || !validatePortalEdits(raw.portals, raw.edits)) add("portals", "Portal records and physical cells must have matching owners");
  const fluids = sanitizeFluidState(raw.fluids); section("fluids", fluids.invalid, fluids.data);
  const fire = sanitizeFireState(raw.fire); section("fire", fire.invalid, fire.data);
  const fireCells = new Set([...cells].filter(([, id]) => id === blockId("fire")).map(([k]) => k));
  if (!fire.invalid) for (const r of fire.data.records) {
    if (!fireCells.delete(key(r.x, r.y, r.z))) add("fire", "Fire record is missing its physical cell");
    const below = block(r.x, r.y - 1, r.z);
    if (below === undefined || !isOpaque(below) || tryBlockById(below)?.solid !== true) add("fire", "Cannot verify Fire support");
  }
  if (fireCells.size) add("fire", "Unowned physical Fire cells");
  const gravel = sanitizeGravelHarvestState(raw.gravelHarvests);
  if (section("gravelHarvests", !!gravel.invalid, gravel.data) && !gravel.invalid) for (const r of gravel.data.records) if (block(r.x, r.y, r.z) !== blockId("gravel")) add("gravelHarvests", "Cannot verify cached Gravel decision source");
  section("farming", false, sanitizeFarmingState(raw.farming));
  const caneGrowth = readCaneGrowthState(raw.caneGrowth);
  section("caneGrowth", caneGrowth.kind === "invalid", caneGrowth.kind === "valid" ? caneGrowth.data : undefined);
  const scheduled = sanitizeScheduled(raw.redstone);
  if (section("redstone", false, scheduled)) {
    const ticks = new Set<string>();
    for (const r of scheduled) { const k = `${key(r.x, r.y, r.z)}:${r.kind}`; if (ticks.has(k)) add("redstone", "Duplicate scheduled component owner"); ticks.add(k); }
  }
  const furnaces = sanitizeFurnaces(raw.furnaces);
  // A valid legacy zero-progress binding is harmless and retained, rather than silently erased in the archive.
  const expectedFurnaces = structuredClone(furnaces.furnaces);
  if (Array.isArray(raw.furnaces)) raw.furnaces.forEach((f, i) => {
    if (!obj(f) || !obj(f.state) || f.state.progress !== 0 || !has(f.state, "progressInputId") || !expectedFurnaces[i]) return;
    const id = f.state.progressInputId;
    if (typeof id === "number" && Number.isSafeInteger(id) && isKnownId(id) && smeltResult(id) !== null) expectedFurnaces[i].state.progressInputId = id;
  });
  if (section("furnaces", furnaces.dropped > 0, expectedFurnaces)) {
    const anchors = new Set<string>();
    for (const f of furnaces.furnaces) {
      const k = key(f.x, f.y, f.z);
      if (!coord(f.x, f.y, f.z) || anchors.has(k) || block(f.x, f.y, f.z) !== blockId("furnace")) add("furnaces", "Duplicate, missing or unverified physical furnace owner");
      anchors.add(k);
    }
  }
  const boards = sanitizeChalkboards(raw.chalkboards);
  if (section("chalkboards", boards.dropped > 0, boards.boards)) {
    const occupied = new Set<string>();
    for (const b of boards.boards) for (const p of chalkboardCells(b)) {
      const k = key(p.x, p.y, p.z);
      if (occupied.has(k) || block(p.x, p.y, p.z) !== blockId(CHALKBOARD_SIZES[b.size].block)) add("chalkboards", "Overlapping, missing or unverified board cells");
      occupied.add(k);
    }
  }
  const mobs = sanitizeMobState(raw.mobs); const mobsValid = section("mobs", !!mobs.invalid, mobs.data);
  if (diagnoseRawNpcActions(raw)) add("npcs", "Invalid NPC URL/command actions");
  const legacyNpcs = sanitizeNpcs(raw.npcs);
  // Current saves mirror authoritative modern NPCs into the legacy cache. Its
  // historical height bounds are narrower than the valid modern actor bounds.
  // Accept that cache unchanged only when every field matches validated actors.
  const modernNpcMirror = mobs.data.records.filter(m => m.kind === "npc").map(m => ({
    x: m.position.x, y: m.position.y, z: m.position.z, yaw: m.yaw,
    name: m.name ?? "NPC", dialogue: m.dialogue ?? "", ...(m.npcActions ? { npcActions: m.npcActions } : {}),
  }));
  section("npcs", false, !canonicalEqual(raw.npcs, legacyNpcs) && mobs.present && mobsValid && !mobs.invalid ? modernNpcMirror : legacyNpcs);
  const drops = sanitizeWorldDrops(raw.worldDrops); section("worldDrops", !!drops.invalid, drops.data);
  const projectiles = new SnowballProjectiles({ getLoadedBlock: block }, raw.snowballProjectiles);
  section("snowballProjectiles", !!projectiles.loadIssues, projectiles.toJSON()); projectiles.dispose();
  const actors = mobsValid && !mobs.invalid ? mobs.data.records.map(restoreMobSnapshot) : [];
  const context = { mobs: actors, player: (player as Obj).position as Vec3, getLoadedBlock: block };
  const leashes = new LeashStore(raw.leashes);
  if (has(raw, "leashes")) {
    for (const r of leashes.records) if (r.phase === "active" && r.anchor.kind === "fence" && block(r.anchor.x, r.anchor.y, r.anchor.z) === undefined) add("leashes", "Unverified fence anchor");
    if (leashes.loadIssues || leashes.validateCrossReferences(context)) add("leashes", "Invalid archived Leash owners or references");
    else { try { section("leashes", false, leashes.toJSON()); } catch { add("leashes", "Unresolved archived Leash owners"); } }
  }
  if(has(raw,"cameras"))section("cameras",!readCameras(raw.cameras),readCameras(raw.cameras));
  const balloons = new BalloonStore(raw.balloons);
  if (has(raw, "balloons")) {
    for (const r of balloons.records) if (r.phase === "active" && r.target.kind === "fence" && block(r.target.x, r.target.y, r.target.z) === undefined) add("balloons", "Unverified fence target");
    if (balloons.loadIssues || balloons.validateCrossReferences(context)) add("balloons", "Invalid archived Balloon owners or references");
    else { try { section("balloons", false, balloons.toJSON()); } catch { add("balloons", "Unresolved archived Balloon owners"); } }
  }
  return issues.length === start ? structuredClone(raw) as unknown as DimensionWorldState : null;
}

/** Validates every inactive owner before any caller can repair, activate or overwrite a world.
 * It never changes input data, generates terrain itself, or grants item ownership. */
export function readDimensionArchive(raw: unknown, activeRaw: unknown, probe?: DimensionGeneratedBlockProbe): DimensionReadResult {
  if (raw === undefined) return { kind: "absent" };
  const issues: DimensionSaveIssue[] = diagnoseRawBookOwnership(activeRaw,raw);
  if(issues.length)return{kind:'invalid',issues};
  try {
    const input = copyJSON(raw, "dimensions");
    if (!exact(input, ["version", "active", "inactive", "links"]) || input.version !== 1 || !realm(input.active) || !obj(input.inactive) || !Array.isArray(input.links)) return { kind: "invalid", issues: [{ path: "dimensions", reason: "Malformed dimension archive envelope" }] };
    const active = input.active, worlds: Partial<Record<DimensionId, DimensionWorldState>> = {}, inactive: Partial<Record<DimensionId, DimensionWorldState>> = {};
    const current = readWorld(activeProjection(activeRaw), active, "", issues, probe); if (current) worlds[active] = current;
    for (const [id, value] of Object.entries(input.inactive)) {
      if (!realm(id) || id === active) { issues.push({ path: `dimensions.inactive.${id}`, reason: "Unknown realm or duplicate active-world owner" }); continue; }
      const world = readWorld(value, id, `dimensions.inactive.${id}`, issues, probe); if (world) worlds[id] = inactive[id] = world;
    }
    if (input.links.length > PORTAL_MAX_RECORDS) issues.push({ path: "dimensions.links", reason: "Too many portal links" });
    const used = new Set<string>(), links: DimensionPortalLink[] = [];
    for (let i = 0; i < Math.min(input.links.length, PORTAL_MAX_RECORDS); i++) {
      const link = input.links[i], path = `dimensions.links[${i}]`;
      if (!exact(link, ["from", "to"])) { issues.push({ path, reason: "Malformed portal link" }); continue; }
      const endpoints: DimensionPortalEndpoint[] = [];
      for (const side of ["from", "to"] as const) {
        const e = link[side], ep = `${path}.${side}`;
        if (!exact(e, ["dimension", "portal"]) || !realm(e.dimension)) { issues.push({ path: ep, reason: "Malformed portal endpoint" }); continue; }
        const p = sanitizePortalState({ version: 1, records: [e.portal] });
        if (p.invalid || !worlds[e.dimension]?.portals?.records.some(r => same(r, e.portal))) { issues.push({ path: ep, reason: "Portal endpoint has no matching physical frame owner" }); continue; }
        endpoints.push({ dimension: e.dimension, portal: p.data.records[0] });
      }
      if (endpoints.length !== 2) continue;
      if (endpoints[0].dimension === endpoints[1].dimension) { issues.push({ path, reason: "Portal link must connect different realms" }); continue; }
      let duplicate = false;
      for (const e of endpoints) {
        const k = `${e.dimension}:${e.portal.axis}:${key(e.portal.x, e.portal.y, e.portal.z)}`;
        if (used.has(k)) duplicate = true; used.add(k);
      }
      if (duplicate) { issues.push({ path, reason: "Duplicate portal endpoint owner" }); continue; }
      links.push({ from: endpoints[0], to: endpoints[1] });
    }
    return issues.length ? { kind: "invalid", issues } : { kind: "valid", data: { version: 1, active, inactive, links } };
  } catch (error) {
    return { kind: "invalid", issues: [...issues, { path: error instanceof BadData ? error.path : "dimensions", reason: error instanceof Error ? error.message : "Unreadable dimension data" }] };
  }
}
