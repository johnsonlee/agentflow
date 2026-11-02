import { describe, expect, it } from "vitest";
import {
  AIR, ITEMS, ITEM_ID_BASE, Inventory, World, blockId, breakBlock, breakTime, canHarvest, craftOnce, displayNameOf, isItem,
  itemById, itemId, matchRecipe, maxStackOf, parseCommand, parseSave, placeBlock, serializeSave, stackId, toolOf,
  type CraftingGrid, type ItemStack,
} from "../src";

const st = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const P = () => st("oak_planks");
const C = () => st("cobblestone");
const K = () => st("stick");

function stoneFloor(): World {
  const world = new World(1);
  for (let x = -2; x < 4; x++) for (let z = -2; z < 4; z++) for (let y = 0; y < 90; y++) world.setBlock(x, y, z, y <= 50 ? blockId("stone") : AIR);
  return world;
}

function holding(name: string, damage?: number): Inventory {
  const inv = new Inventory();
  inv.setSlot(0, damage ? { id: itemId(name), count: 1, damage } : { id: itemId(name), count: 1 });
  return inv;
}

describe("item registry", () => {
  it("keeps item ids apart from block ids and resolves names both ways", () => {
    expect(ITEMS.every((i) => isItem(i.id) && i.id >= ITEM_ID_BASE)).toBe(true);
    expect(isItem(blockId("stone"))).toBe(false);
    expect(stackId("stone")).toBe(blockId("stone"));
    expect(itemById(itemId("wooden_pickaxe")).displayName).toBe("Wooden Pickaxe");
    expect(displayNameOf(itemId("stick"))).toBe("Stick");
    expect(displayNameOf(blockId("dirt"))).toBe("Dirt");
    expect(() => itemId("diamond_hoe")).toThrow();
  });

  it("has wooden and stone pickaxe, axe, shovel and sword with Minecraft stats", () => {
    for (const m of ["wooden", "stone"]) for (const k of ["pickaxe", "axe", "shovel", "sword"]) expect(toolOf(itemId(`${m}_${k}`))?.kind).toBe(k);
    expect(toolOf(itemId("wooden_pickaxe"))).toMatchObject({ tier: 1, speed: 2, durability: 59 });
    expect(toolOf(itemId("stone_pickaxe"))).toMatchObject({ tier: 2, speed: 4, durability: 131 });
    expect(toolOf(itemId("stick"))).toBeNull();
    expect(toolOf(blockId("stone"))).toBeNull();
  });

  it("swords hit hardest, and stone beats wood", () => {
    const attack = (n: string) => toolOf(itemId(n))!.attack;
    expect(attack("wooden_sword")).toBeGreaterThan(attack("wooden_axe"));
    expect(attack("wooden_sword")).toBeGreaterThan(attack("wooden_pickaxe"));
    expect(attack("stone_sword")).toBeGreaterThan(attack("wooden_sword"));
  });
});

describe("item stacks", () => {
  it("tools stack to 1, sticks and blocks to 64", () => {
    expect(maxStackOf(itemId("wooden_sword"))).toBe(1);
    expect(maxStackOf(itemId("stick"))).toBe(64);
    expect(maxStackOf(blockId("dirt"))).toBe(64);
    const inv = new Inventory();
    expect(inv.add(itemId("stone_axe"), 3)).toBe(0);
    expect(inv.slots.slice(0, 3).map((s) => s?.count)).toEqual([1, 1, 1]);
    inv.add(itemId("stick"), 70);
    expect(inv.slots[3]).toEqual({ id: itemId("stick"), count: 64 });
    expect(inv.slots[4]).toEqual({ id: itemId("stick"), count: 6 });
  });

  it("addStack keeps a tool's wear", () => {
    const inv = new Inventory();
    inv.addStack({ id: itemId("wooden_pickaxe"), count: 1, damage: 10 });
    expect(inv.slots[0]).toEqual({ id: itemId("wooden_pickaxe"), count: 1, damage: 10 });
  });

  it("items cannot be placed as blocks", () => {
    const world = stoneFloor();
    const inv = holding("stick");
    expect(placeBlock(world, inv, "survival", 0, 51, 0, { x: 3.5, y: 51, z: 3.5 })).toBe(false);
    expect(world.getBlock(0, 51, 0)).toBe(AIR);
  });

  it("/give accepts items", () => {
    expect(parseCommand("/give wooden_pickaxe")).toEqual({ type: "give", id: itemId("wooden_pickaxe"), count: 1 });
    expect(parseCommand("/give minecraft:stick 8")).toEqual({ type: "give", id: itemId("stick"), count: 8 });
  });
});

describe("tool recipes (Minecraft shapes)", () => {
  it("2 planks stacked vertically make 4 sticks, in the 2x2 grid", () => {
    expect(matchRecipe([P(), null, P(), null], 2)?.result).toEqual({ id: itemId("stick"), count: 4 });
    expect(matchRecipe([P(), P(), null, null], 2)).toBeNull();
  });

  it("pickaxe: three heads over two sticks, 3x3 only", () => {
    const grid: CraftingGrid = [P(), P(), P(), null, K(), null, null, K(), null];
    expect(matchRecipe(grid, 3)?.result).toEqual({ id: itemId("wooden_pickaxe"), count: 1 });
    expect(craftOnce(grid, 3)).toEqual({ id: itemId("wooden_pickaxe"), count: 1 });
    expect(grid.every((s) => s === null)).toBe(true);
    const stone: CraftingGrid = [C(), C(), C(), null, K(), null, null, K(), null];
    expect(matchRecipe(stone, 3)?.result.id).toBe(itemId("stone_pickaxe"));
  });

  it("axe in either orientation, shovel and sword", () => {
    expect(matchRecipe([P(), P(), null, P(), K(), null, null, K(), null], 3)?.recipe.id).toBe("wooden_axe");
    expect(matchRecipe([null, P(), P(), null, K(), P(), null, K(), null], 3)?.recipe.id).toBe("wooden_axe");
    expect(matchRecipe([null, C(), null, null, K(), null, null, K(), null], 3)?.recipe.id).toBe("stone_shovel");
    expect(matchRecipe([null, null, C(), null, null, C(), null, null, K()], 3)?.recipe.id).toBe("stone_sword");
    // Mixed materials don't form a tool.
    expect(matchRecipe([P(), C(), P(), null, K(), null, null, K(), null], 3)).toBeNull();
  });
});

