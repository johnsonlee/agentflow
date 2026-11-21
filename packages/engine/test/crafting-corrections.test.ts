import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  BLOCKS, ITEMS, RECIPES, SMELTING_RECIPES, FUELS, SMELT_SECONDS, Inventory,
  craftOnce, matchRecipe, createFurnace, tickFurnace, smeltResult, stackId, parseSave, serializeSave,
  type CraftingGrid, type FurnaceState,
} from "../src";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/crafting-corrections-1.26.33.json", import.meta.url), "utf8"));
const baseline = JSON.parse(readFileSync(new URL("./fixtures/native-reductions-registry-ca64.json", import.meta.url), "utf8"));
const stack = (name: string, count = 1) => ({ id: stackId(name), count });
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v) + "\n").digest("hex");
const shelf = (count = 1): CraftingGrid => ["oak_planks", "oak_planks", "oak_planks", "book", "book", "book", "oak_planks", "oak_planks", "oak_planks"].map((name) => stack(name, count));
function roundTrip(f: FurnaceState): FurnaceState {
  return parseSave(serializeSave({ name: "ore furnace", seed: 1, mode: "survival", timeOfDay: .3,
    player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [],
    furnaces: [{ x: 1, y: 60, z: 1, state: f }],
  })).furnaces![0].state;
}

it("preserves prior registry prefixes, other125 recipes (snow is checked separately), old9 smelts and all fuels", () => {
  expect(BLOCKS).toHaveLength(307); expect(ITEMS.slice(0, 535)).toHaveLength(535);
  expect(digest(BLOCKS)).toBe(baseline.allBlockDefsSHA256); expect(digest(ITEMS.slice(0, 535))).toBe(baseline.allItemDefsSHA256);
  expect(RECIPES.slice(0, 128)).toHaveLength(128);
  expect(RECIPES.slice(0, 128).filter((r) => r.id !== "bookshelf" && r.id !== "glowstone" && r.id !== "snow_block")).toEqual(fixture.unchangedRecipes.filter((r: { id: string }) => r.id !== "glowstone" && r.id !== "snow_block"));
  expect(Object.keys(SMELTING_RECIPES)).toHaveLength(11);
  for (const [input, output] of Object.entries(fixture.previousSmelting)) expect(SMELTING_RECIPES[input]).toBe(output);
  expect(FUELS).toEqual(fixture.previousFuels); expect(SMELT_SECONDS).toBe(10);
});

it("matches five source-pinned factual transforms without registering broader tag membership", () => {
  expect(fixture.candidateVersion).toBe("1.26.33.0"); expect(fixture.acceptedTarget).toBe(false);
  expect(fixture.cases).toHaveLength(5);
  for (const row of fixture.cases) {
    expect(row.source.sha256).toMatch(/^[a-f0-9]{64}$/); expect(row.source.bytes).toBeGreaterThan(0);
    if (row.pattern) {
      const grid = row.pattern.flatMap((line: string) => [...line].map((key: string) => stack(row.key[key])));
      expect(matchRecipe(grid, 3)?.result).toEqual(stack(row.output[0][0], row.output[0][1]));
      expect(grid.filter((s: { id: number }) => s.id === stackId("book"))).toHaveLength(3);
      expect(grid.filter((s: { id: number }) => s.id === stackId("oak_planks"))).toHaveLength(6);
    } else {
      expect(row.stationTags).toContain("furnace"); expect(row.output[0][1]).toBe(1);
      expect(smeltResult(stackId(row.input))).toBe(stackId(row.output[0][0]));
    }
  }
});

it("consumes exactly six planks and three books per shelf, preserving all remaining stacked ingredients", () => {
  const grid = shelf(2);
  expect(craftOnce(grid, 3)).toEqual(stack("bookshelf")); expect(grid).toEqual(shelf());
  expect(craftOnce(grid, 3)).toEqual(stack("bookshelf")); expect(grid).toEqual(Array(9).fill(null));
  expect(craftOnce(grid, 3)).toBeNull();
});

