import { readCaneGrowthState, type CaneGrowthState } from "./cane-growth-state";
import { readCodeWorkspace, type CodeWorkspaceData } from "./code-workspace";
import {hasBusyFurnaceOwnership} from "../ownership/furnace-contents";
import { diagnoseRawRecyclingOwnership, type RecyclingOwnershipIssue } from "./recycling-ownership";
import {diagnoseRawCaneOwnership} from './cane-ownership';
import {readChestOwners,type SavedChest} from './chest-save';
import {copyChestData} from '../ownership/single-chest';
import {readBrewingStandOwners,type SavedBrewingStand} from "./brewing-save";
import {readBlazeOwners, diagnoseRawBlazeOwnership, type BlazeOwnershipIssue} from "./blaze-save";
import type {BlazeFireballsData} from "../simulation/blaze-fireballs";
import { sanitizePortalState, validatePortalEdits, isPortalBlock, type PortalData } from "../simulation/portals";
import { readDimensionArchive, type DimensionsData, type DimensionSaveIssue, type DimensionGeneratedBlockProbe } from "./dimension-save";
import { createDimensionGeneratedBlockProbe } from "../world/dimension-probe";
import { sanitizeFluidState, type FluidData } from "../simulation/fluids";
import { sanitizeGeneratorVersion, type GeneratorVersion } from "../world/generator";
import { isKnownBlockId } from "../catalog/blocks";
import { WORLD_HEIGHT } from "../world/chunk";
import { sanitizeFireState, type FireData } from "../simulation/fire";
import { inspectIgnitionOwner, isIgnitionToolId } from "../ownership/ignition-tool";
import { sanitizeGravelHarvestState, type GravelHarvestData } from "../ownership/gravel-harvest";
import { inspectBucketOwner, isBucketId } from "../ownership/buckets";
import { diagnoseRawCowState } from "./mob-save";
import { inspectBottleOwner, isBottleId } from "../ownership/bottles";
import { hasPlayerStatus, sanitizePlayerStatus, type PlayerStatus } from "../simulation/status-effects";
import { inspectSparklerState, isSparklerId } from "../ownership/sparkler-state";
import { sanitizeStack } from "./savecheck";
import { inspectGlowState } from "../ownership/glow-stick-state";
import { sanitizePlayerState, validatePlayerDeathOwnership, type PlayerStateData } from "../simulation/player-death";
import type { BalloonsData } from "../ownership/balloons";
import type { LeashData } from "../ownership/leashes";
import type { MobStateData } from "./mob-save";
import type { WorldDropsData } from "../ownership/world-drops";
import type { SnowballProjectilesData } from "../simulation/snowball-projectiles";
import { netherWartAge, sanitizeFarmingState, type FarmingState } from "../simulation/farming";
import type { BlockEdit } from "../world/world";
import type { InventoryData, ItemStack } from "../ownership/inventory";
import { sanitizeInventoryPending } from "./savecheck";
import type { GameMode } from "../world/rules";
import { clampPosition, WORLD_BORDER, type Vec3 } from "../core/math";
import type { HungerState } from "../simulation/hunger";
import type { FurnaceState } from "../crafting/smelting";
import type { Chalkboard } from "../education/chalkboard";
import type { AgentState } from "../automation/agent";
import type { CodeProgram } from "../automation/codebuilder";

export const SAVE_VERSION = 1;