describe("tool-based mining", () => {
  const stone = blockId("stone");

  it("break time depends on tool type and tier (Minecraft: stone 7.5 s by hand, 1.125 s wood pick, 0.5625 s stone pick)", () => {
    expect(breakTime("survival", stone)).toBeCloseTo(7.5);
    expect(breakTime("survival", stone, toolOf(itemId("wooden_pickaxe")))).toBeCloseTo(1.125);
    expect(breakTime("survival", stone, toolOf(itemId("stone_pickaxe")))).toBeCloseTo(0.5625);
    // The wrong tool is no faster than a hand.
    expect(breakTime("survival", stone, toolOf(itemId("stone_shovel")))).toBeCloseTo(7.5);
    expect(breakTime("survival", blockId("dirt"), toolOf(itemId("wooden_shovel")))).toBeCloseTo(0.375);
    expect(breakTime("survival", blockId("oak_log"), toolOf(itemId("stone_axe")))).toBeCloseTo(0.75);
    expect(breakTime("creative", stone, null)).toBe(0);
  });

  it("stone and ores drop only with a good enough pickaxe", () => {
    expect(canHarvest(stone, null)).toBe(false);
    expect(canHarvest(stone, toolOf(itemId("wooden_axe")))).toBe(false);
    expect(canHarvest(stone, toolOf(itemId("wooden_pickaxe")))).toBe(true);
    expect(canHarvest(blockId("iron_ore"), toolOf(itemId("wooden_pickaxe")))).toBe(false);
    expect(canHarvest(blockId("iron_ore"), toolOf(itemId("stone_pickaxe")))).toBe(true);
    expect(canHarvest(blockId("diamond_ore"), toolOf(itemId("stone_pickaxe")))).toBe(false);
    expect(canHarvest(blockId("dirt"), null)).toBe(true);

    const world = stoneFloor();
    const hand = new Inventory();
    expect(breakBlock(world, hand, "survival", 0, 50, 0)).toBe(true);
    expect(world.getBlock(0, 50, 0)).toBe(AIR);
    expect(hand.slots.filter(Boolean)).toEqual([]);

    const pick = holding("wooden_pickaxe");
    breakBlock(world, pick, "survival", 1, 50, 0);
    expect(pick.slots[1]).toEqual({ id: blockId("cobblestone"), count: 1 });
  });

  it("tools wear by one use per block and break when spent; creative never wears", () => {
    const world = stoneFloor();
    const inv = holding("wooden_pickaxe", 57);
    breakBlock(world, inv, "survival", 0, 50, 0);
    expect(inv.slots[0]).toMatchObject({ id: itemId("wooden_pickaxe"), damage: 58 });
    breakBlock(world, inv, "survival", 1, 50, 0);
    expect(inv.slots[0]?.id).not.toBe(itemId("wooden_pickaxe"));
    expect(inv.slots.some((s) => s?.id === itemId("wooden_pickaxe"))).toBe(false);
    expect(inv.slots.filter((s) => s?.id === blockId("cobblestone"))[0]?.count).toBe(2);

    const creative = holding("wooden_pickaxe");
    breakBlock(world, creative, "creative", 2, 50, 0);
    expect(creative.slots[0]).toEqual({ id: itemId("wooden_pickaxe"), count: 1 });
  });

  it("damageSelected ignores non-tools", () => {
    const inv = holding("stick");
    expect(inv.damageSelected(5)).toBe(false);
    expect(inv.slots[0]).toEqual({ id: itemId("stick"), count: 1 });
  });
});

describe("saves with items", () => {
  const base = {
    name: "w", seed: 1, mode: "survival" as const, timeOfDay: 0.3,
    player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false }, edits: [],
  };

  it("round-trips tools with wear and sticks", () => {
    const inv = new Inventory();
    inv.addStack({ id: itemId("stone_sword"), count: 1, damage: 7 });
    inv.add(itemId("stick"), 5);
    inv.add(blockId("dirt"), 3);
    const loaded = Inventory.fromJSON(parseSave(serializeSave({ ...base, inventory: inv.toJSON() })).inventory);
    expect(loaded.slots.slice(0, 3)).toEqual([
      { id: itemId("stone_sword"), count: 1, damage: 7 },
      { id: itemId("stick"), count: 5 },
      { id: blockId("dirt"), count: 3 },
    ]);
  });

  it("loads saves written before items existed, and drops unknown ids", () => {
    const old = JSON.stringify({ version: 1, ...base, inventory: { slots: [{ id: blockId("glass"), count: 4 }, { id: 9999, count: 1 }], selected: 0 } });
    const loaded = Inventory.fromJSON(parseSave(old).inventory);
    expect(loaded.slots[0]).toEqual({ id: blockId("glass"), count: 4 });
    expect(loaded.slots[1]).toBeNull();
  });
});
