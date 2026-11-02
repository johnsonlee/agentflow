/**
 * Block registry. Block ids are small integers stored in chunk arrays;
 * textures are referenced by tile name and resolved by the renderer.
 */

export type RenderShape = "cube" | "cross" | "liquid" | "none";

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
  /** Needs a solid block underneath (plants). */
  needsSupport?: boolean;
}

function faces(top: string, side = top, bottom = top): BlockFaces {
  return { top, side, bottom };
}

type BlockSpec = Omit<BlockDef, "id" | "solid" | "transparent" | "shape" | "creative" | "hardness" | "drop"> &
  Partial<Pick<BlockDef, "solid" | "transparent" | "shape" | "creative" | "hardness">> & { drop?: string };

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
  { name: "glowstone", displayName: "Glowstone", faces: faces("glowstone"), hardness: 0.45, emissive: true },
  { name: "bookshelf", displayName: "Bookshelf", faces: faces("oak_planks", "bookshelf"), hardness: 2.25, tool: "axe" },
  { name: "crafting_table", displayName: "Crafting Table", faces: faces("crafting_table_top", "crafting_table_side", "oak_planks"), hardness: 3.75, tool: "axe" },
  { name: "dandelion", displayName: "Dandelion", faces: faces("dandelion"), solid: false, transparent: true, shape: "cross", hardness: 0, needsSupport: true },
  { name: "poppy", displayName: "Poppy", faces: faces("poppy"), solid: false, transparent: true, shape: "cross", hardness: 0, needsSupport: true },
  { name: "tall_grass", displayName: "Tall Grass", faces: faces("tall_grass"), solid: false, transparent: true, shape: "cross", hardness: 0, needsSupport: true },
  // Minecraft: Education Edition world-builder blocks.
  { name: "allow", displayName: "Allow", faces: faces("allow"), hardness: Infinity },
  { name: "deny", displayName: "Deny", faces: faces("deny"), hardness: Infinity },
  { name: "border", displayName: "Border", faces: faces("border"), hardness: Infinity },
];

export const BLOCKS: readonly BlockDef[] = specs.map(({ drop, ...s }, id) => ({
  solid: true,
  transparent: false,
  shape: "cube" as RenderShape,
  creative: true,
  hardness: 1,
  ...s,
  id,
  drop: drop === undefined ? undefined : specs.findIndex((o) => o.name === drop),
}));

const byName = new Map(BLOCKS.map((b) => [b.name, b]));

export const AIR = 0;

export function blockById(id: number): BlockDef {
  const def = BLOCKS[id];
  if (!def) throw new Error(`Unknown block id ${id}`);
  return def;
}

export function blockId(name: string): number {
  const def = byName.get(name);
  if (!def) throw new Error(`Unknown block "${name}"`);
  return def.id;
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
  const b = BLOCKS[id];
  return b !== undefined && b.shape === "cube" && !b.transparent;
}

export function isSolid(id: number): boolean {
  return BLOCKS[id]?.solid ?? false;
}
