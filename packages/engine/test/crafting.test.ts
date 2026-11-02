import { describe, expect, it } from "vitest";
import { RECIPES, blockId, craftOnce, matchRecipe, type CraftingGrid } from "../src";

const s = (name: string, count = 1) => ({ id: blockId(name), count });

describe("crafting", () => {
  it("every recipe refers to known blocks", () => {
    for (const r of RECIPES) {
      expect(() => blockId(r.result[0])).not.toThrow();
      for (const name of [...(r.ingredients ?? []), ...Object.values(r.key ?? {})]) expect(() => blockId(name)).not.toThrow();
    }
  });

  it("crafts planks from a log in any cell (shapeless)", () => {
    const grid: CraftingGrid = [null, null, null, s("oak_log", 2)];
    expect(matchRecipe(grid, 2)?.result).toEqual({ id: blockId("oak_planks"), count: 4 });
    expect(craftOnce(grid, 2)).toEqual({ id: blockId("oak_planks"), count: 4 });
    expect(grid[3]).toEqual(s("oak_log", 1));
    craftOnce(grid, 2);
    expect(grid[3]).toBeNull();
    expect(craftOnce(grid, 2)).toBeNull();
  });

  it("crafts a crafting table from 2x2 planks, anywhere in a 3x3 grid", () => {
    const p = () => s("oak_planks");
    expect(matchRecipe([p(), p(), p(), p()], 2)?.recipe.id).toBe("crafting_table");
    const big: CraftingGrid = [null, null, null, null, p(), p(), null, p(), p()];
    expect(matchRecipe(big, 3)?.recipe.id).toBe("crafting_table");
    expect(matchRecipe([p(), p(), p(), null], 2)).toBeNull();
  });

  it("needs a 3x3 grid for the bookshelf", () => {
    const p = () => s("oak_planks");
    const l = () => s("oak_log");
    expect(matchRecipe([p(), p(), p(), l(), l(), l(), p(), p(), p()], 3)?.result.id).toBe(blockId("bookshelf"));
  });

  it("dyes wool with flowers", () => {
    expect(matchRecipe([s("white_wool"), null, null, s("poppy")], 2)?.result.id).toBe(blockId("red_wool"));
    expect(matchRecipe([s("dandelion"), s("white_wool"), null, null], 2)?.result.id).toBe(blockId("yellow_wool"));
    expect(matchRecipe([s("dandelion"), s("dandelion"), null, null], 2)).toBeNull();
  });
});
