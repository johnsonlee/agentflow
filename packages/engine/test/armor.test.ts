import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ARMOR_SLOTS, ITEMS, Inventory, applyArmorDamage, armorOf, armorPoints, craftOnce, durabilityOf,
  matchRecipe, parseSave, serializeSave, sanitizeInventoryPending, stackId, type CraftingGrid, type InventoryData,
} from "../src";

const piece = (name: string, damage?: number) => ({ id: stackId(name), count: 1, ...(damage === undefined ? {} : { damage }) });
const materials = ["iron", "golden", "diamond"] as const;
const kinds = ["helmet", "chestplate", "leggings", "boots"] as const;

it("persists held equipment and crafting stacks without repairing malformed armor or losing book content", () => {
  const book = { id: stackId("written_book"), count: 1, book: { pages: ["Saved notes"], title: "Journal", author: "Player" } };
  const pending = [piece("iron_chestplate", 31), { id: stackId("iron_ingot"), count: 8 }, book];
  const restored = parseSave(JSON.stringify({ version: 1, seed: 123, inventoryPending: pending }));
  expect(restored.inventoryPending).toEqual(pending);
  expect(parseSave(JSON.stringify({ version: 1, seed: 123 })).inventoryPending).toEqual([]);
  expect(sanitizeInventoryPending([piece("iron_chestplate", 240), { id: -1, count: 1 }, null, pending[0]])).toEqual([pending[0]]);
  expect(sanitizeInventoryPending(Array.from({ length: 15 }, () => pending[0]))).toHaveLength(10);
  expect(sanitizeInventoryPending(Object.create({ 0: pending[0], length: 1 }))).toEqual([]);
  const clean = sanitizeInventoryPending(pending);
  clean[2].book!.pages[0] = "changed";
  expect(book.book.pages[0]).toBe("Saved notes");
});

it("preserves all 428 published item IDs and appends twelve armor pieces", () => {
  expect(createHash("sha256").update(JSON.stringify(ITEMS.slice(0, 428).map(({ id, name }) => [id, name])) + "\n").digest("hex"))
    .toBe("dc679c47561b0a4f232b1f40daf5cbc8c51c0b660f9f9062647edbf3dcb28dd2");
  expect(ITEMS.slice(428).map((i) => i.name)).toEqual(materials.flatMap((m) => kinds.map((k) => `${m}_${k}`)));
});

for (const [mi, material] of materials.entries()) describe(`${material} armor`, () => {
  const points = [[2, 6, 5, 2], [2, 5, 3, 1], [3, 8, 6, 3]][mi];
  const uses = [[165, 240, 225, 195], [77, 112, 105, 91], [363, 528, 495, 429]][mi];
  it("crafts all four shaped recipes with the right material and consumes each ingredient", () => {
    const ingredient = material === "golden" ? "gold_ingot" : material === "iron" ? "iron_ingot" : "diamond";
    const shapes = [[0, 1, 2, 3, 5], [0, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 5, 6, 8], [0, 2, 3, 5]];
    kinds.forEach((kind, i) => {
      const grid: CraftingGrid = new Array(9).fill(null);
      shapes[i].forEach((cell) => { grid[cell] = { id: stackId(ingredient), count: 2 }; });
      expect(craftOnce(grid, 3)).toEqual(piece(`${material}_${kind}`));
      expect(grid.filter(Boolean).every((s) => s!.count === 1)).toBe(true);
      grid[shapes[i][0]] = piece("stick");
      expect(matchRecipe(grid, 3)).toBeNull();
      const def = ITEMS.find((item) => item.name === `${material}_${kind}`)!;
      expect(def.maxStack).toBe(1);
      expect(armorOf(def.id)).toEqual({ material, slot: ARMOR_SLOTS[i], points: points[i], durability: uses[i] });
      expect(durabilityOf(def.id)).toBe(uses[i]);
    });
    expect(matchRecipe([piece(ingredient), piece(ingredient), piece(ingredient), piece(ingredient)], 2)).toBeNull();
  });
  it("equips the complete set, reduces melee, wears each piece and preserves excluded damage", () => {
    const inv = new Inventory();
    kinds.forEach((kind, i) => expect(inv.swapEquipment(ARMOR_SLOTS[i], piece(`${material}_${kind}`)).ok).toBe(true));
    expect(armorPoints(inv)).toBe(points.reduce((a, b) => a + b, 0));
    expect(applyArmorDamage(inv, 9)).toBeCloseTo(9 * (1 - points.reduce((a, b) => a + b, 0) * 0.04));
    ARMOR_SLOTS.forEach((slot) => expect(inv.equipment[slot]!.damage).toBe(2));
    const before = inv.toJSON();
    for (const kind of ["fall", "starvation", "void"] as const) expect(applyArmorDamage(inv, 9, kind)).toBe(9);
    expect(inv.toJSON()).toEqual(before);
    for (const amount of [NaN, Infinity, -1, 0]) expect(applyArmorDamage(inv, amount)).toBe(0);
    expect(inv.toJSON()).toEqual(before);
  });
});

