import { withLegacyStationFaces } from "./helpers/legacy-station-faces";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ITEMS, BLOCKS, RECIPES, craftOnce, matchRecipe, stackId, maxStackOf, sanitizeStack, type CraftingGrid } from "../src";
const before = JSON.parse(readFileSync(new URL("./fixtures/spider-string-baseline.json", import.meta.url), "utf8"));
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");
const string = (count = 1) => ({ id: stackId("string"), count });

it("appends string and its wool recipe while preserving every published item, block and recipe", () => {
  expect([ITEMS.slice(0, 551).length, BLOCKS.slice(0, 307).length, RECIPES.slice(0, 142).length]).toEqual([551, 307, 142]);
  expect(digest(ITEMS.slice(0, 550))).toBe(before.itemDefsSHA256);
  expect(digest(withLegacyStationFaces(BLOCKS.slice(0, 307)))).toBe(before.blockDefsSHA256);
  expect(digest(RECIPES.slice(0, 141))).toBe(before.recipesSHA256);
  expect(ITEMS.slice(0, 550).map(i => [i.id, i.name])).toEqual(before.itemIDs);
  expect(RECIPES.slice(0, 141).map(r => r.id)).toEqual(before.recipeIDs);
  expect(stackId("string")).toBe(806); expect(maxStackOf(806)).toBe(64);
  expect(sanitizeStack(string(64))).toEqual(string(64));
  expect(ITEMS.slice(0, 551).at(-1)?.icon).toBe("item_string");
});

it("crafts white wool in either supported grid from four occupied string cells, consuming once per cell", () => {
  for (const width of [2, 3]) for (let row = 0; row <= width - 2; row++) for (let col = 0; col <= width - 2; col++) {
    const cells: CraftingGrid = Array(width * width).fill(null);
    const indices = [row * width + col, row * width + col + 1, (row + 1) * width + col, (row + 1) * width + col + 1];
    for (const i of indices) cells[i] = string(2);
    const original = structuredClone(cells);
    expect(matchRecipe(cells, width)?.recipe.id).toBe("string_to_wool"); expect(cells).toEqual(original);
    expect(craftOnce(cells, width)).toEqual({ id: stackId("white_wool"), count: 1 });
    for (const i of indices) expect(cells[i]).toEqual(string());
    expect(craftOnce(cells, width)).toEqual({ id: stackId("white_wool"), count: 1 });
    expect(cells).toEqual(Array(width * width).fill(null));
  }
});

it("refuses missing cells, a single stack of four, foreign contents and extra occupied cells without consumption", () => {
  const cases: CraftingGrid[] = [
    [string(4), null, null, null],
    ...[0, 1, 2, 3].map(missing => Array.from({ length: 4 }, (_, i) => i === missing ? null : string())),
    [string(), string(), string(), { id: stackId("feather"), count: 1 }],
    [string(), string(), string(), string(), string(), null, null, null, null],
  ];
  for (const cells of cases) { const original = structuredClone(cells); expect(craftOnce(cells, cells.length === 4 ? 2 : 3)).toBeNull(); expect(cells).toEqual(original); }
});
