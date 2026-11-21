import { withLegacyStationFaces } from "./helpers/legacy-station-faces";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ITEMS, BLOCKS, RECIPES, craftOnce, matchRecipe, maxStackOf, placedBlockOf, itemById, stackId, type CraftingGrid } from "../src/index";
const baseline = JSON.parse(readFileSync(new URL("./fixtures/leash-baseline.json", import.meta.url), "utf8"));
const facts = JSON.parse(readFileSync(new URL("./fixtures/lead-source-facts.json", import.meta.url), "utf8"));
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v) + "\n").digest("hex");
const st = (name = "string", count = 1) => ({ id: stackId(name), count });
const shape = (mirror = false, count = 1): CraftingGrid => Array.from({ length: 9 }, (_, i) => (mirror ? [1, 2, 4, 5, 6] : [0, 1, 3, 4, 8]).includes(i) ? st("string", count) : null);
it("pins the explicit modern recipe while retaining the conflicting older slime variant as evidence", () => {
  const modern = facts.sources.at(-1);
  expect(modern.path).toBe("behavior_packs/vanilla_1.21.90/recipes/lead.json");
  expect(modern.sha256).toBe("06a433a59d4487f9f6b32b5838d50ab4484736f6f401a22b8c3917ae80e80634");
  expect(modern.manifestMatches).toBe(true); expect(modern.pattern).toEqual(["~~ ", "~~ ", "  ~"]);
  expect(modern.key).toEqual({ "~": { item: "minecraft:string" } }); expect(modern.resultLiteral).toEqual({ item: "minecraft:lead", count: 2 });
  expect(facts.sources.slice(0, 2).every((r: { key: { O: { item: string } } }) => r.key.O.item === "minecraft:slime_ball")).toBe(true);
});
it("appends Lead807 and one recipe without changing published item/block/recipe identities", () => {
  expect([ITEMS.slice(0, 552).length, BLOCKS.length, RECIPES.slice(0, 144).length]).toEqual([552, 309, 144]);
  expect(digest(ITEMS.slice(0, 551))).toBe(baseline.itemDefsSHA256); expect(digest(withLegacyStationFaces(BLOCKS.slice(0,308)))).toBe(baseline.blockDefsSHA256);
  expect(digest(RECIPES.slice(0, 143))).toBe(baseline.recipesSHA256); expect(ITEMS.slice(0, 551).map(i => [i.id, i.name])).toEqual(baseline.itemIDs);
  for (const [id, name] of baseline.itemIDs as [number, string][]) expect(stackId(name)).toBe(id);
  expect(stackId("lead_rope")).toBe(807); expect(stackId("lead")).toBe(484); expect(itemById(484).chem).toMatchObject({ kind: "element", z: 82 }); expect(new Set(ITEMS.slice(0, 552).map(i => i.name)).size).toBe(552); expect(maxStackOf(807)).toBe(64); expect(placedBlockOf(807)).toBeNull(); expect(ITEMS[551]?.icon).toBe("item_lead");
});
it("consumes exactly five cell units for two Leads in either supported mirror", () => {
  for (const mirror of [false, true]) {
    const grid = shape(mirror, 2), copy = structuredClone(grid); expect(matchRecipe(grid, 3)?.recipe.id).toBe("lead"); expect(grid).toEqual(copy);
    expect(craftOnce(grid, 3)).toEqual(st("lead_rope", 2)); expect(grid).toEqual(shape(mirror));
    expect(craftOnce(grid, 3)).toEqual(st("lead_rope", 2)); expect(grid).toEqual(Array(9).fill(null));
  }
});
it("refuses incomplete, extra, wrong-class and consolidated stacks without consuming a valid Lead input", () => {
  const cases: CraftingGrid[] = [
    ...[0, 1, 3, 4].map(missing => { const grid = shape(); grid[missing] = null; return grid; }),
    ...["feather", "oak_planks", "lead", "lead_rope"].map(name => { const grid = shape(); grid[4] = st(name); return grid; }),
    [st("string", 5), null, null, null, null, null, null, null, null],
    (() => { const grid = shape(); grid[2] = st(); return grid; })(),
  ];
  for (const grid of cases) { const copy = structuredClone(grid); expect(craftOnce(grid, 3)).toBeNull(); expect(grid).toEqual(copy); }
  // Four strings in a square are legitimately wool, not an invalid empty preview or a Lead.
  const compact = Array.from({ length: 4 }, () => st()); expect(matchRecipe(compact, 2)?.recipe.id).toBe("string_to_wool");
  const withoutTail = shape(); withoutTail[8] = null; expect(matchRecipe(withoutTail, 3)?.result).toEqual(st("white_wool"));
});
