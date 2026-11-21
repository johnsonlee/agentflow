/**
 * Item registry for things that are not blocks (sticks, tools). Item ids start at
 * {@link ITEM_ID_BASE}, so one numeric id space covers inventory stacks while chunk
 * arrays keep holding block ids only.
 */
import { SPARKLER_COLORS } from "./sparkler-colors";
import { BALLOON_COLORS } from "./balloon-colors";
import { DYE_COLORS } from "./dyes";
import { GLOW_STICK_COLORS } from "./glow-stick-colors";
import { ADDITIONAL_GUIDE_ISOTOPES } from "../crafting/education-isotopes";
import { BLOCKS, blockById, blockId, isKnownBlockId, tryBlockById } from "./blocks";
import { ADDITIONAL_COMPOUNDS, ADDITIONAL_ELEMENTS, ELEMENTS, LEGACY_COMPOUNDS, LEGACY_ELEMENTS, LAB_PRODUCTS, elementItemName, isotopeItemName, type CompoundData } from "../crafting/chemistry-data";

import { ITEM_ID_BASE, ITEM_ID_LIMIT } from "../core/ids";
export { ITEM_ID_BASE } from "../core/ids";
export const MAX_STACK = 64;

export type ToolKind = "pickaxe" | "axe" | "shovel" | "sword" | "hoe";
export type ToolMaterial = "wooden" | "stone" | "iron" | "golden" | "diamond";

export interface ToolSpec {
  kind: ToolKind;
  material: ToolMaterial;
  /** Harvest level: wooden/golden 1, stone 2, iron 3, diamond 4. */
  tier: number;
  /** Mining speed multiplier on blocks this tool is made for. */
  speed: number;
  /** Uses before the tool breaks. */
  durability: number;
  /** Melee damage (Bedrock values). */
  attack: number;
}

export const ARMOR_SLOTS = ["head", "chest", "legs", "feet"] as const;
export type ArmorSlot = typeof ARMOR_SLOTS[number];
export type ArmorMaterial = "iron" | "golden" | "diamond";
export interface ArmorSpec {
  slot: ArmorSlot;
  material: ArmorMaterial;
  /** Each point blocks 4% of eligible damage (maximum 20 points). */
  points: number;
  durability: number;
}

export interface ItemDef {
  id: number;
  name: string;
  displayName: string;
  maxStack: number;
  /** Texture tile drawn as the item's icon. */
  icon: string;
  tool?: ToolSpec;
  armor?: ArmorSpec;
  /** Block this item places (Lab Table products such as the heat block and glow stick). */
  places?: string;
  /** Chemistry: element (atomic number), isotope (plus mass number), compound (formula) or lab product. */
  chem?: { kind: "element" | "isotope" | "compound" | "product"; z?: number; symbol?: string; mass?: number; formula?: string };
  /**
   * Food: hunger points restored and saturation gained (Minecraft values). `risk` is a chance of
   * extra exhaustion (a simplified Hunger effect).
   */
  food?: { hunger: number; saturation: number; risk?: { chance: number; exhaustion: number } };
}

/** Minecraft values: wood speed 2 / 59 uses, stone 4 / 131, iron 6 / 250; Bedrock attack damage. */
const MATERIALS: Record<ToolMaterial, { tier: number; speed: number; durability: number; attack: Record<ToolKind, number> }> = {
  wooden: { tier: 1, speed: 2, durability: 59, attack: { hoe: 1, sword: 5, axe: 4, pickaxe: 3, shovel: 2 } },
  stone: { tier: 2, speed: 4, durability: 131, attack: { hoe: 1, sword: 6, axe: 5, pickaxe: 4, shovel: 3 } },
  iron: { tier: 3, speed: 6, durability: 250, attack: { hoe: 1, sword: 7, axe: 6, pickaxe: 5, shovel: 4 } },
  // Bedrock permits one more use than the nominal Java durability (32 / 1561).
  golden: { tier: 1, speed: 12, durability: 33, attack: { hoe: 1, sword: 5, axe: 4, pickaxe: 3, shovel: 2 } },
  diamond: { tier: 4, speed: 8, durability: 1562, attack: { hoe: 1, sword: 8, axe: 7, pickaxe: 6, shovel: 5 } },
};

const MATERIAL_NAMES: Record<ToolMaterial, string> = { wooden: "Wooden", stone: "Stone", iron: "Iron", golden: "Golden", diamond: "Diamond" };

