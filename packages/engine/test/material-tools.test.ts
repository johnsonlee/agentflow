import { historicalItemMap } from "./historical-item-map";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AIR, ITEMS, Inventory, World, blockId, breakBlock, breakTime, canHarvest, craftOnce, itemId,
  matchRecipe, parseCommand, parseSave, serializeSave, stackId, toolOf, type CraftingGrid,
} from "../src";

const materials = ["golden", "diamond"] as const;
const kinds = ["pickaxe", "axe", "shovel", "sword"] as const;
const stack = (name: string, count = 1) => ({ id: stackId(name), count });

// Snapshot of the complete id/name mapping at PR revision f0e47b7, before these tools were appended.
// A renamed or reordered old item would silently reinterpret saved player and Agent inventories.
it("preserves every existing saved item id and appends the eight new tools", () => {
  const old = historicalItemMap(ITEMS.slice(0, 175));
  expect(createHash("sha256").update(JSON.stringify(old) + "\n").digest("hex"))
    .toBe("944783e08056612e522e46ee9f4f7e64337e8ecb4fe096eef91acfc65164c152");
  expect(ITEMS.slice(175, 183).map((i) => i.name)).toEqual(materials.flatMap((m) => kinds.map((k) => `${m}_${k}`)));
});

it("uses Bedrock attack damage, speed, harvest level and uses before breaking", () => {
  const expected = {
    golden: { tier: 1, speed: 12, durability: 33, attack: [3, 4, 2, 5] },
    diamond: { tier: 4, speed: 8, durability: 1562, attack: [6, 7, 5, 8] },
  };
  for (const material of materials) kinds.forEach((kind, index) => {
    const { attack, ...stats } = expected[material];
    expect(toolOf(itemId(`${material}_${kind}`))).toEqual({ ...stats, material, kind, attack: attack[index] });
    expect(parseCommand(`/give minecraft:${material}_${kind}`)).toEqual({ type: "give", id: itemId(`${material}_${kind}`), count: 1 });
  });
});

for (const material of materials) describe(`${material} survival tools`, () => {
  const headName = material === "golden" ? "gold_ingot" : "diamond";
  it("crafts each tool, consumes its materials, accepts mirrored axes, and rejects mixed heads", () => {
    const h = () => stack(headName, 2), k = () => stack("stick", 2);
    const patterns: Record<typeof kinds[number], CraftingGrid> = {
      pickaxe: [h(), h(), h(), null, k(), null, null, k(), null],
      axe: [null, h(), h(), null, k(), h(), null, k(), null],
      shovel: [h(), null, null, k(), null, null, k(), null, null],
      sword: [h(), null, null, h(), null, null, k(), null, null],
    };
    for (const kind of kinds) {
      const grid = patterns[kind];
      expect(craftOnce(grid, 3)).toEqual(stack(`${material}_${kind}`));
      expect(grid.filter(Boolean).every((s) => s?.count === 1)).toBe(true);
    }
    expect(matchRecipe([stack(headName), stack(headName), null, stack("stick")], 2)).toBeNull();
    // These tools require three rows (or columns), so they need the crafting table.
    expect(matchRecipe([h(), null, h(), null], 2)).toBeNull();
    expect(matchRecipe([h(), stack(material === "golden" ? "diamond" : "gold_ingot"), h(), null, k(), null, null, k(), null], 3)).toBeNull();
  });

  it("collects only harvestable drops, wears tools and breaks on the final use", () => {
    const world = new World(47);
    const inv = new Inventory();
    const name = `${material}_pickaxe`;
    const durability = toolOf(itemId(name))!.durability;
    inv.setSlot(0, { ...stack(name), damage: durability - 2 });
    world.setBlock(0, 70, 0, blockId("stone"));
    world.setBlock(1, 70, 0, blockId("diamond_ore"));
    expect(breakBlock(world, inv, "survival", 0, 70, 0)).toBe(true);
    expect(inv.slots[0]?.damage).toBe(durability - 1);
    expect(breakBlock(world, inv, "survival", 1, 70, 0)).toBe(true);
    expect(world.getBlock(1, 70, 0)).toBe(AIR);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots.some((s) => s?.id === blockId("cobblestone"))).toBe(true);
    expect(inv.slots.some((s) => s?.id === itemId("diamond"))).toBe(material === "diamond");
  });

  it("keeps worn tools separate across save and load", () => {
    const inv = new Inventory();
    inv.addStack({ ...stack(`${material}_sword`), damage: 12 });
    inv.addStack({ ...stack(`${material}_sword`), damage: 13 });
    const saved = serializeSave({
      name: "tools", seed: 47, mode: "survival", timeOfDay: 0.3,
      player: { position: { x: 0, y: 70, z: 0 }, yaw: 0, pitch: 0, flying: false },
      inventory: inv.toJSON(), edits: [],
    });
    expect(Inventory.fromJSON(parseSave(saved).inventory).slots.slice(0, 2)).toEqual(inv.slots.slice(0, 2));
  });
});

it("gold mines stone fastest but cannot harvest higher-tier ores", () => {
  const gold = toolOf(itemId("golden_pickaxe"));
  const diamond = toolOf(itemId("diamond_pickaxe"));
  expect(breakTime("survival", blockId("stone"), gold)).toBeCloseTo(2.25 / 12);
  expect(breakTime("survival", blockId("stone"), diamond)).toBeCloseTo(2.25 / 8);
  expect(canHarvest(blockId("coal_ore"), gold)).toBe(true);
  for (const name of ["iron_ore", "gold_ore", "diamond_ore", "redstone_ore"]) {
    expect(canHarvest(blockId(name), gold)).toBe(false);
    expect(canHarvest(blockId(name), diamond)).toBe(true);
  }
  expect(canHarvest(blockId("diamond_ore"), toolOf(itemId("diamond_axe")))).toBe(false);
});
