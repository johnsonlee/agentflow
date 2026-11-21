import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { AIR, Inventory, MOB_SPECS, MobLootResolver, SQUID, blockId, bodyBox, boxCollides, createMob, mobDrops, mobSnapshot, parseSave, restoreMobSnapshot, sanitizeMobState, sanitizePendingMobLoot, serializeSave, squidBreathDamage, stackId, stepMob, type Mob, type Vec3 } from "../src";
const water = blockId("water"), stone = blockId("stone");
const aquarium = (x: number, y: number, z: number) => y <= 0 || y >= 8 || Math.abs(x) >= 5 || Math.abs(z) >= 5 ? stone : water;
const zero = { x: 0, y: 0, z: 0 };
function swim(direction: Vec3, position = { x: .5, y: 3, z: .5 }): Mob {
  const mob = createMob(1, "squid", position);
  mob.squidState!.swimDirection = { ...direction }; mob.squidState!.decisionTimer = 2;
  return mob;
}
function advance(mob: Mob, seconds: number, get = aquarium, bias = zero, acceleration = zero): number {
  let damage = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    stepMob(get, mob, 1 / 60, () => .5, null, undefined, 0, bias, acceleration);
    damage += squidBreathDamage(mob);
  }
  return damage;
}
it("preserves the original six MobSpecs byte projection and existing passive/hostile classifications", () => {
  const baseline = JSON.parse(readFileSync(new URL("./fixtures/balloon-baseline-ebab.json", import.meta.url), "utf8"));
  const old = Object.fromEntries(Object.entries(MOB_SPECS).slice(0,6));
  expect(createHash("sha256").update(JSON.stringify(old) + "\n").digest("hex")).toBe(baseline.mobSpecsSHA256);
  expect(MOB_SPECS.squid).toMatchObject({ width: .95, height: .95, maxHealth: 10 });
});
it("swims both up and down with real displacement, finite pitch and collision-safe wall/floor/ceiling", () => {
  for (const direction of [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }]) {
    const mob = swim(direction); advance(mob, 1);
    expect(direction.y ? Math.sign(mob.position.y - 3) : Math.sign(mob.position.x - .5)).toBe(direction.y || 1);
    expect(Math.abs(mob.squidState!.pitch)).toBeLessThanOrEqual(Math.PI / 2);
  }
  const cases = [swim({ x: 0, y: 1, z: 0 }, { x: .5, y: 6.9, z: .5 }), swim({ x: 0, y: -1, z: 0 }, { x: .5, y: 1.05, z: .5 }), swim({ x: 1, y: 0, z: 0 }, { x: 4.4, y: 3, z: .5 })];
  for (const mob of cases) { advance(mob, 1); expect(boxCollides(aquarium, bodyBox(mob.position, .95, .95))).toBe(false); }
  expect(cases[0].position.y).toBeLessThanOrEqual(7.05001);
  expect(cases[1].position.y).toBeGreaterThanOrEqual(.99999);
  expect(cases[2].position.x).toBeLessThanOrEqual(4.52501);
});
it("retains all three directional bias and acceleration components", () => {
  for (const axis of ["x", "y", "z"] as const) for (const sign of [-1, 1]) {
    for (const useForce of [false, true]) {
      const mob = swim(zero), directional = { ...zero, [axis]: sign * 4 };
      advance(mob, .5, aquarium, useForce ? zero : directional, useForce ? directional : zero);
      expect(Math.sign(mob.position[axis] - (axis === "y" ? 3 : .5))).toBe(sign);
    }
  }
});
it("lands under gravity, exhausts only after fifteen dry seconds, and resets in water", () => {
  const dry = (_x: number, y: number, _z: number) => y <= 0 ? stone : AIR;
  const mob = swim(zero);
  expect(advance(mob, 14, dry)).toBe(0); expect(mob.position.y).toBeCloseTo(1, 4); expect(mob.onGround).toBe(true);
  expect(advance(mob, 3.1, dry)).toBe(2); expect(mob.health).toBe(10);
  expect(mob.squidState!.airRemaining).toBe(0);
  advance(mob, .1, aquarium); expect(mob.squidState!.airRemaining).toBe(SQUID.airSupply); expect(mob.squidState!.damageAccumulator).toBe(0);
});
it("suspends unknown cells and embedded terrain without changing pose, velocity, phase or breath", () => {
  for (const unknown of [true, false]) {
    const mob = swim({ x: 1, y: 0, z: 0 }); mob.velocity = { x: 3, y: -1, z: 2 };
    const before = structuredClone(mob); let draws = 0;
    const stepped = stepMob(() => unknown ? -1 : stone, mob, .1, () => { draws++; return .5; });
    expect(stepped).toBe(false); expect(mob).toEqual(before); expect(draws).toBe(0);
  }
});
it("clamps oversized dt to existing .1s substeps and cannot tunnel through boundaries", () => {
  const large = swim(zero), regular = swim(zero);
  large.velocity = regular.velocity = { x: 78, y: 78, z: 0 };
  regular.velocity = { ...large.velocity };
  stepMob(aquarium, large, 50, () => .5); stepMob(aquarium, regular, .1, () => .5);
  expect(large).toEqual(regular); expect(boxCollides(aquarium, bodyBox(large.position, .95, .95))).toBe(false);
});
it("roundtrips used swimming and exposure state, defaults legacy once and rejects corrupt/crosskind owners", () => {
  const mob = swim({ x: .6, y: -.8, z: 0 }); advance(mob, .5);
  mob.squidState!.airRemaining = 0; mob.squidState!.damageAccumulator = 1.25;
  const pending = [{ id: stackId("ink_sac"), count: 3 }], snapshot = mobSnapshot(mob, pending);
  const core = { name: "squid", seed: 1, mode: "survival" as const, timeOfDay: .3, player: { position: mob.position, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [] };
  const parsed = parseSave(serializeSave({ ...core, mobs: { nextId: 2, records: [snapshot] } }));
  const checked = sanitizeMobState(parsed.mobs); expect(checked.invalid).toBe(0); expect(checked.data.records[0]).toEqual(snapshot);
  const restored = restoreMobSnapshot(checked.data.records[0]); expect(mobSnapshot(restored, pending)).toEqual(snapshot);
  advance(mob, .1); advance(restored, .1); expect(restored).toEqual(mob);
  const legacy = { ...snapshot }; delete legacy.squidState;
  const defaulted = sanitizeMobState({ nextId: 2, records: [legacy] }); expect(defaulted.invalid).toBe(0); expect(defaulted.data.records[0].squidState!.airRemaining).toBe(15);
  const bad = [undefined, null, { ...snapshot.squidState, airRemaining: 16 }, { ...snapshot.squidState, damageAccumulator: 2 }, { ...snapshot.squidState, decisionTimer: -1 }, { ...snapshot.squidState, pitch: NaN }, { ...snapshot.squidState, swimDirection: { x: 0, y: 2, z: 0 } }];
  for (const squidState of bad) expect(sanitizeMobState({ nextId: 2, records: [{ ...snapshot, squidState }] }).invalid).toBe(1);
  expect(sanitizeMobState({ nextId: 2, records: [{ ...mobSnapshot(createMob(1, "pig", mob.position)), squidState: snapshot.squidState }] }).invalid).toBe(1);
});
it("bounds ink to1..3 and preserves the single cached roll through refusal and restored retry", () => {
  for (const [random, count] of [[0, 1], [.5, 2], [1, 3]]) expect(mobDrops("squid", () => random)).toEqual([{ id: stackId("ink_sac"), count }]);
  expect(() => mobDrops("squid", () => NaN)).toThrow(RangeError);
  for (const raw of [[], [{ id: stackId("ink_sac"), count: 0 }], [{ id: stackId("ink_sac"), count: 4 }], [{ id: stackId("black_dye"), count: 1 }], [{ id: stackId("ink_sac"), count: 1, damage: 0 }]]) expect(sanitizePendingMobLoot("squid", raw)).toBeNull();
  let calls = 0; const resolver = new MobLootResolver(() => { calls++; return 1; }), mob = swim(zero);
  expect(resolver.tryDrop(mob, () => null, mob.position)).toBe(false);
  expect(resolver.tryDrop(mob, () => null, mob.position)).toBe(false); expect(calls).toBe(1);
  const pending = resolver.exportPending(mob)!, saved = mobSnapshot(mob, pending), restored = restoreMobSnapshot(saved), next = new MobLootResolver(() => { throw Error("must not reroll"); });
  expect(next.restorePending(restored, saved.pendingLoot)).toBe(true); let committed = 0;
  expect(next.tryDrop(restored, stacks => { expect(stacks).toEqual(pending); return { commit: () => { committed++; return true; } }; }, restored.position)).toBe(true);
  expect(next.tryDrop(restored, () => { throw Error("must not redeliver"); }, restored.position)).toBe(true); expect(committed).toBe(1);
});

it("suspends a loaded body whose swept neighborhood is unknown before decisions or breath drain", () => {
  const mob = swim({ x: 1, y: 0, z: 0 }, { x: 4.45, y: 3, z: .5 });
  mob.velocity.x = 8; mob.squidState!.decisionTimer = 0; mob.squidState!.damageAccumulator = 1.5;
  const before = structuredClone(mob); let draws = 0;
  const stepped = stepMob((x, y, z) => x >= 5 ? -1 : aquarium(x, y, z), mob, .1, () => { draws++; return .5; });
  expect(stepped).toBe(false); expect(mob).toEqual(before); expect(draws).toBe(0);
  const invalid = swim(zero); invalid.position.x = 1e30;
  expect(stepMob(() => { throw Error("invalid pose must not query cells"); }, invalid, .1, () => .5)).toBe(false);
});
it("retains corrupt raw JSON and reports the cached squid owner invalid for the existing recovery boundary", () => {
  const snapshot = mobSnapshot(swim(zero), [{ id: stackId("ink_sac"), count: 2 }]);
  const core = { version: 1, name: "raw squid", seed: 1, mode: "survival", timeOfDay: .3, player: { position: { x: .5, y: 3, z: .5 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [] };
  for (const record of [{ ...snapshot, squidState: { ...snapshot.squidState, airRemaining: -1 } }, { ...snapshot, kind: "pig" }]) {
    const raw = JSON.stringify({ ...core, mobs: { nextId: 2, records: [record] } });
    const parsed = parseSave(raw), checked = sanitizeMobState(parsed.mobs);
    expect(checked.invalid).toBe(1); expect(checked.data.records).toEqual([]);
    expect(JSON.parse(raw).mobs.records[0].pendingLoot).toEqual(snapshot.pendingLoot);
    expect((parsed.mobs as { records: unknown[] }).records[0]).toEqual(record);
  }
});
