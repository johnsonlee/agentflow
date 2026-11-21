import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  BLOCKS, COMPOUNDS, ITEMS, LAB_PRODUCTS, Inventory, World, blockId, constructElement, craftOnce,
  createAgent, createCompound, giveAgent, itemById, labReaction, nameOf, parseCommand, parseSave,
  reduceMaterial, runAgentCommand, sanitizeAgent, sanitizeFurnaces, sanitizeInventoryPending, serializeSave,
  stackId, type CraftingGrid, type ItemStack,
} from "../src/index";
import { historicalItemMap } from "./historical-item-map";

const compoundId = 402, productId = 704;
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const coloredWool = BLOCKS.filter((b) => b.name.endsWith("_wool") && b.name !== "white_wool");

it("retains the old NaClO identity at ID402 and appends a distinct bleach product without moving any other ID", () => {
  expect(stackId("sodium_hypochlorite")).toBe(compoundId);
  expect(itemById(compoundId)).toMatchObject({ name: "sodium_hypochlorite", displayName: "Sodium Hypochlorite", icon: "item_compound_sodium_hypochlorite", chem: { kind: "compound", formula: "NaClO" } });
  expect(COMPOUNDS.find((c) => c.name === "sodium_hypochlorite")).toMatchObject({ formula: "NaClO", recipe: [["Na", 1], ["Cl", 1], ["O", 1]] });
  expect(COMPOUNDS.some((c) => c.name === "bleach")).toBe(false);
  expect(stackId("bleach")).toBe(productId);
  expect(ITEMS.slice(448, 449).map((i) => [i.id, i.name])).toEqual([[productId, "bleach"]]);
  expect(itemById(productId)).toMatchObject({ displayName: "Bleach", icon: "item_product_bleach", chem: { kind: "product" }, maxStack: 64 });
  expect(LAB_PRODUCTS.map((p) => p.product)).toEqual(["heat_block", "super_fertilizer", "ice_bomb", "underwater_torch", "glow_stick"]);
  expect(createHash("sha256").update(JSON.stringify(historicalItemMap(ITEMS.slice(0, 448))) + "\n").digest("hex"))
    .toBe("a1222a5815e226e6abc590dd4b5ec912aea858050cd49e05e26eb40df2f5f888");
  // Normalization is deliberately restricted to this corrected label at this one old ID.
  expect(historicalItemMap([{ id: 402, name: "sodium_hypochlorite" }, { id: 403, name: "sodium_hypochlorite" }, { id: 402, name: "changed" }, { id: 704, name: "bleach" }]))
    .toEqual([[402, "bleach"], [403, "sodium_hypochlorite"], [402, "changed"], [704, "bleach"]]);
  expect(parseCommand("/give bleach 2")).toEqual({ type: "give", id: productId, count: 2 });
  expect(parseCommand("/give sodium_hypochlorite 2")).toEqual({ type: "give", id: compoundId, count: 2 });
});

it("constructs the reactant atoms, creates NaClO and water, then uses the exact three-plus-three Lab mixture", () => {
  const sodium = constructElement(11, 12, 11), chlorine = constructElement(17, 18, 17), oxygen = constructElement(8, 8, 8), hydrogen = constructElement(1, 0, 1);
  for (const atom of [sodium, chlorine, oxygen, hydrogen]) expect(atom).toHaveProperty("id");
  if (!("id" in sodium && "id" in chlorine && "id" in oxygen && "id" in hydrogen)) throw new Error("Expected neutral atoms");
  const hypo = createCompound([{ id: sodium.id, count: 1 }, { id: chlorine.id, count: 1 }, { id: oxygen.id, count: 1 }]);
  expect(hypo).toEqual({ id: compoundId });
  const water = createCompound([{ id: hydrogen.id, count: 2 }, { id: oxygen.id, count: 1 }]);
  expect(water).toEqual({ id: stackId("water_compound") });
  expect(labReaction([stack("water_compound", 3), stack("sodium_hypochlorite", 3)])).toEqual({ id: productId });
  expect(labReaction([stack("sodium_hypochlorite"), stack("water_compound"), null, stack("sodium_hypochlorite", 2), stack("water_compound", 2)])).toEqual({ id: productId });
  expect(reduceMaterial(compoundId)?.map((s) => [nameOf(s.id), s.count])).toEqual([["sodium", 1], ["chlorine", 1], ["oxygen", 1]]);
  expect(reduceMaterial(productId)).toBeNull();
});

