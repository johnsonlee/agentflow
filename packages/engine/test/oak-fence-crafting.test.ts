import { withLegacyStationFaces } from "./helpers/legacy-station-faces";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BLOCKS, ITEMS, RECIPES, blockById, blockId, craftOnce, matchRecipe, stackId, type CraftingGrid } from "../src/index";
const before = JSON.parse(readFileSync(new URL("./fixtures/oak-fence-baseline.json", import.meta.url), "utf8"));
const facts = JSON.parse(readFileSync(new URL("./fixtures/oak-fence-source-facts.json", import.meta.url), "utf8"));
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v) + "\n").digest("hex");
const st = (name: string, count = 1) => ({ id: stackId(name), count });
const inputs = ["oak_planks", "stick", "oak_planks", "oak_planks", "stick", "oak_planks"];
it("pins the retained canonical oak recipe and explicit output count while keeping geometry unverified", () => {
  expect(facts.installer.sha256).toBe("80bb151b1db4e46edc503230bc8ece25210fff94b7d73d6774559a054398a91e");
  expect(facts.sources).toHaveLength(3);
  expect(facts.sources.map((r: { sha256: string }) => r.sha256)).toEqual([
    "d2834393c26c7a5e184fe4fa494bbe2ee294b8f88bb08ac3f6b91fa95b583845",
    "e560d72c6b5fd71fc03243511b0bc484f99ce5a27f021ef395744094696c4004",
    "b97c710db9dc4a95a43364c2da352e0ca046f848f50bfa38dc831db1064bac67",
  ]);
  for (const row of facts.sources) { expect(row.manifestMatches).toBe(true); expect(row.pattern).toEqual(["W#W", "W#W"]); expect(row.countLiteral).toBe(3); }
  const canonical = facts.sources.at(-1);
  expect(canonical.key).toEqual({ "#": { item: "minecraft:stick" }, W: { item: "minecraft:oak_planks" } });
  expect(canonical.resultLiteral).toEqual({ item: "minecraft:oak_fence", count: 3 });
});
it("adds one explicit unused low-block identity without changing published definitions or recipes", () => {
  expect([ITEMS.slice(0, 551).length, BLOCKS.slice(0, 308).length, RECIPES.slice(0, 143).length]).toEqual([551, 308, 143]);
  expect(digest(ITEMS.slice(0, 551))).toBe(before.itemDefsSHA256); expect(digest(withLegacyStationFaces(BLOCKS.slice(0, 307)))).toBe(before.blockDefsSHA256);
  expect(digest(RECIPES.slice(0, 142))).toBe(before.recipesSHA256);
  expect(BLOCKS.slice(0, 307).map(b => [b.id, b.name])).toEqual(before.blockIDs);
  expect(blockId("oak_fence")).toBe(188); expect(BLOCKS.at(-1)?.name).toBe("oak_fence");
  expect(blockById(188)).toMatchObject({ solid: true, transparent: true, shape: "fence", faces: { top: "oak_planks", side: "oak_planks", bottom: "oak_planks" } });
  expect(new Set(BLOCKS.map(b => b.id)).size).toBe(308); expect(new Set(RECIPES.slice(0, 143).map(r => r.id)).size).toBe(143);
});
it("crafts the retained six-cell oak recipe in either row position and consumes four planks and two sticks once", () => {
  for (const offset of [0, 3]) {
    const cells: CraftingGrid = Array(9).fill(null); for (let i = 0; i < 6; i++) cells[i + offset] = st(inputs[i], 2);
    const copy = structuredClone(cells); expect(matchRecipe(cells, 3)?.recipe.id).toBe("oak_fence"); expect(cells).toEqual(copy);
    expect(craftOnce(cells, 3)).toEqual(st("oak_fence", 3)); for (let i = 0; i < 6; i++) expect(cells[i + offset]).toEqual(st(inputs[i]));
    expect(craftOnce(cells, 3)).toEqual(st("oak_fence", 3)); expect(cells).toEqual(Array(9).fill(null));
  }
});
it("refuses missing cells, wrong classes, an extra occupied cell and a compact grid without consuming", () => {
  const valid = () => [...inputs.map(n => st(n)), null, null, null] as CraftingGrid;
  const cases: CraftingGrid[] = [
    ...inputs.map((_, missing) => { const cells = valid(); cells[missing] = null; return cells; }),
    ...["birch_log", "oak_log", "stone"].map(name => { const cells = valid(); cells[0] = st(name); return cells; }),
    [...inputs.map(n => st(n)), st("stick"), null, null],
    [st("oak_planks"), st("stick"), st("oak_planks"), st("stick")],
  ];
  for (const cells of cases) { const copy = structuredClone(cells); expect(craftOnce(cells, cells.length === 4 ? 2 : 3)).toBeNull(); expect(cells).toEqual(copy); }
});