export interface SaveData {
  /** Derived before sanitation; never trusted from JSON or serialized as a schema field. */
  recyclingOwnershipIssues?: RecyclingOwnershipIssue[];
  version: number;
  /** World-owned brewing ingredients, bottle slots and reserved fuel/work. */
  brewingStands?:SavedBrewingStand[];
  chests?:SavedChest[];
  chestOwnershipIssues?:GlowOwnershipIssue[];
  /** Derived raw diagnostics; never trusted from saved JSON. */
  brewingOwnershipIssues?:GlowOwnershipIssue[];
  name: string;
  seed: number;
  /** Active world stays flat; only inactive world owners live in this extension. */
  dimensions?: DimensionsData;
  /** Derived before any owner repair; callers must preserve the exact original. */
  dimensionsInvalid?: boolean;
  dimensionOwnershipIssues?: DimensionSaveIssue[];
  generatorVersion?: GeneratorVersion;
  /** Raw diagnostics; callers preserve exact original and freeze writes/actions. */
  generatorVersionInvalid?: boolean;
  fluids?: FluidData;
  fluidsInvalid?: boolean;
  portals?: PortalData;
  portalsInvalid?: boolean;
  portalOwnershipIssues?: GlowOwnershipIssue[];
  /** Hidden Wart crop states in raw item owners require exact-original recovery. */
  wartOwnershipIssues?: GlowOwnershipIssue[];
  caneOwnershipIssues?: GlowOwnershipIssue[];
  blazeFireballs?:BlazeFireballsData;
  blazeOwnershipIssues?:BlazeOwnershipIssue[];
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
  /** Whole-container diagnostics read before any raw bottle can be repaired/discarded. */
  bottleOwnershipIssues?: GlowOwnershipIssue[];
  /** Whole empty/milk/water/lava buckets are diagnosed before any raw-owner repair. */
  bucketOwnershipIssues?: GlowOwnershipIssue[];
  /** Derived raw new-Cow corruption diagnostic; never trusted or serialized. */
  cowStateInvalid?: boolean;
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
  /** Bounded application text drafts; never executable or native project files. */
  codeWorkspace?: CodeWorkspaceData;
  /** Derived from malformed present data, never trusted from JSON or serialized. */
  codeWorkspaceInvalid?: boolean;
  /** Education Edition chalkboards (optional for older saves). */
  chalkboards?: Chalkboard[];
  /** Furnaces with their contents and progress (optional for older saves). */
  furnaces?: Array<{ x: number; y: number; z: number; state: FurnaceState }>;
  /** Pending redstone ticks (optional; sanitized by `sanitizeScheduled` on load). */
  redstone?: unknown;
  farming?: FarmingState;
  /** World-local loaded-time Cane growth clock; no offline catch-up. */
  caneGrowth?: CaneGrowthState;
  /** Derived before normalization; never trusted from JSON or serialized. */
  caneGrowthInvalid?: boolean;
  fire?: FireData;
  /** Derived raw/source diagnostic, never trusted or serialized. */
  fireInvalid?: boolean;
  ignitionOwnershipIssues?: GlowOwnershipIssue[];
  gravelHarvests?: GravelHarvestData;
  /** Derived raw decision diagnostic, never trusted or serialized. */
  gravelHarvestInvalid?: boolean;
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

export function serializeSave(data: Omit<SaveData, "version">, generatedBlockProbe: DimensionGeneratedBlockProbe = createDimensionGeneratedBlockProbe()): string {
  const caneGrowth = readCaneGrowthState(data.caneGrowth);
  if (data.caneGrowthInvalid || caneGrowth.kind === "invalid") throw new Error("Cannot serialize invalid Cane growth state");
  const codeWorkspace = readCodeWorkspace(data.codeWorkspace);
  if (data.codeWorkspaceInvalid || codeWorkspace.kind === "invalid") throw new Error("Cannot serialize invalid source workspace");
  if(hasBusyFurnaceOwnership(data))throw new Error("Cannot serialize busy Furnace ownership");
  if(data.recyclingOwnershipIssues?.length||diagnoseRawRecyclingOwnership(data).length)throw new Error("Cannot serialize unsafe recycling equipment ownership");
  if(data.caneOwnershipIssues?.length||diagnoseRawCaneOwnership(data).length)throw new Error("Cannot serialize invalid Cane/Paper ownership");
  if(data.blazeOwnershipIssues?.length||diagnoseRawBlazeOwnership(data).length)throw new Error("Cannot serialize invalid Blaze ownership");
  // Validate the original complete archive before any flat-world normalization.
  const dimensions = readDimensionArchive(data.dimensions, data, generatedBlockProbe);
  const chests=readChestOwners(data,(x,y,z)=>generatedBlockProbe(dimensions.kind==="valid"?dimensions.data.active:"overworld",data.seed,data.generatorVersion??1,x,y,z));
  if(data.chestOwnershipIssues?.length||chests.issues.length)throw new Error("Cannot serialize invalid Chest ownership");
  const brewing=readBrewingStandOwners(data,(x,y,z)=>generatedBlockProbe(dimensions.kind==="valid"?dimensions.data.active:"overworld",data.seed,data.generatorVersion??1,x,y,z));
  if(data.brewingOwnershipIssues?.length||brewing.issues.length||diagnoseRawBrewingItemOwnership(data).length)throw new Error("Cannot serialize invalid brewing ownership");
  if (data.dimensionsInvalid || data.dimensionOwnershipIssues?.length || dimensions.kind === "invalid") throw new Error("Cannot serialize invalid dimension ownership");
  const { caneGrowthInvalid: _caneGrowthInvalid, codeWorkspaceInvalid: _codeWorkspaceInvalid, recyclingOwnershipIssues:_recyclingIssues, caneOwnershipIssues:_caneIssues, chestOwnershipIssues:_chestIssues, brewingOwnershipIssues:_brewingIssues, blazeOwnershipIssues:_blazeIssues, wartOwnershipIssues:_wartIssues, dimensionsInvalid: _dimensionsInvalid, dimensionOwnershipIssues: _dimensionIssues, portalsInvalid:_portalsInvalid, portalOwnershipIssues:_portalIssues, fluidsInvalid:_fluidsInvalid, generatorVersionInvalid:_generatorVersionInvalid, fireInvalid: _fireInvalid, ignitionOwnershipIssues: _ignitionIssues, glowOwnershipIssues: _derivedIssues, sparklerOwnershipIssues: _sparklerIssues, bottleOwnershipIssues: _bottleIssues, bucketOwnershipIssues: _bucketIssues, cowStateInvalid: _cowInvalid, gravelHarvestInvalid: _gravelInvalid, playerStatusInvalid: _statusInvalid, ...owned } = data;
  if (codeWorkspace.kind === "valid") owned.codeWorkspace = codeWorkspace.data;
  if (caneGrowth.kind === "valid") owned.caneGrowth = caneGrowth.data;
  if (dimensions.kind === "valid") owned.dimensions = dimensions.data;
  if(brewing.present)owned.brewingStands=brewing.stations;
  if(chests.present)owned.chests=chests.stations;
  const portals=sanitizePortalState(owned.portals);
  if(_wartIssues?.length||diagnoseRawWartOwnership(owned).length||diagnoseRawWartSupport(owned,owned.dimensions?.active??"overworld",generatedBlockProbe).length)throw new Error("Cannot serialize hidden Wart item ownership");
  if(_portalsInvalid||_portalIssues?.length||portals.invalid||!validatePortalEdits(owned.portals,owned.edits)||diagnoseRawPortalOwnership(owned).length)throw new Error("Cannot serialize invalid portal ownership");
  if(portals.present)owned.portals=portals.data;
  const generator=sanitizeGeneratorVersion(owned.generatorVersion),fluids=sanitizeFluidState(owned.fluids);
  if(_fluidsInvalid||_generatorVersionInvalid||generator.invalid||fluids.invalid||(generator.present||fluids.present)&&!validFluidEdits(owned.edits))throw new Error("Cannot serialize invalid fluids or terrain version");
  if(generator.present)owned.generatorVersion=generator.version;
  if(fluids.present)owned.fluids=fluids.data;
  if(diagnoseRawBucketOwnership(owned).length)throw new Error("Cannot serialize invalid bucket ownership");
  const toolIssues = diagnoseRawIgnitionOwnership(owned);
  if (toolIssues.some(issue => /ignition/.test(issue.reason))) throw new Error("Cannot serialize invalid ignition ownership");
  const fire = sanitizeFireState(owned.fire);
  if (_fireInvalid || fire.invalid || _ignitionIssues?.length) throw new Error("Cannot serialize invalid Fire or ignition ownership");
  if (fire.data.records.length) owned.fire = fire.data; else delete owned.fire;
  const status = sanitizePlayerStatus(owned.playerStatus);
  if (_statusInvalid || status.invalid) throw new Error("Cannot serialize invalid player status");
  if (hasPlayerStatus(status.data)) owned.playerStatus = status.data; else delete owned.playerStatus;
  return JSON.stringify({ version: SAVE_VERSION, ...owned });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** New fluid/versioned worlds reject malformed edit identities before downstream sanitation. */
function validFluidEdits(raw:unknown):boolean {
 if(!Array.isArray(raw))return false;
 const seen=new Set<string>();
 for(const e of raw){
  if(!Array.isArray(e)||e.length!==4||Reflect.ownKeys(e).length!==5||![e[0],e[1],e[2]].every(Number.isSafeInteger)||Math.abs(e[0])>WORLD_BORDER||Math.abs(e[2])>WORLD_BORDER||e[1]<0||e[1]>=WORLD_HEIGHT||!isKnownBlockId(e[3]))return false;
  const k=`${e[0]},${e[1]},${e[2]}`;if(seen.has(k))return false;seen.add(k);
 }
 return Reflect.ownKeys(raw).length===raw.length+1;
}

export interface GlowOwnershipIssue { path: string; reason: string }

/** Scan raw owners before sanitizeInventoryPending/fromJSON/Agent/furnace loaders can drop state.
 * This produces diagnostics only; Game must preserve the original raw text and block overwrite. */
function diagnoseRawActivationOwnership(raw: unknown, field: "glow" | "sparkler" | "bottle" | "bucket" | "ignition" | "portal" | "wart" | "brewing"): GlowOwnershipIssue[] {
  const issues: GlowOwnershipIssue[] = [];
  if (!isObj(raw)) return issues;
  const check = (value: unknown, path: string, supported = true) => {
    if (typeof value !== "object" || value === null) return;
    if(field==="brewing"){
      const identity=Object.getOwnPropertyDescriptor(value,"id");
      if(identity&&!('value'in identity)){issues.push({path,reason:"unreadable owned item identity before brewing recovery"});return;}
      const id=identity?.value;
      if(Number.isSafeInteger(id)&&id>=845&&id<=849){
        const count=Object.getOwnPropertyDescriptor(value,"count");
        const descriptors=Reflect.ownKeys(value).every(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return (key==="id"||key==="count")&&d.enumerable&&'value'in d;});
        if(!supported||!isObj(value)||Reflect.ownKeys(value).length!==2||!descriptors||!count||!('value'in count)||count.value!==1)issues.push({path,reason:"invalid or unsupported potion/medicine owner"});
      }return;
    }
    if(field==="wart"){
      const id=Object.getOwnPropertyDescriptor(value,"id")?.value;
      if(netherWartAge(id)!==null)issues.push({path,reason:"hidden Wart physical crop cannot be an owned item"});
      else if(id===842){const count=Object.getOwnPropertyDescriptor(value,"count")?.value;
        if(!supported||!isObj(value)||Reflect.ownKeys(value).some(k=>k!=="id"&&k!=="count")||!Number.isSafeInteger(count)||count<1||count>64)issues.push({path,reason:"invalid or unsupported canonical Wart item owner"});
      }return;
    }
    if(field==="portal"){if(isPortalBlock(Object.getOwnPropertyDescriptor(value,"id")?.value))issues.push({path,reason:"hidden portal physical cell cannot be an owned item"});return;}
    // New Sparkler identities require recovery even when their legacy metadata is absent.
    const legacySparkler = field === "sparkler" && isObj(value) && typeof own(value, "id") === "number" && isSparklerId(own(value, "id") as number);
    const bottle = field === "bottle" && isObj(value) && typeof own(value,"id") === "number" && isBottleId(own(value,"id") as number);
    const bucket = field === "bucket" && isObj(value) && typeof own(value,"id")==="number" && isBucketId(own(value,"id") as number);
    const ignition = field === "ignition" && isObj(value) && isIgnitionToolId(own(value, "id"));
    if (field === "ignition" ? !ignition : field === "bottle" ? !bottle : field === "bucket" ? !bucket : !(field in value) && !legacySparkler) return;
    const state = field === "ignition" ? inspectIgnitionOwner(value) : field === "bucket" ? inspectBucketOwner(value) : field === "bottle" ? inspectBottleOwner(value) : field === "glow" ? inspectGlowState(value) : inspectSparklerState(value);
    if (state.kind === "invalid") issues.push({ path, reason: state.reason });
    else if (!supported) issues.push({ path, reason: `${field} owner would be discarded or is unsupported` });
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
    if ((field === "bottle" || field === "bucket" || field === "ignition" || field === "portal" || field === "wart" || field === "brewing") && Object.prototype.hasOwnProperty.call(inventory,"offhand")) check(own(inventory,"offhand"),"inventory.offhand",false);
    const equipment = object(own(inventory, "equipment"), "inventory.equipment");
    if (equipment) for (const key of Object.keys(equipment))
      check(own(equipment, key), `inventory.equipment.${key}`, false); // Glow is never armor.
  }
  list(own(raw, "inventoryPending"), "inventoryPending", 10);
  const agent = object(own(raw, "agent"), "agent");
  if (agent) {
    if (field === "sparkler" && Object.prototype.hasOwnProperty.call(agent, "offhand"))
      issues.push({ path: "agent.offhand", reason: "Agent offhand is an unsupported owner" });
    if (field === "bottle" || field === "bucket" || field === "ignition" || field === "portal" || field === "wart" || field === "brewing") check(own(agent,"offhand"),"agent.offhand",false);
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
  const chestField=Object.getOwnPropertyDescriptor(raw,"chests");
  if(chestField){try{if(!('value'in chestField))throw Error();const rows=copyChestData(chestField.value);if(!Array.isArray(rows))throw Error();rows.forEach((row,index)=>{const state=object(own(row,"state"),`chests[${index}].state`,false);if(state)list(own(state,"slots"),`chests[${index}].state.slots`,27,true,true,false);});}catch{issues.push({path:"chests",reason:"Unreadable Chest item owners"});}}
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

export function diagnoseRawBrewingItemOwnership(raw:unknown):GlowOwnershipIssue[]{return diagnoseRawActivationOwnership(raw,"brewing");}
export function diagnoseRawWartOwnership(raw:unknown):GlowOwnershipIssue[]{return diagnoseRawActivationOwnership(raw,"wart");}
/** Resolve edited crop support against this realm only, before any edit repair. */
export function diagnoseRawWartSupport(raw:unknown,dimension:"overworld"|"nether",probe:DimensionGeneratedBlockProbe):GlowOwnershipIssue[]{
 if(!isObj(raw)||!Array.isArray(raw.edits))return [];
 if(raw.edits.some(e=>Array.isArray(e)&&netherWartAge(e[3])!==null)&&!validFluidEdits(raw.edits))return [{path:"edits",reason:"Malformed Wart physical edits; refusing silent repair"}];
 const edits=new Map<string,number>(),key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
 for(const e of raw.edits)if(Array.isArray(e)&&e.length===4&&e.slice(0,3).every(Number.isSafeInteger)&&isKnownBlockId(e[3]))edits.set(key(e[0],e[1],e[2]),e[3]);
 const generator=sanitizeGeneratorVersion(raw.generatorVersion),version=generator.present?generator.version:1;
 const block=(x:number,y:number,z:number):number|undefined=>{
  const id=edits.get(key(x,y,z));if(id!==undefined)return id;
  try{return probe(dimension,raw.seed as number,version,x,y,z);}catch{return undefined;}
 };
 const issues:GlowOwnershipIssue[]=[],seen=new Set<string>();
 for(let i=0;i<raw.edits.length;i++){
  const e=raw.edits[i];if(!Array.isArray(e)||e.length!==4||!e.slice(0,3).every(Number.isSafeInteger))continue;
  const candidates=netherWartAge(e[3])!==null?[e[1]]:dimension==="nether"?[e[1]+1]:[];
  for(const y of candidates){const k=key(e[0],y,e[2]);if(seen.has(k)||netherWartAge(block(e[0],y,e[2])??-1)===null)continue;seen.add(k);
   if(block(e[0],y-1,e[2])!==195)issues.push({path:`edits[${i}]`,reason:"Wart crop requires known Soul Sand support in its own realm"});
  }
 }
 return issues;
}


export function diagnoseRawPortalOwnership(raw:unknown):GlowOwnershipIssue[]{return diagnoseRawActivationOwnership(raw,"portal");}

export function diagnoseRawIgnitionOwnership(raw: unknown): GlowOwnershipIssue[] { return diagnoseRawActivationOwnership(raw, "ignition"); }

export function diagnoseRawBucketOwnership(raw:unknown):GlowOwnershipIssue[]{return diagnoseRawActivationOwnership(raw,"bucket");}

export function diagnoseRawBottleOwnership(raw: unknown): GlowOwnershipIssue[] { return diagnoseRawActivationOwnership(raw, "bottle"); }

export function diagnoseRawGlowOwnership(raw: unknown): GlowOwnershipIssue[] { return diagnoseRawActivationOwnership(raw, "glow"); }
export function diagnoseRawSparklerOwnership(raw: unknown): GlowOwnershipIssue[] { return diagnoseRawActivationOwnership(raw, "sparkler"); }

/**
 * Parses a save and rebuilds it field by field with strict, own-property checks. A save is
 * rejected (with a clear message) only if it isn't JSON, has an unsupported version or has no
 * usable seed. Every other top-level field is repaired to a safe default instead (e.g. an invalid
 * game mode becomes creative), so a damaged save stays reachable. Optional sections are passed on
 * as-is and sanitized by their own loaders (savecheck.ts, loadPrograms).
 */
export function parseSave(text: string, generatedBlockProbe: DimensionGeneratedBlockProbe = createDimensionGeneratedBlockProbe()): SaveData {
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

  // Inactive owners must be diagnosed before legacy loaders can repair or omit
  // any part of the active or inactive world. Never return a partial archive.
  const dimensions = readDimensionArchive(own(raw, "dimensions"), raw, generatedBlockProbe);

  // Must precede sanitizeInventoryPending and all downstream owner loaders.
  const glowOwnershipIssues = diagnoseRawGlowOwnership(raw);
  const sparklerOwnershipIssues = diagnoseRawSparklerOwnership(raw);
  const bottleOwnershipIssues = diagnoseRawBottleOwnership(raw);
  const bucketOwnershipIssues = diagnoseRawBucketOwnership(raw);
  const ignitionOwnershipIssues = diagnoseRawIgnitionOwnership(raw);
  const blazeOwners=readBlazeOwners(raw);
  const recyclingOwnershipIssues=diagnoseRawRecyclingOwnership(raw);
  const caneOwnershipIssues=diagnoseRawCaneOwnership(raw);
  const wartOwnershipIssues=[...diagnoseRawWartOwnership(raw),...diagnoseRawWartSupport(raw,dimensions.kind==="valid"?dimensions.data.active:"overworld",generatedBlockProbe)];
  const portalOwnershipIssues=diagnoseRawPortalOwnership(raw),portals=sanitizePortalState(own(raw,"portals"));
  const portalsInvalid=portals.invalid||!validatePortalEdits(own(raw,"portals"),own(raw,"edits"));
  const generator=sanitizeGeneratorVersion(own(raw,"generatorVersion")),fluids=sanitizeFluidState(own(raw,"fluids"));
  const chests=readChestOwners(raw,(x,y,z)=>generatedBlockProbe(dimensions.kind==="valid"?dimensions.data.active:"overworld",seed|0,generator.version,x,y,z));
  const brewing=readBrewingStandOwners(raw,(x,y,z)=>generatedBlockProbe(dimensions.kind==="valid"?dimensions.data.active:"overworld",seed|0,generator.version,x,y,z));
  const brewingOwnershipIssues=[...brewing.issues,...diagnoseRawBrewingItemOwnership(raw)];
  const fluidEditsInvalid=(generator.present||fluids.present)&&!validFluidEdits(own(raw,"edits"));
  const fire = sanitizeFireState(own(raw, "fire"));
  const cowStateInvalid = diagnoseRawCowState(own(raw,"mobs"));
  const gravelHarvest = sanitizeGravelHarvestState(own(raw,"gravelHarvests"));
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
  const caneGrowth = readCaneGrowthState(own(raw, "caneGrowth"));
  if (caneGrowth.kind === "valid") save.caneGrowth = caneGrowth.data;
  if (caneGrowth.kind === "invalid") save.caneGrowthInvalid = true;
  const codeWorkspace = readCodeWorkspace(own(raw, "codeWorkspace"));
  if (codeWorkspace.kind === "valid") save.codeWorkspace = codeWorkspace.data;
  if (codeWorkspace.kind === "invalid") save.codeWorkspaceInvalid = true;
  if (dimensions.kind === "valid") save.dimensions = dimensions.data;
  if (dimensions.kind === "invalid") { save.dimensionsInvalid = true; save.dimensionOwnershipIssues = dimensions.issues; }
  if(brewing.present)save.brewingStands=brewing.stations;
  if(chests.present)save.chests=chests.stations;
  if(chests.issues.length)save.chestOwnershipIssues=chests.issues;
  if(brewingOwnershipIssues.length)save.brewingOwnershipIssues=brewingOwnershipIssues;
  if(portals.present)save.portals=portals.data;
  if(portalsInvalid)save.portalsInvalid=true;
  if(Object.hasOwn(raw,"blazeFireballs"))save.blazeFireballs=blazeOwners.fireballs;
  if(blazeOwners.issues.length)save.blazeOwnershipIssues=blazeOwners.issues;
  if(wartOwnershipIssues.length)save.wartOwnershipIssues=wartOwnershipIssues;
  if(recyclingOwnershipIssues.length)save.recyclingOwnershipIssues=recyclingOwnershipIssues;
  if(caneOwnershipIssues.length)save.caneOwnershipIssues=caneOwnershipIssues;
  if(portalOwnershipIssues.length)save.portalOwnershipIssues=portalOwnershipIssues;
  if(generator.present)save.generatorVersion=generator.version;
  if(generator.invalid)save.generatorVersionInvalid=true;
  if(fluids.present)save.fluids=fluids.data;
  if(fluids.invalid||fluidEditsInvalid)save.fluidsInvalid=true;
  if (glowOwnershipIssues.length) save.glowOwnershipIssues = glowOwnershipIssues;
  if (sparklerOwnershipIssues.length) save.sparklerOwnershipIssues = sparklerOwnershipIssues;
  if (bottleOwnershipIssues.length) save.bottleOwnershipIssues = bottleOwnershipIssues;
  if (bucketOwnershipIssues.length) save.bucketOwnershipIssues = bucketOwnershipIssues;
  if (ignitionOwnershipIssues.length) save.ignitionOwnershipIssues = ignitionOwnershipIssues;
  if (fire.present) save.fire = fire.data;
  if (fire.invalid) save.fireInvalid = true;
  if (cowStateInvalid) save.cowStateInvalid = true;
  if (gravelHarvest.present) save.gravelHarvests = gravelHarvest.data;
  if (gravelHarvest.invalid) save.gravelHarvestInvalid = true;
  const status = sanitizePlayerStatus(own(raw, "playerStatus"));
  if (status.invalid) save.playerStatusInvalid = true;
  else if (hasPlayerStatus(status.data)) save.playerStatus = status.data;
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
