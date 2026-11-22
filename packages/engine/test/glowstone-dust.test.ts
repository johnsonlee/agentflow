import { withLegacyStationFaces } from "./helpers/legacy-station-faces";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, RECIPES, NATIVE_MATERIAL_REDUCTIONS, Inventory, World, WorldDrops, baseStackId,
  blockId, blockDrops, blockById, breakBlock, craftOnce, createAgent, dropCount, dropOf, emission,
  giveAgent, itemById, matchRecipe, parseSave, placeBlock, placedBlockOf, reduceMaterial, runAgentCommand,
  sanitizeAgent, sanitizeFurnaces, sanitizeInventoryPending, serializeSave, stackId, type CraftingGrid, type ItemStack,
} from "../src/index";
const baseline = JSON.parse(readFileSync(new URL("./fixtures/glowstone-dust-baseline.json", import.meta.url), "utf8"));
const source = JSON.parse(readFileSync(new URL("./fixtures/glowstone-dust-source-facts.json", import.meta.url), "utf8"));
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v) + "\n").digest("hex");
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const floor = { getLoadedBlock: (_x: number, y: number, _z: number) => y === 0 ? blockId("stone") : AIR };
const position = { x: .5, y: 1, z: .5 };

it("preserves complete307blocks/535items/127other recipes/22native rows and appends one distinct ordinary material", () => {
  expect(BLOCKS.slice(0, 307)).toHaveLength(307); expect(hash(withLegacyStationFaces(BLOCKS.slice(0, 307)))).toBe(baseline.blockDefsSHA256);
  expect(ITEMS.slice(0, 537)).toHaveLength(537); expect(hash(ITEMS.slice(0, 535))).toBe(baseline.itemDefsSHA256);
  expect(RECIPES.slice(0, 128)).toHaveLength(128); expect(hash(RECIPES.slice(0, 128).filter((r) => r.id !== "glowstone").map((r) => r.id === "snow_block" ? { ...r, key: { "#": "snow" }, note: "Minecraft uses snowballs" } : r))).toBe(baseline.other127RecipesSHA256);
  expect(baseline.previousGlowstoneRecipe).toEqual({ id: "glowstone", pattern: ["##", "##"], key: { "#": "gold_ore" }, result: ["glowstone", 1], note: "Minecraft uses glowstone dust" });
  expect(hash(baseline.previousGlowstoneRecipe)).toBe(baseline.previousGlowstoneRecipeSHA256);
  expect(RECIPES.slice(0, 128).at(-1)).toEqual({ id: "glowstone", pattern: ["##", "##"], key: { "#": "glowstone_dust" }, result: ["glowstone", 1] }); expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  expect(NATIVE_MATERIAL_REDUCTIONS.slice(0,24)).toHaveLength(24); expect(NATIVE_MATERIAL_REDUCTIONS.slice(24).map(r=>r.input)).toEqual(["netherrack","soul_sand"]); expect(hash(NATIVE_MATERIAL_REDUCTIONS.slice(0, 22))).toBe(baseline.nativeReductionsSHA256);
  expect(itemById(791)).toEqual({ id: 791, name: "glowstone_dust", displayName: "Glowstone Dust", icon: "item_glowstone_dust", maxStack: 64 });
  expect(placedBlockOf(791)).toBeNull(); expect(baseStackId(blockId("glowstone"))).toBe(blockId("glowstone"));
  const bag = new Inventory(); bag.pick(blockId("glowstone")); expect(bag.selectedStack()).toEqual(stack("glowstone"));
});

it.each([[0, 4, 2], [1 / 3, 4, 3], [.5, 5, 3], [2 / 3, 5, 4], [1 - Number.EPSILON, 5, 4]])(
  "resolves source-bounded ordinary redstone and glowstone ranges at%s", (random, redstone, dust) => {
    let calls = 0; const rand = () => { calls++; return random; };
    expect(blockDrops(blockId("redstone_ore"), rand)).toEqual([stack("redstone", redstone)]);
    expect(blockDrops(blockId("glowstone"), rand)).toEqual([stack("glowstone_dust", dust)]); expect(calls).toBe(2);
    expect(dropCount(blockId("redstone_ore"), () => random)).toBe(redstone); expect(dropOf(blockId("glowstone"))).toBe(791);
  },
);

