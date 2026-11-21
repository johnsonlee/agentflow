import { withLegacyStationFaces } from "./helpers/legacy-station-faces";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, LEGACY_MATERIAL_REDUCTIONS, NATIVE_MATERIAL_REDUCTIONS, NATIVE_REDUCTION_SOURCE, REDUCTIONS,
  Inventory, World, blockId, breakBlock, constructElement, createAgent, createCompound, elementBlockId, elementParticlesOf,
  giveAgent, isItem, itemById, maxStackOf, parseSave, placeBlock, reduceMaterial, runAgentCommand, sanitizeAgent,
  sanitizeInventoryPending, serializeSave, stackId, type ItemStack,
} from "../src";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/native-reductions-1.26.33.json", import.meta.url), "utf8")) as {
  version: string; installerSHA256: string; cases: { appName: string; appId: number; appKind: "block" | "item"; nativeIdentifier: string;
    output: { item: string; count: number }[]; sourceFiles: { path: string; sha256: string }[] }[];
};
const legacy = JSON.parse(readFileSync(new URL("./fixtures/native-reductions-legacy-ca64.json", import.meta.url), "utf8")) as {
  cases: { id: number; name: string; kind: string; output: ItemStack[] }[];
};
const baseline = JSON.parse(readFileSync(new URL("./fixtures/native-reductions-registry-ca64.json", import.meta.url), "utf8"));
const digest = (x: unknown) => createHash("sha256").update(JSON.stringify(x) + "\n").digest("hex");
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const atom = (z: number) => z === 0 ? elementBlockId(0) : ITEMS.find((i) => i.chem?.kind === "element" && i.chem.z === z)!.id;
const count = (bag: Inventory, id: number) => bag.slots.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);

it("matches all22 independently retained raw candidate recipe output lists and per-row provenance", () => {
  expect(NATIVE_REDUCTION_SOURCE.version).toBe(fixture.version); expect(NATIVE_REDUCTION_SOURCE.installerSHA256).toBe(fixture.installerSHA256);
  expect(NATIVE_REDUCTION_SOURCE.acceptedTargetVersion).toBe(false); expect(fixture.cases).toHaveLength(22); expect(NATIVE_MATERIAL_REDUCTIONS.slice(0, 22)).toHaveLength(22);
  for (const test of fixture.cases) {
    const row = NATIVE_MATERIAL_REDUCTIONS.find((r) => r.input === test.appName)!;
    expect(stackId(test.appName)).toBe(test.appId); expect(row.inputKind).toBe(test.appKind); expect(isItem(test.appId)).toBe(test.appKind === "item");
    expect(row.nativeIdentifier).toBe(test.nativeIdentifier); expect(row.sources).toEqual(test.sourceFiles);
    const expected = test.output.map((s) => ({ id: atom(Number(s.item.replace("minecraft:element_", ""))), count: s.count }));
    expect(reduceMaterial(test.appId), test.appName).toEqual(expected);
    expect(row.output).toEqual(test.output.map((s) => [Number(s.item.replace("minecraft:element_", "")), s.count]));
    expect(expected.reduce((n, s) => n + s.count, 0)).toBe(100); // Only these22 material cases; bucket+container recipes are excluded.
    for (const s of expected) { expect(s.id).not.toBe(AIR); expect(s.count).toBeGreaterThan(0); expect(s.count).toBeLessThanOrEqual(maxStackOf(s.id)); }
  }
});

