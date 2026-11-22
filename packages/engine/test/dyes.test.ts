import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, DYE_COLORS, DYE_RECIPES, ITEMS, Inventory, World, blockById, blockId, breakBlock,
  craftOnce, createAgent, elementBlockId, giveAgent, isItem, isKnownBlockId, itemById, matchRecipe,
  parseSave, placeBlock, runAgentCommand, sanitizeAgent, sanitizeEdits, sanitizeInventoryPending,
  sanitizeStack, serializeSave, stackId, type CraftingGrid, type ItemStack,
} from "../src/index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const colors = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const newWools = ["magenta", "light_blue", "pink", "gray", "light_gray", "cyan", "brown", "green"];
const source = JSON.parse(readFileSync(new URL("./fixtures/dye-source-recipes.json", import.meta.url), "utf8")) as {
  revision: string; recipes: { file: string; type: string; inputs: { name: string; count: number }[]; result: { name: string; count: number } }[];
};

it("preserves every prior block/item/atom identity and appends dyes and explicit low wool IDs", () => {
  expect(hash(BLOCKS.slice(0, 283).map(({ id, name }) => [id, name]))).toBe("92c0bd071a363ff7b25a136222265510203ebfc1fd6518942cb3788a9e23e4c7");
  expect(hash(ITEMS.slice(0, 519).map(({ id, name }) => [id, name]))).toBe("c7c43e88c216c30259536783a583814edc6f93126bf4aa6397f024a33cce5ba7");
  expect(hash(ITEMS.filter((i) => i.chem?.kind === "element" || i.chem?.kind === "isotope").map((i) => [i.id, i.chem!.kind, i.chem!.z, i.chem!.symbol, i.chem!.mass])))
    .toBe("54ba81669824eb6b526e76e1fff7f979ed42b273faed2f99b71012c5d34be270");
  expect(BLOCKS.slice(0, 291)).toHaveLength(291); expect(ITEMS.slice(0, 535)).toHaveLength(535);
  expect(DYE_COLORS.map((c) => c.name)).toEqual(colors);
  expect(new Set(DYE_COLORS.map((c) => c.rgb.join(","))).size).toBe(16);
  for (const [i, color] of DYE_COLORS.entries()) {
    const dye = itemById(775 + i); expect(dye.name).toBe(`${color.name}_dye`); expect(dye.icon).toBe(`item_${color.name}_dye`);
    expect(dye.maxStack).toBe(64); expect(dye.chem).toBeUndefined();
    expect(color.rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
    expect(blockById(blockId(`${color.name}_wool`)).faces.side).toBe(`${color.name}_wool`);
  }
  expect(BLOCKS.slice(283, 291).map((b) => [b.id, b.name])).toEqual(newWools.map((c, i) => [164 + i, `${c}_wool`]));
  expect(blockId("element_118")).toBe(32886); expect(isKnownBlockId(201)).toBe(false); expect(isItem(164)).toBe(false);
});

it("matches all 17 available-input primary-source recipes with exact output counts in arbitrary cells", () => {
  expect(source.revision).toBe("15701fa9c13923f12662984c32c124327e40e3d3"); expect(source.recipes).toHaveLength(62);
  const available = source.recipes.filter((r) => r.inputs.every((input) => { try { stackId(input.name); return true; } catch { return false; } }));
  expect(available).toHaveLength(17); expect(DYE_RECIPES).toHaveLength(17);
  expect(new Set(DYE_RECIPES.map((r) => r.id))).toEqual(new Set(available.map((r) => r.file.replace(/\.json$/, ""))));
  for (const recipe of available) for (const width of [2, 3]) {
    expect(recipe.type).toBe("minecraft:recipe_shapeless");
    const ingredients = recipe.inputs.flatMap((i) => Array.from({ length: i.count }, () => i.name));
    const grid: CraftingGrid = new Array(width * width).fill(null);
    ingredients.forEach((name, i) => { grid[grid.length - 1 - i] = stack(name, 3); });
    const before = structuredClone(grid);
    expect(craftOnce(grid, width), recipe.file).toEqual(stack(recipe.result.name, recipe.result.count));
    for (let i = 0; i < grid.length; i++) expect(grid[i]).toEqual(before[i] ? { ...before[i]!, count: 2 } : null);
    const extra = structuredClone(before);
    // In a full 2x2 recipe, replace an input rather than fabricating a fifth slot.
    const empty = extra.findIndex((s) => s === null); extra[empty < 0 ? 0 : empty] = stack("stone");
    const snapshot = structuredClone(extra); expect(craftOnce(extra, width)).toBeNull(); expect(extra).toEqual(snapshot);
  }
});

it("requires repeated mix ingredients in separate occupied cells and never treats raw ink as every dye", () => {
  // One black + two white cells yields three; a single white stack still only supplies one cell.
  const grid: CraftingGrid = [stack("black_dye", 2), stack("white_dye", 3), stack("white_dye", 4), null];
  expect(craftOnce(grid, 2)).toEqual(stack("light_gray_dye", 3)); expect(grid.map((s) => s?.count ?? 0)).toEqual([1, 2, 3, 0]);
  expect(craftOnce([stack("black_dye"), stack("white_dye", 2), null, null], 2)).toEqual(stack("gray_dye", 2));
  expect(craftOnce([stack("ink_sac"), stack("white_dye"), null, null], 2)).toEqual(stack("gray_dye", 2));
  for (const dye of ["blue_dye", "brown_dye", "white_dye", "green_dye"]) {
    expect(DYE_RECIPES.some((r) => r.result[0] === dye)).toBe(false); // Missing raw acquisition resources are not invented.
  }
});

it("uses provisional white wool + canonical dye for 15 colors, and bleach whitens all 15", () => {
  for (const color of colors.filter((c) => c !== "white")) for (const width of [2, 3]) {
    const grid: CraftingGrid = new Array(width * width).fill(null); grid[0] = stack("white_wool", 3); grid[grid.length - 1] = stack(`${color}_dye`, 2);
    expect(craftOnce(grid, width)).toEqual(stack(`${color}_wool`)); expect(grid[0]!.count).toBe(2); expect(grid.at(-1)!.count).toBe(1);
    const bleach: CraftingGrid = new Array(width * width).fill(null); bleach[1] = stack(`${color}_wool`, 3); bleach[bleach.length - 1] = stack("bleach", 2);
    expect(craftOnce(bleach, width)).toEqual(stack("white_wool")); expect(bleach[1]!.count).toBe(2); expect(bleach.at(-1)!.count).toBe(1);
  }
  for (const names of [["white_wool", "poppy"], ["white_wool", "dandelion"], ["white_wool", "ink_sac"], ["white_wool", "white_dye"], ["red_wool", "blue_dye"], ["red_wool", "red_dye"], ["white_wool", "red_dye", "stone"]]) {
    const grid: CraftingGrid = Array.from({ length: 4 }, (_, i) => names[i] ? stack(names[i], 2) : null), before = structuredClone(grid);
    expect(craftOnce(grid, 2)).toBeNull(); expect(grid).toEqual(before);
  }
});

it("crafts the existing green glow stick from six distinct polyethylene cells in the exact Journal grid", () => {
  const names = ["polyethylene", "hydrogen_peroxide", "polyethylene", "polyethylene", "green_dye", "polyethylene", "polyethylene", "luminol", "polyethylene"];
  const grid = names.map((name) => stack(name, 3));
  const oldGlow = stackId("underwater_torch") + 1; expect(stackId("glow_stick")).toBe(oldGlow);
  expect(craftOnce(grid, 3)).toEqual({ id: oldGlow, count: 1, glow: { state: "inactive" } }); expect(grid.every((s) => s.count === 2)).toBe(true);
  for (const index of [0, 2, 3, 5, 6, 8]) {
    const missing: CraftingGrid = names.map((name) => stack(name)); missing[index] = null; const before = structuredClone(missing);
    expect(craftOnce(missing, 3)).toBeNull(); expect(missing).toEqual(before);
  }
  for (const wrong of ["luminol", "black_dye", "light_gray_dye", "ink_sac"]) {
    const bad = names.map((name) => stack(name)); bad[4] = stack(wrong); const before = structuredClone(bad);
    expect(craftOnce(bad, 3)).toBeNull(); expect(bad).toEqual(before);
  }
  const swapped = names.map((name) => stack(name)); [swapped[1], swapped[7]] = [swapped[7], swapped[1]];
  expect(matchRecipe(swapped, 3)).toBeNull();
  expect(matchRecipe([stack("polyethylene", 6), stack("hydrogen_peroxide"), stack("green_dye"), stack("luminol")], 2)).toBeNull();
  expect(matchRecipe([stack("polyethylene"), stack("luminol"), stack("polyethylene"), stack("polyethylene"), stack("hydrogen_peroxide"), stack("polyethylene"), null, stack("polyethylene"), null], 3)).toBeNull();
});

it("places, harvests and saves every new wool ID without aliasing items or high element blocks", () => {
  const world = new World(13), edits: [number, number, number, number][] = [];
  for (const [i, color] of newWools.entries()) {
    const bag = new Inventory(), name = `${color}_wool`, id = 164 + i; bag.add(id, 2);
    expect(placeBlock(world, bag, "survival", 8, 90, 8, { x: 2, y: 91, z: 2 })).toBe(true); expect(world.getBlock(8, 90, 8)).toBe(id);
    expect(breakBlock(world, bag, "survival", 8, 90, 8)).toBe(true); expect(bag.slots[0]).toEqual(stack(name, 2));
    edits.push([i, 90, 0, id]);
  }
  edits.push([8, 90, 0, elementBlockId(118)]);
  expect(sanitizeEdits(edits)).toEqual(edits);
  const parsed = parseSave(serializeSave({ seed: 13, name: "new wool", mode: "creative", timeOfDay: .3,
    player: { position: { x: 8, y: 91, z: 0 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits }));
  const restored = new World(parsed.seed); restored.importEdits(sanitizeEdits(parsed.edits));
  expect(restored.exportEdits()).toEqual(edits); expect(restored.getBlock(0, 90, 0)).not.toBe(AIR);
});

it("round trips all new dye/wool stacks through inventory, pending recovery and Agent transfer/save", () => {
  const names = [...colors.map((c) => `${c}_dye`), ...newWools.map((c) => `${c}_wool`)];
  const bag = new Inventory(), agent = createAgent(8, 91, 8);
  for (const name of names) { bag.add(stackId(name), 3); expect(giveAgent(agent, stack(name, 2))).toBe(0); }
  const pending = names.slice(0, 10).map((name) => stack(name, 2));
  const save = parseSave(serializeSave({ seed: 13, name: "dye ownership", mode: "survival", timeOfDay: .3,
    player: { position: { x: 8, y: 91, z: 8 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), agent, inventoryPending: pending, edits: [] }));
  const restored = Inventory.fromJSON(save.inventory); expect(restored.toJSON()).toEqual(bag.toJSON());
  expect(save.inventoryPending).toEqual(pending);
  const clean = sanitizeAgent(save.agent)!; expect(clean).toEqual(agent);
  for (let i = 0; i < names.length; i += 10) expect(sanitizeInventoryPending(names.slice(i, i + 10).map((n) => stack(n, 2)))).toEqual(names.slice(i, i + 10).map((n) => stack(n, 2)));
  const received = new Inventory();
  for (let i = 0; i < names.length; i++) expect(runAgentCommand(new World(13), clean, { op: "drop", slot: i }, { giveToPlayer: (s) => received.addStack(s) }).ok).toBe(true);
  expect(received.slots.filter(Boolean)).toEqual(names.map((n) => stack(n, 2)));
  for (const raw of [{ id: ITEMS.at(-1)!.id + 1, count: 1 }, { id: 189, count: 1 }, { id: 775, count: 65 }, { id: 775, count: 0 }]) expect(sanitizeStack(raw)).toBeNull();
});
