import { METAL_STORAGE_BLOCKS } from "./metal-storage";
import {CANE_PLANT_ID} from './cane-profile';
import { STATION_FACE_TEXTURES } from "./station-textures";
import { DYE_COLORS } from "./dyes";
/**
 * Compact block registry. Stable low and extended IDs are stored in Uint16 chunk arrays;
 * textures are referenced by tile name and resolved by the renderer.
 */

import { ELEMENTS } from "../crafting/chemistry-data";
import { EXTENDED_BLOCK_ID_BASE, isBlockNamespace } from "../core/ids";

export type RenderShape = "cube" | "cross" | "liquid" | "torch" | "box" | "fence" | "brewing_stand" | "cane" | "none";

export interface BlockFaces {
  top: string;
  bottom: string;
  side: string;
}

export interface BlockDef {
  id: number;
  name: string;
  displayName: string;
  /** Collides with entities. */
  solid: boolean;
  /** Fully hides neighbouring faces when false. */
  transparent: boolean;
  /** Uses alpha blending in the separate translucent-solid mesh pass. */
  translucent?: boolean;
  shape: RenderShape;
  faces: BlockFaces;
  /**
   * Seconds to break in survival by hand (or with any tool for blocks that need one, before the
   * tool's speed applies); Infinity = unbreakable. Equals Minecraft hardness x 1.5.
   */
  hardness: number;
  /** Tool that mines this block faster (Minecraft's "preferred tool"). */
  tool?: "pickaxe" | "axe" | "shovel";
  /**
   * Minimum pickaxe tier needed to get a drop (1 wooden, 2 stone, 3 iron). Without it the block
   * breaks 3.33x slower and drops nothing, as in Minecraft.
   */
  harvestTier?: number;
  /** Block id dropped when broken in survival (defaults to itself). */
  drop?: number;
  /** Appears in the creative inventory. */
  creative: boolean;
  /** Emits light (rendered at full brightness). */
  emissive?: boolean;
  /** Block light emitted, 0-15 (Minecraft: torch 14, glowstone 15). */
  light?: number;
  /** Needs a solid block underneath (plants, dust, buttons, plates, repeaters). */
  needsSupport?: boolean;
  /** Placing a block here replaces it (plants only; dust and plates are not replaceable, as in Minecraft). */
  replaceable?: boolean;
  /** Torch-shaped light that can be placed in water (the underwater torch, glow sticks). */
  waterproof?: boolean;
  /** Bounds of a "box" shape within the cell: [x0, y0, z0, x1, y1, z1], each 0-1. */
  collisionBox?: readonly [number, number, number, number, number, number];
  /** Application contact policy; physics must explicitly consume this value. */
  surfaceSpeed?: number;
  /** Application Fire support policy; simulation must explicitly consume this value. */
  permanentFireSupport?: boolean;
  box?: readonly [number, number, number, number, number, number];
}

function faces(top: string, side = top, bottom = top): BlockFaces {
  return { top, side, bottom };
}

