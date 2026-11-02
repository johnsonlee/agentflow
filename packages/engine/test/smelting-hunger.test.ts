import { describe, expect, it } from "vitest";
import {
  AIR, EAT_SECONDS, EXHAUSTION, Inventory, MAX_FOOD, MOB_SPECS, SMELT_SECONDS, World, addExhaustion, blockId, breakBlock, canEat,
  canHarvest, createFurnace, createHunger, dropOf, eat, fuelSeconds, furnaceContents, itemId, matchRecipe, parseSave,
  serializeSave, smeltResult, stackId, tickFurnace, tickHunger, toolOf, type CraftingGrid,
} from "../src";

const st = (name: string, count = 1) => ({ id: stackId(name), count });

describe("smelting", () => {
  it("has the Minecraft recipes and fuels", () => {
    const pairs: [string, string][] = [
      ["iron_ore", "iron_ingot"], ["gold_ore", "gold_ingot"], ["sand", "glass"], ["cobblestone", "stone"],
      ["oak_log", "charcoal"], ["raw_porkchop", "cooked_porkchop"], ["raw_chicken", "cooked_chicken"],
    ];
    for (const [i, o] of pairs) expect(smeltResult(stackId(i))).toBe(stackId(o));
    expect(smeltResult(stackId("dirt"))).toBeNull();
    expect(fuelSeconds(stackId("coal"))).toBe(80);
    expect(fuelSeconds(stackId("charcoal"))).toBe(80);
    expect(fuelSeconds(stackId("oak_planks"))).toBe(15);
    expect(fuelSeconds(stackId("oak_log"))).toBe(15);
    expect(fuelSeconds(stackId("stick"))).toBe(5);
    expect(fuelSeconds(stackId("cobblestone"))).toBe(0);
  });

  it("smelts one item per 10 s while fuel burns, consuming fuel only when needed", () => {
    const f = createFurnace();
    f.input = st("iron_ore", 3);
    f.fuel = st("oak_planks", 2);
    tickFurnace(f, SMELT_SECONDS - 0.5);
    expect(f.output).toBeNull();
    expect(f.fuel).toEqual(st("oak_planks", 1));
    tickFurnace(f, 0.5);
    expect(f.output).toEqual(st("iron_ingot", 1));
    expect(f.input).toEqual(st("iron_ore", 2));
    // A plank burns 15 s = 1.5 items; the second plank is lit for the rest.
    tickFurnace(f, 2 * SMELT_SECONDS);
    expect(f.output).toEqual(st("iron_ingot", 3));
    expect(f.input).toBeNull();
    expect(f.fuel).toBeNull();
    // Two planks (2 x 15 s) smelt exactly three items.
    expect(f.burnLeft).toBeCloseTo(0);
  });

  it("does not light without something smeltable, and loses progress when the fire goes out", () => {
    const f = createFurnace();
    f.fuel = st("coal", 1);
    f.input = st("dirt", 1);
    tickFurnace(f, 5);
    expect(f.fuel).toEqual(st("coal", 1));
    expect(f.burnLeft).toBe(0);

    const g = createFurnace();
    g.input = st("sand", 1);
    g.fuel = st("stick", 1);
    tickFurnace(g, 5);
    expect(g.progress).toBeCloseTo(0.5);
    tickFurnace(g, 2.5);
    expect(g.progress).toBeCloseTo(0);
    expect(g.output).toBeNull();
  });

  it("stops when the output slot holds something else", () => {
    const f = createFurnace();
    f.input = st("sand", 1);
    f.fuel = st("coal", 1);
    f.output = st("stone", 1);
    tickFurnace(f, 20);
    expect(f.output).toEqual(st("stone", 1));
    expect(furnaceContents(f).map((s) => s.id).sort()).toEqual([stackId("sand"), stackId("coal"), stackId("stone")].sort());
  });

  it("furnace is crafted from 8 cobblestone in a ring and needs a pickaxe", () => {
    const c = () => st("cobblestone");
    const grid: CraftingGrid = [c(), c(), c(), c(), null, c(), c(), c(), c()];
    expect(matchRecipe(grid, 3)?.result).toEqual(st("furnace", 1));
    expect(canHarvest(blockId("furnace"), null)).toBe(false);
    expect(canHarvest(blockId("furnace"), toolOf(itemId("wooden_pickaxe")))).toBe(true);
  });
});

