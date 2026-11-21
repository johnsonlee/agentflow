import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, Inventory, MOB_SPECS, MobLootResolver, SPIDER, WorldDrops, ZOMBIE, blockId, burnInDaylight,
  createMob, damageMob, itemById, knockbackFrom, mobAttack, mobDrops, mobIsAggressive, mobSnapshot,
  parseCommand, parseSave, raycastMob, restoreMobSnapshot, sanitizeMobState, sanitizePendingMobLoot,
  serializeSave, stackId, stepMob, type MobKind,
} from "../src";
const facts = JSON.parse(readFileSync(new URL("./fixtures/spider-source-facts.json", import.meta.url), "utf8"));
const at = { x: .5, y: 10, z: .5 }, near = { x: 1.5, y: 10, z: .5 };
const flat = (_x: number, y: number, _z: number) => y < 10 ? blockId("stone") : AIR;
const stack = (count = 1) => ({ id: stackId("string"), count });
const core = { name: "Spider ownership", seed: 1, mode: "survival" as const, timeOfDay: .3,
  player: { position: at, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [],
};

it("binds HP/body and bounded loot to retained Education facts without claiming an active damage variant", () => {
  expect(facts.clientVersion).toBe("1.26.33.0"); expect(facts.entities).toHaveLength(14);
  for (const e of facts.entities) {
    expect(e.health).toEqual({ value: 16, max: 16 }); expect(e.collision_box).toEqual({ width: 1.4, height: .9 });
    expect(e.sha256).toMatch(/^[0-9a-f]{64}$/); expect(e.bytes).toBeGreaterThan(0);
  }
  expect(new Set(facts.entities.map((e: { attack: { damage: number } }) => e.attack.damage))).toEqual(new Set([2, 3]));
  expect(facts.activeRuntimeBindingVerified).toBe(false); expect(facts.loot.stringCount).toEqual({ min: 0, max: 2 });
  expect(MOB_SPECS.spider).toMatchObject({ maxHealth: 16, width: 1.4, height: .9 }); expect(SPIDER.damage).toBe(2);
  expect(stackId("string")).toBe(806); expect(itemById(806)).toMatchObject({ name: "string", maxStack: 64, icon: "item_string" });
  expect(parseCommand("/summon minecraft:spider")).toEqual({ type: "summon", kind: "spider" });
  for (const kind of ["constructor", "__proto__", "cave_spider"]) expect(parseCommand(`/summon ${kind}`).type).toBe("error");
});

it("stays neutral in bright light, attacks in darkness, and never burns like a zombie", () => {
  const spider = createMob(1, "spider", at);
  expect(mobIsAggressive(spider, 15)).toBe(false); expect(mobIsAggressive(spider, 8)).toBe(false);
  expect(mobAttack(spider, near, .05, 15)).toBe(0); expect(spider.attackTimer).toBeUndefined();
  expect(mobIsAggressive(spider, 7)).toBe(true); expect(mobAttack(spider, near, .05, 7)).toBe(2);
  expect(mobAttack(spider, near, .5, 0)).toBe(0); expect(mobAttack(spider, near, .5, 0)).toBe(2);
  expect(burnInDaylight(spider, 15, 0, 5)).toBe(false); expect(spider.health).toBe(16); expect(spider.burning).toBeUndefined();
  expect(mobAttack(createMob(2, "zombie", at), near, .05, 15)).toBe(ZOMBIE.damage);
  for (const kind of ["pig", "sheep", "chicken", "npc"] as MobKind[]) expect(mobIsAggressive(createMob(3, kind, at), 0)).toBe(false);
});

it("only actual positive damage provokes, renews a fixed timer, and expires on clamped simulation time", () => {
  const spider = createMob(1, "spider", at);
  for (const amount of [0, -1, NaN, Infinity]) expect(damageMob(spider, amount, 0)).toBe(false);
  expect(spider.health).toBe(16); expect(spider.spiderAngerSeconds).toBe(0);
  expect(damageMob(spider, 1, 0)).toBe(false); expect(spider.health).toBe(15); expect(spider.spiderAngerSeconds).toBe(10);
  expect(mobIsAggressive(spider, 15)).toBe(true); expect(mobAttack(spider, near, .05, 15)).toBe(2);
  stepMob(flat, spider, 99, () => .99, null, undefined, 15); expect(spider.spiderAngerSeconds).toBeCloseTo(9.9);
  stepMob(flat, spider, 0, () => .99, null, undefined, 15); expect(spider.spiderAngerSeconds).toBeCloseTo(9.9);
  damageMob(spider, 1, 0); expect(spider.spiderAngerSeconds).toBe(10); expect(spider.health).toBe(14);
  for (let i = 0; i < 101; i++) stepMob(flat, spider, .1, () => .99, null, undefined, 15);
  expect(spider.spiderAngerSeconds).toBe(0); expect(mobIsAggressive(spider, 15)).toBe(false);
  expect(spider.health).toBe(14); expect(mobAttack(spider, spider.position, 2, 15)).toBe(0);
});

it("chases within its own range in darkness and clears a stale search when daylight neutralizes it", () => {
  const spider = createMob(1, "spider", at), target = { ...at, x: 8.5 };
  for (let i = 0; i < 50; i++) stepMob(flat, spider, .05, () => .99, target, undefined, 0);
  expect(spider.position.x).toBeGreaterThan(4); expect(spider.position.x).toBeLessThan(target.x);
  stepMob(flat, spider, .05, () => .99, target, undefined, 15);
  expect(spider.path).toBeUndefined(); expect(spider.search).toBeUndefined();
  const distant = createMob(2, "spider", at); distant.onGround = true;
  for (let i = 0; i < 20; i++) stepMob(flat, distant, .05, () => .99, { ...at, x: at.x + 17 }, undefined, 0);
  expect(distant.position.x).toBeCloseTo(at.x); expect(distant.path).toBeUndefined();
});

it("uses its wide short body for collision and actual ray targeting", () => {
  const spider = createMob(1, "spider", at);
  expect(raycastMob({ x: 1.1, y: 10.8, z: 3 }, { x: 0, y: 0, z: -1 }, spider, 4)).toBeCloseTo(1.8);
  expect(raycastMob({ x: 1.1, y: 10.95, z: 3 }, { x: 0, y: 0, z: -1 }, spider, 4)).toBeNull();
  const wall = (x: number, y: number, z: number) => x === 3 && y >= 10 && y <= 13 ? blockId("stone") : flat(x, y, z);
  spider.yaw = -Math.PI / 2; spider.walking = true; spider.thinkTimer = 100;
  for (let i = 0; i < 150; i++) stepMob(wall, spider, .05, () => .99, null, undefined, 15);
  expect(spider.position.x).toBeLessThanOrEqual(2.3 + .001); expect(spider.position.y).toBeCloseTo(10);
  expect(knockbackFrom(spider, { ...spider.position, x: spider.position.x + 1 })).toEqual({ x: 5, y: 4, z: 0 });
});

it("roundtrips anger, stable IDs and pending loot without aliasing and permits legacy missing timer", () => {
  const spider = createMob(17, "spider", at); damageMob(spider, 2, 0); stepMob(flat, spider, .05, () => .99, null, undefined, 15);
  const snapshot = mobSnapshot(spider, [stack(2)]), text = serializeSave({ ...core, mobs: { nextId: 33, records: [snapshot] } });
  const checked = sanitizeMobState(parseSave(text).mobs); expect(checked.invalid).toBe(0); expect(checked.data.nextId).toBe(33);
  expect(checked.data.records[0]).toEqual(snapshot); const restored = restoreMobSnapshot(checked.data.records[0]);
  expect(restored.id).toBe(17); expect(restored.spiderAngerSeconds).toBeCloseTo(9.95); expect(restored.health).toBe(14);
  restored.position.x = 999; restored.spiderAngerSeconds = 1; expect(snapshot.position.x).not.toBe(999); expect(snapshot.spiderAngerSeconds).toBeCloseTo(9.95);
  const legacy = { ...snapshot }; delete legacy.spiderAngerSeconds;
  expect(sanitizeMobState({ nextId: 33, records: [legacy] }).invalid).toBe(0); expect(restoreMobSnapshot(legacy).spiderAngerSeconds).toBe(0);
});

it("diagnoses malformed or wrong-kind anger without silently replacing the corrupt owner's timer", () => {
  const spider = mobSnapshot(createMob(1, "spider", at)), pig = mobSnapshot(createMob(3, "pig", at));
  for (const anger of [-.01, 10.01, NaN, Infinity, -Infinity, null, undefined, "1", {}, []]) {
    const raw = { ...spider, spiderAngerSeconds: anger }, checked = sanitizeMobState({ nextId: 4, records: [raw, pig] });
    expect(checked.invalid).toBe(1); expect(checked.data.records).toEqual([pig]);
  }
  for (const anger of [0, 5, 10]) expect(sanitizeMobState({ nextId: 4, records: [{ ...pig, spiderAngerSeconds: anger }] }).invalid).toBe(1);
  for (const anger of [0, 10]) expect(sanitizeMobState({ nextId: 2, records: [{ ...spider, spiderAngerSeconds: anger }] }).invalid).toBe(0);
  const live = createMob(2, "spider", at); live.spiderAngerSeconds = 11; expect(() => mobSnapshot(live)).toThrow(/invalid live/);
});

it("permits only string0..2 cached batches, with no conditional Eye or invented empty stack", () => {
  expect(mobDrops("spider", () => 0)).toEqual([]); expect(mobDrops("spider", () => .5)).toEqual([stack()]); expect(mobDrops("spider", () => 1)).toEqual([stack(2)]);
  for (const invalid of [NaN, Infinity, -Infinity]) expect(() => mobDrops("spider", () => invalid)).toThrow(RangeError);
  expect(sanitizePendingMobLoot("spider", [])).toEqual([]); expect(sanitizePendingMobLoot("spider", [stack(2)])).toEqual([stack(2)]);
  for (const bad of [[stack(0)], [stack(3)], [stack(), stack()], [{ ...stack(), damage: 0 }], [{ id: stackId("white_wool"), count: 1 }]]) expect(sanitizePendingMobLoot("spider", bad)).toBeNull();
});

it.each([0, 1, 2])("retains a resolved%istring roll through refusal, Save, restoration, full bag and exactly-once pickup", count => {
  let rolls = 0; const spider = createMob(7, "spider", at), resolver = new MobLootResolver(() => { rolls++; return count / 2; });
  spider.health = 1;
  expect(resolver.tryDrop(spider, () => null, at)).toBe(false); expect(rolls).toBe(1);
  const pending = count ? [stack(count)] : []; expect(resolver.exportPending(spider)).toEqual(pending);
  expect(resolver.tryDrop(spider, () => ({ commit: () => false }), at)).toBe(false); expect(rolls).toBe(1);
  const parsed = parseSave(serializeSave({ ...core, mobs: { nextId: 8, records: [mobSnapshot(spider, resolver.exportPending(spider))] } }));
  const saved = sanitizeMobState(parsed.mobs); expect(saved.invalid).toBe(0); const record = saved.data.records[0], restored = restoreMobSnapshot(record);
  const next = new MobLootResolver(() => { throw Error("a restored pending roll must not reroll"); }); expect(next.restorePending(restored, record.pendingLoot)).toBe(true);
  const drops = new WorldDrops({ getLoadedBlock: flat }); expect(next.tryDrop(restored, drops.planSpawnBatch.bind(drops), at)).toBe(true);
  expect(next.tryDrop(restored, () => { throw Error("committed owner must not redeliver"); }, at)).toBe(true);
  expect(drops.records.map(r => r.stack)).toEqual(pending); expect(next.exportPending(restored)).toBeUndefined();
  const bag = new Inventory(); for (let i = 0; i < bag.slots.length; i++) bag.setSlot(i, { id: blockId("stone"), count: 64 });
  drops.update(.5); expect(drops.tryPickup(at, s => bag.addStack(s))).toBe(0);
  const loaded = new WorldDrops({ getLoadedBlock: flat }, parseSave(serializeSave({ ...core, worldDrops: drops.toJSON() })).worldDrops);
  expect(loaded.loadIssues).toBe(0); expect(loaded.records.map(r => r.stack)).toEqual(pending);
  bag.setSlot(0, null); expect(loaded.tryPickup(at, s => bag.addStack(s))).toBe(count); expect(loaded.records).toEqual([]);
  expect(bag.slots.filter(s => s?.id === stackId("string"))).toEqual(pending);
});