it("refuses wrong Lab quantities, water blocks, finished bleach and extra ingredients without mutating inputs", () => {
  for (const ingredients of [
    [stack("water_compound", 2), stack("sodium_hypochlorite", 3)],
    [stack("water_compound", 3), stack("sodium_hypochlorite", 4)],
    [stack("water", 3), stack("sodium_hypochlorite", 3)],
    [stack("water_compound", 3), stack("bleach", 3)],
    [stack("water_compound", 3), stack("sodium_hypochlorite", 3), stack("salt")],
  ]) {
    const before = structuredClone(ingredients);
    expect(labReaction(ingredients)).toHaveProperty("error"); expect(ingredients).toEqual(before);
  }
});

it("whitens every existing colored wool in any crafting cells and consumes only one of each", () => {
  expect(coloredWool.map((b) => b.name)).toEqual(["red_wool", "orange_wool", "yellow_wool", "lime_wool", "blue_wool", "purple_wool", "black_wool", "magenta_wool", "light_blue_wool", "pink_wool", "gray_wool", "light_gray_wool", "cyan_wool", "brown_wool", "green_wool"]);
  for (const wool of coloredWool) for (const width of [2, 3]) {
    for (let a = 0; a < width * width; a++) for (let b = 0; b < width * width; b++) {
      if (a === b) continue;
      const grid: CraftingGrid = new Array(width * width).fill(null);
      grid[a] = stack("bleach", 2); grid[b] = { id: wool.id, count: 3 };
      expect(craftOnce(grid, width)).toEqual({ id: blockId("white_wool"), count: 1 });
      expect(grid[a]).toEqual(stack("bleach", 1)); expect(grid[b]).toEqual({ id: wool.id, count: 2 });
    }
  }
});

it("refuses raw NaClO, already-white wool and extra crafting ingredients without consumption", () => {
  for (const grid of [
    [stack("sodium_hypochlorite"), stack("red_wool"), null, null],
    [stack("bleach"), stack("white_wool"), null, null],
    [stack("bleach"), stack("red_wool"), stack("salt"), null],
  ] satisfies CraftingGrid[]) {
    const before = structuredClone(grid); expect(craftOnce(grid, 2)).toBeNull(); expect(grid).toEqual(before);
  }
});

it("loads legacy numeric NaClO saves and keeps compound/product identity distinct in bag, pending, furnace and Agent transfers", () => {
  const legacy = parseSave(JSON.stringify({ version: 1, seed: 13, inventory: { slots: [{ id: 402, count: 3 }], selected: 0 } }));
  const bag = Inventory.fromJSON(legacy.inventory);
  expect(bag.slots[0]).toEqual({ id: compoundId, count: 3 }); expect(nameOf(bag.slots[0]!.id)).toBe("sodium_hypochlorite");
  bag.add(productId, 2);
  const pending = [{ id: compoundId, count: 2 }, { id: productId, count: 1 }];
  const agent = createAgent(0, 60, 0);
  for (const s of pending) expect(giveAgent(agent, s)).toBe(0);
  const text = serializeSave({ name: "bleach identities", seed: 13, mode: "survival", timeOfDay: .3,
    player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), edits: [],
    inventoryPending: pending, agent, furnaces: [{ x: 1, y: 60, z: 1, state: { input: pending[0], fuel: null, output: pending[1], burnLeft: 0, burnTotal: 0, progress: 0 } }] });
  const save = parseSave(text);
  expect(Inventory.fromJSON(save.inventory).toJSON()).toEqual(bag.toJSON());
  expect(sanitizeInventoryPending(save.inventoryPending)).toEqual(pending);
  expect(sanitizeFurnaces(save.furnaces).furnaces[0].state).toMatchObject({ input: pending[0], output: pending[1] });
  const restoredAgent = sanitizeAgent(save.agent)!;
  expect(restoredAgent.slots.slice(0, 2)).toEqual(pending);
  const received = new Inventory();
  for (const slot of [0, 1]) expect(runAgentCommand(new World(13), restoredAgent, { op: "drop", slot }, { giveToPlayer: (s) => received.addStack(s) }).ok).toBe(true);
  expect(received.slots.slice(0, 2)).toEqual(pending);
  expect(received.slots.slice(0, 2).map((s) => itemById(s!.id).chem?.kind)).toEqual(["compound", "product"]);
});
