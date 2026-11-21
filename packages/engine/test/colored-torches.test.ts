import { withLegacyStationFaces } from "./helpers/legacy-station-faces";
import { historicalItemMap } from "./historical-item-map";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, Inventory, World, blockById, blockId, breakBlock, craftOnce, creativeBlocks,
  dropOf, emission, labReaction, matchRecipe, parseSave, placeBlock, placedBlockOf, sanitizeEdits, serializeSave, stackId, type CraftingGrid,
} from "../src";

const recipes = [["blue", "cerium_chloride"], ["red", "mercuric_chloride"], ["purple", "potassium_chloride"], ["green", "tungsten_chloride"]] as const;
const hash = (defs: readonly { id: number; name: string }[]) => createHash("sha256").update(JSON.stringify(historicalItemMap(defs)) + "\n").digest("hex");

it("preserves all 160 existing block IDs and all 448 item IDs while appending four torch blocks", () => {
  expect(hash(withLegacyStationFaces(BLOCKS.slice(0, 160)))).toBe("3c71ae1be8abe2fbb2e31d60411fd521684402a8f2971516c48818060e731ae4");
  expect(hash(ITEMS.slice(0, 448))).toBe("a1222a5815e226e6abc590dd4b5ec912aea858050cd49e05e26eb40df2f5f888");
  expect(BLOCKS.slice(160, 164).map((b) => [b.id, b.name])).toEqual(recipes.map(([color], i) => [160 + i, `${color}_torch`]));
  expect(BLOCKS.slice(0, 164).every((b) => b.id < 256)).toBe(true);
  expect(creativeBlocks().filter((b) => recipes.some(([color]) => b.name === `${color}_torch`))).toHaveLength(4);
});

for (const [color, compound] of recipes) describe(`${color} chemistry torch`, () => {
  const name = `${color}_torch`;
  it("crafts chloride above torch in every translated position and spends one of each ingredient", () => {
    for (const width of [2, 3]) for (let row = 0; row < width - 1; row++) for (let col = 0; col < width; col++) {
      const grid: CraftingGrid = new Array(width * width).fill(null);
      const top = row * width + col, bottom = top + width;
      grid[top] = { id: stackId(compound), count: 2 }; grid[bottom] = { id: blockId("torch"), count: 3 };
      expect(craftOnce(grid, width)).toEqual({ id: blockId(name), count: 1 });
      expect(grid[top]).toEqual({ id: stackId(compound), count: 1 }); expect(grid[bottom]).toEqual({ id: blockId("torch"), count: 2 });
    }
    for (const [a, b] of [[0, 1], [0, 6], [3, 0]]) {
      const grid: CraftingGrid = new Array(9).fill(null);
      grid[a] = { id: stackId(compound), count: 1 }; grid[b] = { id: blockId("torch"), count: 1 };
      expect(matchRecipe(grid, 3)).toBeNull();
    }
    const extra: CraftingGrid = [{ id: stackId(compound), count: 1 }, null, { id: stackId("stick"), count: 1 }, { id: blockId("torch"), count: 1 }, null, null, null, null, null];
    expect(matchRecipe(extra, 3)).toBeNull();
  });
  it("shares ordinary support, placement, water refusal, scalar lighting and canonical break drops", () => {
    const world = new World(17), bag = new Inventory(), id = blockId(name), feet = { x: 2, y: 91, z: 2 };
    bag.add(id, 2); world.setBlock(8, 90, 8, AIR); world.setBlock(8, 89, 8, AIR);
    expect(placeBlock(world, bag, "survival", 8, 90, 8, feet)).toBe(false);
    world.setBlock(8, 89, 8, blockId("stone")); world.setBlock(8, 90, 8, blockId("water"));
    expect(placeBlock(world, bag, "survival", 8, 90, 8, feet)).toBe(false); expect(bag.slots[0]!.count).toBe(2);
    world.setBlock(8, 90, 8, AIR);
    expect(placeBlock(world, bag, "survival", 8, 90, 8, feet)).toBe(true); expect(bag.slots[0]!.count).toBe(1);
    expect(world.getBlock(8, 90, 8)).toBe(id); expect(emission(id)).toBe(14); expect(world.getLight(8, 90, 8) & 15).toBe(14);
    expect(world.getLight(8, 91, 8) & 15).toBe(13);
    expect(blockById(id)).toMatchObject({ shape: "torch", solid: false, transparent: true, light: 14, hardness: 0 });
    expect(blockById(id).waterproof).not.toBe(true);
    expect(breakBlock(world, bag, "survival", 8, 90, 8)).toBe(true); expect(world.getBlock(8, 90, 8)).toBe(AIR);
    expect(bag.slots[0]).toEqual({ id, count: 2 }); expect(world.getLight(8, 90, 8) & 15).toBe(0);
  });
});

it("round trips the four block/inventory IDs through current save validation", () => {
  const world = new World(17), bag = new Inventory();
  recipes.forEach(([color], i) => { const id = blockId(`${color}_torch`); world.setBlock(4 + i, 90, 4, id); bag.add(id, 2); });
  const data = parseSave(serializeSave({ name: "colors", seed: world.seed, mode: "survival", timeOfDay: .3,
    player: { position: { x: 2, y: 91, z: 2 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), edits: world.exportEdits() }));
  const restored = new World(data.seed); restored.importEdits(sanitizeEdits(data.edits));
  expect(Inventory.fromJSON(data.inventory).toJSON()).toEqual(bag.toJSON());
  recipes.forEach(([color], i) => expect(restored.getBlock(4 + i, 90, 4)).toBe(blockId(`${color}_torch`)));
});

it("crafts the existing underwater torch only with magnesium directly above an ordinary torch", () => {
  const magnesium = stackId("magnesium"), torch = blockId("torch"), underwater = stackId("underwater_torch");
  for (const width of [2, 3]) for (let row = 0; row < width - 1; row++) for (let col = 0; col < width; col++) {
    const grid: CraftingGrid = new Array(width * width).fill(null);
    const top = row * width + col, bottom = top + width;
    grid[top] = { id: magnesium, count: 2 }; grid[bottom] = { id: torch, count: 3 };
    expect(craftOnce(grid, width)).toEqual({ id: underwater, count: 1 });
    expect(grid[top]).toEqual({ id: magnesium, count: 1 }); expect(grid[bottom]).toEqual({ id: torch, count: 2 });
  }
  for (const [top, bottom] of [[0, 1], [0, 6], [3, 0]]) {
    const grid: CraftingGrid = new Array(9).fill(null);
    grid[top] = { id: magnesium, count: 1 }; grid[bottom] = { id: torch, count: 1 };
    expect(matchRecipe(grid, 3)).toBeNull();
  }
  const extra: CraftingGrid = [{ id: magnesium, count: 1 }, null, { id: stackId("stick"), count: 1 }, { id: torch, count: 1 }, null, null, null, null, null];
  expect(matchRecipe(extra, 3)).toBeNull();
  expect(placedBlockOf(underwater)).toBe(blockId("placed_underwater_torch"));
  expect(dropOf(blockId("placed_underwater_torch"))).toBe(underwater);
});

it("refuses underwater torch ingredients at the Lab Table without changing their stacks", () => {
  const ingredients = [{ id: stackId("magnesium"), count: 1 }, { id: blockId("torch"), count: 1 }];
  const before = structuredClone(ingredients);
  expect(labReaction(ingredients)).toEqual({ error: "Nothing happens" });
  expect(ingredients).toEqual(before);
});