describe("iron tools and ore drops", () => {
  it("iron tools are crafted from ingots and harvest gold and diamond ore", () => {
    const i = () => st("iron_ingot");
    const k = () => st("stick");
    expect(matchRecipe([i(), i(), i(), null, k(), null, null, k(), null], 3)?.result).toEqual(st("iron_pickaxe", 1));
    expect(matchRecipe([null, i(), null, null, i(), null, null, k(), null], 3)?.result).toEqual(st("iron_sword", 1));
    const iron = toolOf(itemId("iron_pickaxe"))!;
    expect(iron).toMatchObject({ tier: 3, speed: 6, durability: 250 });
    expect(canHarvest(blockId("gold_ore"), iron)).toBe(true);
    expect(canHarvest(blockId("diamond_ore"), iron)).toBe(true);
    expect(canHarvest(blockId("gold_ore"), toolOf(itemId("stone_pickaxe")))).toBe(false);
  });

  it("coal ore drops coal, diamond ore a diamond, gold ore itself", () => {
    expect(dropOf(blockId("coal_ore"))).toBe(itemId("coal"));
    expect(dropOf(blockId("diamond_ore"))).toBe(itemId("diamond"));
    expect(dropOf(blockId("gold_ore"))).toBe(blockId("gold_ore"));
    expect(dropOf(blockId("stone"))).toBe(blockId("cobblestone"));

    const world = new World(1);
    world.setBlock(0, 50, 0, blockId("gold_ore"));
    world.setBlock(1, 50, 0, blockId("diamond_ore"));
    const inv = new Inventory();
    inv.setSlot(0, { id: itemId("iron_pickaxe"), count: 1 });
    breakBlock(world, inv, "survival", 0, 50, 0);
    breakBlock(world, inv, "survival", 1, 50, 0);
    expect(world.getBlock(0, 50, 0)).toBe(AIR);
    expect(inv.slots[1]).toEqual({ id: blockId("gold_ore"), count: 1 });
    expect(inv.slots[2]).toEqual({ id: itemId("diamond"), count: 1 });
    expect(inv.slots[0]).toMatchObject({ id: itemId("iron_pickaxe"), damage: 2 });
  });

  it("pigs and chickens drop raw meat", () => {
    expect(MOB_SPECS.pig.drop).toEqual(["raw_porkchop", 2]);
    expect(MOB_SPECS.chicken.drop).toEqual(["raw_chicken", 1]);
  });
});

describe("hunger", () => {
  it("activity drains saturation first, then food", () => {
    const h = createHunger();
    expect(h.food).toBe(MAX_FOOD);
    addExhaustion(h, 4 * 5);
    expect(h.saturation).toBe(0);
    expect(h.food).toBe(MAX_FOOD);
    addExhaustion(h, 4 * 3);
    expect(h.food).toBe(MAX_FOOD - 3);
    addExhaustion(h, EXHAUSTION.sprintPerBlock * 10);
    expect(h.exhaustion).toBeCloseTo(1);
  });

  it("regenerates health when well fed (costing exhaustion) and starves when empty", () => {
    const h = createHunger();
    expect(tickHunger(h, 3.9, 10, 20)).toBe(0);
    expect(tickHunger(h, 0.1, 10, 20)).toBe(1);
    expect(h.exhaustion).toBeCloseTo(2);
    expect(tickHunger(h, 10, 20, 20)).toBe(0);
    h.food = 17;
    expect(tickHunger(h, 10, 10, 20)).toBe(0);
    h.food = 0;
    expect(tickHunger(h, 4, 10, 20)).toBe(-1);
    // Normal difficulty: starvation stops at half a heart.
    expect(tickHunger(h, 4, 1, 20)).toBe(0);
  });

  it("eating restores food and saturation; not when full or not food", () => {
    const h = createHunger();
    expect(canEat(h, itemId("cooked_porkchop"))).toBe(false);
    h.food = 10;
    h.saturation = 0;
    expect(canEat(h, itemId("cooked_porkchop"))).toBe(true);
    expect(canEat(h, blockId("dirt"))).toBe(false);
    expect(eat(h, itemId("cooked_porkchop"))).toBe(true);
    expect(h.food).toBe(18);
    expect(h.saturation).toBeCloseTo(12.8);
    expect(eat(h, itemId("cooked_chicken"))).toBe(true);
    expect(h.food).toBe(20);
    expect(h.saturation).toBe(20);
    expect(eat(h, itemId("cooked_chicken"))).toBe(false);
    expect(eat(h, itemId("iron_ingot"))).toBe(false);
    expect(EAT_SECONDS).toBeGreaterThan(1);
  });
});

describe("saves with furnaces and hunger", () => {
  it("round-trips furnace contents and hunger", () => {
    const f = createFurnace();
    f.input = st("iron_ore", 2);
    f.progress = 0.4;
    const h = createHunger();
    h.food = 7;
    const text = serializeSave({
      name: "w", seed: 1, mode: "survival", timeOfDay: 0.3,
      player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false },
      inventory: new Inventory().toJSON(), edits: [], hunger: h, furnaces: [{ x: 1, y: 2, z: 3, state: f }],
    });
    const save = parseSave(text);
    expect(save.hunger).toEqual(h);
    expect(save.furnaces).toEqual([{ x: 1, y: 2, z: 3, state: f }]);
  });
});