const KIND_NAMES: Record<ToolKind, string> = { pickaxe: "Pickaxe", axe: "Axe", shovel: "Shovel", sword: "Sword", hoe: "Hoe" };

function tool(material: ToolMaterial, kind: ToolKind): Omit<ItemDef, "id"> {
  const m = MATERIALS[material];
  const name = `${material}_${kind}`;
  return {
    name,
    displayName: `${MATERIAL_NAMES[material]} ${KIND_NAMES[kind]}`,
    maxStack: 1,
    icon: `item_${name}`,
    tool: { kind, material, tier: m.tier, speed: m.speed, durability: m.durability, attack: m.attack[kind] },
  };
}

function material(name: string, displayName: string, food?: ItemDef["food"]): Omit<ItemDef, "id"> {
  return { name, displayName, maxStack: MAX_STACK, icon: `item_${name}`, ...(food ? { food } : {}) };
}

const TOOL_KINDS = ["pickaxe", "axe", "shovel", "sword"] as const;

// Append only: item ids are positional and stored in saves.
function compoundItem(c: CompoundData): Omit<ItemDef, "id"> {
  return { name: c.name, displayName: c.displayName, maxStack: MAX_STACK, icon: `item_compound_${c.name}`, chem: { kind: "compound", formula: c.formula } };
}

/** Lab Table products that are placed as blocks (`placed_<name>`). */
const PLACED_PRODUCTS = new Set(["heat_block", "underwater_torch", "glow_stick"]);

// Standard armor values. Slots use the same 11/16/15/13 durability factors.
// Chestplate durability is documented by minecraft.net's Taking Inventory: Chestplate.
const ARMOR_STATS: Record<ArmorMaterial, { multiplier: number; points: readonly number[] }> = {
  iron: { multiplier: 15, points: [2, 6, 5, 2] },
  golden: { multiplier: 7, points: [2, 5, 3, 1] },
  diamond: { multiplier: 33, points: [3, 8, 6, 3] },
};
const ARMOR_KINDS = ["helmet", "chestplate", "leggings", "boots"] as const;
const ARMOR_DURABILITY_FACTORS = [11, 16, 15, 13] as const;
const ARMOR_KIND_NAMES = ["Helmet", "Chestplate", "Leggings", "Boots"] as const;
function armor(material: ArmorMaterial, index: number): Omit<ItemDef, "id"> {
  const stats = ARMOR_STATS[material];
  const name = `${material}_${ARMOR_KINDS[index]}`;
  return {
    name, displayName: `${MATERIAL_NAMES[material]} ${ARMOR_KIND_NAMES[index]}`,
    maxStack: 1, icon: `item_${name}`,
    armor: { slot: ARMOR_SLOTS[index], material, points: stats.points[index], durability: ARMOR_DURABILITY_FACTORS[index] * stats.multiplier },
  };
}

