import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ADDITIONAL_COMPOUNDS, ADDITIONAL_ELEMENTS, COMPOUNDS, ELEMENTS, ITEMS, Inventory, MAX_PARTICLES,
  constructElement, createCompound, elementByZ, itemById, labReaction, nameOf, parseSave, reduceMaterial, serializeSave, stackId,
} from "../src";

const resultName = (r: { id: number } | { error: string }) => "id" in r ? nameOf(r.id) : r.error;

it("keeps all 183 pre-expansion saved item ids, including the new tool increment", () => {
  const old = ITEMS.slice(0, 183).map(({ id, name }) => [id, name]);
  expect(createHash("sha256").update(JSON.stringify(old) + "\n").digest("hex"))
    .toBe("9091696b691a6ab9086501a1113f156a4a2afd200614e90eec7e5420f8704d92");
  expect(ITEMS[183].name).toBe("rubidium");
  expect(stackId("barium_sulfate")).toBeGreaterThan(stackId("oganesson"));
});

describe("all 118 elements and selected real isotopes", () => {
  it("covers heavy atoms whose neutron counts exceeded the old input bound", () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(elementByZ(79)).toMatchObject({ symbol: "Au", a: 197 });
    expect(elementByZ(92)).toMatchObject({ symbol: "U", a: 238 });
    expect(elementByZ(118)).toMatchObject({ symbol: "Og", a: 294 });
    expect(resultName(constructElement(92, 146, 92))).toBe("uranium");
    expect(resultName(constructElement(118, 176, 118))).toBe("oganesson");
    expect(resultName(constructElement(92, 143, 92))).toBe("uranium_235");
    expect(resultName(constructElement(54, 82, 54))).toBe("xenon_136");
    for (const e of ADDITIONAL_ELEMENTS) {
      expect(resultName(constructElement(e.z, e.a - e.z, e.z))).toBe(e.name.toLowerCase());
      for (const mass of e.isotopes) expect(resultName(constructElement(e.z, mass - e.z, e.z))).toBe(`${e.name.toLowerCase()}_${mass}`);
    }
  });

  it("refuses invalid ions, unlisted isotope masses and out-of-bound or noninteger particles", () => {
    expect(resultName(constructElement(92, 146, 91))).toMatch(/neutral Uranium atom needs 92 electrons/);
    expect(resultName(constructElement(118, 175, 118))).toMatch(/isn't in the supported isotope catalogue/);
    expect(resultName(constructElement(119, 176, 119))).toMatch(/Only elements 1-118/);
    for (const bad of [-1, 1.5, NaN, Infinity, MAX_PARTICLES + 1]) {
      expect(constructElement(bad, 176, 118)).toHaveProperty("error");
      expect(constructElement(118, bad, 118)).toHaveProperty("error");
      expect(constructElement(118, 176, bad)).toHaveProperty("error");
    }
    expect(resultName(constructElement(118, MAX_PARTICLES + 1, 118))).toContain(`0 to ${MAX_PARTICLES}`);
  });

  it("round trips heavy elements and isotope stacks through the world save format", () => {
    const inv = new Inventory();
    for (const n of ["uranium", "uranium_235", "oganesson", "tungsten_chloride"]) inv.add(stackId(n), 3);
    const saved = serializeSave({
      name: "heavy chemistry", seed: 1, mode: "survival", timeOfDay: 0.3,
      player: { position: { x: 0, y: 70, z: 0 }, yaw: 0, pitch: 0, flying: false }, inventory: inv.toJSON(), edits: [],
    });
    const restored = Inventory.fromJSON(parseSave(saved).inventory);
    expect(restored.slots.slice(0, 4)).toEqual(inv.slots.slice(0, 4));
    expect(itemById(stackId("oganesson")).chem).toEqual({ kind: "element", z: 118, symbol: "Og", mass: 294 });
  });
});

it("creates and reduces all eight Journal compounds requiring new or omitted elements", () => {
  expect(COMPOUNDS).toHaveLength(35);
  expect(ADDITIONAL_COMPOUNDS).toHaveLength(8);
  for (const c of ADDITIONAL_COMPOUNDS) {
    const ingredients = c.recipe.map(([symbol, count]) => ({
      id: stackId(ELEMENTS.find((e) => e.symbol === symbol)!.name.toLowerCase()), count,
    }));
    expect(resultName(createCompound(ingredients))).toBe(c.name);
    expect(reduceMaterial(stackId(c.name))).toEqual(ingredients);
    const wrong = ingredients.map((s, i) => ({ ...s, count: s.count + (i === 0 ? 1 : 0) }));
    expect(createCompound(wrong)).toHaveProperty("error");
  }
});

it("uses the Journal ice bomb recipe: four sodium acetates, without snow", () => {
  expect(resultName(labReaction([{ id: stackId("sodium_acetate"), count: 4 }]))).toBe("ice_bomb");
  expect(labReaction([{ id: stackId("sodium_acetate"), count: 3 }])).toHaveProperty("error");
  expect(labReaction([{ id: stackId("sodium_acetate"), count: 1 }, { id: stackId("snow"), count: 1 }])).toHaveProperty("error");
});