it("exposes the actual active26-row table and preserves ordered duplicate-element stacks", () => {
  expect(REDUCTIONS).toHaveLength(26); expect(new Set(REDUCTIONS.map(([name]) => name)).size).toBe(26);
  expect(LEGACY_MATERIAL_REDUCTIONS.map(([name]) => name)).toEqual(["glass", "charcoal"]);
  const symbols = new Map(ITEMS.filter((i) => i.chem?.kind === "element").map((i) => [i.chem!.symbol, i.id]));
  for (const [name, parts] of REDUCTIONS) expect(reduceMaterial(stackId(name))).toEqual(parts.map(([symbol, count]) => ({ id: symbol === "?" ? 32768 : symbols.get(symbol)!, count })));
  expect(reduceMaterial(blockId("sand"))).toEqual([stack("silicon", 33), stack("oxygen", 64), stack("oxygen", 3)]);
  expect(reduceMaterial(stackId("iron_ingot"))).toEqual([stack("iron", 64), stack("iron", 36)]);
  expect(reduceMaterial(blockId("dirt"))).toHaveLength(9);
  const first = reduceMaterial(blockId("redstone_ore"))!; first[2].count = 1;
  expect(reduceMaterial(blockId("redstone_ore"))![2]).toEqual({ id: 32768, count: 38 });
});

it("retains all338 legacy compatibility outputs without advertising them as native recipes", () => {
  expect(legacy.cases).toHaveLength(338);
  expect(legacy.cases.filter((r) => r.kind === "compound")).toHaveLength(35);
  expect(legacy.cases.filter((r) => r.kind === "isotope")).toHaveLength(301);
  for (const test of legacy.cases) { expect(stackId(test.name)).toBe(test.id); expect(reduceMaterial(test.id)).toEqual(test.output); }
});

it("rejects the sulfur material/atom name collision and leaves unsupported/unknown atom semantics intact", () => {
  expect(stackId("sulfur")).toBe(299); expect(itemById(299).chem).toMatchObject({ kind: "element", symbol: "S", z: 16 });
  expect(NATIVE_MATERIAL_REDUCTIONS.some((r) => r.input === "sulfur")).toBe(false); expect(reduceMaterial(299)).toBeNull();
  for (const i of ITEMS.filter((i) => i.chem?.kind === "element")) expect(reduceMaterial(i.id)).toBeNull();
  for (const name of ["water", "snowy_grass", "stone_button", "element_16", "element_0", "bleach", "red_dye"]) expect(reduceMaterial(stackId(name))).toBeNull();
  expect(constructElement(0, 0, 0)).toHaveProperty("error"); expect(elementParticlesOf(32768)).toBeNull();
  expect(createCompound([{ id: 32768, count: 1 }])).toHaveProperty("error");
  for (const id of [-1, .5, NaN, Infinity, 189, ITEMS.at(-1)!.id + 1, 32767, 65535, 65536]) expect(reduceMaterial(id)).toBeNull();
});

it("keeps every complete pre-increment block/item definition and atom identity unchanged", () => {
  expect(BLOCKS.slice(0, 307)).toHaveLength(307); expect(ITEMS.slice(0, 535)).toHaveLength(535);
  expect(digest(withLegacyStationFaces(BLOCKS.slice(0, 307)))).toBe(baseline.allBlockDefsSHA256); expect(digest(ITEMS.slice(0, 535))).toBe(baseline.allItemDefsSHA256);
  expect(digest(BLOCKS.slice(0, 307).map(({ id, name }) => [id, name]))).toBe(baseline.allBlockIDNamesSHA256);
  expect(digest(ITEMS.slice(0, 535).map(({ id, name }) => [id, name]))).toBe(baseline.allItemIDNamesSHA256);
  expect(digest(ITEMS.filter((i) => i.chem?.kind === "element" || i.chem?.kind === "isotope").map((i) => [i.id, i.chem!.kind, i.chem!.z, i.chem!.symbol, i.chem!.mass])))
    .toBe("54ba81669824eb6b526e76e1fff7f979ed42b273faed2f99b71012c5d34be270");
});

