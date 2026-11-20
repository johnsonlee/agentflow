import { historicalItemMap } from "./historical-item-map";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, FarmingSystem, Inventory, World, blockId, blockDrops, boxCollides, breakBlock, craftOnce,
  createAgent, createHunger, createPlayerBody, eat, farmDrops, farmlandId, farmlandMoisture, fuelSeconds,
  hasFarmWater, matchRecipe, parseSave, placeBlock, runAgentCommand, sanitizeFarmingState, serializeSave,
  stackId, stepPlayer, tillSoil, toolOf, useLabProduct, wheatAge, wheatId, type CraftingGrid,
} from "../src";

const spot = { x: 8, y: 90, z: 8, normal: { x: 0, y: 1, z: 0 } };
const idMapHash = (defs: readonly { id: number; name: string }[]) => createHash("sha256").update(JSON.stringify(historicalItemMap(defs)) + "\n").digest("hex");
function farm(seed = 73) {
  const world = new World(seed);
  world.setBlock(8, 90, 8, farmlandId(7));
  world.setBlock(8, 91, 8, wheatId(0));
  world.setBlock(9, 90, 8, blockId("water"));
  return world;
}
function advance(system: FarmingSystem, seconds: number, dt = 10, light = 15) {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) system.update(Math.min(dt, seconds - elapsed), light);
}

it("preserves the complete published block/item maps and keeps all appended states in byte storage", () => {
  expect(idMapHash(BLOCKS.slice(0, 144))).toBe("f33eb7439cbc96a301800ea7494f7beb8ebfe1ed8f051181107f5b6762124bb6");
  expect(idMapHash(ITEMS.slice(0, 440))).toBe("1f38a3e5c7182d96cded60859bd0d6d45576b0545ceeffbad4434e31873e14f3");
  expect(BLOCKS.slice(0, 160)).toHaveLength(160);
  expect(BLOCKS.length).toBeLessThan(256);
  expect(ITEMS.slice(440, 448).map((s) => s.name)).toEqual(["wooden_hoe", "stone_hoe", "iron_hoe", "golden_hoe", "diamond_hoe", "wheat_seeds", "wheat", "bread"]);
  for (let n = 0; n < 8; n++) {
    expect(farmlandMoisture(farmlandId(n))).toBe(n); expect(wheatAge(wheatId(n))).toBe(n);
  }
  expect(farmlandMoisture(blockId("dirt"))).toBeNull();
  expect(wheatAge(NaN)).toBeNull();
  expect(() => wheatId(8)).toThrow(); expect(() => farmlandId(-1)).toThrow();
});

it("crafts every hoe, including mirrored shapes, and three-wheat bread; bread restores five food and six saturation", () => {
  for (const [material, head] of [["wooden", "oak_planks"], ["stone", "cobblestone"], ["iron", "iron_ingot"], ["golden", "gold_ingot"], ["diamond", "diamond"]]) {
    for (const cells of [[0, 1, 4, 7], [1, 2, 4, 7]]) {
      const grid: CraftingGrid = new Array(9).fill(null);
      cells.forEach((cell, i) => { grid[cell] = { id: stackId(i < 2 ? head : "stick"), count: 1 }; });
      expect(craftOnce(grid, 3)).toEqual({ id: stackId(`${material}_hoe`), count: 1 });
      expect(grid.every((s) => s === null)).toBe(true);
    }
    expect(toolOf(stackId(`${material}_hoe`))?.kind).toBe("hoe");
  }
  const wheat = { id: stackId("wheat"), count: 1 };
  const grid: CraftingGrid = [null, null, null, wheat, { ...wheat }, { ...wheat }, null, null, null];
  expect(craftOnce(grid, 3)).toEqual({ id: stackId("bread"), count: 1 });
  expect(matchRecipe([wheat, wheat, null, null], 2)).toBeNull();
  expect(fuelSeconds(stackId("wooden_hoe"))).toBe(10);
  const hunger = createHunger(); expect(eat(hunger, stackId("bread"))).toBe(false);
  hunger.food = 10; hunger.saturation = 0;
  expect(eat(hunger, stackId("bread"))).toBe(true);
  expect(hunger).toMatchObject({ food: 15, saturation: 6 });
});