it("keeps other ordinary identities and quantities deterministic and rejects invalid range RNG", () => {
  const never = () => { throw new Error("ordinary nonrandom drop must not roll"); };
  expect(blockDrops(blockId("stone"), never)).toEqual([stack("cobblestone")]); expect(blockDrops(blockId("bookshelf"), never)).toEqual([stack("book", 3)]);
  expect(blockDrops(blockId("glass"), never)).toEqual([]); expect(baseStackId(blockId("redstone_wire_15"))).toBe(stackId("redstone"));
  for (const random of [NaN, Infinity, -Infinity]) expect(() => blockDrops(blockId("glowstone"), () => random)).toThrow(RangeError);
  expect(dropCount(blockId("glowstone"), () => -1)).toBe(2); expect(dropCount(blockId("redstone_ore"), () => 1)).toBe(5);
});

it("reserves actual full-bag player harvests once and preserves both source and tool wear on refusal", () => {
  const world = new World(7), bag = new Inventory(), drops = new WorldDrops(world);
  for (let i = 0; i < 36; i++) bag.setSlot(i, stack("stone", 64)); bag.setSlot(0, { ...stack("iron_pickaxe"), damage: 9 });
  world.setBlock(8, 90, 8, blockId("glowstone")); world.setBlock(8, 91, 8, blockId("dandelion"));
  let rolls = 0; const rand = () => { rolls++; return .99; }; const before = bag.toJSON();
  expect(breakBlock(world, bag, "survival", 8, 90, 8, rand, [], () => null)).toBe(false);
  expect(world.getBlock(8, 90, 8)).toBe(blockId("glowstone")); expect(world.getBlock(8, 91, 8)).toBe(blockId("dandelion")); expect(bag.toJSON()).toEqual(before); expect(rolls).toBe(1);
  expect(breakBlock(world, bag, "survival", 8, 90, 8, rand, [], drops.planSpawnBatch.bind(drops))).toBe(true);
  expect(rolls).toBe(2); expect(drops.records.map((r) => r.stack)).toEqual([stack("glowstone_dust", 4), stack("dandelion")]);
  expect(world.getBlock(8, 90, 8)).toBe(AIR); expect(world.getBlock(8, 91, 8)).toBe(AIR);
  expect(bag.slots[0]).toEqual({ ...stack("iron_pickaxe"), damage: 10 }); expect(bag.slots.slice(1)).toEqual(before.slots.slice(1));
  world.setBlock(9, 90, 8, blockId("glowstone"));
  expect(breakBlock(world, bag, "survival", 9, 90, 8, rand)).toBe(false); expect(world.getBlock(9, 90, 8)).toBe(blockId("glowstone")); expect(bag.slots[0]?.damage).toBe(10);
});

it("keeps player tool/creative/Deny gates ahead of random harvests", () => {
  const world = new World(8), bag = new Inventory(), drops = new WorldDrops(world), sink = drops.planSpawnBatch.bind(drops);
  let rolls = 0; const rand = () => { rolls++; return .99; };
  for (const tool of [null, "wooden_pickaxe", "stone_pickaxe", "golden_pickaxe"]) {
    bag.setSlot(0, tool ? stack(tool) : null); world.setBlock(8, 90, 8, blockId("redstone_ore"));
    expect(breakBlock(world, bag, "survival", 8, 90, 8, rand, [], sink)).toBe(true); expect(drops.records).toEqual([]); expect(rolls).toBe(0);
  }
  for (const tool of ["iron_pickaxe", "diamond_pickaxe"]) {
    bag.setSlot(0, stack(tool)); world.setBlock(8, 90, 8, blockId("redstone_ore"));
    expect(breakBlock(world, bag, "survival", 8, 90, 8, rand, [], sink)).toBe(true);
  }
  expect(drops.records.map((r) => r.stack)).toEqual([stack("redstone", 5), stack("redstone", 5)]); expect(rolls).toBe(2);
  world.setBlock(8, 90, 8, blockId("glowstone"));
  expect(breakBlock(world, bag, "creative", 8, 90, 8, rand, [], sink)).toBe(true); expect(rolls).toBe(2);
  world.setBlock(8, 89, 8, blockId("deny")); world.setBlock(8, 90, 8, blockId("redstone_ore"));
  const before = bag.toJSON(); expect(breakBlock(world, bag, "survival", 8, 90, 8, rand, [], sink)).toBe(false);
  expect(bag.toJSON()).toEqual(before); expect(rolls).toBe(2); expect(world.getBlock(8, 90, 8)).toBe(blockId("redstone_ore"));
});

