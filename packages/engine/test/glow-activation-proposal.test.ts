/** PROPOSAL TEXT ONLY. Not installed in checkout and NOT executed/typechecked.
 * Tests import proposed source files directly; no index/export/UI/sanitizer patch is implied. */
import { describe, expect, it } from "vitest";
import { Inventory, type ItemStack } from "../src/ownership/inventory";
import { stackId } from "../src/catalog/items";
import { GLOW_STICK_COLORS } from "../src/catalog/glow-stick-colors";
import { freshStack, inspectGlowState } from "../src/ownership/glow-stick-state";
import { cloneStack, planGlowActivation, stackLimit, stacksCompatible } from "../src/ownership/stack";

const red = stackId("red_glow_stick");
const inactive = (count = 1): ItemStack => ({ id: red, count, glow: { state: "inactive" } });
const active = (): ItemStack => ({ id: red, count: 1, glow: { state: "active" } });
const legacy = (count = 1): ItemStack => ({ id: red, count });
const full = (source: ItemStack) => {
  const bag = new Inventory();
  for (let index = 0; index < bag.slots.length; index++) bag.slots[index] = { id: stackId("cobblestone"), count: 64 };
  bag.slots[0] = source;
  return bag;
};
const count = (slots: readonly (ItemStack | null)[]) => slots.reduce((sum, stack) => sum + (stack?.id === red ? stack.count : 0), 0);

