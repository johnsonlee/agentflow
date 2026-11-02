import { describe, expect, it } from "vitest";
import {
  BLOCKS, COMPOUNDS, ELEMENTS, Inventory, ITEMS, LAB_REACTIONS, REDUCTIONS, addExhaustion, constructElement, createCompound,
  displayNameOf, elementByZ, isKnownId, itemById, labReaction, nameOf, createHunger, reduceMaterial, sanitizeStack, stackId,
} from "../src";

const id = (name: string) => stackId(name);
const ok = (r: { id: number } | { error: string }) => ("id" in r ? nameOf(r.id) : `error: ${r.error}`);
const stacks = (...pairs: [string, number][]) => pairs.map(([n, count]) => ({ id: id(n), count }));

/** Parses "C₆H₁₂O₆" / "Mg(NO₃)₂" into element counts. */
function parseFormula(formula: string): Map<string, number> {
  const ascii = formula.replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080));
  const out = new Map<string, number>();
  const re = /\(([^)]*)\)(\d*)|([A-Z][a-z]?)(\d*)/g;
  for (const m of ascii.matchAll(re)) {
    if (m[1] !== undefined) {
      for (const [s, n] of parseFormula(m[1])) out.set(s, (out.get(s) ?? 0) + n * Number(m[2] || 1));
    } else out.set(m[3], (out.get(m[3]) ?? 0) + Number(m[4] || 1));
  }
  return out;
}