it("delivers current Agent harvest bounds to world ownership with full bags and retains denied source", () => {
  const world = new World(9), agent = createAgent(8, 91, 8), drops = new WorldDrops(world);
  for (let i = 0; i < 27; i++) agent.slots[i] = stack("stone", 64); const before = structuredClone(agent);
  for (const [name, out, min, max] of [["glowstone", "glowstone_dust", 2, 4], ["redstone_ore", "redstone", 4, 5]] as const) {
    world.setBlock(8, 90, 8, blockId(name));
    expect(runAgentCommand(world, agent, { op: "destroy", dir: "down" }, { worldDrop: () => null }).ok).toBe(false); expect(world.getBlock(8, 90, 8)).toBe(blockId(name));
    expect(runAgentCommand(world, agent, { op: "destroy", dir: "down" }, { worldDrop: drops.planSpawnBatch.bind(drops) }).ok).toBe(true);
    const result = drops.records.at(-1)!.stack; expect(result.id).toBe(stackId(out)); expect(result.count).toBeGreaterThanOrEqual(min); expect(result.count).toBeLessThanOrEqual(max); expect(agent).toEqual(before);
  }
  world.setBlock(8, 89, 8, blockId("deny")); world.setBlock(8, 90, 8, blockId("glowstone"));
  expect(runAgentCommand(world, agent, { op: "destroy", dir: "down" }, { worldDrop: drops.planSpawnBatch.bind(drops) }).ok).toBe(false); expect(world.getBlock(8, 90, 8)).toBe(blockId("glowstone"));
  agent.slots[0] = stack("glowstone_dust"); expect(runAgentCommand(world, agent, { op: "place", dir: "up" }).ok).toBe(false); expect(agent.slots[0]).toEqual(stack("glowstone_dust"));
});

it("crafts exactly four acquired dust to the original placeable light15 block in2x2 or translated3x3", () => {
  const dust = blockDrops(blockId("glowstone"), () => .99)[0]; expect(dust).toEqual(stack("glowstone_dust", 4));
  const grid: CraftingGrid = Array.from({ length: 4 }, () => ({ id: dust.id, count: 2 }));
  expect(craftOnce(grid, 2)).toEqual(stack("glowstone")); expect(grid).toEqual(Array.from({ length: 4 }, () => stack("glowstone_dust")));
  expect(craftOnce(grid, 2)).toEqual(stack("glowstone")); expect(grid).toEqual(Array(4).fill(null));
  const translated: CraftingGrid = [null, null, null, null, stack("glowstone_dust"), stack("glowstone_dust"), null, stack("glowstone_dust"), stack("glowstone_dust")];
  const output = craftOnce(translated, 3)!; expect(output).toEqual(stack("glowstone")); expect(translated).toEqual(Array(9).fill(null));
  const world = new World(11), bag = new Inventory(); bag.setSlot(0, output);
  expect(placeBlock(world, bag, "survival", 8, 90, 8, { x: 5, y: 90, z: 5 })).toBe(true);
  expect(world.getBlock(8, 90, 8)).toBe(blockId("glowstone")); expect(emission(blockId("glowstone"))).toBe(15); expect(bag.slots[0]).toBeNull();
});

it("refuses incomplete/extra/wrong dust layouts without consuming owned inputs", () => {
  for (const grid of [[stack("gold_ore"), stack("gold_ore"), stack("gold_ore"), stack("gold_ore")], [stack("glowstone_dust"), stack("glowstone_dust"), stack("glowstone_dust"), null], [stack("glowstone_dust"), stack("glowstone_dust"), stack("glowstone_dust"), stack("redstone")], [stack("glowstone_dust"), stack("glowstone_dust"), stack("glowstone_dust"), stack("glowstone_dust"), stack("glowstone_dust"), null, null, null, null]]) {
    const before = structuredClone(grid); expect(craftOnce(grid, grid.length === 4 ? 2 : 3)).toBeNull(); expect(grid).toEqual(before);
  }
  expect(matchRecipe([null, stack("redstone"), null, stack("redstone"), stack("glowstone"), stack("redstone"), null, stack("redstone"), null], 3)?.result).toEqual(stack("redstone_lamp"));
});

