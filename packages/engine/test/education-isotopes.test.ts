import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  BLOCKS, EDUCATION_ISOTOPE_GUIDE, EDUCATION_ISOTOPE_GUIDE_SOURCE, ELEMENTS, ITEMS, MAX_PARTICLES,
  Inventory, World, constructElement, createAgent, createCompound, elementParticlesOf, giveAgent,
  isDocumentedEducationIsotope, itemById, nameOf, parseSave, runAgentCommand, sanitizeAgent,
  sanitizeInventoryPending, serializeSave, stackId, type ItemStack,
} from "../src";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const legacyOnly = [[4, 10], [13, 26], [21, 46], [26, 60], [33, 73], [61, 147], [103, 266], [107, 270]];
// Independently derived from the official PDF against the pre-increment scientific catalogue.
const missingGuideMasses: number[][] = [[6,11],[16,35],[19,42],[19,43],[20,45],[20,47],[24,51],[26,52],[26,55],[26,59],[27,57],[27,58],[28,59],[28,63],[29,64],[30,65],[31,67],[31,68],[31,70],[32,68],[34,75],[34,79],[35,80],[37,86],[38,85],[38,89],[38,90],[42,99],[44,106],[49,111],[50,113],[53,123],[53,125],[53,129],[53,131],[55,129],[55,134],[55,136],[55,137],[56,133],[56,140],[58,141],[58,144],[61,144],[70,169],[79,198],[80,197],[80,203],[81,201],[82,210],[83,207],[85,211],[88,223],[88,224],[88,228],[90,228],[90,230],[93,239],[94,238],[96,243],[96,245],[96,246],[96,248],[97,249],[98,249],[98,250],[98,252],[101,256],[103,262],[107,269]];

it("pins the exact 411 neutral rows and preserves all 164 block and 449 item IDs and old particle identities", () => {
  expect(EDUCATION_ISOTOPE_GUIDE_SOURCE.sha256).toBe("2dffb34389fe7478507a1d3a0726ac2712f91bf59012c723f28a80472cd16cef");
  expect(EDUCATION_ISOTOPE_GUIDE).toHaveLength(118);
  expect(EDUCATION_ISOTOPE_GUIDE.reduce((sum, [, , ns]) => sum + ns.length, 0)).toBe(411);
  // This digest was computed from retained, cross-checked source geometry, not generated runtime definitions.
  expect(digest(EDUCATION_ISOTOPE_GUIDE)).toBe("93d6c6f1381c6d65475459cb98b963a74f203c98b47611c97f93f58d1a2f9b96");
  expect(digest(BLOCKS.slice(0, 164).map(({ id, name }) => [id, name]))).toBe("01c152ce6dbc67a7e4e07b24fccf35b2a20725eb6e3fb3b97694403c39b84894");
  expect(digest(ITEMS.slice(0, 449).map(({ id, name }) => [id, name]))).toBe("5ce6fee25a8ca0c4fb72fca071996a41a3914122acf7724705b2fc616eb47294");
  expect(digest(ITEMS.slice(0, 449).filter((i) => i.chem?.kind === "element" || i.chem?.kind === "isotope")
    .map((i) => [i.id, i.chem!.kind, i.chem!.z, i.chem!.symbol, i.chem!.mass])))
    .toBe("b8161c443051325894cfaed35fae4f0a5d31f9d75b5e48658586e73891828c1b");
  expect(ITEMS.slice(449, 519).map((i) => [i.chem?.z, i.chem?.mass])).toEqual(missingGuideMasses);
  expect(ITEMS.slice(449, 519).map((i) => i.id)).toEqual(Array.from({ length: 70 }, (_, i) => 705 + i));
  expect(ITEMS.slice(449, 519).every((i) => i.chem?.kind === "isotope")).toBe(true);
});

it("constructs every guide combination, retains the eight guide-absent combinations, and supports exactly their union", () => {
  const expected = new Set<string>();
  for (const [z, symbol, neutrons] of EDUCATION_ISOTOPE_GUIDE) for (const n of neutrons) {
    expected.add(`${z}:${n}`);
    const result = constructElement(z, n, z); expect(result).toHaveProperty("id");
    if (!("id" in result)) throw new Error("Missing documented isotope");
    expect(elementParticlesOf(result.id)).toMatchObject({ protons: z, neutrons: n, electrons: z, mass: z + n, symbol, documented: true });
  }
  for (const [z, mass] of legacyOnly) {
    const n = mass - z; expected.add(`${z}:${n}`);
    const result = constructElement(z, n, z); expect(result).toHaveProperty("id");
    if (!("id" in result)) throw new Error("Lost legacy isotope");
    expect(elementParticlesOf(result.id)).toMatchObject({ z, mass, neutrons: n, documented: false });
  }
  const actual = new Set<string>();
  for (let z = 1; z <= 118; z++) for (let n = 0; n <= MAX_PARTICLES; n++) {
    if ("id" in constructElement(z, n, z)) actual.add(`${z}:${n}`);
  }
  expect(actual).toEqual(expected); expect(actual.size).toBe(419);
});

