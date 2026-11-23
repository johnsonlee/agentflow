import { METAL_NUGGETS } from "../catalog/metal-nuggets";
import { inspectItemState } from "../ownership/item-state";
import { METAL_STORAGE_BLOCKS } from "../catalog/metal-storage";
import { hasCloneableBookMetadata, stackLimit } from "../ownership/stack";
import { SPARKLER_COLORS } from "../catalog/sparkler-colors";
import { freshStack } from "../ownership/glow-stick-state";
import { BALLOON_COLORS } from "../catalog/balloon-colors";
import { DYE_COLORS } from "../catalog/dyes";
import { GLOW_STICK_COLORS } from "../catalog/glow-stick-colors";
import { BLOCKS } from "../catalog/blocks";
import { isKnownId, stackId, type ArmorMaterial, type ToolMaterial } from "../catalog/items";
import type { ItemStack } from "../ownership/inventory";

export interface Recipe {
  id: string;
  /** Shaped recipe rows; each character maps through `key`, space = empty. */
  pattern?: string[];
  key?: Record<string, string>;
  /** Available Oak/Birch subset of the declared native plank tag, matched per occupied cell. */
  keyTags?: Readonly<Record<string, "planks"|"wooden_slabs">>;
  /** Shapeless ingredients (block or item names). */
  ingredients?: string[];
  result: [block: string, count: number];
  /** Short note when the recipe simplifies Minecraft or its exact rules remain unverified. */
  note?: string;
}

/** Minecraft tool shapes for one head material (`#`), with sticks (`|`) as handles. */
function toolRecipes(material: ToolMaterial, head: string): Recipe[] {
  const key = { "#": head, "|": "stick" };
  return [
    { id: `${material}_pickaxe`, pattern: ["###", " | ", " | "], key, keyTags: material === "wooden" ? { "#": "planks" } : undefined, result: [`${material}_pickaxe`, 1] },
    { id: `${material}_axe`, pattern: ["##", "#|", " |"], key, keyTags: material === "wooden" ? { "#": "planks" } : undefined, result: [`${material}_axe`, 1] },
    { id: `${material}_shovel`, pattern: ["#", "|", "|"], key, keyTags: material === "wooden" ? { "#": "planks" } : undefined, result: [`${material}_shovel`, 1] },
    { id: `${material}_sword`, pattern: ["#", "#", "|"], key, keyTags: material === "wooden" ? { "#": "planks" } : undefined, result: [`${material}_sword`, 1] },
  ];
}

/** Standard shaped armor recipes; all can be translated within the crafting grid. */
function armorRecipes(material: ArmorMaterial, head: string): Recipe[] {
  const key = { "#": head };
  return [
    { id: `${material}_helmet`, pattern: ["###", "# #"], key, result: [`${material}_helmet`, 1] },
    { id: `${material}_chestplate`, pattern: ["# #", "###", "###"], key, result: [`${material}_chestplate`, 1] },
    { id: `${material}_leggings`, pattern: ["###", "# #", "# #"], key, result: [`${material}_leggings`, 1] },
    { id: `${material}_boots`, pattern: ["# #", "# #"], key, result: [`${material}_boots`, 1] },
  ];
}

/** Verified available-input subset of Mojang samples 15701fa9c13923f12662984c32c124327e40e3d3.
 * Exact normalized source records/hashes: artifacts/chemistry-dyes-glowstick-sources.json.
 * Missing acquisition resources are not substituted; legacy ink-sac mix alternatives stay distinct.
 */