it("refuses logs, missing/extra ingredients, wrong layout and2x2 without consumption", () => {
  const logs = shelf(); for (const i of [3, 4, 5]) logs[i] = stack("oak_log");
  const missing = shelf(); missing[4] = null;
  const extra = shelf(); extra[4] = stack("book_and_quill");
  const wrong = shelf(); [wrong[0], wrong[3]] = [wrong[3], wrong[0]];
  const small = [stack("oak_planks"), stack("book"), stack("book"), stack("oak_planks")];
  for (const [grid, width] of [[logs, 3], [missing, 3], [extra, 3], [wrong, 3], [small, 2]] as [CraftingGrid, number][]) {
    const before = structuredClone(grid); expect(craftOnce(grid, width)).toBeNull(); expect(grid).toEqual(before);
  }
  // Counts within a cell may exceed one; they are legitimate stacked inputs, not extra recipe cells.
});

it.each([["coal_ore", "coal"], ["diamond_ore", "diamond"]])("smelts%s one-for-one at inherited10s, carrying fuel and saved progress", (input, output) => {
  let f = createFurnace(); f.input = stack(input, 2); f.fuel = stack("oak_planks", 2);
  tickFurnace(f, 9.75); expect(f.output).toBeNull(); expect(f.input).toEqual(stack(input, 2));
  expect(f.fuel).toEqual(stack("oak_planks")); expect(f.burnLeft).toBeCloseTo(5.25);
  f = roundTrip(f); expect(f.progress).toBeCloseTo(.975);
  tickFurnace(f, .25); expect(f.output).toEqual(stack(output)); expect(f.input).toEqual(stack(input)); expect(f.burnLeft).toBeCloseTo(5);
  tickFurnace(f, 10); expect(f.output).toEqual(stack(output, 2)); expect(f.input).toBeNull();
  expect(f.fuel).toBeNull(); expect(f.burnLeft).toBeCloseTo(10);
  expect(roundTrip(f)).toEqual(f);
});

it.each([["coal_ore", "coal"], ["diamond_ore", "diamond"]])("blocks%s with full or wrong output, preserves fuel/input and resumes after collection", (input, output) => {
  for (const blocked of [stack(output, 64), stack("stone")]) {
    let f = createFurnace(); f.input = stack(input, 2); f.fuel = stack("oak_planks"); f.output = blocked;
    const before = structuredClone(f); tickFurnace(f, 30); expect(f).toEqual(before);
    f = roundTrip(f); f.output = stack(output, 63); tickFurnace(f, 10);
    expect(f.output).toEqual(stack(output, 64)); expect(f.input).toEqual(stack(input)); expect(f.burnLeft).toBeCloseTo(5);
    tickFurnace(f, 1); expect(f.input).toEqual(stack(input)); expect(f.progress).toBe(0);
    f.output = null; tickFurnace(f, 4); expect(f.progress).toBeCloseTo(.4); expect(f.output).toBeNull();
  }
});

it("changes between ore recipes without converting an incompatible existing output and refuses invalid inputs", () => {
  const f = createFurnace(); f.input = stack("coal_ore"); f.fuel = stack("oak_planks", 2);
  tickFurnace(f, 10); expect(f.output).toEqual(stack("coal"));
  f.input = stack("diamond_ore"); tickFurnace(f, 2); expect(f.output).toEqual(stack("coal")); expect(f.input).toEqual(stack("diamond_ore")); expect(f.progress).toBe(0);
  f.output = null; tickFurnace(f, 10); expect(f.output).toEqual(stack("diamond")); expect(f.input).toBeNull();
  for (const id of [stackId("dirt"), -1, .5, NaN, Infinity, 65535]) {
    expect(smeltResult(id)).toBeNull(); const bad = createFurnace(); bad.input = { id, count: 1 }; bad.fuel = stack("coal");
    const before = structuredClone(bad); tickFurnace(bad, 20); expect(bad).toEqual(before);
  }
});