it("retains reference/default masses and refuses guide holes, unsupported inputs and unequal electrons under the compatibility rule", () => {
  expect(ELEMENTS.find((e) => e.z === 28)?.a).toBe(58); // Guide highlight is 59, not a proven lookup default.
  expect(ELEMENTS.find((e) => e.z === 103)?.a).toBe(266); // Still readable even though guide has 262.
  expect(constructElement(28, 30, 28)).toEqual({ id: stackId("nickel") });
  expect(constructElement(28, 31, 28)).toEqual({ id: stackId("nickel_59") });
  expect(isDocumentedEducationIsotope(17, 36)).toBe(false);
  expect(constructElement(17, 19, 17)).toHaveProperty("error");
  expect(constructElement(6, 5, 5)).toHaveProperty("error");
  expect(constructElement(119, 176, 119)).toHaveProperty("error");
  for (const invalid of [-1, .5, NaN, Infinity, MAX_PARTICLES + 1]) {
    expect(constructElement(6, invalid, 6)).toHaveProperty("error");
    expect(constructElement(invalid, 5, 6)).toHaveProperty("error");
    expect(constructElement(6, 5, invalid)).toHaveProperty("error");
  }
});

it("looks up actual registered atom metadata without mutating it and refuses raw invalid or non-atom IDs", () => {
  expect(elementParticlesOf(stackId("hydrogen_2"))).toMatchObject({ protons: 1, neutrons: 1, electrons: 1, mass: 2, documented: true });
  const carbon = elementParticlesOf(stackId("carbon_11"))!; carbon.neutrons = 200;
  expect(elementParticlesOf(stackId("carbon_11"))!.neutrons).toBe(5);
  for (const id of [null, undefined, NaN, Infinity, -.5, -1, 99999, stackId("bleach"), stackId("water_compound"), stackId("stone"), "6" as unknown as number, {} as number]) {
    expect(elementParticlesOf(id)).toBeNull();
  }
});

it("uses old and new isotopes as their element symbols in Compound Creator recipes, including mixed variants", () => {
  expect(createCompound([stack("hydrogen_2", 2), stack("oxygen_18")])).toEqual({ id: stackId("water_compound") });
  const carbon = constructElement(6, 5, 6);
  expect(carbon).toEqual({ id: stackId("carbon_11") });
  expect(createCompound([stack("carbon_11", 6), stack("hydrogen_2", 6)])).toEqual({ id: stackId("benzene") });
  expect(createCompound([stack("hydrogen"), stack("hydrogen_3"), stack("oxygen_17")])).toEqual({ id: stackId("water_compound") });
  for (const bad of [stack("bleach"), stack("water_compound"), stack("iron_pickaxe"), { id: -1, count: 1 }]) {
    const inputs = [stack("hydrogen_2", 2), stack("oxygen_18"), bad]; const before = structuredClone(inputs);
    expect(createCompound(inputs)).toHaveProperty("error"); expect(inputs).toEqual(before);
  }
  for (const count of [0, -1, 1.5, NaN, 65]) expect(createCompound([stack("hydrogen_2", count), stack("oxygen_18")])).toHaveProperty("error");
});

it("round trips old/new/guide-absent atoms through saves, pending recovery and Agent transfer without relabeling masses", () => {
  const atoms = [stack("carbon_11", 2), stack("uranium_235", 3), stack("beryllium_10", 4), stack("nickel", 5), stack("nickel_59", 6)];
  const bag = new Inventory(); for (const atom of atoms) bag.addStack(atom);
  const agent = createAgent(0, 60, 0); for (const atom of atoms) expect(giveAgent(agent, atom)).toBe(0);
  const save = parseSave(serializeSave({ name: "documented isotopes", seed: 13, mode: "survival", timeOfDay: .3,
    player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), inventoryPending: atoms, edits: [], agent }));
  const restored = Inventory.fromJSON(save.inventory); expect(restored.slots.slice(0, atoms.length)).toEqual(atoms);
  expect(sanitizeInventoryPending(save.inventoryPending)).toEqual(atoms);
  const restoredAgent = sanitizeAgent(save.agent)!, received = new Inventory();
  for (let slot = 0; slot < atoms.length; slot++) expect(runAgentCommand(new World(13), restoredAgent, { op: "drop", slot }, { giveToPlayer: (s) => received.addStack(s) }).ok).toBe(true);
  expect(received.slots.slice(0, atoms.length)).toEqual(atoms);
  expect(received.slots.slice(0, atoms.length).map((s) => elementParticlesOf(s!.id)?.mass)).toEqual([11, 235, 10, 58, 59]);
  expect(nameOf(restored.slots[0]!.id)).toBe("carbon_11");
});