const LEGACY_DYE_RECIPES: readonly Recipe[] = [
  { id: "black_dye_from_ink_sac", ingredients: ["ink_sac"], result: ["black_dye", 1] },
  { id: "cyan_dye", ingredients: ["blue_dye", "green_dye"], result: ["cyan_dye", 2] },
  { id: "gray_dye", ingredients: ["black_dye", "white_dye"], result: ["gray_dye", 2] },
  { id: "gray_dye_from_ink_white", ingredients: ["ink_sac", "white_dye"], result: ["gray_dye", 2] },
  { id: "light_blue_dye", ingredients: ["blue_dye", "white_dye"], result: ["light_blue_dye", 2] },
  { id: "light_gray_dye", ingredients: ["black_dye", "white_dye", "white_dye"], result: ["light_gray_dye", 3] },
  { id: "light_gray_dye_from_gray_white", ingredients: ["gray_dye", "white_dye"], result: ["light_gray_dye", 2] },
  { id: "light_gray_dye_from_ink_white", ingredients: ["ink_sac", "white_dye", "white_dye"], result: ["light_gray_dye", 3] },
  { id: "lime_dye", ingredients: ["green_dye", "white_dye"], result: ["lime_dye", 2] },
  { id: "magenta_dye", ingredients: ["blue_dye", "red_dye", "pink_dye"], result: ["magenta_dye", 3] },
  { id: "magenta_dye_from_blue_ink_white", ingredients: ["blue_dye", "red_dye", "red_dye", "white_dye"], result: ["magenta_dye", 4] },
  { id: "magenta_dye_from_purple_and_pink", ingredients: ["purple_dye", "pink_dye"], result: ["magenta_dye", 2] },
  { id: "orange_dye_from_red_yellow", ingredients: ["red_dye", "yellow_dye"], result: ["orange_dye", 2] },
  { id: "pink_dye", ingredients: ["red_dye", "white_dye"], result: ["pink_dye", 2] },
  { id: "purple_dye", ingredients: ["blue_dye", "red_dye"], result: ["purple_dye", 2] },
  { id: "red_dye_from_poppy", ingredients: ["poppy"], result: ["red_dye", 1] },
  { id: "yellow_dye_from_dandelion", ingredients: ["dandelion"], result: ["yellow_dye", 1] },
];

/** Exact available Bone Meal alternatives from retained Mojang sample dye-source-recipes.json.
 * Keep the legacy seventeen spread in place; append these only after all old191 main recipes. */
const WHITE_DYE_FROM_BONE_MEAL: Recipe = { id: "white_dye_from_bone_meal", ingredients: ["bone_meal"], result: ["white_dye", 1] };
const BONE_MEAL_DYE_RECIPES: readonly Recipe[] = [
  { id: "gray_dye_from_black_bonemeal", ingredients: ["black_dye", "bone_meal"], result: ["gray_dye", 2] },
  { id: "gray_dye_from_ink_bonemeal", ingredients: ["ink_sac", "bone_meal"], result: ["gray_dye", 2] },
  { id: "light_blue_dye_from_blue_bonemeal", ingredients: ["blue_dye", "bone_meal"], result: ["light_blue_dye", 2] },
  { id: "light_gray_dye_from_black_bonemeal", ingredients: ["black_dye", "bone_meal", "bone_meal"], result: ["light_gray_dye", 3] },
  { id: "light_gray_dye_from_gray_bonemeal", ingredients: ["gray_dye", "bone_meal"], result: ["light_gray_dye", 2] },
  { id: "light_gray_dye_from_ink_bonemeal", ingredients: ["ink_sac", "bone_meal", "bone_meal"], result: ["light_gray_dye", 3] },
  { id: "lime_dye_from_bonemeal", ingredients: ["green_dye", "bone_meal"], result: ["lime_dye", 2] },
  { id: "magenta_dye_from_blue_ink_bonemeal", ingredients: ["blue_dye", "red_dye", "red_dye", "bone_meal"], result: ["magenta_dye", 4] },
  { id: "pink_dye_from_red_bonemeal", ingredients: ["red_dye", "bone_meal"], result: ["pink_dye", 2] },
];
export const DYE_RECIPES: readonly Recipe[] = [...LEGACY_DYE_RECIPES, WHITE_DYE_FROM_BONE_MEAL, ...BONE_MEAL_DYE_RECIPES];

