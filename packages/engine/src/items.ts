/**
 * Item registry for things that are not blocks (sticks, tools). Item ids start at
 * {@link ITEM_ID_BASE}, so one numeric id space covers inventory stacks while chunk
 * arrays keep holding block ids only.
 */
import { BLOCKS, blockById } from "./blocks";

export const ITEM_ID_BASE = 256;
export const MAX_STACK = 64;

export type ToolKind = "pickaxe" | "axe" | "shovel" | "sword";
export type ToolMaterial = "wooden" | "stone" | "iron";

export interface ToolSpec {
  kind: ToolKind;
  material: ToolMaterial;
  /** Harvest level: wooden 1, stone 2, iron 3. */
  tier: number;
  /** Mining speed multiplier on blocks this tool is made for. */
  speed: number;
  /** Uses before the tool breaks. */
  durability: number;
  /** Melee damage (Bedrock values). */
  attack: number;
}

export interface ItemDef {
  id: number;
  name: string;
  displayName: string;
  maxStack: number;
  /** Texture tile drawn as the item's icon. */
  icon: string;
  tool?: ToolSpec;
  /** Food: hunger points restored and saturation gained (Minecraft values). */
  food?: { hunger: number; saturation: number };
}

/** Minecraft values: wood speed 2 / 59 uses, stone 4 / 131, iron 6 / 250; Bedrock attack damage. */
const MATERIALS: Record<ToolMaterial, { tier: number; speed: number; durability: number; attack: Record<ToolKind, number> }> = {
  wooden: { tier: 1, speed: 2, durability: 59, attack: { sword: 5, axe: 4, pickaxe: 3, shovel: 2 } },
  stone: { tier: 2, speed: 4, durability: 131, attack: { sword: 6, axe: 5, pickaxe: 4, shovel: 3 } },
  iron: { tier: 3, speed: 6, durability: 250, attack: { sword: 7, axe: 6, pickaxe: 5, shovel: 4 } },
};

const MATERIAL_NAMES: Record<ToolMaterial, string> = { wooden: "Wooden", stone: "Stone", iron: "Iron" };

const KIND_NAMES: Record<ToolKind, string> = { pickaxe: "Pickaxe", axe: "Axe", shovel: "Shovel", sword: "Sword" };

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
];

export const ITEMS: readonly ItemDef[] = specs.map((s, i) => ({ ...s, id: ITEM_ID_BASE + i }));

const itemsByName = new Map(ITEMS.map((i) => [i.name, i]));

export function isItem(id: number): boolean {
  return id >= ITEM_ID_BASE;
}

export function itemById(id: number): ItemDef {
  const def = ITEMS[id - ITEM_ID_BASE];
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

/** True for any id a stack may hold (a known block or item). */
export function isKnownId(id: number): boolean {
  return isItem(id) ? ITEMS[id - ITEM_ID_BASE] !== undefined : BLOCKS[id] !== undefined;
}

export function nameOf(id: number): string {
  return isItem(id) ? itemById(id).name : blockById(id).name;
}

export function displayNameOf(id: number): string {
  return isItem(id) ? itemById(id).displayName : blockById(id).displayName;
}

export function maxStackOf(id: number): number {
  return isItem(id) ? itemById(id).maxStack : MAX_STACK;
}

export function foodOf(id: number | undefined | null): ItemDef["food"] | null {
  if (id === undefined || id === null || !isItem(id)) return null;
  return itemById(id).food ?? null;
}

/** Minecraft drops that differ from the block itself (coal ore -> coal, diamond ore -> diamond). */
const BLOCK_ITEM_DROPS: Record<string, string> = { coal_ore: "coal", diamond_ore: "diamond" };

/** Stack id a block drops when harvested. */
export function dropOf(blockIdValue: number): number {
  const def = blockById(blockIdValue);
  const item = BLOCK_ITEM_DROPS[def.name];
  if (item) return itemId(item);
  return def.drop ?? def.id;
}

export function toolOf(id: number | undefined | null): ToolSpec | null {
  if (id === undefined || id === null || !isItem(id)) return null;
  return itemById(id).tool ?? null;
}

/** Texture tiles used by item icons. */
export function itemTextureNames(): string[] {
  return ITEMS.map((i) => i.icon);
}