it("bounds every dispatched stack and requires joint capacity for every newly sourced batch", () => {
  for (const input of [...BLOCKS, ...ITEMS]) for (const s of reduceMaterial(input.id) ?? []) {
    expect(Number.isInteger(s.count)).toBe(true); expect(s.count).toBeGreaterThan(0); expect(s.count).toBeLessThanOrEqual(maxStackOf(s.id));
  }
  for (const row of NATIVE_MATERIAL_REDUCTIONS) {
    const output = reduceMaterial(stackId(row.input))!, bag = new Inventory();
    for (let i = 0; i < 35; i++) bag.setSlot(i, stack("stone", 64));
    const before = bag.toJSON(), trial = Inventory.fromJSON(before);
    expect(output.some((s) => trial.addStack(s) > 0), row.input).toBe(true); expect(bag.toJSON()).toEqual(before);
    const enough = new Inventory(); expect(output.every((s) => enough.addStack(s) === 0)).toBe(true);
    expect(enough.slots.reduce((n, s) => n + (s?.count ?? 0), 0)).toBe(100);
  }
});

it("merges Unknown58 from real redstone/glowstone outputs and preserves it through place/save/harvest", () => {
  const bag = new Inventory();
  for (const input of ["redstone", "glowstone"]) for (const s of reduceMaterial(stackId(input))!) expect(bag.addStack(s)).toBe(0);
  expect(bag.slots.reduce((n, s) => n + (s?.count ?? 0), 0)).toBe(200); expect(count(bag, 32768)).toBe(58); expect(count(bag, AIR)).toBe(0);
  bag.selected = bag.slots.findIndex((s) => s?.id === 32768);
  const world = new World(13); expect(placeBlock(world, bag, "survival", 8, 90, 8, { x: 2, y: 91, z: 2 })).toBe(true);
  expect(world.getBlock(8, 90, 8)).toBe(32768); expect(count(bag, 32768)).toBe(57);
  const parsed = parseSave(serializeSave({ name: "unknown material", seed: 13, mode: "survival", timeOfDay: .3,
    player: { position: { x: 2, y: 91, z: 2 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), edits: world.exportEdits(), inventoryPending: [{ id: 32768, count: 58 }] }));
  const restored = Inventory.fromJSON(parsed.inventory), loaded = new World(parsed.seed); loaded.importEdits(parsed.edits);
  expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual([{ id: 32768, count: 58 }]); expect(loaded.getBlock(8, 90, 8)).toBe(32768);
  expect(breakBlock(loaded, restored, "survival", 8, 90, 8)).toBe(true); expect(count(restored, 32768)).toBe(58);
});

it("preserves Unknown ownership during partial Agent drop, save/pending and capacity merging", () => {
  const robot = createAgent(8, 91, 8); expect(giveAgent(robot, { id: 32768, count: 58 })).toBe(0);
  const bag = new Inventory(); for (let i = 0; i < 36; i++) bag.setSlot(i, stack("stone", 64)); bag.setSlot(0, { id: 32768, count: 63 });
  expect(bag.spaceFor(32768)).toBe(1);
  expect(runAgentCommand(new World(13), robot, { op: "drop", slot: 0 }, { giveToPlayer: (s) => bag.addStack(s) }).ok).toBe(true);
  expect(robot.slots[0]).toEqual({ id: 32768, count: 57 }); expect(count(bag, 32768)).toBe(64);
  const parsed = parseSave(serializeSave({ name: "partial transfer", seed: 13, mode: "survival", timeOfDay: .3,
    player: { position: { x: 2, y: 91, z: 2 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), agent: robot, edits: [], inventoryPending: [{ id: 32768, count: 57 }] }));
  const restored = Inventory.fromJSON(parsed.inventory), savedRobot = sanitizeAgent(parsed.agent)!;
  expect(savedRobot.slots[0]).toEqual({ id: 32768, count: 57 }); expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual([{ id: 32768, count: 57 }]);
  restored.setSlot(35, null); expect(runAgentCommand(new World(13), savedRobot, { op: "drop", slot: 0 }, { giveToPlayer: (s) => restored.addStack(s) }).ok).toBe(true);
  expect(savedRobot.slots[0]).toBeNull(); expect(count(restored, 32768)).toBe(121);
});