const specs: Omit<ItemDef, "id">[] = [
  { name: "stick", displayName: "Stick", maxStack: MAX_STACK, icon: "item_stick" },
  ...(["wooden", "stone"] as const).flatMap((m) => TOOL_KINDS.map((k) => tool(m, k))),
  // Increment 2: smelting, iron tools, food.
  material("coal", "Coal"),
  material("charcoal", "Charcoal"),
  material("iron_ingot", "Iron Ingot"),
  material("gold_ingot", "Gold Ingot"),
  material("diamond", "Diamond"),
  material("raw_porkchop", "Raw Porkchop", { hunger: 3, saturation: 1.8 }),
  material("cooked_porkchop", "Cooked Porkchop", { hunger: 8, saturation: 12.8 }),
  material("raw_chicken", "Raw Chicken", { hunger: 2, saturation: 1.2 }),
  material("cooked_chicken", "Cooked Chicken", { hunger: 6, saturation: 7.2 }),
  ...TOOL_KINDS.map((k) => tool("iron", k)),
  // Increment 3: zombie drop. Minecraft: 80% chance of Hunger (30 s), about 3 exhaustion in total.
  material("rotten_flesh", "Rotten Flesh", { hunger: 4, saturation: 0.8, risk: { chance: 0.8, exhaustion: 3 } }),
  // Increment 4: Book & Quill.
  material("feather", "Feather"),
  material("ink_sac", "Ink Sac"),
  material("book", "Book"),
  { name: "book_and_quill", displayName: "Book and Quill", maxStack: 1, icon: "item_book_and_quill" },
  { name: "written_book", displayName: "Written Book", maxStack: 1, icon: "item_written_book" },
  // Increment 6a: Education Edition chemistry (elements 1-36, isotopes, compounds, lab products).
  ...LEGACY_ELEMENTS.map((e) => ({
    name: elementItemName(e), displayName: e.name, maxStack: MAX_STACK, places: `element_${e.z}`, icon: `item_element_${e.z}_${e.symbol}`,
    chem: { kind: "element" as const, z: e.z, symbol: e.symbol, mass: e.a },
  })),
  ...LEGACY_ELEMENTS.flatMap((e) => e.isotopes.map((m) => ({
    name: isotopeItemName(e, m), displayName: `${e.name}-${m}`, maxStack: MAX_STACK, icon: `item_isotope_${e.z}_${e.symbol}_${m}`,
    chem: { kind: "isotope" as const, z: e.z, symbol: e.symbol, mass: m },
  }))),
  ...LEGACY_COMPOUNDS.filter((c) => !c.appended).map(compoundItem),
  ...LAB_PRODUCTS.map((r) => ({
    name: r.product, displayName: r.displayName, maxStack: MAX_STACK, icon: `item_product_${r.product}`, chem: { kind: "product" as const },
    places: PLACED_PRODUCTS.has(r.product) ? `placed_${r.product}` : undefined,
  })),
  // Increment 6b.
  ...LEGACY_COMPOUNDS.filter((c) => c.appended).map(compoundItem),
  { name: "redstone", displayName: "Redstone Dust", maxStack: MAX_STACK, icon: "item_redstone", places: "redstone_wire_0" },
  { name: "wooden_door", displayName: "Wooden Door", maxStack: MAX_STACK, icon: "item_wooden_door", places: "door_wooden_lower_0_0" },
  { name: "iron_door", displayName: "Iron Door", maxStack: MAX_STACK, icon: "item_iron_door", places: "door_iron_lower_0_0" },
  // Append only: preserve every previous item id in saved inventories.
  ...(["golden", "diamond"] as const).flatMap((m) => TOOL_KINDS.map((k) => tool(m, k))),
  // Append new chemistry after every legacy item (including tools): never reinterpret old saves.
  ...ADDITIONAL_ELEMENTS.map((e) => ({
    name: elementItemName(e), displayName: e.name, maxStack: MAX_STACK, places: `element_${e.z}`, icon: `item_element_${e.z}_${e.symbol}`,
    chem: { kind: "element" as const, z: e.z, symbol: e.symbol, mass: e.a },
  })),
  ...ADDITIONAL_ELEMENTS.flatMap((e) => e.isotopes.map((m) => ({
    name: isotopeItemName(e, m), displayName: `${e.name}-${m}`, maxStack: MAX_STACK, icon: `item_isotope_${e.z}_${e.symbol}_${m}`,
    chem: { kind: "isotope" as const, z: e.z, symbol: e.symbol, mass: m },
  }))),
  ...ADDITIONAL_COMPOUNDS.map(compoundItem),
  // Armor appends after all 428 existing entries: never reinterpret saved item IDs.
  ...(["iron", "golden", "diamond"] as const).flatMap((m) => ARMOR_SLOTS.map((_, i) => armor(m, i))),
  // Append after the 440 published entries, never expand the legacy tool arrays in place.
  ...(["wooden", "stone", "iron", "golden", "diamond"] as const).map((m) => tool(m, "hoe")),
  { ...material("wheat_seeds", "Wheat Seeds"), places: "wheat_0" },
  material("wheat", "Wheat"),
  material("bread", "Bread", { hunger: 5, saturation: 6 }),
  // Distinct Lab Table product; never insert into the positional legacy LAB_PRODUCTS array.
  { name: "bleach", displayName: "Bleach", maxStack: MAX_STACK, icon: "item_product_bleach", chem: { kind: "product" } },
  // Append 70 missing documented-guide masses after all 449 existing entries.
  ...ADDITIONAL_GUIDE_ISOTOPES.map(({ z, symbol, mass }) => {
    const e = [...LEGACY_ELEMENTS, ...ADDITIONAL_ELEMENTS].find((element) => element.z === z)!;
    return {
      name: isotopeItemName(e, mass), displayName: `${e.name}-${mass}`, maxStack: MAX_STACK, icon: `item_isotope_${z}_${symbol}_${mass}`,
      chem: { kind: "isotope" as const, z, symbol, mass },
    };
  }),
  // Append-only canonical dyes after all 519 published entries.
  ...DYE_COLORS.map(({ name, displayName }) => material(`${name}_dye`, `${displayName} Dye`)),
  // Append after all535 published items; saved glowstone blocks retain their existing block ID.
  material("glowstone_dust", "Glowstone Dust"),
  // Application stack bound pending direct current Education runtime verification.
  { name: "snowball", displayName: "Snowball", maxStack: 16, icon: "item_snowball" },
  // Append-only color identities. No new placeable/permanent-light blocks or activation state.
  ...GLOW_STICK_COLORS.filter(({ color }) => color !== "green").map(({ itemName, displayName, icon }) => ({
    name: itemName, displayName, maxStack: MAX_STACK, icon, chem: { kind: "product" as const },
  })),
  // App stack bound64; retained loot text establishes string identity/count, not native stack size.
  { name: "string", displayName: "String", maxStack: MAX_STACK, icon: "item_string" },
  // Application stack bound64; modern retained recipe identity/count, not native stack calibration.
  { name: "lead_rope", displayName: "Lead", maxStack: MAX_STACK, icon: "item_lead" },
  // Append16 flat products; stack64 is an application choice pending native verification.
  ...BALLOON_COLORS.map(({ itemName, displayName, icon }) => ({
    name: itemName, displayName, maxStack: MAX_STACK, icon, chem: { kind: "product" as const },
  })),
  // Append five application sparkler identities after the complete568-item prefix.
  ...SPARKLER_COLORS.map(({ itemName, displayName, iconInactive }) => ({
    name: itemName, displayName, maxStack: MAX_STACK, icon: iconInactive, chem: { kind: "product" as const },
  })),
  // Nutrition2 follows the official Bedrock snippet; saturation3.2/stack64 are application choices.
  material("spider_eye", "Spider Eye", { hunger: 2, saturation: 3.2 }),
  // Whole-container identities; empty64/water1 are explicit application bounds pending native calibration.
  material("glass_bottle", "Glass Bottle"),
  { name: "water_bottle", displayName: "Water Bottle", maxStack: 1, icon: "item_water_bottle" },
];

