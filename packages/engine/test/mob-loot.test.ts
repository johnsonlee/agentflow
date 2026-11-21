import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, Inventory, MOB_SPECS, MobLootResolver, SAVE_VERSION, WorldDrops, blockId,
  createMob, mobDrops, parseSave, serializeSave, stackId, type DropSink, type ItemStack, type MobKind,
} from "../src";

const facts = JSON.parse(readFileSync(new URL("./fixtures/native-mob-loot-1.26.33.json", import.meta.url), "utf8"));
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const at = { x: .5, y: 1, z: .5 };
const floor = { getLoadedBlock: (_x: number, y: number, _z: number) => y === 0 ? blockId("stone") : AIR };
const amount = (stacks: readonly ItemStack[], name: string) => stacks.filter((s) => s.id === stackId(name)).reduce((n, s) => n + s.count, 0);

it("retains all legacy mob metadata and registries while documenting exact candidate source ranges", () => {
  expect(JSON.parse(JSON.stringify(MOB_SPECS))).toEqual(facts.legacyMobSpecs);
  expect(BLOCKS).toHaveLength(307); expect(ITEMS).toHaveLength(535);
  expect(facts.sources).toHaveLength(13);
  expect(facts.ranges.map((r: { mob: string; min: number; max: number; sources: string[] }) => [r.mob, r.min, r.max, r.sources.length])).toEqual([
    ["pig", 1, 3, 2], ["chicken", 0, 2, 1], ["zombie", 0, 2, 4],
  ]);
  for (const source of facts.sources) { expect(source.sha256).toMatch(/^[0-9a-f]{64}$/); expect(source.bytes).toBeGreaterThan(0); }
  expect(facts.targetAccepted).toBe(false); expect(facts.activeRuntimeBindingVerified).toBe(false);
});

it.each([[0, 1, 0], [1 / 3, 2, 1], [2 / 3, 3, 2], [1 - Number.EPSILON, 3, 2]])(
  "samples the bounded application intervals at%s without creating zero-count loot", (random, pork, optional) => {
    expect(mobDrops("pig", () => random)).toEqual([stack("raw_porkchop", pork)]);
    expect(mobDrops("chicken", () => random)).toEqual([stack("raw_chicken"), ...(optional ? [stack("feather", optional)] : [])]);
    expect(mobDrops("zombie", () => random)).toEqual(optional ? [stack("rotten_flesh", optional)] : []);
  },
);

it("samples each variable base count once and preserves limited sheep/NPC fallback without random draws", () => {
  let calls = 0; const rand = () => { calls++; return .5; };
  for (const kind of ["pig", "chicken", "zombie"] as MobKind[]) mobDrops(kind, rand);
  expect(calls).toBe(3); expect(mobDrops("sheep", rand)).toEqual([stack("white_wool")]); expect(mobDrops("npc", rand)).toEqual([]); expect(calls).toBe(3);
  const first = mobDrops("chicken", rand); first[0].count = 50;
  expect(mobDrops("chicken", rand)).toEqual([stack("raw_chicken"), stack("feather")]);
});

it("bounds finite endpoint test RNG values and refuses nonfinite values before returning invalid stacks", () => {
  expect(mobDrops("pig", () => -1)).toEqual([stack("raw_porkchop")]); expect(mobDrops("pig", () => 1)).toEqual([stack("raw_porkchop", 3)]);
  expect(mobDrops("chicken", () => 2)).toEqual([stack("raw_chicken"), stack("feather", 2)]);
  for (const random of [NaN, Infinity, -Infinity]) expect(() => mobDrops("zombie", () => random)).toThrow(RangeError);
});

it("caches one fatal roll through refused staging/commit, isolates receiver mutation and commits exactly once", () => {
  let calls = 0; const resolver = new MobLootResolver(() => { calls++; return calls === 1 ? .99 : 0; });
  const mob = createMob(1, "pig", at), original = structuredClone(mob), drops = new WorldDrops(floor);
  const refused: DropSink = (stacks, position) => { expect(stacks).toEqual([stack("raw_porkchop", 3)]); (stacks[0] as ItemStack).count = 99; position.x = 1000; return null; };
  expect(resolver.tryDrop(mob, refused, at)).toBe(false); expect(at.x).toBe(.5); expect(mob).toEqual(original); expect(drops.records).toEqual([]);
  expect(resolver.tryDrop(mob, (stacks) => { expect(stacks).toEqual([stack("raw_porkchop", 3)]); return { commit: () => false }; }, at)).toBe(false);
  expect(resolver.tryDrop(mob, drops.planSpawnBatch.bind(drops), at)).toBe(true); expect(calls).toBe(1);
  expect(drops.records.map((r) => r.stack)).toEqual([stack("raw_porkchop", 3)]);
  expect(resolver.tryDrop(mob, () => { throw new Error("committed mob must not ask a second receiver"); }, at)).toBe(true); expect(calls).toBe(1);
  expect(drops.records.map((r) => r.stack)).toEqual([stack("raw_porkchop", 3)]);
});