it("matches the exact dust-native ordered reduction and retains old block/reduction rows", () => {
  const row = NATIVE_MATERIAL_REDUCTIONS.find((r) => r.input === "glowstone_dust")!;
  expect(row.input).toBe("glowstone_dust"); expect(row.inputKind).toBe("item"); expect(row.nativeIdentifier).toBe("minecraft:glowstone_dust");
  const raw = source.sources.find((s: { path: string }) => s.path.endsWith("reducer_glowstone_gem.json"));
  expect(row.sources).toEqual([{ path: raw.path, sha256: raw.sha256 }]);
  expect(row.output).toEqual([[18, 20], [5, 20], [36, 20], [10, 20], [0, 20]]);
  const expected = [stack("argon", 20), stack("boron", 20), stack("krypton", 20), stack("neon", 20), { id: 32768, count: 20 }];
  expect(reduceMaterial(791)).toEqual(expected); expect(reduceMaterial(blockId("glowstone"))).toEqual(expected);
  const result = reduceMaterial(791)!; result[0].count = 1; expect(reduceMaterial(791)).toEqual(expected);
  expect(source.targetAccepted).toBe(false); expect(source.activeRuntimeBindingVerified).toBe(false);
  const recipes = source.sources.filter((s: { path: string }) => s.path.endsWith("/glowstone.json")); expect(recipes).toHaveLength(2);
  for (const record of recipes) expect(record.table["minecraft:recipe_shaped"].pattern).toEqual(["##", "##"]);
});

it("persists dust in allowned Savev1 containers and preserves rolled WorldDrops through partial pickup", () => {
  const bag = new Inventory(), agent = createAgent(0, 1, 0), dust = stack("glowstone_dust", 7);
  const book = { ...stack("written_book"), book: { pages: ["kept"], title: "T", author: "A" } }, worn = { ...stack("iron_pickaxe"), damage: 31 };
  bag.setSlot(0, dust); bag.setSlot(1, book); bag.setSlot(2, worn); giveAgent(agent, stack("glowstone_dust", 3));
  const drops = new WorldDrops(floor); drops.spawnBatch(blockDrops(blockId("glowstone"), () => .99), position); drops.update(.5);
  const furnace = { input: stack("glowstone_dust", 2), fuel: stack("coal"), output: worn, progress: 0, burnLeft: 0, burnTotal: 0 };
  const text = serializeSave({ name: "dust", seed: 1, mode: "survival", timeOfDay: .3, player: { position, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), inventoryPending: [stack("glowstone_dust", 4)], edits: [], agent, furnaces: [{ x: 0, y: 1, z: 0, state: furnace }], worldDrops: drops.toJSON() });
  const saved = parseSave(text); expect(saved.version).toBe(1); expect(Inventory.fromJSON(saved.inventory).toJSON()).toEqual(bag.toJSON()); expect(sanitizeAgent(saved.agent)).toEqual(agent);
  expect(sanitizeInventoryPending(saved.inventoryPending)).toEqual([stack("glowstone_dust", 4)]); expect(sanitizeFurnaces(saved.furnaces).furnaces[0].state).toEqual(furnace);
  const restored = new WorldDrops(floor, saved.worldDrops); expect(restored.toJSON()).toEqual(drops.toJSON());
  for (let i = 0; i < 36; i++) bag.setSlot(i, stack("stone", 64)); bag.setSlot(0, stack("glowstone_dust", 63));
  expect(restored.tryPickup(position, (s) => bag.addStack(s))).toBe(1); expect(restored.records[0].stack).toEqual(stack("glowstone_dust", 3));
  bag.setSlot(1, null); expect(restored.tryPickup(position, (s) => bag.addStack(s))).toBe(3); expect(restored.records).toEqual([]); expect(bag.slots[0]).toEqual(stack("glowstone_dust", 64)); expect(bag.slots[1]).toEqual(stack("glowstone_dust", 3));
});