/** Recipes for the blocks and items this game models; provisional rules carry a note. */
export const RECIPES: readonly Recipe[] = [
  { id: "stick", pattern: ["#", "#"], key: { "#": "oak_planks" }, keyTags: { "#": "planks" }, result: ["stick", 4] },
  ...toolRecipes("wooden", "oak_planks"),
  ...toolRecipes("stone", "cobblestone"),
  ...toolRecipes("iron", "iron_ingot"),
  ...toolRecipes("golden", "gold_ingot"),
  ...toolRecipes("diamond", "diamond"),
  ...(["wooden", "stone", "iron", "golden", "diamond"] as const).map((m) => ({
    id: `${m}_hoe`, pattern: ["HH", " |", " |"],
    key: { H: m === "wooden" ? "oak_planks" : m === "stone" ? "cobblestone" : m === "iron" ? "iron_ingot" : m === "golden" ? "gold_ingot" : "diamond", "|": "stick" },
    keyTags: m === "wooden" ? { H: "planks" as const } : undefined,
    result: [`${m}_hoe`, 1] as [string, number],
  })),
  { id: "bread", pattern: ["WWW"], key: { W: "wheat" }, result: ["bread", 1] },
  ...armorRecipes("iron", "iron_ingot"),
  ...armorRecipes("golden", "gold_ingot"),
  ...armorRecipes("diamond", "diamond"),
  { id: "torch", pattern: ["C", "|"], key: { C: "coal", "|": "stick" }, result: ["torch", 4] },
  { id: "torch_from_charcoal", pattern: ["C", "|"], key: { C: "charcoal", "|": "stick" }, result: ["torch", 4] },
  // Official Chemistry Lab Journal, printed page 9: magnesium directly above a torch.
  { id: "underwater_torch", pattern: ["M", "T"], key: { M: "magnesium", T: "torch" }, result: ["underwater_torch", 1] },
  // The same page places a chloride directly above an ordinary torch.
  ...([ ["blue", "cerium_chloride"], ["red", "mercuric_chloride"], ["purple", "potassium_chloride"], ["green", "tungsten_chloride"] ] as const).map(([color, compound]) => ({
    id: `${color}_torch`, pattern: ["C", "T"], key: { C: compound, T: "torch" }, result: [`${color}_torch`, 1] as [string, number],
  })),
  { id: "ink_sac", ingredients: ["coal"], result: ["ink_sac", 1], note: "Minecraft gets ink sacs from squids (not modelled)" },
  { id: "book_and_quill", ingredients: ["book", "ink_sac", "feather"], result: ["book_and_quill", 1] },
  { id: "furnace", pattern: ["###", "# #", "###"], key: { "#": "cobblestone" }, result: ["furnace", 1] },
  { id: "oak_planks", ingredients: ["oak_log"], result: ["oak_planks", 4] },
  { id: "birch_planks", ingredients: ["birch_log"], result: ["birch_planks", 4] },
  { id: "crafting_table", pattern: ["##", "##"], key: { "#": "oak_planks" }, keyTags: { "#": "planks" }, result: ["crafting_table", 1] },
  { id: "bookshelf", pattern: ["###", "BBB", "###"], key: { "#": "oak_planks", B: "book" }, keyTags: { "#": "planks" }, result: ["bookshelf", 1], note: "Available Oak/Birch subset of the declared plank tag; other wood species remain unmodeled" },
  { id: "snow_block", pattern: ["##", "##"], key: { "#": "snowball" }, result: ["snow", 1] },
  ...LEGACY_DYE_RECIPES,
  // Official 2019 dye article teaches white wool + dye; exact current Education counts are unverified.
  ...DYE_COLORS.filter((c) => c.name !== "white").map(({ name }) => ({
    id: `${name}_wool`, ingredients: ["white_wool", `${name}_dye`], result: [`${name}_wool`, 1] as [string, number],
    note: "Provisional one white wool + one canonical dye -> one wool; current Education quantities/recoloring unverified",
  })),
  // Official Mojang samples 15701fa: eight clear glass around one matching dye -> eight.
  ...DYE_COLORS.map(({ name }) => ({
    id: `${name}_stained_glass`, pattern: ["GGG", "GDG", "GGG"], key: { G: "glass", D: `${name}_dye` },
    result: [`${name}_stained_glass`, 8] as [string, number],
  })),
  { id: "black_stained_glass_from_ink_sac", pattern: ["GGG", "GDG", "GGG"], key: { G: "glass", D: "ink_sac" }, result: ["black_stained_glass", 8] },
  // Journal page 8: the finished Lab Table bleach product whitens existing colored wool.
  ...BLOCKS.filter((b) => b.name.endsWith("_wool") && b.name !== "white_wool").map((b) => ({
    id: `bleach_${b.name}`, ingredients: ["bleach", b.name], result: ["white_wool", 1] as [string, number],
  })),
  // Redstone (Minecraft recipes).
  { id: "redstone_torch", pattern: ["R", "|"], key: { R: "redstone", "|": "stick" }, result: ["redstone_torch", 1] },
  { id: "lever", pattern: ["|", "#"], key: { "|": "stick", "#": "cobblestone" }, result: ["lever", 1] },
  { id: "stone_button", ingredients: ["stone"], result: ["stone_button", 1] },
  { id: "stone_pressure_plate", pattern: ["##"], key: { "#": "stone" }, result: ["stone_pressure_plate", 1] },
  { id: "redstone_lamp", pattern: [" R ", "RGR", " R "], key: { R: "redstone", G: "glowstone" }, result: ["redstone_lamp", 1] },
  { id: "repeater", pattern: ["TRT", "SSS"], key: { T: "redstone_torch", R: "redstone", S: "stone" }, result: ["repeater", 1] },
  { id: "wooden_door", pattern: ["##", "##", "##"], key: { "#": "oak_planks" }, result: ["wooden_door", 3] },
  { id: "iron_door", pattern: ["##", "##", "##"], key: { "#": "iron_ingot" }, result: ["iron_door", 3] },
  // Chemistry Lab Journal p9: six polyethylene, peroxide above dye, luminol below.
  { id: "glow_stick", pattern: ["PHP", "PDP", "PLP"],
    key: { P: "polyethylene", H: "hydrogen_peroxide", D: "green_dye", L: "luminol" }, result: ["glow_stick", 1],
    note: "Existing green item only; output count provisional, activation/lifetime/current Education behavior unverified" },
  // Replace the former gold-ore placeholder: candidate1.26.33.0 vanilla/1.20.10 agree on four dust.
  { id: "glowstone", pattern: ["##", "##"], key: { "#": "glowstone_dust" }, result: ["glowstone", 1] },
  // Journal p9 grid and retained color identities; output1 is provisional, not native count evidence.
  ...GLOW_STICK_COLORS.filter(({ color }) => color !== "green").map(({ itemName, dye }) => ({
    id: itemName, pattern: ["PHP", "PDP", "PLP"],
    key: { P: "polyethylene", H: "hydrogen_peroxide", D: dye, L: "luminol" }, result: [itemName, 1] as [string, number],
    note: "Color identity and Journal grid; output count provisional, activation/lifetime/current Education behavior unverified",
  })),
  // Education1.26.33 retained vanilla_1.21.40 recipe: four strings -> white wool.
  // Native JSON omits result count; output1 is the application default, not a measured native quantity.
  { id: "string_to_wool", pattern: ["##", "##"], key: { "#": "string" }, result: ["white_wool", 1],
    note: "Four-cell shape and canonical white from retained Education recipe; output1 application default" },
  // Retained Education1.26.33 vanilla_1.21.40: four oak planks, two sticks -> three oak fences.
  { id: "oak_fence", pattern: ["W#W", "W#W"], key: { W: "oak_planks", "#": "stick" }, result: ["oak_fence", 3] },
  // Explicit modern variant: retained vanilla_1.21.90 uses five strings, output2.
  // Older retained variants require four strings plus slime; active pack selection remains unverified.
  { id: "lead", pattern: ["~~ ", "~~ ", "  ~"], key: { "~": "string" }, result: ["lead_rope", 2],
    note: "Selected retained modern five-string variant; older slime recipe differs, active native binding unverified" },
  ...BALLOON_COLORS.map(({ itemName, dye }): Recipe => ({
    id: itemName, pattern: ["LDL", "LHL", "LRL"],
    key: { L: "latex", D: dye, H: "helium", R: "lead_rope" }, result: [itemName, 1],
    note: "Journal pattern; output1 and canonical helium-4 only are application choices; native isotope acceptance unverified",
  })),
  ...SPARKLER_COLORS.map(({ itemName, compound }): Recipe => ({
    id: itemName, pattern: ["C", "M", "S"], key: { C: compound, M: "magnesium", S: "stick" }, result: [itemName, 1],
    note: "Journal vertical chloride/magnesium/stick shape; output1 is an application choice",
  })),
  // Retained candidate Education1.26.33 vanilla glass_bottle recipe: three-glass V -> three bottles.
  { id: "glass_bottle", pattern: ["G G", " G "], key: { G: "glass" }, result: ["glass_bottle", 3] },
  // Retained Education bucket recipe: three iron ingots in a width-three V.
  { id: "bucket", pattern: ["I I", " I "], key: { I: "iron_ingot" }, result: ["bucket", 1] },
  { id: "flint_and_steel", ingredients: ["iron_ingot", "flint"], result: ["flint_and_steel", 1] },
  // Retained Education1.26.33.0 text declarations; actual station semantics remain this app's.
  { id: "nether_bricks", pattern: ["##", "##"], key: {"#":"nether_brick"}, result: ["nether_bricks",1] },
  { id: "blaze_powder", ingredients: ["blaze_rod"], result: ["blaze_powder",2] },
  { id:"brewing_stand",pattern:[" R ","CCC"],key:{R:"blaze_rod",C:"cobblestone"},result:["brewing_stand",1],note:"Available cobblestone declaration subset; effective native stone tag membership remains unverified" },
  {id:'chest',pattern:['###','# #','###'],key:{'#':'oak_planks'},keyTags:{'#':'planks'},result:['chest',1]},
  {id:'paper',pattern:['###'],key:{'#':'sugar_cane'},result:['paper',3]},
  {id:'book',ingredients:['paper','paper','paper','leather'],result:['book',1]},
  // Four shapes/material counts declared in Education 1.26.33's recipe files.
  ...armorRecipes("leather", "leather"),
  // Education1.26.33 declares one reeds input -> one Sugar; reuse the existing Sugar owner.
  { id: "sugar_from_cane", pattern: ["#"], key: { "#": "sugar_cane" }, result: ["sugar", 1] },
  // Retained Education 1.26.33.0 ordinary block compression and reverse declarations.
  ...METAL_STORAGE_BLOCKS.flatMap(({ name, material }): Recipe[] => [
    { id: name, pattern: ["###", "###", "###"], key: { "#": material }, result: [name, 1] },
    { id: `${material}_from_block`, pattern: ["#"], key: { "#": name }, result: [material, 9] },
  ]),
  // Retained native one-ingot/nine-nugget reversible declaration shapes.
  ...METAL_NUGGETS.flatMap(({ name, ingot }): Recipe[] => [
    { id: name, pattern: ["#"], key: { "#": ingot }, result: [name, 9] },
    { id: `${ingot}_from_nuggets`, pattern: ["###", "###", "###"], key: { "#": name }, result: [ingot, 1] },
  ]),
  {id:'hay_block',pattern:['###','###','###'],key:{'#':'wheat'},result:['hay_block',1]},
  {id:'wheat_from_hay_block',pattern:['#'],key:{'#':'hay_block'},result:['wheat',9]},
  // Cached Education1.26.33 client declares Bone -> legacy dye15 x3 and dye15 -> white dye19.
  // This app uses distinct item identities; 2x2 availability follows its shapeless matcher policy.
  { id: "bone_meal_from_bone", ingredients: ["bone"], result: ["bone_meal", 3] },
  WHITE_DYE_FROM_BONE_MEAL,
  ...BONE_MEAL_DYE_RECIPES,
  {id:"oak_wooden_slab",pattern:["###"],key:{"#":"oak_planks"},result:["oak_slab",6]},
  {id:"birch_wooden_slab",pattern:["###"],key:{"#":"birch_planks"},result:["birch_slab",6]},
  {id:"composter",pattern:["# #","# #","###"],key:{"#":"oak_slab"},keyTags:{"#":"wooden_slabs"},result:["composter",1]},
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

const plankTagIds = new Set([stackId("oak_planks"), stackId("birch_planks")]);

function shapedMatches(recipe: Recipe, cells: number[][]): boolean {
  const pattern = recipe.pattern!;
  if (pattern.length !== cells.length || pattern[0].length !== cells[0].length) return false;
  const accepts = (ch: string, id: number) => ch === " " ? id === 0
    : recipe.keyTags?.[ch] === "planks" ? plankTagIds.has(id) : recipe.keyTags?.[ch] === "wooden_slabs" ? id===211||id===214 : stackId(recipe.key![ch]) === id;
  const direct = pattern.every((row, r) => [...row].every((ch, c) => accepts(ch, cells[r][c])));
  const mirrored = pattern.every((row, r) => [...row].every((ch, c) => accepts(ch, cells[r][row.length - 1 - c])));
  return direct || mirrored;
}

function shapelessMatches(recipe: Recipe, grid: CraftingGrid): boolean {
  const have = grid.filter((s): s is ItemStack => s !== null).map((s) => s.id).sort((a, b) => a - b);
  const need = recipe.ingredients!.map(stackId).sort((a, b) => a - b);
  return have.length === need.length && have.every((id, i) => id === need[i]);
}

/** Finds the recipe matching a 2x2 (width 2) or 3x3 (width 3) grid. */
export function matchRecipe(grid: CraftingGrid, width: number): { recipe: Recipe; result: ItemStack } | null {
  // Matching is also the UI's ownership preview: invalid sources cannot promise an output
  // that craftOnce must later refuse (or synthesize output from zero/over-limit counts).
  for (const stack of grid) if (stack !== null && (!stack || !isKnownId(stack.id) || !Number.isSafeInteger(stack.count)
    || stack.count < 1 || stack.count > stackLimit(stack) || inspectItemState(stack).kind === "invalid" || !hasCloneableBookMetadata(stack))) return null;
  const cells = trim(grid, width);
  if (cells.length === 0) return null;
  for (const recipe of RECIPES) {
    const ok = recipe.pattern ? shapedMatches(recipe, cells) : shapelessMatches(recipe, grid);
    if (ok) return { recipe, result: freshStack(stackId(recipe.result[0]), recipe.result[1]) };
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