describe("element table", () => {
  it("has elements 1-36 in order with unique symbols and real isotopes", () => {
    expect(ELEMENTS.map((e) => e.z)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(36);
    expect(elementByZ(8)).toMatchObject({ symbol: "O", name: "Oxygen", a: 16 });
    expect(elementByZ(26)).toMatchObject({ symbol: "Fe", a: 56 });
    expect(elementByZ(36)).toMatchObject({ symbol: "Kr", a: 84 });
    for (const e of ELEMENTS) {
      expect(e.a).toBeGreaterThanOrEqual(e.z);
      for (const m of e.isotopes) {
        expect(m).not.toBe(e.a);
        expect(m).toBeGreaterThanOrEqual(e.z);
      }
    }
  });

  it("registers element, isotope, compound and product items with chemistry data; block and item names are unique", () => {
    const names = [...BLOCKS.map((b) => b.name), ...ITEMS.map((i) => i.name)];
    expect(names.length).toBe(new Set(names).size);
    const o = itemById(id("oxygen"));
    expect(o.chem).toEqual({ kind: "element", z: 8, symbol: "O", mass: 16 });
    expect(itemById(id("carbon_14")).chem).toMatchObject({ kind: "isotope", z: 6, mass: 14 });
    expect(displayNameOf(id("carbon_14"))).toBe("Carbon-14");
    expect(itemById(id("water_compound")).chem).toEqual({ kind: "compound", formula: "H₂O" });
    expect(displayNameOf(id("water_compound"))).toBe("Water");
    for (const b of ["element_constructor", "compound_creator", "material_reducer", "lab_table"]) expect(isKnownId(id(b))).toBe(true);
  });
});

describe("Element Constructor", () => {
  it("builds elements from protons, neutrons and electrons", () => {
    expect(ok(constructElement(8, 8, 8))).toBe("oxygen");
    expect(ok(constructElement(1, 0, 1))).toBe("hydrogen");
    expect(ok(constructElement(26, 30, 26))).toBe("iron");
    expect(ok(constructElement(36, 48, 36))).toBe("krypton");
    for (const e of ELEMENTS) expect(ok(constructElement(e.z, e.a - e.z, e.z))).toBe(e.name.toLowerCase());
  });

  it("builds isotopes", () => {
    expect(ok(constructElement(6, 8, 6))).toBe("carbon_14");
    expect(ok(constructElement(1, 1, 1))).toBe("hydrogen_2");
    expect(ok(constructElement(1, 2, 1))).toBe("hydrogen_3");
    expect(ok(constructElement(17, 20, 17))).toBe("chlorine_37");
  });

  it("refuses invalid combinations with a reason", () => {
    expect(ok(constructElement(0, 0, 0))).toMatch(/at least one proton/);
    expect(ok(constructElement(37, 48, 37))).toMatch(/Only elements 1-36/);
    expect(ok(constructElement(8, 8, 7))).toMatch(/neutral Oxygen atom needs 8 electrons/);
    expect(ok(constructElement(8, 20, 8))).toMatch(/Oxygen-28 isn't a known isotope \(neutrons: 8, 9, 10\)/);
    for (const bad of [-1, 1.5, NaN, Infinity, 141, Number.MAX_VALUE]) {
      expect(ok(constructElement(bad, 0, bad))).toMatch(/^error:/);
      expect(ok(constructElement(8, bad, 8))).toMatch(/^error:/);
    }
  });
});

describe("Compound Creator", () => {
  it("every compound recipe matches its formula and is creatable", () => {
    expect(COMPOUNDS.length).toBeGreaterThanOrEqual(20);
    for (const c of COMPOUNDS) {
      expect(new Map(c.recipe)).toEqual(parseFormula(c.formula));
      const slots = c.recipe.map(([s, n]) => ({ id: id(ELEMENTS.find((e) => e.symbol === s)!.name.toLowerCase()), count: n }));
      expect(ok(createCompound(slots))).toBe(c.name);
    }
  });

  it("makes water from 2 H + 1 O in any slots, and refuses near misses", () => {
    expect(ok(createCompound([null, ...stacks(["hydrogen", 1], ["oxygen", 1], ["hydrogen", 1]), null]))).toBe("water_compound");
    expect(ok(createCompound(stacks(["hydrogen", 2], ["oxygen", 2])))).toBe("hydrogen_peroxide");
    expect(ok(createCompound(stacks(["hydrogen", 3], ["oxygen", 1])))).toMatch(/don't make a known compound/);
    expect(ok(createCompound([]))).toMatch(/Add some elements/);
    // Isotopes and non-elements are refused.
    expect(ok(createCompound(stacks(["hydrogen_2", 2], ["oxygen", 1])))).toMatch(/Only elements/);
    expect(ok(createCompound(stacks(["dirt", 1])))).toMatch(/Only elements/);
  });
});

describe("Material Reducer", () => {
  it("reduces blocks, items, compounds and isotopes to elements", () => {
    const r = (n: string) => reduceMaterial(id(n))?.map((s) => `${nameOf(s.id)}x${s.count}`);
    expect(r("sand")).toEqual(["siliconx1", "oxygenx2"]);
    expect(r("oak_log")).toEqual(["carbonx6", "hydrogenx10", "oxygenx5"]);
    expect(r("iron_ingot")).toEqual(["ironx1"]);
    expect(r("water_compound")).toEqual(["hydrogenx2", "oxygenx1"]);
    expect(r("carbon_14")).toEqual(["carbonx1"]);
    expect(r("crafting_table")).toBeUndefined();
    for (const [name] of REDUCTIONS) expect(reduceMaterial(id(name))).not.toBeNull();
  });

  it("returns null for unknown or malformed ids", () => {
    for (const bad of [-1, 1.5, NaN, 99999, Infinity]) expect(reduceMaterial(bad)).toBeNull();
  });
});

describe("Lab Table", () => {
  it("runs every curated reaction", () => {
    for (const r of LAB_REACTIONS) expect(ok(labReaction(r.ingredients.map(([n, c]) => ({ id: id(n), count: c }))))).toBe(r.product);
  });

  it("makes a heat block and refuses wrong mixtures", () => {
    expect(ok(labReaction(stacks(["calcium_chloride", 1], ["iron", 1], ["salt", 1], ["water_compound", 1])))).toBe("heat_block");
    expect(ok(labReaction(stacks(["iron", 1], ["water_compound", 1], ["salt", 1])))).toMatch(/Nothing happens/);
    expect(ok(labReaction(stacks(["iron", 2], ["water_compound", 1], ["salt", 1], ["calcium_chloride", 1])))).toMatch(/Nothing happens/);
    expect(ok(labReaction([]))).toMatch(/Add some/);
    expect(ok(labReaction([{ id: 1.5, count: 1 }]))).toMatch(/Unknown/);
  });
});

describe("saving chemistry items", () => {
  it("element, isotope, compound and product stacks round-trip through the inventory save", () => {
    const inv = new Inventory();
    for (const n of ["oxygen", "carbon_14", "water_compound", "glow_stick", "element_constructor"]) inv.add(id(n), 5);
    const loaded = Inventory.fromJSON(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(loaded.slots.slice(0, 5).map((s) => s && `${nameOf(s.id)}x${s.count}`)).toEqual([
      "oxygenx5", "carbon_14x5", "water_compoundx5", "glow_stickx5", "element_constructorx5",
    ]);
    expect(sanitizeStack({ id: id("oxygen"), count: 65 })).toBeNull();
    expect(sanitizeStack({ id: id("oxygen"), count: 64 })).toEqual({ id: id("oxygen"), count: 64 });
  });
});

describe("addExhaustion (review 95edfbc8 hardening)", () => {
  it("ignores NaN, infinite and negative amounts", () => {
    const h = createHunger();
    for (const bad of [NaN, Infinity, -Infinity, -5]) addExhaustion(h, bad);
    expect(h.exhaustion).toBe(0);
    addExhaustion(h, 1.5);
    expect(h.exhaustion).toBe(1.5);
  });
});
