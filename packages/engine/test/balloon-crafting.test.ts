import { withLegacyBirchRecipes } from "./helpers/legacy-birch-recipes";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BLOCKS, ITEMS, RECIPES, MOB_SPECS, stackId, maxStackOf, craftOnce, matchRecipe, type CraftingGrid } from "../src/index";
import { BALLOON_COLORS, balloonColorOf } from "../src/catalog/balloon-colors";
import baseline from "./fixtures/balloon-baseline-ebab.json";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");
const grid = (dye: string, count = 2): CraftingGrid => ["latex", dye, "latex", "latex", "helium", "latex", "latex", "lead_rope", "latex"].map(name => ({ id: stackId(name), count }));
it("appends sixteen immutable flat color products without changing any old definition or recipe", () => {
  const oldMobSpecs = Object.fromEntries(Object.entries(MOB_SPECS).filter(([kind]) => ["pig", "sheep", "chicken", "npc", "zombie", "spider"].includes(kind)));
  expect([ITEMS.length, BLOCKS.length, RECIPES.length, Object.keys(oldMobSpecs).length]).toEqual([600, 324, 179, 6]);
  expect(RECIPES.slice(170, 171)).toMatchObject([{ id: "brewing_stand", pattern: [" R ", "CCC"], key: { R: "blaze_rod", C: "cobblestone" }, result: ["brewing_stand", 1] }]);
  expect(digest(ITEMS.slice(0, 552))).toBe(baseline.itemDefsSHA256);
  expect(digest(BLOCKS.slice(0,308))).toBe(baseline.blockDefsSHA256); expect(digest(withLegacyBirchRecipes(RECIPES.slice(0, 144)))).toBe(baseline.recipesSHA256);
  expect(digest(oldMobSpecs)).toBe(baseline.mobSpecsSHA256);
  expect(ITEMS.slice(0, 552).map(i => [i.id, i.name])).toEqual(baseline.itemIDs);
  expect(Object.isFrozen(BALLOON_COLORS)).toBe(true);
  for (const [i, color] of BALLOON_COLORS.entries()) {
    expect(Object.isFrozen(color)).toBe(true); expect(stackId(color.itemName)).toBe(808 + i);
    expect(color.itemId).toBe(808 + i); expect(balloonColorOf(color.itemId)).toBe(color); expect(maxStackOf(color.itemId)).toBe(64);
  }
  for (const id of [0, 484, 807, 824, NaN, Infinity, 808.5]) expect(balloonColorOf(id)).toBeUndefined();
});
it("uses all nine cells and consumes six latex, matching dye, canonical helium and one rope exactly once for every color", () => {
  expect(stackId("lead_rope")).toBe(807); expect(stackId("lead")).toBe(484);
  for (const color of BALLOON_COLORS) {
    const cells = grid(color.dye), before = structuredClone(cells);
    expect(matchRecipe(cells, 3)?.recipe.id).toBe(color.itemName); expect(cells).toEqual(before);
    expect(craftOnce(cells, 3)).toEqual({ id: color.itemId, count: 1 });
    expect(cells).toEqual(before.map(s => s && { ...s, count: 1 }));
    expect(craftOnce(cells, 3)).toEqual({ id: color.itemId, count: 1 }); expect(cells).toEqual(Array(9).fill(null));
  }
});
it("rejects chemical Pb, wrong helium/isotope, missing or displaced cells without consuming anything", () => {
  for (const [index, ingredient] of [[7, "lead"], [4, "hydrogen"], [4, "helium_3"], [1, "ink_sac"]] as const) {
    const cells = grid("red_dye"); cells[index] = { id: stackId(ingredient), count: 2 };
    const before = structuredClone(cells); expect(craftOnce(cells, 3)).toBeNull(); expect(cells).toEqual(before);
  }
  for (let missing = 0; missing < 9; missing++) {
    const cells = grid("red_dye"); cells[missing] = null; const before = structuredClone(cells);
    expect(craftOnce(cells, 3)).toBeNull(); expect(cells).toEqual(before);
  }
  const shifted = grid("red_dye"); [shifted[1], shifted[4]] = [shifted[4], shifted[1]];
  const before = structuredClone(shifted); expect(craftOnce(shifted, 3)).toBeNull(); expect(shifted).toEqual(before);
  expect(matchRecipe(grid("blue_dye"), 3)?.result.id).toBe(stackId("blue_balloon"));
  expect(matchRecipe(grid("blue_dye"), 3)?.result.id).not.toBe(stackId("red_balloon"));
  expect(craftOnce(grid("red_dye").slice(0, 4), 2)).toBeNull();
});