/** Horizontal facings, as for chalkboards and the Agent: 0 +z, 1 -x, 2 -z, 3 +x. */
export const FACING_VECTORS: readonly (readonly [number, number])[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

type BlockSpec = Omit<BlockDef, "id" | "solid" | "transparent" | "shape" | "creative" | "hardness" | "drop"> &
  Partial<Pick<BlockDef, "solid" | "transparent" | "shape" | "creative" | "hardness">> & { id?: number; drop?: string };

const specs: BlockSpec[] = [
  { name: "air", displayName: "Air", faces: faces("none"), solid: false, transparent: true, shape: "none", creative: false, hardness: 0 },
  { name: "grass", displayName: "Grass Block", faces: faces("grass_top", "grass_side", "dirt"), hardness: 0.9, drop: "dirt", tool: "shovel" },
  { name: "dirt", displayName: "Dirt", faces: faces("dirt"), hardness: 0.75, tool: "shovel" },
  { name: "stone", displayName: "Stone", faces: faces("stone"), hardness: 2.25, drop: "cobblestone", tool: "pickaxe", harvestTier: 1 },
  { name: "cobblestone", displayName: "Cobblestone", faces: faces("cobblestone"), hardness: 3, tool: "pickaxe", harvestTier: 1 },
  { name: "oak_planks", displayName: "Oak Planks", faces: faces("oak_planks"), hardness: 3, tool: "axe" },
  { name: "oak_log", displayName: "Oak Log", faces: faces("oak_log_top", "oak_log"), hardness: 3, tool: "axe" },
  { name: "oak_leaves", displayName: "Oak Leaves", faces: faces("oak_leaves"), transparent: true, hardness: 0.3 },
  { name: "sand", displayName: "Sand", faces: faces("sand"), hardness: 0.75, tool: "shovel" },
  { name: "gravel", displayName: "Gravel", faces: faces("gravel"), hardness: 0.9, tool: "shovel" },
  { name: "water", displayName: "Water", faces: faces("water"), solid: false, transparent: true, shape: "liquid", hardness: Infinity, creative: false },
  { name: "glass", displayName: "Glass", faces: faces("glass"), transparent: true, hardness: 0.45 },
  { name: "bricks", displayName: "Bricks", faces: faces("bricks"), hardness: 3, tool: "pickaxe", harvestTier: 1 },
  { name: "bedrock", displayName: "Bedrock", faces: faces("bedrock"), hardness: Infinity },
  { name: "coal_ore", displayName: "Coal Ore", faces: faces("coal_ore"), hardness: 4.5, tool: "pickaxe", harvestTier: 1 },
  { name: "iron_ore", displayName: "Iron Ore", faces: faces("iron_ore"), hardness: 4.5, tool: "pickaxe", harvestTier: 2 },
  { name: "gold_ore", displayName: "Gold Ore", faces: faces("gold_ore"), hardness: 4.5, tool: "pickaxe", harvestTier: 3 },
  { name: "diamond_ore", displayName: "Diamond Ore", faces: faces("diamond_ore"), hardness: 4.5, tool: "pickaxe", harvestTier: 3 },
  { name: "birch_log", displayName: "Birch Log", faces: faces("birch_log_top", "birch_log"), hardness: 3, tool: "axe" },
  { name: "birch_leaves", displayName: "Birch Leaves", faces: faces("birch_leaves"), transparent: true, hardness: 0.3 },
  { name: "snowy_grass", displayName: "Snowy Grass Block", faces: faces("snow", "grass_snow_side", "dirt"), hardness: 0.9, drop: "dirt", tool: "shovel" },
  { name: "snow", displayName: "Snow Block", faces: faces("snow"), hardness: 0.3, tool: "shovel" },
  { name: "white_wool", displayName: "White Wool", faces: faces("white_wool"), hardness: 1.2 },
  { name: "red_wool", displayName: "Red Wool", faces: faces("red_wool"), hardness: 1.2 },
  { name: "orange_wool", displayName: "Orange Wool", faces: faces("orange_wool"), hardness: 1.2 },
  { name: "yellow_wool", displayName: "Yellow Wool", faces: faces("yellow_wool"), hardness: 1.2 },
  { name: "lime_wool", displayName: "Lime Wool", faces: faces("lime_wool"), hardness: 1.2 },
  { name: "blue_wool", displayName: "Blue Wool", faces: faces("blue_wool"), hardness: 1.2 },
  { name: "purple_wool", displayName: "Purple Wool", faces: faces("purple_wool"), hardness: 1.2 },
  { name: "black_wool", displayName: "Black Wool", faces: faces("black_wool"), hardness: 1.2 },
  { name: "glowstone", displayName: "Glowstone", faces: faces("glowstone"), hardness: 0.45, emissive: true, light: 15 },
  { name: "bookshelf", displayName: "Bookshelf", faces: faces("oak_planks", "bookshelf"), hardness: 2.25, tool: "axe" },
  { name: "crafting_table", displayName: "Crafting Table", faces: faces("crafting_table_top", "crafting_table_side", "oak_planks"), hardness: 3.75, tool: "axe" },
  { name: "dandelion", displayName: "Dandelion", faces: faces("dandelion"), solid: false, transparent: true, shape: "cross", hardness: 0, needsSupport: true, replaceable: true },
  { name: "poppy", displayName: "Poppy", faces: faces("poppy"), solid: false, transparent: true, shape: "cross", hardness: 0, needsSupport: true, replaceable: true },
  { name: "tall_grass", displayName: "Tall Grass", faces: faces("tall_grass"), solid: false, transparent: true, shape: "cross", hardness: 0, needsSupport: true, replaceable: true },
  // Minecraft: Education Edition world-builder blocks.
  { name: "allow", displayName: "Allow", faces: faces("allow"), hardness: Infinity },
  { name: "deny", displayName: "Deny", faces: faces("deny"), hardness: Infinity },
  { name: "border", displayName: "Border", faces: faces("border"), hardness: Infinity },
  // Append only: block ids are positional and stored in chunks and saves.
  { name: "furnace", displayName: "Furnace", faces: faces("furnace_top", "furnace_front", "furnace_top"), hardness: 5.25, tool: "pickaxe", harvestTier: 1 },
  { name: "torch", displayName: "Torch", faces: faces("torch"), solid: false, transparent: true, shape: "torch", hardness: 0, emissive: true, light: 14 },
  { name: "chalkboard_slate", displayName: "Slate", faces: faces("chalkboard"), solid: false, transparent: true, shape: "none", hardness: 1.5 },
  { name: "chalkboard_poster", displayName: "Poster", faces: faces("chalkboard"), solid: false, transparent: true, shape: "none", hardness: 1.5 },
  { name: "chalkboard_board", displayName: "Board", faces: faces("chalkboard"), solid: false, transparent: true, shape: "none", hardness: 1.5 },
  // Education Edition chemistry stations (use them to open their screens).
  { name: "element_constructor", displayName: "Element Constructor", faces: faces(STATION_FACE_TEXTURES.element_constructor.top, "element_constructor_side", STATION_FACE_TEXTURES.element_constructor.bottom), hardness: 5, tool: "pickaxe" },
  { name: "compound_creator", displayName: "Compound Creator", faces: faces(STATION_FACE_TEXTURES.compound_creator.top, "compound_creator_side", STATION_FACE_TEXTURES.compound_creator.bottom), hardness: 5, tool: "pickaxe" },
  { name: "material_reducer", displayName: "Material Reducer", faces: faces(STATION_FACE_TEXTURES.material_reducer.top, "material_reducer_side", STATION_FACE_TEXTURES.material_reducer.bottom), hardness: 5, tool: "pickaxe" },
  { name: "lab_table", displayName: "Lab Table", faces: faces(STATION_FACE_TEXTURES.lab_table.top, "lab_table_side", STATION_FACE_TEXTURES.lab_table.bottom), hardness: 5, tool: "pickaxe" },
  // Lab Table products once placed (the items place these; breaking one gives the item back), and ice.
  { name: "ice", displayName: "Ice", faces: faces("ice"), hardness: 0.75, tool: "pickaxe" },
  { name: "placed_heat_block", displayName: "Heat Block", faces: faces("heat_block"), hardness: 1.5, creative: false },
  { name: "placed_underwater_torch", displayName: "Underwater Torch", faces: faces("underwater_torch_block"), solid: false, transparent: true, shape: "torch", hardness: 0, emissive: true, light: 14, waterproof: true, creative: false },
  { name: "placed_glow_stick", displayName: "Glow Stick", faces: faces("glow_stick_block"), solid: false, transparent: true, shape: "torch", hardness: 0, emissive: true, light: 10, waterproof: true, creative: false },
  ...redstoneBlocks(),
];

/** A thin panel against side `facing` of the cell (doors). */
function panel(facing: number): BlockDef["box"] {
  const [dx, dz] = FACING_VECTORS[facing];
  const t = 3 / 16;
  return [dx === 1 ? 1 - t : 0, 0, dz === 1 ? 1 - t : 0, dx === -1 ? t : 1, 1, dz === -1 ? t : 1];
}

/**
 * Increment 6b: redstone. Each component state is its own block id (so states are saved with the
 * world's block edits): dust power 0-15, on/off switches, torches and lamps, repeater facing x delay
 * x powered, and door material x half x facing x open. Append only.
 */
function redstoneBlocks(): BlockSpec[] {
  const out: BlockSpec[] = [
    { name: "redstone_ore", displayName: "Redstone Ore", faces: faces("redstone_ore"), hardness: 4.5, tool: "pickaxe", harvestTier: 3 },
  ];
  for (let p = 0; p <= 15; p++) {
    out.push({
      name: `redstone_wire_${p}`, displayName: "Redstone Dust", faces: faces(`redstone_dust_${p}`), solid: false, transparent: true, shape: "box",
      box: [0, 0, 0, 1, 1 / 32, 1], hardness: 0, needsSupport: true, creative: false,
    });
  }
  const off = { solid: false, transparent: true, hardness: 0 } as const;
  out.push(
    { name: "lever", displayName: "Lever", faces: faces("lever_off"), shape: "torch", ...off },
    { name: "lever_on", displayName: "Lever", faces: faces("lever_on"), shape: "torch", ...off, creative: false, drop: "lever" },
    { name: "stone_button", displayName: "Stone Button", faces: faces("stone_button"), shape: "box", box: [5 / 16, 0, 6 / 16, 11 / 16, 2 / 16, 10 / 16], needsSupport: true, ...off, hardness: 0.75 },
    { name: "stone_button_on", displayName: "Stone Button", faces: faces("stone_button"), shape: "box", box: [5 / 16, 0, 6 / 16, 11 / 16, 1 / 16, 10 / 16], needsSupport: true, ...off, hardness: 0.75, creative: false, drop: "stone_button" },
    { name: "stone_pressure_plate", displayName: "Stone Pressure Plate", faces: faces("pressure_plate"), shape: "box", box: [1 / 16, 0, 1 / 16, 15 / 16, 1 / 16, 15 / 16], needsSupport: true, ...off, hardness: 0.75, tool: "pickaxe" },
    { name: "stone_pressure_plate_on", displayName: "Stone Pressure Plate", faces: faces("pressure_plate"), shape: "box", box: [1 / 16, 0, 1 / 16, 15 / 16, 1 / 32, 15 / 16], needsSupport: true, ...off, hardness: 0.75, tool: "pickaxe", creative: false, drop: "stone_pressure_plate" },
    { name: "redstone_torch", displayName: "Redstone Torch", faces: faces("redstone_torch_on"), shape: "torch", ...off, emissive: true, light: 7 },
    { name: "redstone_torch_off", displayName: "Redstone Torch", faces: faces("redstone_torch_off"), shape: "torch", ...off, creative: false, drop: "redstone_torch" },
    { name: "redstone_lamp", displayName: "Redstone Lamp", faces: faces("redstone_lamp_off"), hardness: 0.45 },
    { name: "redstone_lamp_on", displayName: "Redstone Lamp", faces: faces("redstone_lamp_on"), hardness: 0.45, emissive: true, light: 15, creative: false, drop: "redstone_lamp" },
    { name: "repeater", displayName: "Redstone Repeater", faces: faces("repeater_0_1_0", "repeater_side"), shape: "box", box: [0, 0, 0, 1, 2 / 16, 1], needsSupport: true, ...off },
  );
  for (let f = 0; f < 4; f++) for (let d = 1; d <= 4; d++) for (const on of [0, 1]) {
    out.push({
      name: `repeater_${f}_${d}_${on}`, displayName: "Redstone Repeater", faces: faces(`repeater_${f}_${d}_${on}`, "repeater_side"), shape: "box",
      box: [0, 0, 0, 1, 2 / 16, 1], needsSupport: true, ...off, creative: false, drop: "repeater",
    });
  }
  for (const m of ["wooden", "iron"] as const) for (const half of ["lower", "upper"] as const) for (let f = 0; f < 4; f++) for (const open of [0, 1]) {
    out.push({
      name: `door_${m}_${half}_${f}_${open}`, displayName: m === "wooden" ? "Wooden Door" : "Iron Door", faces: faces(`door_${m}_${half}`), shape: "box",
      // Open doors swing to the next side; closed doors block movement (as a full cell).
      box: panel(open ? (f + 1) % 4 : f), solid: !open, transparent: true, creative: false,
      hardness: m === "wooden" ? 4.5 : 7.5, tool: m === "wooden" ? "axe" : "pickaxe", harvestTier: m === "iron" ? 1 : undefined,
    });
  }
  return out;
}

// Append-only farming states stay below the byte-storage and item-ID boundary.
for (let moisture = 0; moisture < 8; moisture++) specs.push({
  name: `farmland_${moisture}`, displayName: "Farmland", faces: faces(moisture > 0 ? "farmland_wet" : "farmland_dry", "dirt", "dirt"),
  shape: "box", transparent: true, box: [0, 0, 0, 1, 15 / 16, 1], collisionBox: [0, 0, 0, 1, 15 / 16, 1],
  hardness: .9, tool: "shovel", creative: false, drop: "dirt",
});
for (let age = 0; age < 8; age++) specs.push({
  name: `wheat_${age}`, displayName: `Wheat (age ${age})`, faces: faces(`wheat_stage_${age}`),
  solid: false, transparent: true, shape: "cross", hardness: 0, creative: false, needsSupport: true,
});

// Append-only Education chemistry torches inherit the ordinary torch's scalar lighting model.
for (const color of ["blue", "red", "purple", "green"]) specs.push({
  name: `${color}_torch`, displayName: `${color[0].toUpperCase()}${color.slice(1)} Torch`, faces: faces(`${color}_torch`),
  solid: false, transparent: true, shape: "torch", hardness: 0, emissive: true, light: 14,
});

// Generic world representations preserve existing atom inventory IDs and reference metadata.
for (let z = 0; z <= 118; z++) {
  const element = ELEMENTS.find((e) => e.z === z);
  const tile = `element_block_${z}_${element?.symbol ?? "unknown"}`;
  specs.push({ id: EXTENDED_BLOCK_ID_BASE + z, name: `element_${z}`, displayName: element?.name ?? "Unknown Element",
    faces: faces(tile), creative: z === 0 });
}

// Explicit low IDs: compact-array indices now include the high element definitions.
for (const [i, name] of (["magenta", "light_blue", "pink", "gray", "light_gray", "cyan", "brown", "green"] as const).entries()) {
  const color = DYE_COLORS.find((c) => c.name === name)!;
  specs.push({ id: 164 + i, name: `${name}_wool`, displayName: `${color.displayName} Wool`, faces: faces(`${name}_wool`), hardness: 1.2 });
}

// Append explicit low IDs after wool; compact registry indices include high element IDs.
for (const [i, color] of DYE_COLORS.entries()) specs.push({
  id: 172 + i, name: `${color.name}_stained_glass`, displayName: `${color.displayName} Stained Glass`,
  faces: faces(`${color.name}_stained_glass`), transparent: true, translucent: true,
  // Reuse the existing ordinary-glass proxy; exact current Education mining times are unverified.
  hardness: .45,
});

// Append explicit unused low ID; old compact registry indices/extended IDs remain unchanged.
// Original application geometry/mining model; native fence shape calibration is unverified.
specs.push({ id: 188, name: "oak_fence", displayName: "Oak Fence", faces: faces("oak_planks"),
  shape: "fence", transparent: true, solid: true, hardness: 3, tool: "axe" });

// Bounded upright application Fire; hidden, noncolliding and never an obtainable item.
specs.push({ id: 189, name: "fire", displayName: "Fire", faces: faces("fire"),
  shape: "cross", solid: false, transparent: true, creative: false, hardness: 0, emissive: true, light: 15 });

// Static source-only fluid model; numerical values are application choices.
specs.push({ id: 190, name: "lava", displayName: "Lava", faces: faces("lava"),
  shape: "liquid", solid: false, transparent: true, creative: false, hardness: Infinity, emissive: true, light: 15 });
specs.push({ id: 191, name: "obsidian", displayName: "Obsidian", faces: faces("obsidian"),
  hardness: 35, tool: "pickaxe", harvestTier: 4 });

// Hidden physical lifecycle cells; emission is a bounded application choice.
for (const [id,name] of [[192,"nether_portal_x"],[193,"nether_portal_z"]] as const) specs.push({id,name,displayName:"Nether Portal",faces:faces("nether_portal"),shape:"none",solid:false,transparent:true,creative:false,hardness:Infinity,emissive:true,light:11});

// Stage A Nether materials. Break values are application seconds, not calibrated native hardness.
specs.push({id:194,name:"netherrack",displayName:"Netherrack",faces:faces("netherrack"),hardness:.6,tool:"pickaxe",harvestTier:1,permanentFireSupport:true});
specs.push({id:195,name:"soul_sand",displayName:"Soul Sand",faces:faces("soul_sand"),shape:"box",box:[0,0,0,1,.875,1],collisionBox:[0,0,0,1,.875,1],hardness:.75,tool:"shovel",surfaceSpeed:.4});
specs.push({id:196,name:"nether_bricks",displayName:"Nether Bricks",faces:faces("nether_bricks"),hardness:3,tool:"pickaxe",harvestTier:1});
for(let age=0;age<4;age++)specs.push({id:197+age,name:`nether_wart_${age}`,displayName:"Nether Wart",faces:faces(`nether_wart_stage_${age===0?0:age===3?2:1}`),shape:"cross",solid:false,transparent:true,creative:false,hardness:0,needsSupport:true});

// Original bounded stand profile; physical parts are shared by meshing, collision and targeting.
specs.push({id:201,name:"brewing_stand",displayName:"Brewing Stand",faces:faces("brewing_stand_base","brewing_stand_rod","brewing_stand_base"),shape:"brewing_stand",solid:true,transparent:true,hardness:.75,tool:"pickaxe",harvestTier:1,needsSupport:true});

// Append-only Birch identity; existing saved Oak Planks remain Oak.
specs.push({id:202,name:"birch_planks",displayName:"Birch Planks",faces:faces("birch_planks"),hardness:3,tool:"axe"});

specs.push({id:203,name:'chest',displayName:'Chest',faces:faces('chest_top','chest_side','chest_bottom'),shape:'box',box:[1/16,0,1/16,15/16,14/16,15/16],collisionBox:[1/16,0,1/16,15/16,14/16,15/16],transparent:true,hardness:3.75,tool:'axe'});

specs.push({id:CANE_PLANT_ID,name:'sugar_cane_plant',displayName:'Sugar Cane',faces:faces('sugar_cane_plant'),shape:'cane',solid:false,transparent:true,hardness:0,creative:false,needsSupport:true});

// Ordinary storage identities append after all archived blocks; never alias element_26/79/6.
for (const { id, name, displayName, hardness, harvestTier } of METAL_STORAGE_BLOCKS) {
  specs.push({ id, name, displayName, faces: faces(name), hardness, tool: "pickaxe", harvestTier });
}

const idsByName = new Map(specs.map((s, index) => [s.name, s.id ?? index]));
if (idsByName.size !== specs.length) throw new Error("Duplicate block name");
export const BLOCKS: readonly BlockDef[] = specs.map(({ drop, id: explicitId, ...s }, index) => ({
  solid: true,
  transparent: false,
  shape: "cube" as RenderShape,
  creative: true,
  hardness: 1,
  ...s,
  id: explicitId ?? index,
  drop: drop === undefined ? undefined : (() => {
    const id = idsByName.get(drop);
    if (id === undefined) throw new Error(`Unknown block drop ${drop}`);
    return id;
  })(),
}));

const byName = new Map(BLOCKS.map((b) => [b.name, b]));
const byId = new Map(BLOCKS.map((b) => [b.id, b]));
if (byId.size !== BLOCKS.length || BLOCKS.some((b) => !isBlockNamespace(b.id))) throw new Error("Invalid or duplicate block ID");

export const AIR = 0;

export function blockById(id: number): BlockDef {
  const def = tryBlockById(id);
  if (!def) throw new Error(`Unknown block id ${id}`);
  return def;
}

export function blockId(name: string): number {
  const def = byName.get(name);
  if (!def) throw new Error(`Unknown block "${name}"`);
  return def.id;
}

/** Optional lookup for guards and untrusted IDs; the registry remains compact. */
export function tryBlockById(id: number): BlockDef | undefined {
  return isBlockNamespace(id) ? byId.get(id) : undefined;
}
export function isKnownBlockId(id: unknown): id is number {
  return isBlockNamespace(id) && byId.has(id);
}
export function elementBlockId(z: number): number {
  if (!Number.isInteger(z) || z < 0 || z > 118) throw new RangeError("Element atomic number must be 0–118");
  return EXTENDED_BLOCK_ID_BASE + z;
}
export function elementZOfBlock(id: number): number | null {
  const z = id - EXTENDED_BLOCK_ID_BASE;
  return Number.isInteger(z) && z >= 0 && z <= 118 && isKnownBlockId(id) ? z : null;
}

/** Blocks shown in the creative inventory, in display order. */
export function creativeBlocks(): BlockDef[] {
  return BLOCKS.filter((b) => b.creative);
}

/** All texture tile names referenced by any block. */
export function textureNames(): string[] {
  const set = new Set<string>();
  for (const b of BLOCKS) {
    if (b.shape === "none") continue;
    set.add(b.faces.top);
    set.add(b.faces.side);
    set.add(b.faces.bottom);
  }
  return [...set];
}

/** True when the block fully occludes faces of neighbouring blocks. */
export function isOpaque(id: number): boolean {
  const b = tryBlockById(id);
  return b !== undefined && b.shape === "cube" && !b.transparent;
}

export function isSolid(id: number): boolean {
  return tryBlockById(id)?.solid ?? false;
}
