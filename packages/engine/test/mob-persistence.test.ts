import { expect, it } from "vitest";
import {
  AIR, Inventory, MobLootResolver, WorldDrops, blockId, createMob, mobSnapshot, restoreMobSnapshot,
  sanitizeMobState, sanitizeNpcs, sanitizePendingMobLoot, serializeSave, parseSave, stackId,
  type Mob, type MobKind, type MobSnapshot, type MobStateData,
} from "../src";
const position = { x: .5, y: 1, z: .5 };
const floor = { getLoadedBlock: (_x: number, y: number, _z: number) => y === 0 ? blockId("stone") : AIR };
const stack = (name: string, count = 1) => ({ id: stackId(name), count });
const core = { name: "mob save", seed: 1, mode: "survival" as const, timeOfDay: .3,
  player: { position, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [],
};
const restoreState = (data: MobStateData) => sanitizeMobState(parseSave(serializeSave({ ...core, mobs: data })).mobs);

it("roundtrips allfive kinds with stable IDs, semantic timers and explicit JSON-safe NPC invulnerability", () => {
  const kinds: MobKind[] = ["pig", "sheep", "chicken", "npc", "zombie"];
  const ids = [3, 9, 28, 99, 180];
  const snapshots = kinds.map((kind, index) => {
    const mob = createMob(ids[index], kind, { x: index + .25, y: 80.25, z: -index - .75 }, { name: "Teacher", dialogue: "Keep this exact dialogue.", yaw: -.7 });
    mob.velocity = { x: 1.5, y: -2, z: .25 }; mob.onGround = true; mob.walking = true; mob.thinkTimer = -12.5; mob.hurtTimer = 1.25;
    mob.attackTimer = .7; mob.burnTimer = .4; mob.burning = true; mob.detourTimer = -.01; mob.detourSign = -1; mob.stuckTimer = .1;
    if (kind !== "npc") mob.health -= 1;
    const circular: Record<string, unknown> = {}; circular.self = circular;
    mob.search = circular as unknown as Mob["search"]; mob.path = [{ x: 1, y: 2, z: 3 }]; mob.pathTimer = 100; mob.pathGoal = { x: 4, y: 5, z: 6 }; mob.failCount = 2;
    const snapshot = mobSnapshot(mob);
    for (const excluded of ["search", "path", "pathTimer", "pathGoal", "failCount"]) expect(Object.hasOwn(snapshot, excluded)).toBe(false);
    return snapshot;
  });
  const text = serializeSave({ ...core, mobs: { nextId: 200, records: snapshots } });
  expect(text).toContain('"health":"invulnerable"'); expect(text).not.toContain('"health":null');
  const parsed = parseSave(text); expect(parsed.version).toBe(1);
  const checked = sanitizeMobState(parsed.mobs); expect(checked.present).toBe(true); expect(checked.invalid).toBe(0); expect(checked.data).toEqual({ nextId: 200, records: snapshots });
  const restored = checked.data.records.map(restoreMobSnapshot);
  expect(restored.map(m => m.id)).toEqual(ids); expect(restored[3].health).toBe(Infinity); expect(restored[3].name).toBe("Teacher"); expect(restored[3].dialogue).toBe("Keep this exact dialogue.");
  expect(restored.map(m => mobSnapshot(m))).toEqual(snapshots);
  for (const mob of restored) expect(mob.search ?? mob.path).toBeUndefined();
});

it("keeps oldNPC-only saves and absent/defaultempty sections distinct from present invalid sections", () => {
  const npc = { x: 3, y: 70, z: 4, yaw: .3, name: "Legacy", dialogue: "Old world" };
  const parsed = parseSave(serializeSave({ ...core, npcs: [npc] }));
  expect(Object.hasOwn(parsed, "mobs")).toBe(false); expect(sanitizeNpcs(parsed.npcs)).toEqual([npc]);
  expect(sanitizeMobState(parsed.mobs)).toEqual({ data: { nextId: 1, records: [] }, invalid: 0, present: false });
  expect(restoreState({ nextId: 1, records: [] })).toEqual({ data: { nextId: 1, records: [] }, invalid: 0, present: true });
  expect(sanitizeMobState(null)).toEqual({ data: { nextId: 1, records: [] }, invalid: 1, present: true });
  expect(parseSave(JSON.stringify({ ...core, version: 1, mobs: null })).mobs).toBeNull();
});

it("never caps valid records and keeps stable nextId independently of sparse live IDs", () => {
  const records = Array.from({ length: 1205 }, (_, i) => mobSnapshot(createMob(i * 2 + 1, "pig", { x: i, y: 80, z: 0 })));
  const checked = restoreState({ nextId: 9000, records }); expect(checked.invalid).toBe(0); expect(checked.data.records).toHaveLength(1205); expect(checked.data.nextId).toBe(9000);
  expect(checked.data.records).toEqual(records);
  const exhausted = sanitizeMobState({ nextId: Number.MAX_SAFE_INTEGER, records: [] }); expect(exhausted.invalid).toBe(0); expect(exhausted.data.nextId).toBe(Number.MAX_SAFE_INTEGER);
});

it("reports duplicate/bad IDs and invalid nextId without renumbering or discarding other valid owners", () => {
  const good = mobSnapshot(createMob(41, "pig", position));
  const checked = sanitizeMobState({ nextId: 2, records: [good, { ...good }, { ...good, id: 0 }, { ...good, id: 1.5 }, { ...good, id: Number.MAX_SAFE_INTEGER }, { ...good, id: 73 }] });
  expect(checked.invalid).toBe(5); expect(checked.data.records.map(m => m.id)).toEqual([41, 73]); expect(checked.data.nextId).toBe(74);
  expect(sanitizeMobState({ nextId: 41, records: [good] }).invalid).toBe(1);
  expect(sanitizeMobState({ nextId: Infinity, records: [good] }).data).toEqual({ nextId: 42, records: [good] });
});

it("strictly rejects nonfinite/corekind/boolean/inherited fields and preserves valid zero/negative timer values", () => {
  const good = mobSnapshot(createMob(1, "pig", position));
  const bad: unknown[] = [null, [], Object.create(good), { ...good, kind: "squid" }, { ...good, kind: "constructor" }, { ...good, kind: "__proto__" },
    { ...good, position: { ...position, x: Infinity } }, { ...good, position: { ...position, y: NaN } }, { ...good, velocity: { x: 0, y: -Infinity, z: 0 } },
    { ...good, yaw: NaN }, { ...good, health: NaN }, { ...good, health: 0 }, { ...good, health: 11 }, { ...good, health: "invulnerable" },
    { ...good, onGround: 1 }, { ...good, walking: "true" }, { ...good, thinkTimer: Infinity }, { ...good, hurtTimer: -1 }, { ...good, burnTimer: NaN }, { ...good, detourSign: 0 }, { ...good, burning: 1 }];
  for (const value of bad) { const checked = sanitizeMobState({ nextId: 2, records: [value, { ...good, id: 3 }] }); expect(checked.invalid).toBeGreaterThan(0); expect(checked.data.records.map(m => m.id)).toEqual([3]); }
  const nullProto = Object.assign(Object.create(null), good); expect(sanitizeMobState({ nextId: 2, records: [nullProto] }).invalid).toBe(0);
  const timers = { ...good, thinkTimer: -1000, hurtTimer: 0, attackTimer: 0, burnTimer: 0, detourTimer: -.1, detourSign: 1, stuckTimer: 0, burning: false };
  expect(sanitizeMobState({ nextId: 2, records: [timers] }).data.records).toEqual([timers]);
});

it("rejects accidental NPCnull/NaN/infinite encodings and keeps text without silent truncation", () => {
  const npc = createMob(1, "npc", position, { name: "N", dialogue: "D" }), good = mobSnapshot(npc);
  expect(good.health).toBe("invulnerable"); expect(restoreMobSnapshot(good).health).toBe(Infinity);
  for (const health of [null, NaN, Infinity, -Infinity, 10]) expect(sanitizeMobState({ nextId: 2, records: [{ ...good, health }] }).invalid).toBe(1);
  for (const patch of [{ name: "n".repeat(65) }, { dialogue: "d".repeat(2001) }, { name: undefined }, { dialogue: 4 }]) expect(sanitizeMobState({ nextId: 2, records: [{ ...good, ...patch }] }).invalid).toBe(1);
  npc.health = NaN; expect(() => mobSnapshot(npc)).toThrow(/invalid live/);
});

it("validates cached batches against exact permitted kind identities, quantities and ordinary metadata", () => {
  expect(sanitizePendingMobLoot("pig", [stack("raw_porkchop", 3)])).toEqual([stack("raw_porkchop", 3)]);
  expect(sanitizePendingMobLoot("zombie", [])).toEqual([]); expect(sanitizePendingMobLoot("npc", [])).toEqual([]);
  expect(sanitizePendingMobLoot("chicken", [stack("raw_chicken")])).toEqual([stack("raw_chicken")]);
  expect(sanitizePendingMobLoot("chicken", [stack("raw_chicken"), stack("feather", 2)])).toEqual([stack("raw_chicken"), stack("feather", 2)]);
  for (const raw of [null, [], [stack("raw_porkchop", 0)], [stack("raw_porkchop", 4)], [stack("redstone")], [stack("raw_porkchop"), stack("raw_porkchop")], [{ ...stack("raw_porkchop"), damage: 0 }], [{ ...stack("raw_porkchop"), book: { pages: ["not mob loot"] } }]]) expect(sanitizePendingMobLoot("pig", raw)).toBeNull();
  expect(sanitizePendingMobLoot("chicken", [stack("feather")])).toBeNull(); expect(sanitizePendingMobLoot("sheep", [stack("white_wool", 2)])).toBeNull();
  const mob = mobSnapshot(createMob(1, "pig", position)); expect(sanitizeMobState({ nextId: 2, records: [{ ...mob, pendingLoot: [stack("raw_porkchop", 4)] }] }).invalid).toBe(1);
});

it("retains a refused resolved roll through actual Savev1, fresh object restoration and later exactly-once delivery", () => {
  let rolls = 0; const resolver = new MobLootResolver(() => { rolls++; return .99; }), mob = createMob(7, "pig", position);
  mob.health = 1; expect(resolver.tryDrop(mob, () => null, position)).toBe(false); expect(rolls).toBe(1);
  const exported = resolver.exportPending(mob)!; expect(exported).toEqual([stack("raw_porkchop", 3)]); exported[0].count = 1;
  expect(resolver.exportPending(mob)).toEqual([stack("raw_porkchop", 3)]);
  const data = restoreState({ nextId: 30, records: [mobSnapshot(mob, resolver.exportPending(mob))] }); expect(data.invalid).toBe(0);
  const record = data.data.records[0], restored = restoreMobSnapshot(record), fresh = new MobLootResolver(() => { throw new Error("restored pending owner must not reroll"); });
  expect(restored).not.toBe(mob); expect(restored.id).toBe(7); expect(fresh.restorePending(restored, record.pendingLoot)).toBe(true); expect(fresh.restorePending(restored, record.pendingLoot)).toBe(false);
  record.pendingLoot![0].count = 1; expect(fresh.exportPending(restored)).toEqual([stack("raw_porkchop", 3)]);
  expect(fresh.tryDrop(restored, () => ({ commit: () => false }), position)).toBe(false);
  const drops = new WorldDrops(floor); expect(fresh.tryDrop(restored, drops.planSpawnBatch.bind(drops), position)).toBe(true); expect(drops.records.map(r => r.stack)).toEqual([stack("raw_porkchop", 3)]);
  expect(fresh.exportPending(restored)).toBeUndefined(); expect(fresh.restorePending(restored, [stack("raw_porkchop")])).toBe(false);
  expect(fresh.tryDrop(restored, () => { throw new Error("no second receiver"); }, position)).toBe(true);
  expect(drops.records.map(r => r.stack)).toEqual([stack("raw_porkchop", 3)]);
  const afterDeath = parseSave(serializeSave({ ...core, mobs: { nextId: 30, records: [] }, worldDrops: drops.toJSON() }));
  expect(sanitizeMobState(afterDeath.mobs).data.records).toEqual([]); expect(new WorldDrops(floor, afterDeath.worldDrops).records.map(r => r.stack)).toEqual([stack("raw_porkchop", 3)]);
});

it("preserves a resolved empty zero roll as distinct from unresolved through JSON and restoration", () => {
  const resolver = new MobLootResolver(() => 0), zombie = createMob(8, "zombie", position); zombie.health = 1;
  expect(resolver.exportPending(zombie)).toBeUndefined(); expect(resolver.tryDrop(zombie, () => null, position)).toBe(false); expect(resolver.exportPending(zombie)).toEqual([]);
  const state = restoreState({ nextId: 9, records: [mobSnapshot(zombie, resolver.exportPending(zombie))] });
  const snapshot = state.data.records[0]; expect(Object.hasOwn(snapshot, "pendingLoot")).toBe(true); expect(snapshot.pendingLoot).toEqual([]);
  const restored = restoreMobSnapshot(snapshot), next = new MobLootResolver(() => { throw new Error("zero roll must not reroll"); }); expect(next.restorePending(restored, snapshot.pendingLoot)).toBe(true);
  const drops = new WorldDrops(floor); expect(next.tryDrop(restored, drops.planSpawnBatch.bind(drops), position)).toBe(true); expect(drops.records).toEqual([]); expect(next.exportPending(restored)).toBeUndefined();
  expect(next.tryDrop(restored, () => { throw new Error("no second empty transfer"); }, position)).toBe(true);
});

it("keeps snapshots, loaded vectors and pending records detached and refuses invalid live snapshots", () => {
  const mob = createMob(1, "pig", position), snapshot = mobSnapshot(mob, [stack("raw_porkchop", 2)]);
  snapshot.position.x = 99; snapshot.velocity.y = 20; snapshot.pendingLoot![0].count = 1;
  expect(mob.position).toEqual(position); expect(mob.velocity).toEqual({ x: 0, y: 0, z: 0 });
  const loaded = sanitizeMobState({ nextId: 2, records: [snapshot] }); loaded.data.records[0].position.x = 77; expect(snapshot.position.x).toBe(99);
  const restored = restoreMobSnapshot(snapshot); restored.position.x = 88; expect(snapshot.position.x).toBe(99);
  mob.velocity.y = Infinity; expect(() => mobSnapshot(mob)).toThrow(/invalid live/);
  expect(() => restoreMobSnapshot({ ...snapshot, health: null } as unknown as MobSnapshot)).toThrow(/invalid mob/);
});