describe("proposed untimed per-unit glow activation reducer", () => {
  it("recognizes all14 unchanged IDs and preserves old metadata absence", () => {
    expect(GLOW_STICK_COLORS).toHaveLength(14);
    for (const color of GLOW_STICK_COLORS) {
      const old = { id: stackId(color.itemName), count: 64 };
      expect(inspectGlowState(old)).toEqual({ kind: "legacy" });
      expect(cloneStack(old)).toEqual(old);
      expect(Object.prototype.hasOwnProperty.call(cloneStack(old), "glow")).toBe(false);
      expect(freshStack(old.id)).toEqual({ id: old.id, count: 1, glow: { state: "inactive" } });
    }
    expect(stackId("glow_stick")).toBe(426);
    expect(inspectGlowState({ id: red, count: 1, glow: undefined }).kind).toBe("invalid");
  });
  it("enforces activecount1, strict state shape, no native fields, and explicit bulk inactive semantics", () => {
    expect(stackLimit(active())).toBe(1); expect(stackLimit(inactive(64))).toBe(64);
    expect(inspectGlowState(inactive(128)).kind).toBe("invalid");
    expect(inspectGlowState(inactive(128), true)).toEqual({ kind: "inactive" });
    const invalid: unknown[] = [
      { ...active(), count: 2 }, { ...active(), count: 64 }, { ...active(), count: 0 },
      { ...active(), count: NaN }, { ...active(), glow: null },
      { ...active(), glow: { state: "expired" } }, { ...active(), glow: { state: "active", duration: 300 } },
      { ...active(), damage: 0 }, { ...active(), book: { pages: [] } },
      { id: stackId("stone"), count: 1, glow: { state: "active" } },
      { ...active(), glow: Object.create({ state: "active" }) },
    ];
    for (const stack of invalid) expect(inspectGlowState(stack, true).kind).toBe("invalid");
    const bag = new Inventory(); expect(bag.addStack({ ...active(), count: 2 })).toBe(2);
    expect(bag.slots.every(stack => stack === null)).toBe(true);
  });
  it("deep clones nested metadata and isolates active/inactive/legacy merge identity", () => {
    const original = inactive(), copied = cloneStack(original); copied.glow!.state = "active";
    expect(original.glow!.state).toBe("inactive");
    const book = { id: stackId("written_book"), count: 1, book: { pages: ["original"] } };
    const bookCopy = cloneStack(book); bookCopy.book!.pages[0] = "changed";
    expect(book.book.pages).toEqual(["original"]);
    expect(stacksCompatible(legacy(), inactive())).toBe(false);
    expect(stacksCompatible(inactive(), active())).toBe(false);
    expect(stacksCompatible(active(), active())).toBe(true); // Identity is equal; capacity1 still forbids merge.
    const bag = new Inventory(); bag.addStack(active()); bag.addStack(active());
    expect(bag.slots.filter(Boolean)).toEqual([active(), active()]);
  });
  it.each([1, 2, 64])("purely plans and atomically commits one active unit from count%i", amount => {
    const bag = new Inventory(); bag.slots[0] = inactive(amount);
    const before = bag.toJSON(), slotsIdentity = bag.slots;
    const plan = planGlowActivation(bag.slots, 0);
    expect(bag.toJSON()).toEqual(before);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw Error("Expected a complete detached plan");
    expect(plan.slots[0]).toEqual(active()); expect(count(plan.slots)).toBe(amount);
    expect(bag.activateSelectedGlow()).toEqual({ ok: true, kind: "activated", color: "red" });
    expect(bag.slots).toBe(slotsIdentity); expect(bag.selected).toBe(0);
    expect(bag.slots[0]).toEqual(active()); expect(count(bag.slots)).toBe(amount);
    expect(bag.slots.filter(stack => stack?.glow?.state === "active")).toHaveLength(1);
    if (amount > 1) expect(bag.slots[1]).toEqual(inactive(amount - 1));
    const committed = bag.toJSON(); expect(bag.activateSelectedGlow()).toEqual({ ok: false, reason: "already-active" });
    expect(bag.toJSON()).toEqual(committed);
  });
  it("preserves exact legacy remainder absence and never activates the entire legacy stack", () => {
    const bag = new Inventory(); bag.slots[0] = legacy(64);
    expect(bag.activateSelectedGlow().ok).toBe(true);
    expect(bag.slots[0]).toEqual(active()); expect(bag.slots[1]).toEqual(legacy(63));
    expect(Object.prototype.hasOwnProperty.call(bag.slots[1], "glow")).toBe(false);
  });
  it("refuses a full incompatible bag without any source mutation, while count1 needs no extra space", () => {
    const bag = full(inactive(2)), before = bag.toJSON(), originalSlot = bag.slots[0];
    expect(bag.activateSelectedGlow()).toEqual({ ok: false, reason: "needs-room" });
    expect(bag.toJSON()).toEqual(before); expect(bag.slots[0]).toBe(originalSlot);
    const single = full(inactive()); expect(single.activateSelectedGlow().ok).toBe(true);
    expect(single.slots[0]).toEqual(active());
  });
  it("uses compatible remainder capacity in a full bag and refuses insufficient or differently-stated capacity", () => {
    const enough = full(inactive(3)); enough.slots[1] = inactive(62);
    expect(enough.activateSelectedGlow().ok).toBe(true); expect(enough.slots[1]).toEqual(inactive(64)); expect(count(enough.slots)).toBe(65);
    for (const destination of [inactive(63), legacy(62), active()]) {
      const bag = full(inactive(3)); bag.slots[1] = destination; const before = bag.toJSON();
      expect(bag.activateSelectedGlow()).toEqual({ ok: false, reason: "needs-room" }); expect(bag.toJSON()).toEqual(before);
    }
    const old = full(legacy(3)); old.slots[1] = legacy(62);
    expect(old.activateSelectedGlow().ok).toBe(true); expect(old.slots[1]).toEqual(legacy(64));
  });
  it("keeps metadata-aware capacity equal to actual insertion and copies incoming state", () => {
    const bag = full(inactive(64)); bag.slots[1] = inactive(63); bag.slots[2] = null; bag.slots[3] = legacy(63);
    expect(bag.spaceForStack(inactive(66))).toBe(65); expect(bag.spaceForStack(legacy())).toBe(65);
    const incoming = inactive(66); expect(bag.addStack(incoming)).toBe(1);
    incoming.glow!.state = "active";
    expect(bag.slots[1]).toEqual(inactive(64)); expect(bag.slots[2]).toEqual(inactive(64)); expect(bag.slots[3]).toEqual(legacy(63));
    expect(bag.spaceForStack(active())).toBe(0);
  });
  it("does not silently repair malformed existing owners or erase unrelated legacy metadata", () => {
    const bag = new Inventory(); bag.slots[0] = inactive(2); bag.slots[1] = { ...active(), count: 2 }; const before = structuredClone(bag.slots);
    expect(bag.activateSelectedGlow()).toEqual({ ok: false, reason: "invalid-state" }); expect(bag.slots).toEqual(before);
    const old = new Inventory(); old.slots[0] = { ...legacy(2), book: { pages: ["retain raw owner"] } };
    const oldBefore = old.toJSON(); expect(old.activateSelectedGlow()).toEqual({ ok: false, reason: "invalid-state" }); expect(old.toJSON()).toEqual(oldBefore);
  });
});