it("tills and wears only successful survival hoe uses; refuses obstruction, wrong items, bottom use and Deny", () => {
  const world = new World(5), bag = new Inventory();
  world.setBlock(8, 90, 8, blockId("grass")); bag.add(stackId("wooden_hoe"));
  expect(tillSoil(world, bag, "survival", spot)).toBe(true);
  expect(world.getBlock(8, 90, 8)).toBe(farmlandId(0)); expect(bag.slots[0]?.damage).toBe(1);
  expect(tillSoil(world, bag, "survival", spot)).toBe(false); expect(bag.slots[0]?.damage).toBe(1);
  world.setBlock(8, 90, 8, blockId("dirt")); world.setBlock(8, 91, 8, blockId("stone"));
  expect(tillSoil(world, bag, "survival", spot)).toBe(false);
  world.setBlock(8, 91, 8, AIR); world.setBlock(8, 89, 8, blockId("deny"));
  expect(tillSoil(world, bag, "survival", spot)).toBe(false);
  expect(tillSoil(world, bag, "creative", spot)).toBe(true); expect(bag.slots[0]?.damage).toBe(1);
  world.setBlock(8, 90, 8, blockId("dirt"));
  expect(tillSoil(world, bag, "creative", { ...spot, normal: { x: 0, y: -1, z: 0 } })).toBe(false);
  world.setBlock(8, 89, 8, blockId("stone"));
  bag.slots[0]!.damage = toolOf(bag.slots[0]!.id)!.durability - 1;
  expect(tillSoil(world, bag, "survival", spot)).toBe(true); expect(bag.slots[0]).toBeNull();
});

it("plants only above farmland, applies build limits and consumes one seed only on success", () => {
  const world = new World(5), bag = new Inventory(); bag.add(stackId("wheat_seeds"), 3);
  world.setBlock(8, 90, 8, blockId("stone"));
  expect(placeBlock(world, bag, "survival", 8, 91, 8, { x: 2, y: 91, z: 2 })).toBe(false);
  world.setBlock(8, 90, 8, farmlandId(0)); world.setBlock(8, 89, 8, blockId("deny"));
  expect(placeBlock(world, bag, "survival", 8, 91, 8, { x: 2, y: 91, z: 2 })).toBe(false);
  world.setBlock(8, 89, 8, blockId("stone"));
  expect(placeBlock(world, bag, "survival", 8, 91, 8, { x: 2, y: 91, z: 2 })).toBe(true);
  expect(world.getBlock(8, 91, 8)).toBe(wheatId(0)); expect(bag.slots[0]!.count).toBe(2);
  expect(placeBlock(world, bag, "survival", 8, 91, 8, { x: 2, y: 91, z: 2 })).toBe(false);
  world.setBlock(9, 90, 8, farmlandId(0));
  expect(placeBlock(world, bag, "creative", 9, 91, 8, { x: 2, y: 91, z: 2 })).toBe(true);
  expect(bag.slots[0]!.count).toBe(2);
  expect(placeBlock(world, bag, "creative", 8, 128, 8, { x: 2, y: 91, z: 2 })).toBe(false);
});

it("recognizes hydration at four including diagonals and upper level, excludes five and below, without generating neighbors", () => {
  const world = new World(5); world.setBlock(8, 90, 8, farmlandId(0));
  for (const [dx, dy, dz, expected] of [[4, 0, 4, true], [4, 1, 4, true], [5, 0, 0, false], [0, -1, 0, false]] as const) {
    world.setBlock(8 + dx, 90 + dy, 8 + dz, blockId("water"));
    expect(hasFarmWater(world, 8, 90, 8)).toBe(expected);
    world.setBlock(8 + dx, 90 + dy, 8 + dz, AIR);
  }
  const count = world.loadedChunkCount(); expect(hasFarmWater(world, 15, 90, 15)).toBe(false); expect(world.loadedChunkCount()).toBe(count);
  world.setBlock(12, 90, 8, blockId("water")); const farming = new FarmingSystem(world); farming.update(1);
  expect(farmlandMoisture(world.getBlock(8, 90, 8))).toBe(7); farming.dispose();
});

