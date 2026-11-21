import { expect, it } from "vitest";
import {
  Inventory, SAVE_VERSION, createFurnace, parseSave, sanitizeFurnaces, serializeSave,
  setFurnaceInput, stackId, tickFurnace, type FurnaceState, type ItemStack,
} from "../src";

const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
function halfway(): FurnaceState {
  const f = createFurnace(); setFurnaceInput(f, stack("iron_ore")); f.fuel = stack("coal", 2);
  tickFurnace(f, 5); expect(f.progress).toBeCloseTo(.5); return f;
}
function restore(f: FurnaceState): FurnaceState {
  const save = parseSave(serializeSave({ name: "progress", seed: 1, mode: "survival", timeOfDay: .3,
    player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false },
    inventory: new Inventory().toJSON(), edits: [], furnaces: [{ x: 0, y: 60, z: 0, state: f }],
  }));
  expect(save.version).toBe(SAVE_VERSION); expect(SAVE_VERSION).toBe(1);
  const checked = sanitizeFurnaces(save.furnaces); expect(checked.dropped).toBe(0); return checked.furnaces[0].state;
}

it("requires a fresh ten seconds when diamond replaces half-smelted iron, without refunding fire", () => {
  const f = halfway(), incoming = stack("diamond_ore");
  const returned = setFurnaceInput(f, incoming);
  expect(returned).toEqual(stack("iron_ore")); expect(f.input).toBe(incoming);
  expect(f.progress).toBe(0); expect(f.progressInputId).toBeUndefined(); expect(f.burnLeft).toBe(75);
  tickFurnace(f, 5); expect(f.output).toBeNull(); expect(f.input).toBe(incoming); expect(f.progress).toBeCloseTo(.5);
  tickFurnace(f, 4.75); expect(f.output).toBeNull(); expect(f.input).toEqual(stack("diamond_ore"));
  tickFurnace(f, .25); expect(f.output).toEqual(stack("diamond")); expect(f.input).toBeNull();
  expect(f.progress).toBe(0); expect(f.progressInputId).toBeUndefined();
  expect(f.fuel).toEqual(stack("coal")); expect(f.burnLeft).toBe(65); expect(returned).toEqual(stack("iron_ore"));
});

it("forfeits progress on remove and reinsert before a frame but keeps same-ID top-up work", () => {
  const f = halfway(), removed = setFurnaceInput(f, null);
  expect(removed).toEqual(stack("iron_ore")); expect(f.progress).toBe(0);
  expect(setFurnaceInput(f, removed)).toBeNull(); tickFurnace(f, 5); expect(f.output).toBeNull();
  const topped = { ...f.input!, count: 3 }; expect(setFurnaceInput(f, topped)).toBe(removed);
  expect(f.progress).toBeCloseTo(.5); tickFurnace(f, 5);
  expect(f.output).toEqual(stack("iron_ingot")); expect(f.input).toEqual(stack("iron_ore", 2));
});

it("resets distinct input IDs even when both recipes make charcoal", () => {
  const f = createFurnace(); f.input = stack("oak_log"); f.fuel = stack("coal"); tickFurnace(f, 5);
  expect(setFurnaceInput(f, stack("birch_log"))).toEqual(stack("oak_log"));
  tickFurnace(f, 5); expect(f.output).toBeNull(); expect(f.progress).toBeCloseTo(.5);
  tickFurnace(f, 5); expect(f.output).toEqual(stack("charcoal"));
});

it("guards direct caller mutations and persists the binding across actual Savev1 sanitization", () => {
  const direct = halfway(); direct.input = stack("diamond_ore"); tickFurnace(direct, 5);
  expect(direct.output).toBeNull(); expect(direct.progress).toBeCloseTo(.5); expect(direct.progressInputId).toBe(stackId("diamond_ore"));
  let saved = halfway(); saved.input = stack("diamond_ore"); saved = restore(saved);
  expect(saved.progress).toBe(0); expect(saved.input).toEqual(stack("diamond_ore")); expect(saved.burnLeft).toBe(75);
  tickFurnace(saved, 5); saved = restore(saved); expect(saved.progress).toBeCloseTo(.5);
  expect(saved.progressInputId).toBe(stackId("diamond_ore")); tickFurnace(saved, 5);
  expect(saved.output).toEqual(stack("diamond")); expect(saved.fuel).toEqual(stack("coal")); expect(saved.burnLeft).toBe(65);
});