if (specs.length > ITEM_ID_LIMIT - ITEM_ID_BASE + 1) throw new Error("Item namespace exhausted");
export const ITEMS: readonly ItemDef[] = specs.map((s, i) => ({ ...s, id: ITEM_ID_BASE + i }));

const itemsByName = new Map(ITEMS.map((i) => [i.name, i]));

export function isItem(id: number): boolean {
  return Number.isInteger(id) && id >= ITEM_ID_BASE && id <= ITEM_ID_LIMIT;
}

export function itemById(id: number): ItemDef {
  const def = isItem(id) ? ITEMS[id - ITEM_ID_BASE] : undefined;
  if (!def) throw new Error(`Unknown item id ${id}`);
  return def;
}

export function itemId(name: string): number {
  const def = itemsByName.get(name);
  if (!def) throw new Error(`Unknown item "${name}"`);
  return def.id;
}

/** Resolves a block or item name to a stack id (blocks first). */
export function stackId(name: string): number {
  const block = BLOCKS.find((b) => b.name === name);
  if (block) return block.id;
  return itemId(name);
}

/** Registered items only; namespace membership alone is not enough. */
export function isKnownItemId(id: number): boolean {
  return isItem(id) && ITEMS[id - ITEM_ID_BASE] !== undefined;
}

/** True for a registered block or item, including extended world blocks. */
export function isKnownId(id: number): boolean {
  return isKnownBlockId(id) || isKnownItemId(id);
}

export function nameOf(id: number): string {
  return isItem(id) ? itemById(id).name : blockById(id).name;
}

export function displayNameOf(id: number): string {
  return isItem(id) ? itemById(id).displayName : blockById(id).displayName;
}

export function maxStackOf(id: number): number {
  if (isItem(id)) return itemById(id).maxStack;
  blockById(id); // Strict: an unregistered block is not a valid stack.
  return MAX_STACK;
}

export function foodOf(id: number | undefined | null): ItemDef["food"] | null {
  if (id === undefined || id === null || !isKnownItemId(id)) return null;
  return itemById(id).food ?? null;
}