it("has deterministic natural growth across dt partitioning, save reload, maturity and loaded-only simulation", () => {
  const a = farm(), b = farm(), sa = new FarmingSystem(a), sb = new FarmingSystem(b);
  advance(sa, 2000, 1); advance(sb, 2000, 10);
  expect(a.exportEdits()).toEqual(b.exportEdits()); expect(sa.toJSON()).toEqual(sb.toJSON());
  const saved = serializeSave({ name: "farm", seed: b.seed, mode: "survival", timeOfDay: .3,
    player: { position: { x: 8, y: 91, z: 8 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: b.exportEdits(), farming: sb.toJSON() });
  const parsed = parseSave(saved), c = new World(parsed.seed); c.importEdits(parsed.edits); const sc = new FarmingSystem(c, parsed.farming);
  advance(sa, 18000); advance(sc, 18000);
  expect(c.exportEdits()).toEqual(a.exportEdits()); expect(sc.toJSON()).toEqual(sa.toJSON());
  expect(wheatAge(a.getBlock(8, 91, 8))).toBe(7);
  advance(sa, 1000); expect(wheatAge(a.getBlock(8, 91, 8))).toBe(7);
  const edits = c.exportEdits(); c.unloadChunk(0, 0); advance(sc, 1000);
  expect(c.loadedChunkCount()).toBe(0); expect(c.exportEdits()).toEqual(edits);
  sa.dispose(); sb.dispose(); sc.dispose();
});

it("refuses natural growth below light nine, restores old/malformed scheduler safely and never grows offline", () => {
  const world = farm(), farming = new FarmingSystem(world);
  advance(farming, 20000, 10, 0); expect(world.getBlock(8, 91, 8)).toBe(wheatId(0));
  const before = farming.toJSON(); farming.update(NaN); farming.update(-1); expect(farming.toJSON()).toEqual(before);
  expect(sanitizeFarmingState(Object.create({ version: 1, tick: 1, accumulator: 0, cursor: 0 }))).toEqual({ version: 1, tick: 0, accumulator: 0, cursor: 0 });
  for (const value of [null, [], { version: 1, tick: -1, accumulator: 0, cursor: 0 }, { version: 1, tick: 0, accumulator: Infinity, cursor: 0 }]) {
    expect(sanitizeFarmingState(value)).toEqual({ version: 1, tick: 0, accumulator: 0, cursor: 0 });
  }
  const restored = new FarmingSystem(world, { version: 1, tick: 20, accumulator: .4, cursor: 0 });
  expect(restored.toJSON()).toEqual({ version: 1, tick: 20, accumulator: .4, cursor: 0 });
  farming.dispose(); restored.dispose();
});

it("fertilizer matures a supported immature crop once and leaves mature/non-crop targets unchanged", () => {
  const world = farm();
  expect(useLabProduct(world, stackId("super_fertilizer"), { ...spot, y: 91 })).toBe(1);
  expect(world.getBlock(8, 91, 8)).toBe(wheatId(7));
  expect(useLabProduct(world, stackId("super_fertilizer"), { ...spot, y: 91 })).toBe(0);
});

it("harvests multiple canonical items for direct, support-loss and Agent routes and refuses full-bag loss atomically", () => {
  expect(farmDrops(wheatId(0), () => 0)).toEqual([{ id: stackId("wheat_seeds"), count: 1 }]);
  expect(farmDrops(wheatId(7), () => 0)).toEqual([{ id: stackId("wheat"), count: 1 }, { id: stackId("wheat_seeds"), count: 3 }]);
  expect(farmDrops(blockId("tall_grass"), () => .2)).toEqual([]);
  expect(farmDrops(blockId("tall_grass"), () => 0)).toEqual([{ id: stackId("wheat_seeds"), count: 1 }]);
  const world = farm(), bag = new Inventory(); world.setBlock(8, 91, 8, wheatId(7));
  for (let i = 0; i < 36; i++) bag.setSlot(i, { id: blockId("stone"), count: 64 });
  const edits = world.exportEdits(); expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0)).toBe(false); expect(world.exportEdits()).toEqual(edits);
  bag.slots.fill(null); expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0)).toBe(true);
  expect(bag.slots.filter(Boolean)).toEqual([{ id: blockId("dirt"), count: 1 }, ...blockDrops(wheatId(7), () => 0)]);
  const aw = farm(), agent = createAgent(8, 91, 8); aw.setBlock(8, 91, 8, wheatId(7));
  expect(runAgentCommand(aw, agent, { op: "destroy", dir: "down" }).ok).toBe(true);
  expect(aw.getBlock(8, 91, 8)).toBe(AIR); expect(agent.slots.some((s) => s?.id === stackId("wheat"))).toBe(true);
  expect(agent.slots.filter(Boolean).every((s) => wheatAge(s!.id) === null)).toBe(true);
});

it("lands at the farmland's rendered top and retains full-cube and closed-door collision", () => {
  const get = (x: number, y: number, z: number) => x === 0 && z === 0 && y === 10 ? farmlandId(7) : AIR;
  const body = createPlayerBody({ x: .5, y: 12, z: .5 });
  for (let i = 0; i < 180; i++) stepPlayer(get, body, { forward: 0, strafe: 0, jump: false, descend: false, sprint: false }, 1 / 60);
  expect(body.onGround).toBe(true); expect(body.position.y).toBeCloseTo(10 + 15 / 16, 4);
  expect(boxCollides(get, { minX: .2, maxX: .8, minY: 10.95, maxY: 11.5, minZ: .2, maxZ: .8 })).toBe(false);
  const door = BLOCKS.find((b) => b.name.startsWith("door_wooden_lower_") && b.solid)!;
  expect(boxCollides(() => door.id, { minX: .2, maxX: .8, minY: .2, maxY: .8, minZ: .2, maxZ: .8 })).toBe(true);
});