it("adopts valid legacy unbound progress and leaves idle legacy state shape unchanged", () => {
  let f = halfway(); delete f.progressInputId; f = restore(f);
  expect(f.progress).toBeCloseTo(.5); expect(f.progressInputId).toBeUndefined();
  tickFurnace(f, .25); expect(f.progressInputId).toBe(stackId("iron_ore"));
  tickFurnace(f, 4.75); expect(f.output).toEqual(stack("iron_ingot"));
  const idle = createFurnace(); expect(restore(idle)).toEqual(idle);
});

it("repairs invalid explicit bindings without discarding owned metadata or remaining fire", () => {
  const f = halfway();
  f.input!.book = { pages: ["ore notes"], title: "Input", author: "User" };
  f.fuel = { ...stack("wooden_hoe"), damage: 13 };
  f.output = { ...stack("written_book"), book: { pages: ["kept"], title: "Signed", author: "User" } };
  for (const marker of [null, -1, 65535, "15", NaN, Infinity, stackId("diamond_ore")]) {
    const raw = { ...structuredClone(f), progressInputId: marker };
    const checked = sanitizeFurnaces([{ x: 0, y: 60, z: 0, state: raw }]);
    expect(checked.dropped).toBe(0); const repaired = checked.furnaces[0].state;
    expect(repaired.input).toEqual(f.input); expect(repaired.fuel).toEqual(f.fuel); expect(repaired.output).toEqual(f.output);
    expect(repaired.burnLeft).toBe(75); expect(repaired.burnTotal).toBe(80);
    expect(repaired.progress).toBe(0); expect(repaired.progressInputId).toBeUndefined();
  }
  for (const input of [null, stack("dirt")]) {
    const checked = sanitizeFurnaces([{ x: 0, y: 60, z: 0, state: { ...f, input } }]).furnaces[0].state;
    expect(checked.progress).toBe(0); expect(checked.input).toEqual(input); expect(checked.fuel).toEqual(f.fuel);
  }
});

it("transfers metadata stacks unchanged and keeps input progress when only fuel or output changes", () => {
  const f = halfway();
  const book = { ...stack("written_book"), book: { pages: ["first", "second"], title: "T", author: "A" } };
  const original = setFurnaceInput(f, book); expect(original).toEqual(stack("iron_ore")); expect(f.input).toBe(book);
  expect(setFurnaceInput(f, original)).toBe(book); expect(book.book.pages).toEqual(["first", "second"]);
  tickFurnace(f, 4); f.fuel = { ...stack("wooden_hoe"), damage: 5 }; f.output = stack("iron_ingot");
  tickFurnace(f, 1); expect(f.progress).toBeCloseTo(.5); expect(f.fuel).toEqual({ ...stack("wooden_hoe"), damage: 5 });
  expect(restore(f)).toEqual(f); tickFurnace(f, 5); expect(f.output).toEqual(stack("iron_ingot", 2));
});

it("clears bindings on blocked output and exhausted progress without replacing stored contents", () => {
  const f = halfway(); f.output = stack("diamond"); const before = structuredClone(f);
  tickFurnace(f, .25); expect(f.progress).toBe(0); expect(f.progressInputId).toBeUndefined();
  expect(f.input).toEqual(before.input); expect(f.output).toEqual(before.output); expect(f.fuel).toEqual(before.fuel);
  const cold = halfway(); cold.burnLeft = 0; cold.fuel = null;
  tickFurnace(cold, 2.75); expect(cold.progress).toBe(0); expect(cold.progressInputId).toBeUndefined();
  expect(cold.input).toEqual(stack("iron_ore")); expect(cold.output).toBeNull();
});
