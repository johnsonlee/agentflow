import { describe, expect, it } from "vitest";
import { Inventory, type ItemStack } from "../src/ownership/inventory";
import { stackId } from "../src/catalog/items";
import { planGlowActivation } from "../src/ownership/stack";
const inactive = (): ItemStack => ({ id: stackId("red_glow_stick"), count: 1, glow: { state: "inactive" } });

describe("G3 malformed ordinary book owner before glow trial cloning", () => {
  it("returns invalid-state without throwing or mutating for malformed plain book owners", () => {
    for (const book of [{}, { pages: "not-array" }, { pages: [7] }, { pages: ["ok"], title: 7 }, { pages: ["ok"], author: false }]) {
      const malformed = { id: stackId("written_book"), count: 1, book } as unknown as ItemStack;
      const bag = new Inventory(); bag.slots[0] = inactive(); bag.slots[1] = malformed;
      const before = structuredClone(bag.slots), source = bag.slots[0], unrelated = bag.slots[1];
      expect(planGlowActivation(bag.slots, 0)).toEqual({ ok: false, reason: "invalid-state" });
      expect(bag.slots).toEqual(before);
      expect(bag.activateSelectedGlow()).toEqual({ ok: false, reason: "invalid-state" });
      expect(bag.slots).toEqual(before); expect(bag.slots[0]).toBe(source); expect(bag.slots[1]).toBe(unrelated);
    }
  });
  it("preserves valid non-glow book/tool owners and detaches their supported metadata", () => {
    const book: ItemStack = { id: stackId("written_book"), count: 1, book: { pages: ["Original", "Second"], title: "Notes", author: "Player" } };
    const tool: ItemStack = { id: stackId("iron_sword"), count: 1, damage: 5 };
    const bag = new Inventory(); bag.slots[0] = inactive(); bag.slots[1] = book; bag.slots[2] = tool;
    const before = structuredClone(bag.slots), plan = planGlowActivation(bag.slots, 0);
    expect(plan.ok).toBe(true); expect(bag.slots).toEqual(before);
    if (!plan.ok) throw Error("Valid supported owners should plan activation");
    expect(plan.slots[1]).toEqual(book); expect(plan.slots[2]).toEqual(tool);
    plan.slots[1]!.book!.pages[0] = "Changed detached copy";
    expect(book.book!.pages[0]).toBe("Original");
    expect(bag.activateSelectedGlow().ok).toBe(true);
    expect(bag.slots[1]).toEqual(book); expect(bag.slots[2]).toEqual(tool);
  });
});