it("decays unwatered soil to dirt, retains dry planted farmland and restores all saved moisture/age states", () => {
  const world = new World(5);
  world.setBlock(8, 90, 8, farmlandId(7));
  const system = new FarmingSystem(world); advance(system, 20000);
  expect(world.getBlock(8, 90, 8)).toBe(blockId("dirt"));
  world.setBlock(8, 90, 8, farmlandId(0)); world.setBlock(8, 91, 8, wheatId(0));
  advance(system, 20000, 10, 0); expect(world.getBlock(8, 90, 8)).toBe(farmlandId(0));
  for (let n = 0; n < 8; n++) { world.setBlock(n, 84, 0, farmlandId(n)); world.setBlock(n, 85, 0, wheatId(n)); }
  const save = parseSave(serializeSave({ name: "states", seed: world.seed, mode: "survival", timeOfDay: .3,
    player: { position: { x: 8, y: 91, z: 8 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: world.exportEdits(), farming: system.toJSON() }));
  const restored = new World(save.seed); restored.importEdits(save.edits);
  for (let n = 0; n < 8; n++) { expect(restored.getBlock(n, 84, 0)).toBe(farmlandId(n)); expect(restored.getBlock(n, 85, 0)).toBe(wheatId(n)); }
  system.dispose();
});

it("preflights Agent block contents and capacity before mutation, and recovers contents only after success", () => {
  const world = new World(5), agent = createAgent(8, 91, 8, 2);
  const furnace = blockId("furnace"); world.setBlock(8, 91, 7, furnace);
  const calls: string[] = [];
  const refused = runAgentCommand(world, agent, { op: "destroy", dir: "forward" }, {
    beforeDestroy: (x, y, z) => { expect([x, y, z]).toEqual([8, 91, 7]); calls.push("before"); return false; },
    afterDestroy: () => calls.push("after"),
  });
  expect(refused.ok).toBe(false); expect(world.getBlock(8, 91, 7)).toBe(furnace); expect(agent.slots.every((s) => s === null)).toBe(true); expect(calls).toEqual(["before"]);
  expect(runAgentCommand(world, agent, { op: "destroy", dir: "forward" }, {
    beforeDestroy: () => { calls.push("before"); return true; },
    afterDestroy: () => { expect(world.getBlock(8, 91, 7)).toBe(AIR); calls.push("after"); },
  }).ok).toBe(true);
  expect(calls).toEqual(["before", "before", "after"]); expect(agent.slots[0]).toEqual({ id: furnace, count: 1 });
  world.setBlock(8, 91, 7, wheatId(7));
  for (let i = 0; i < agent.slots.length; i++) agent.slots[i] = { id: blockId("stone"), count: 64 };
  let called = false;
  expect(runAgentCommand(world, agent, { op: "destroy", dir: "forward" }, { beforeDestroy: () => { called = true; return true; } }).ok).toBe(false);
  expect(called).toBe(false); expect(world.getBlock(8, 91, 7)).toBe(wheatId(7));
});

it("reserves furnace contents together with its block and supported plant in one harvest transaction", () => {
  const world = new World(5), bag = new Inventory(), furnace = blockId("furnace"), flower = blockId("dandelion");
  world.setBlock(8, 90, 8, furnace); world.setBlock(8, 91, 8, flower);
  for (let i = 0; i < 34; i++) bag.setSlot(i, { id: blockId("stone"), count: 64 });
  bag.setSlot(0, { id: stackId("iron_pickaxe"), count: 1, damage: 12 });
  const content = { id: stackId("iron_chestplate"), count: 1, damage: 73 };
  const before = bag.toJSON();
  expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, [content])).toBe(false);
  expect(bag.toJSON()).toEqual(before); expect(world.getBlock(8, 90, 8)).toBe(furnace); expect(world.getBlock(8, 91, 8)).toBe(flower);
  bag.setSlot(33, null);
  expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, [content])).toBe(true);
  expect(world.getBlock(8, 90, 8)).toBe(AIR); expect(world.getBlock(8, 91, 8)).toBe(AIR);
  expect(bag.slots.slice(33)).toEqual([{ id: furnace, count: 1 }, { id: flower, count: 1 }, content]);
  expect(bag.slots[0]!.damage).toBe(13);
  world.setBlock(8, 90, 8, furnace); bag.slots.fill(null);
  expect(breakBlock(world, bag, "creative", 8, 90, 8, () => 0, [content])).toBe(true);
  expect(bag.slots.filter(Boolean)).toEqual([content]);
});
