import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  BLOCKS, COMPOUNDS, ITEMS, Inventory, LEGACY_MATERIAL_REDUCTIONS, REDUCTIONS, blockId, createAgent, giveAgent, maxStackOf,
  parseSave, reduceMaterial, sanitizeAgent, sanitizeInventoryPending, serializeSave, stackId, type ItemStack,
} from "../src";

const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const summary = (parts: ItemStack[]) => parts.map(({ id, count }) => [id, count]);
const aggregate = (parts: ItemStack[]) => {
  const totals = new Map<number, number>();
  for (const { id, count } of parts) totals.set(id, (totals.get(id) ?? 0) + count);
  return totals;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");

it("matches the historical Journal p11 grass image, including oxygen split64+6 and total100", () => {
  const expected = [stack("carbon", 15), stack("oxygen", 64), stack("oxygen", 6), stack("nitrogen", 8), stack("phosphorus", 7)];
  expect(reduceMaterial(blockId("grass"))).toEqual(expected);
  expect(aggregate(expected)).toEqual(new Map([[stackId("carbon"), 15], [stackId("oxygen"), 70], [stackId("nitrogen"), 8], [stackId("phosphorus"), 7]]));
  expect(expected.reduce((n, s) => n + s.count, 0)).toBe(100);
  const first = reduceMaterial(blockId("grass"))!; first[0].count = 1;
  expect(reduceMaterial(blockId("grass"))).toEqual(expected); // previews must not share mutable counts.
});

it("retains explicit unverified glass/charcoal compatibility and compound/isotope semantics", () => {
  expect(LEGACY_MATERIAL_REDUCTIONS).toEqual([["glass", [["Si", 1], ["O", 2]]], ["charcoal", [["C", 1]]]]);
  expect(REDUCTIONS).toHaveLength(26); // 24 native-source rows plus the two retained legacy entries.
  expect(reduceMaterial(stackId("glass"))).toEqual([stack("silicon"), stack("oxygen", 2)]);
  expect(reduceMaterial(stackId("charcoal"))).toEqual([stack("carbon")]);
  expect(reduceMaterial(stackId("water_compound"))).toEqual([stack("hydrogen", 2), stack("oxygen", 1)]);
  expect(reduceMaterial(stackId("polyethylene"))).toEqual([stack("carbon", 10), stack("hydrogen", 20)]);
  expect(reduceMaterial(stackId("sodium_hypochlorite"))).toEqual([stack("sodium"), stack("chlorine"), stack("oxygen")]);
  for (const name of ["carbon_11", "hydrogen_2", "nickel_59"]) {
    const base = name.split("_")[0]; expect(reduceMaterial(stackId(name))).toEqual([stack(base)]);
  }
});

it("dispatches only bounded valid output stacks and keeps invalid/unsupported IDs refused", () => {
  for (const input of [...BLOCKS, ...ITEMS]) for (const s of reduceMaterial(input.id) ?? []) {
    expect(Number.isInteger(s.count)).toBe(true); expect(s.count).toBeGreaterThan(0); expect(s.count).toBeLessThanOrEqual(maxStackOf(s.id));
  }
  for (const compound of COMPOUNDS) expect(reduceMaterial(stackId(compound.name))).not.toBeNull();
  for (const id of [-1, .5, NaN, Infinity, 189, ITEMS.at(-1)!.id + 1, 32767, 65535, 65536]) expect(reduceMaterial(id)).toBeNull();
  for (const name of ["element_0", "element_6", "crafting_table", "bleach", "red_dye"]) expect(reduceMaterial(stackId(name))).toBeNull();
});

it("reserves all outputs jointly, refusing sand with only one empty slot without mutating the original bag", () => {
  const bag = new Inventory(); for (let i = 0; i < 35; i++) bag.setSlot(i, stack("stone", 64));
  const before = bag.toJSON(), outputs = reduceMaterial(blockId("sand"))!;
  expect(outputs.every((s) => bag.spaceFor(s.id) >= s.count)).toBe(true); // Old UI preflight is unsafe.
  const trial = Inventory.fromJSON(before); expect(outputs.map((s) => trial.addStack(s))).toEqual([0, 64, 3]);
  expect(bag.toJSON()).toEqual(before);
  bag.setSlot(34, null); bag.setSlot(33, null); const enough = Inventory.fromJSON(bag.toJSON());
  expect(outputs.map((s) => enough.addStack(s))).toEqual([0, 0, 0]);
  expect(enough.slots.filter((s) => s?.id !== blockId("stone"))).toEqual([stack("silicon", 33), stack("oxygen", 64), stack("oxygen", 3)]);
});

it("detects joint duplicate-oxygen overcommit and preserves exact aggregate counts when capacity suffices", () => {
  const bag = new Inventory(); for (let i = 0; i < 35; i++) bag.setSlot(i, stack("stone", 64));
  bag.setSlot(0, stack("carbon", 49)); bag.setSlot(1, stack("nitrogen", 56)); bag.setSlot(2, stack("phosphorus", 57));
  const outputs = reduceMaterial(blockId("grass"))!, before = bag.toJSON();
  expect(outputs.every((s) => bag.spaceFor(s.id) >= s.count)).toBe(true);
  const trial = Inventory.fromJSON(before); expect(outputs.map((s) => trial.addStack(s))).toEqual([0, 0, 6, 0, 0]);
  expect(bag.toJSON()).toEqual(before);
  bag.setSlot(34, null); const enough = Inventory.fromJSON(bag.toJSON());
  expect(outputs.map((s) => enough.addStack(s))).toEqual([0, 0, 0, 0, 0]);
  const atoms = enough.slots.filter((s): s is ItemStack => s !== null && s.id !== blockId("stone"));
  expect(aggregate(atoms)).toEqual(new Map([[stackId("carbon"), 64], [stackId("nitrogen"), 64], [stackId("phosphorus"), 64], [stackId("oxygen"), 70]]));
});

it("retains source-sized output stacks through actual JSON save, pending ownership and Agent transfer", () => {
  const outputs = reduceMaterial(blockId("grass"))!, bag = new Inventory(), agent = createAgent(8, 91, 8);
  for (const s of outputs) { expect(bag.addStack(s)).toBe(0); expect(giveAgent(agent, s)).toBe(0); }
  const parsed = parseSave(serializeSave({ name: "grass percentages", seed: 13, mode: "survival", timeOfDay: .3,
    player: { position: { x: 8, y: 91, z: 8 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), inventoryPending: outputs, agent, edits: [] }));
  expect(summary(Inventory.fromJSON(parsed.inventory).slots.filter((s): s is ItemStack => s !== null))).toEqual(summary(outputs));
  expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual(outputs);
  expect(sanitizeAgent(parsed.agent)).toEqual(agent);
});

it("does not add or move any dye-era registry or atom metadata identity", () => {
  expect(BLOCKS.slice(0, 291)).toHaveLength(291); expect(ITEMS.slice(0, 535)).toHaveLength(535);
  expect(hash(BLOCKS.slice(0, 291).map(({ id, name }) => [id, name]))).toBe("25176986039cc25bf6439a18fa41557d6795fff785648954210ae5451484b561");
  expect(hash(ITEMS.slice(0, 535).map(({ id, name }) => [id, name]))).toBe("885d45248089dcfd792313e7a5e8cd18f293596684eb119a628a8afda3844b3f");
  expect(hash(ITEMS.filter((i) => i.chem?.kind === "element" || i.chem?.kind === "isotope").map((i) => [i.id, i.chem!.kind, i.chem!.z, i.chem!.symbol, i.chem!.mass])))
    .toBe("54ba81669824eb6b526e76e1fff7f979ed42b273faed2f99b71012c5d34be270");
});