/** Minecraft drops that differ from the block itself (coal ore -> coal, diamond ore -> diamond, bookshelf -> 3 books). */
const BLOCK_ITEM_DROPS = new Map<string, string>([
  ["coal_ore", "coal"], ["diamond_ore", "diamond"], ["bookshelf", "book"],
  ["placed_heat_block", "heat_block"], ["placed_underwater_torch", "underwater_torch"], ["placed_glow_stick", "glow_stick"],
  ["redstone_ore", "redstone"], ["glowstone", "glowstone_dust"], ["snow", "snowball"],
  ...ELEMENTS.map((e) => [`element_${e.z}`, elementItemName(e)] as [string, string]),
  ...BLOCKS.filter((b) => /^wheat_\d$/.test(b.name)).map((b) => [b.name, "wheat_seeds"] as [string, string]),
  ...BLOCKS.filter((b) => b.name.startsWith("redstone_wire_")).map((b) => [b.name, "redstone"] as [string, string]),
  ...BLOCKS.filter((b) => b.name.startsWith("door_")).map((b) => [b.name, b.name.startsWith("door_wooden") ? "wooden_door" : "iron_door"] as [string, string]),
]);
// Ordinary and stained glass shatter without Silk Touch (enchantments are not modelled).
// Keep dropOf/baseStackId as canonical identities; zero is a quantity, never the air item.
const BLOCK_DROP_COUNTS = new Map<string, number>([
  ["bookshelf", 3], ["glass", 0],
  // Four-ball harvest is an application rule pending direct current Education runtime proof.
  // Agent destroy shares these quantities with its existing tool-independent harvest semantics.
  ["snow", 4],
  ...DYE_COLORS.map(({ name }) => [`${name}_stained_glass`, 0] as [string, number]),
]);

/** Unenchanted harvest quantities. Source min/max bounds use application uniform integer sampling;
 * native RNG probabilities, Fortune and Silk Touch are not modeled here.
 */
export function dropCount(blockIdValue: number, rand: () => number = Math.random): number {
  const name = blockById(blockIdValue).name;
  const range = name === "redstone_ore" ? [4, 5] : name === "glowstone" ? [2, 4] : null;
  if (range) {
    const value = rand();
    if (!Number.isFinite(value)) throw new RangeError("Harvest RNG must return a finite number");
    return Math.min(range[1], range[0] + Math.floor(Math.max(0, Math.min(1, value)) * (range[1] - range[0] + 1)));
  }
  return BLOCK_DROP_COUNTS.get(name) ?? 1;
}

/** Stack id a block drops when harvested. */
export function dropOf(blockIdValue: number): number {
  const def = blockById(blockIdValue);
  const item = BLOCK_ITEM_DROPS.get(def.name);
  if (item) return itemId(item);
  return def.drop ?? def.id;
}

/**
 * The stack id an inventory should hold for `id`: hidden state blocks (not in the creative palette,
 * dropping something else, e.g. redstone_wire_15 -> redstone, lever_on -> lever) map to that drop.
 */
export function baseStackId(id: number): number {
  if (isItem(id)) return id;
  const def = tryBlockById(id);
  if (!def || def.creative) return id;
  const drop = dropOf(id);
  return drop !== id ? drop : id;
}

/** Block id an item places, or null (blocks place themselves). */
export function placedBlockOf(id: number): number | null {
  if (isKnownBlockId(id)) return id;
  if (!isKnownItemId(id)) return null;
  const places = itemById(id).places;
  return places ? blockId(places) : null;
}

export function toolOf(id: number | undefined | null): ToolSpec | null {
  if (id === undefined || id === null || !isKnownItemId(id)) return null;
  return itemById(id).tool ?? null;
}

/** Texture tiles used by item icons. */
export function itemTextureNames(): string[] {
  return ITEMS.map((i) => i.icon);
}

/** Armor metadata, or null for a non-armor/unknown id. */
export function armorOf(id: number | null | undefined): ArmorSpec | null {
  return typeof id === "number" && isKnownItemId(id) ? ITEMS[id - ITEM_ID_BASE].armor ?? null : null;
}

/** Uses before breaking for a tool or armor item. */
export function durabilityOf(id: number | null | undefined): number | null {
  if (typeof id !== "number" || !isKnownItemId(id)) return null;
  const item = ITEMS[id - ITEM_ID_BASE];
  return item?.tool?.durability ?? item?.armor?.durability ?? null;
}