it("rejects wrong slots and invalid cursor stacks atomically and exchanges worn pieces without loss", () => {
  const inv = new Inventory();
  const old = piece("iron_chestplate", 12), next = piece("diamond_chestplate", 7);
  expect(inv.swapEquipment("chest", old)).toEqual({ ok: true, stack: null });
  for (const invalid of [piece("iron_helmet"), piece("stick"), { ...next, count: 2 }, piece("diamond_chestplate", -1), piece("diamond_chestplate", 528)]) {
    expect(inv.swapEquipment("chest", invalid)).toEqual({ ok: false, stack: invalid });
    expect(inv.equipment.chest).toEqual(old);
  }
  expect(inv.swapEquipment("chest", next)).toEqual({ ok: true, stack: old });
  expect(inv.swapEquipment("chest", null)).toEqual({ ok: true, stack: next });
  expect(armorPoints(inv)).toBe(0);
});

it("handles equipment swaps in a full bag and refuses unequip without space", () => {
  const inv = new Inventory();
  for (let i = 0; i < 36; i++) inv.setSlot(i, piece("stick"));
  inv.setSlot(12, piece("diamond_boots", 5));
  inv.swapEquipment("feet", piece("golden_boots", 3));
  expect(inv.equipFromSlot(12)).toBe(true);
  expect(inv.slots[12]).toEqual(piece("golden_boots", 3));
  expect(inv.equipment.feet).toEqual(piece("diamond_boots", 5));
  expect(inv.unequip("feet")).toBe(false);
  expect(inv.equipment.feet).toEqual(piece("diamond_boots", 5));
  inv.setSlot(20, null);
  expect(inv.unequip("feet")).toBe(true);
  expect(inv.slots[20]).toEqual(piece("diamond_boots", 5));
  expect(inv.equipment.feet).toBeNull();
  for (const index of [-1, 36, 1.5, NaN]) expect(inv.equipFromSlot(index)).toBe(false);
});

it("protects the last eligible hit, breaks at durability, and ignores corrupted equipment", () => {
  const inv = new Inventory();
  inv.swapEquipment("chest", piece("iron_chestplate", 239));
  expect(applyArmorDamage(inv, 3)).toBeCloseTo(2.28);
  expect(inv.equipment.chest).toBeNull();
  expect(applyArmorDamage(inv, 3)).toBe(3);
  inv.equipment.chest = piece("diamond_chestplate", 528);
  inv.equipment.head = piece("diamond_boots");
  inv.equipment.feet = { ...piece("diamond_boots"), count: 2 };
  expect(armorPoints(inv)).toBe(0);
  expect(applyArmorDamage(inv, 3)).toBe(3);
  expect(durabilityOf(stackId("stick"))).toBeNull();
  expect(durabilityOf(NaN)).toBeNull();
  expect(armorOf(stackId("iron_sword"))).toBeNull();
});

it("round trips worn bag and equipped armor, loads old saves and discards bad equipment independently", () => {
  const inv = new Inventory();
  inv.addStack(piece("iron_helmet", 10));
  inv.swapEquipment("chest", piece("diamond_chestplate", 20));
  inv.swapEquipment("feet", piece("golden_boots", 90));
  const saved = serializeSave({ name: "armor", seed: 7, mode: "survival", timeOfDay: 0.3,
    player: { position: { x: 0, y: 70, z: 0 }, yaw: 0, pitch: 0, flying: false }, inventory: inv.toJSON(), edits: [] });
  expect(Inventory.fromJSON(parseSave(saved).inventory).toJSON()).toEqual(inv.toJSON());
  const old = JSON.parse(saved); delete old.inventory.equipment;
  const restored = Inventory.fromJSON(parseSave(JSON.stringify(old)).inventory);
  expect(restored.slots[0]).toEqual(piece("iron_helmet", 10));
  expect(armorPoints(restored)).toBe(0);
  old.inventory.equipment = { chest: piece("iron_chestplate", 240), head: piece("diamond_boots"), feet: piece("golden_boots", 90), legs: { ...piece("iron_leggings"), count: 2 } };
  const repaired = Inventory.fromJSON(parseSave(JSON.stringify(old)).inventory);
  expect(repaired.slots[0]).toEqual(piece("iron_helmet", 10));
  expect(repaired.equipment).toEqual({ head: null, chest: null, legs: null, feet: piece("golden_boots", 90) });
  const inherited = Object.create({ chest: piece("diamond_chestplate") });
  expect(armorPoints(Inventory.fromJSON({ slots: [], selected: 0, equipment: inherited } as InventoryData))).toBe(0);
});