it("uses mob object identity across repeated numeric IDs and blocks reentrant delivery", () => {
  let calls = 0; const resolver = new MobLootResolver(() => { calls++; return .5; }), drops = new WorldDrops(floor);
  const first = createMob(1, "pig", at), second = createMob(1, "pig", at);
  let nested = true;
  expect(resolver.tryDrop(first, (stacks, position) => {
    nested = resolver.tryDrop(first, drops.planSpawnBatch.bind(drops), position);
    return drops.planSpawnBatch(stacks, position);
  }, at)).toBe(true); expect(nested).toBe(false);
  expect(resolver.tryDrop(second, drops.planSpawnBatch.bind(drops), at)).toBe(true); expect(calls).toBe(2);
  expect(amount(drops.records.map((r) => r.stack), "raw_porkchop")).toBe(4);
});

it("accepts empty zombie batches and zero-feather chickens without phantom stacks or second rolls", () => {
  let calls = 0; const resolver = new MobLootResolver(() => { calls++; return 0; }), drops = new WorldDrops(floor);
  const zombie = createMob(1, "zombie", at), chicken = createMob(2, "chicken", at);
  expect(resolver.tryDrop(zombie, drops.planSpawnBatch.bind(drops), at)).toBe(true); expect(drops.records).toEqual([]);
  expect(resolver.tryDrop(zombie, drops.planSpawnBatch.bind(drops), at)).toBe(true); expect(calls).toBe(1);
  expect(resolver.tryDrop(chicken, drops.planSpawnBatch.bind(drops), at)).toBe(true); expect(calls).toBe(2);
  expect(drops.records.map((r) => r.stack)).toEqual([stack("raw_chicken")]);
});

it("preserves actual maximum rolls in Savev1 and full/partial pickup without changing adjacent owned metadata", () => {
  const resolver = new MobLootResolver(() => .99), drops = new WorldDrops(floor), bag = new Inventory();
  for (const [index, kind] of (["pig", "chicken", "zombie"] as MobKind[]).entries()) expect(resolver.tryDrop(createMob(index + 1, kind, at), drops.planSpawnBatch.bind(drops), at)).toBe(true);
  const book = { ...stack("written_book"), book: { pages: ["owned"], title: "Signed", author: "User" } }, armor = { ...stack("iron_chestplate"), damage: 37 };
  drops.spawnBatch([book, armor], at); drops.update(.5);
  for (let i = 0; i < bag.slots.length; i++) bag.setSlot(i, stack("stone", 64));
  expect(drops.tryPickup(at, (s) => bag.addStack(s))).toBe(0);
  const text = serializeSave({ name: "actual rolls", seed: 1, mode: "survival", timeOfDay: .3, player: { position: at, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), edits: [], worldDrops: drops.toJSON() });
  const saved = parseSave(text); expect(saved.version).toBe(SAVE_VERSION); expect(SAVE_VERSION).toBe(1);
  const restored = new WorldDrops(floor, saved.worldDrops); expect(restored.loadIssues).toBe(0); expect(restored.toJSON()).toEqual(drops.toJSON());
  bag.setSlot(0, stack("raw_porkchop", 63)); expect(restored.tryPickup(at, (s) => bag.addStack(s))).toBe(1);
  expect(amount(restored.records.map((r) => r.stack), "raw_porkchop")).toBe(2);
  for (let i = 1; i < bag.slots.length; i++) bag.setSlot(i, null);
  expect(restored.tryPickup(at, (s) => bag.addStack(s))).toBe(9); expect(restored.records).toEqual([]);
  expect(amount(bag.slots.filter((s): s is ItemStack => s !== null), "raw_porkchop")).toBe(66);
  expect(amount(bag.slots.filter((s): s is ItemStack => s !== null), "raw_chicken")).toBe(1);
  expect(amount(bag.slots.filter((s): s is ItemStack => s !== null), "feather")).toBe(2);
  expect(amount(bag.slots.filter((s): s is ItemStack => s !== null), "rotten_flesh")).toBe(2);
  expect(bag.slots).toContainEqual(book); expect(bag.slots).toContainEqual(armor);
});
