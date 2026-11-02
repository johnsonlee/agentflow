import { stackId } from "./items";
import type { ItemStack } from "./inventory";

export interface Recipe {
  id: string;
  /** Shaped recipe rows; each character maps through `key`, space = empty. */
  pattern?: string[];
  key?: Record<string, string>;
  /** Shapeless ingredients (block or item names). */
  ingredients?: string[];
  result: [block: string, count: number];
  /** Short note when the recipe simplifies Minecraft's (e.g. dyes collapsed into flowers). */
  note?: string;
}

/** Minecraft tool shapes for one head material (`#`), with sticks (`|`) as handles. */
function toolRecipes(material: "wooden" | "stone" | "iron", head: string): Recipe[] {
  const key = { "#": head, "|": "stick" };
  return [
    { id: `${material}_pickaxe`, pattern: ["###", " | ", " | "], key, result: [`${material}_pickaxe`, 1] },
    { id: `${material}_axe`, pattern: ["##", "#|", " |"], key, result: [`${material}_axe`, 1] },
    { id: `${material}_shovel`, pattern: ["#", "|", "|"], key, result: [`${material}_shovel`, 1] },
    { id: `${material}_sword`, pattern: ["#", "#", "|"], key, result: [`${material}_sword`, 1] },
  ];
}

/**
 * Recipes for the blocks and items this game models. Dyes are not modelled, so a few
 * recipes substitute blocks (see `note`).
 */
export const RECIPES: readonly Recipe[] = [
  { id: "stick", pattern: ["#", "#"], key: { "#": "oak_planks" }, result: ["stick", 4] },
  ...toolRecipes("wooden", "oak_planks"),
  ...toolRecipes("stone", "cobblestone"),
  ...toolRecipes("iron", "iron_ingot"),
  { id: "torch", pattern: ["C", "|"], key: { C: "coal", "|": "stick" }, result: ["torch", 4] },
  { id: "torch_from_charcoal", pattern: ["C", "|"], key: { C: "charcoal", "|": "stick" }, result: ["torch", 4] },
  { id: "ink_sac", ingredients: ["coal"], result: ["ink_sac", 1], note: "Minecraft gets ink sacs from squids (not modelled)" },
  { id: "book_and_quill", ingredients: ["book", "ink_sac", "feather"], result: ["book_and_quill", 1] },
  { id: "furnace", pattern: ["###", "# #", "###"], key: { "#": "cobblestone" }, result: ["furnace", 1] },
  { id: "oak_planks", ingredients: ["oak_log"], result: ["oak_planks", 4] },
  { id: "oak_planks_from_birch", ingredients: ["birch_log"], result: ["oak_planks", 4], note: "Minecraft yields birch planks" },
  { id: "crafting_table", pattern: ["##", "##"], key: { "#": "oak_planks" }, result: ["crafting_table", 1] },
  { id: "bookshelf", pattern: ["###", "LLL", "###"], key: { "#": "oak_planks", L: "oak_log" }, result: ["bookshelf", 1], note: "Minecraft uses books instead of logs" },
  { id: "snow_block", pattern: ["##", "##"], key: { "#": "snow" }, result: ["snow", 1], note: "Minecraft uses snowballs" },
  { id: "yellow_wool", ingredients: ["dandelion", "white_wool"], result: ["yellow_wool", 1], note: "dandelion stands in for yellow dye" },
  { id: "red_wool", ingredients: ["poppy", "white_wool"], result: ["red_wool", 1], note: "poppy stands in for red dye" },
  // Education Edition glow stick: polyethylene, hydrogen peroxide and a luminescent chemical.
  {
    id: "glow_stick", pattern: ["PLP", "PHP", " P "], key: { P: "polyethylene", L: "luminol", H: "hydrogen_peroxide" }, result: ["glow_stick", 1],
    note: "Education Edition also takes a dye for the colour; dyes aren't modelled, so luminol stands in",
  },
  { id: "glowstone", pattern: ["##", "##"], key: { "#": "gold_ore" }, result: ["glowstone", 1], note: "Minecraft uses glowstone dust" },
];

export type CraftingGrid = (ItemStack | null)[];

/** Trims empty rows/columns and returns the remaining ids as rows (0 = empty). */
function trim(grid: CraftingGrid, width: number): number[][] {
  const rows: number[][] = [];
  for (let r = 0; r < grid.length / width; r++) rows.push(grid.slice(r * width, r * width + width).map((s) => s?.id ?? 0));
  const usedRows = rows.map((row) => row.some((id) => id !== 0));
  const usedCols = Array.from({ length: width }, (_, c) => rows.some((row) => row[c] !== 0));
  const r0 = usedRows.indexOf(true);
  const r1 = usedRows.lastIndexOf(true);
  const c0 = usedCols.indexOf(true);
  const c1 = usedCols.lastIndexOf(true);
  if (r0 < 0) return [];
  return rows.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
}

function shapedMatches(recipe: Recipe, cells: number[][]): boolean {
  const pattern = recipe.pattern!;
  if (pattern.length !== cells.length || pattern[0].length !== cells[0].length) return false;
  const expect = (ch: string) => (ch === " " ? 0 : stackId(recipe.key![ch]));
  const direct = pattern.every((row, r) => [...row].every((ch, c) => expect(ch) === cells[r][c]));
  const mirrored = pattern.every((row, r) => [...row].every((ch, c) => expect(ch) === cells[r][row.length - 1 - c]));
  return direct || mirrored;
}

function shapelessMatches(recipe: Recipe, grid: CraftingGrid): boolean {
  const have = grid.filter((s): s is ItemStack => s !== null).map((s) => s.id).sort((a, b) => a - b);
  const need = recipe.ingredients!.map(stackId).sort((a, b) => a - b);
  return have.length === need.length && have.every((id, i) => id === need[i]);
}

/** Finds the recipe matching a 2x2 (width 2) or 3x3 (width 3) grid. */
export function matchRecipe(grid: CraftingGrid, width: number): { recipe: Recipe; result: ItemStack } | null {
  const cells = trim(grid, width);
  if (cells.length === 0) return null;
  for (const recipe of RECIPES) {
    const ok = recipe.pattern ? shapedMatches(recipe, cells) : shapelessMatches(recipe, grid);
    if (ok) return { recipe, result: { id: stackId(recipe.result[0]), count: recipe.result[1] } };
  }
  return null;
}

/** Crafts once: consumes one item from every occupied cell. Returns the result or null if nothing matches. */
export function craftOnce(grid: CraftingGrid, width: number): ItemStack | null {
  const match = matchRecipe(grid, width);
  if (!match) return null;
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (!s) continue;
    s.count--;
    if (s.count <= 0) grid[i] = null;
  }
  return match.result;
}
