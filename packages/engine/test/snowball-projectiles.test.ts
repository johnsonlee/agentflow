import { expect, it } from "vitest";
import { Inventory, SnowballProjectiles, blockId, parseSave, serializeSave, stackId, tryThrowSnowball } from "../src/index";
const p = { x: .5, y: 5.5, z: .5 }, d = { x: 1, y: 0, z: 0 };
function world() {
  const blocks = new Map<string, number>();
  return { blocks, getLoadedBlock(x: number, y: number, z: number) { return blocks.get(`${x},${y},${z}`) ?? 0; } };
}
const mob = (id: number, x: number, z = .5) => ({ id, box: { minX: x, maxX: x + .6, minY: 4, maxY: 7, minZ: z - .3, maxZ: z + .3 } });
const bag = (count = 4) => { const inv = new Inventory(); inv.setSlot(0, { id: stackId("snowball"), count }); return inv; };

it("allocates flight before taking exactly one survival ball; creative retains its source", () => {
  const inv = bag(), shots = new SnowballProjectiles(world());
  expect(tryThrowSnowball(inv, "survival", p, d, shots)).toBe(1); expect(inv.selectedStack()?.count).toBe(3);
  expect(tryThrowSnowball(inv, "creative", p, d, shots)).toBe(2); expect(inv.selectedStack()?.count).toBe(3);
  expect(shots.records.map(s => s.key)).toEqual([1, 2]);
  const one = bag(1); expect(tryThrowSnowball(one, "survival", p, d, shots)).toBe(3); expect(one.selectedStack()).toBeNull();
  inv.setSlot(0, { id: stackId("iron_shovel"), count: 1, damage: 7 }); const before = inv.toJSON();
  expect(tryThrowSnowball(inv, "survival", p, d, shots)).toBeNull(); expect(inv.toJSON()).toEqual(before);
});

it("refuses capacity, invalid pose, zero/nonfinite heading, disposal and ID exhaustion without source changes", () => {
  const inv = bag(), shots = new SnowballProjectiles(world());
  const bad = [{ ...p, x: NaN }, { ...p, z: Infinity }, { ...p, x: 30_000_001 }, { ...p, y: 513 }];
  for (const pose of bad) expect(tryThrowSnowball(inv, "survival", pose, d, shots)).toBeNull();
  for (const dir of [{ x: 0, y: 0, z: 0 }, { ...d, x: NaN }, { ...d, y: Infinity }]) expect(tryThrowSnowball(inv, "survival", p, dir, shots)).toBeNull();
  expect(inv.selectedStack()?.count).toBe(4); expect(shots.records).toHaveLength(0);
  for (let i = 0; i < 128; i++) expect(shots.spawn(p, d)).toBe(i + 1);
  const before = shots.toJSON(); expect(tryThrowSnowball(inv, "survival", p, d, shots)).toBeNull(); expect(shots.toJSON()).toEqual(before); expect(inv.selectedStack()?.count).toBe(4);
  const exhausted = new SnowballProjectiles(world(), { version: 1, nextKey: Number.MAX_SAFE_INTEGER, records: [] });
  expect(exhausted.loadIssues).toBe(0); expect(tryThrowSnowball(inv, "survival", p, d, exhausted)).toBeNull();
  shots.dispose(); expect(tryThrowSnowball(inv, "survival", p, d, shots)).toBeNull(); expect(inv.selectedStack()?.count).toBe(4);
});

it("normalizes headings and returns detached input/record/snapshot/impact ownership", () => {
  const shots = new SnowballProjectiles(world()), origin = { ...p }, direction = { x: 2, y: 0, z: 0 };
  shots.spawn(origin, direction); origin.x = 80; direction.y = 100;
  const records = shots.records; records[0].position.x = 99; records[0].velocity.x = 99;
  const json = shots.toJSON(); json.records[0].position.x = 100;
  expect(shots.records[0]).toEqual({ key: 1, position: p, velocity: { x: 30, y: 0, z: 0 }, ageSeconds: 0 });
  const hit = shots.update(.1, [mob(1, 1)])[0]; expect(hit.kind).toBe("mob"); hit.position.x = 100;
  expect(shots.records).toHaveLength(0); expect(shots.update(.1, [mob(1, 1)])).toEqual([]);
});

it("advances analytic gravity consistently across frame partitions and ignores invalid/zero elapsed input", () => {
  const a = new SnowballProjectiles(world()), b = new SnowballProjectiles(world()); a.spawn(p, d); b.spawn(p, d);
  a.update(.2); for (let i = 0; i < 20; i++) b.update(.01);
  expect(a.records[0].position.x).toBeCloseTo(6.5, 10); expect(a.records[0].position.y).toBeCloseTo(5.26, 10); expect(a.records[0].velocity.y).toBeCloseTo(-2.4, 10);
  expect(a.records[0].position.y).toBeCloseTo(b.records[0].position.y, 10); expect(a.records[0].position.x).toBeCloseTo(b.records[0].position.x, 10);
  const before = a.toJSON(); for (const dt of [0, -1, NaN, Infinity]) expect(a.update(dt)).toEqual([]); expect(a.toJSON()).toEqual(before);
  a.update(200); expect(a.records[0].ageSeconds).toBeCloseTo(.45, 10); // Explicit bounded backlog discard, no giant sweep.
});

it("sweeps high-speed trajectories against the first wall, never a mob behind it", () => {
  const w = world(); w.blocks.set("2,5,0", blockId("stone")); const shots = new SnowballProjectiles(w); shots.spawn(p, d);
  const impacts = shots.update(.25, [mob(7, 3)]); expect(impacts).toHaveLength(1); expect(impacts[0].kind).toBe("block"); expect(impacts[0].position.x).toBeCloseTo(1.875, 10); expect(impacts[0].mobId).toBeUndefined(); expect(impacts[0].particleCount).toBe(6); expect(shots.records).toHaveLength(0);
});

it("hits a closer mob before a farther block with deterministic block-first ties", () => {
  const w = world(); w.blocks.set("3,5,0", blockId("stone")); const shots = new SnowballProjectiles(w); shots.spawn(p, d);
  const first = shots.update(.2, [mob(8, 2)])[0]; expect(first.kind).toBe("mob"); expect(first.mobId).toBe(8); expect(first.position.x).toBeCloseTo(1.875, 10);
  const tie = new SnowballProjectiles(w); tie.spawn(p, d); expect(tie.update(.2, [mob(9, 3)])[0].kind).toBe("block");
});

it("honors the projectile radius at diagonal grazing, negative coordinates and starting overlap", () => {
  const w = world(); w.blocks.set("-2,5,0", blockId("stone")); const shots = new SnowballProjectiles(w);
  shots.spawn({ x: .5, y: 5.5, z: 1.1 }, { x: -1, y: 0, z: 0 }); expect(shots.update(.2)[0].kind).toBe("block");
  const miss = new SnowballProjectiles(w); miss.spawn({ x: .5, y: 5.5, z: 1.126 }, { x: -1, y: 0, z: 0 }); expect(miss.update(.1)).toEqual([]);
  const inside = new SnowballProjectiles(w); inside.spawn({ x: -1.5, y: 5.5, z: .5 }, d); expect(inside.update(.01)[0].position.x).toBe(-1.5);
});

it("uses shortened block collision bounds and treats non-solid water as ordinary flight", () => {
  const w = world(); w.blocks.set("1,5,0", blockId("farmland_0")); w.blocks.set("2,5,0", blockId("water")); const shots = new SnowballProjectiles(w);
  shots.spawn({ x: .5, y: 6.07, z: .5 }, d); expect(shots.update(.03)).toEqual([]); // Farmland top5.9375+.125; fullcube would hit.
  expect(shots.records).toHaveLength(1);
});

it("retains a persisted flight while restored cells are unloaded, then resumes without generating", () => {
  let reads = 0, loaded = false;
  const w = { getLoadedBlock() { reads++; return loaded ? 0 : undefined; } }, shots = new SnowballProjectiles(w);
  shots.spawn({ x: 15.5, y: 6, z: .5 }, d); const snapshot = shots.toJSON();
  const restored = new SnowballProjectiles(w, snapshot);
  for (let i = 0; i < 5; i++) expect(restored.update(.25)).toEqual([]);
  expect(restored.toJSON()).toEqual(snapshot); expect(reads).toBeLessThan(100); // Bounded unknown-cell lookups, no generation API exists.
  loaded = true; expect(restored.update(.1)).toEqual([]); expect(restored.records[0].position.x).toBeCloseTo(18.5, 10); expect(restored.records[0].ageSeconds).toBeCloseTo(.1, 10);
  const bounded = new SnowballProjectiles(w); bounded.spawn({ x: 29_999_999.5, y: 6, z: .5 }, d); expect(bounded.update(.1)[0].kind).toBe("boundary"); expect(bounded.records).toHaveLength(0);
});

it("bounds lifetime with exactly one removal and never mutates target health or applies melee behavior", () => {
  const shots = new SnowballProjectiles(world()); shots.spawn({ x: 0, y: 400, z: 0 }, { x: 0, y: 1, z: 0 });
  const events = []; for (let i = 0; i < 40; i++) events.push(...shots.update(.25)); expect(events).toHaveLength(1); expect(events[0].kind).toBe("expired"); expect(shots.update(.25)).toEqual([]);
  for (const kind of ["pig", "sheep", "chicken", "npc", "zombie"]) {
    const live = { ...mob(4, 1), kind, health: 20, hurtTimer: 0, loot: [] }; const before = JSON.stringify(live);
    const store = new SnowballProjectiles(world()); store.spawn(p, d); expect(store.update(.1, [live])[0].mobId).toBe(4); expect(JSON.stringify(live)).toBe(before);
  }
});

it("roundtrips active owners through Savev1 without replay, refund, aliasing or changes to legacy saves", () => {
  const w = world(), shots = new SnowballProjectiles(w), inv = bag(); tryThrowSnowball(inv, "survival", p, d, shots); shots.update(.03);
  const raw = serializeSave({ name: "flight", seed: 1, mode: "survival", timeOfDay: .2, player: { position: p, yaw: 0, pitch: 0, flying: false }, inventory: inv.toJSON(), edits: [], snowballProjectiles: shots.toJSON() });
  const parsed = parseSave(raw), restored = new SnowballProjectiles(w, parsed.snowballProjectiles); expect(restored.loadIssues).toBe(0); expect(restored.toJSON()).toEqual(shots.toJSON()); expect(parsed.inventory.slots[0]?.count).toBe(3);
  restored.spawn(p, d); expect(restored.records.map(s => s.key)).toEqual([1, 2]); expect(shots.records).toHaveLength(1);
  const legacy = JSON.parse(raw); delete legacy.snowballProjectiles; expect(new SnowballProjectiles(w, parseSave(JSON.stringify(legacy)).snowballProjectiles).loadIssues).toBe(0);
});

it("flags a whole present corrupt snapshot rather than truncating owners into a writable replacement", () => {
  const shots = new SnowballProjectiles(world()); shots.spawn(p, d); const good = shots.toJSON();
  const invalid: unknown[] = [null, [], {}, { ...good, records: Array.from({ length: 129 }, (_, i) => ({ ...good.records[0], key: i + 1 })), nextKey: 130 }, { ...good, records: [{ ...good.records[0], velocity: { x: 31, y: 0, z: 0 } }] }, { ...good, version: 2 }, { ...good, nextKey: 1 }, { ...good, nextKey: 2.5 }, { ...good, records: [...good.records, ...good.records] }, { ...good, records: [...good.records, { ...good.records[0], key: 2, position: { ...p, x: NaN } }] }, { ...good, records: [{ ...good.records[0], velocity: { x: 201, y: 0, z: 0 } }] }, { ...good, records: [{ ...good.records[0], ageSeconds: 10 }] }, { ...good, records: [{ ...good.records[0], key: Number.MAX_SAFE_INTEGER + 1 }] }];
  for (const raw of invalid) { const store = new SnowballProjectiles(world(), raw); expect(store.loadIssues).toBe(1); expect(store.spawn(p, d)).toBeNull(); expect(store.records).toEqual([]); }
  const inherited = Object.create({ version: 1, nextKey: 2, records: good.records }); expect(new SnowballProjectiles(world(), inherited).loadIssues).toBe(1);
  const json = JSON.stringify({ version: 1, seed: 1, snowballProjectiles: { ...good, version: 8 } }); const parsed = parseSave(json); expect(new SnowballProjectiles(world(), parsed.snowballProjectiles).loadIssues).toBe(1); expect(json).toContain('"version":8'); // Game must gate overwrite using loadIssues and original raw storage.
});

// Public inventory slots can contain invalid live data; huge integer counts do not decrement in IEEE754.
it("refuses malformed or over-bound source counts without allocating a duplicate flight owner", () => {
  for (const count of [0, -1, .5, NaN, Infinity, 17, Number.MAX_SAFE_INTEGER + 1, 1e100]) {
    for (const mode of ["survival", "creative"] as const) {
      const inv = bag(), shots = new SnowballProjectiles(world());
      inv.slots[0] = { id: stackId("snowball"), count };
      const source = inv.selectedStack(), before = shots.toJSON();
      expect(tryThrowSnowball(inv, mode, p, d, shots)).toBeNull();
      expect(inv.selectedStack()).toBe(source); expect(inv.selectedStack()?.count).toBe(count);
      expect(shots.toJSON()).toEqual(before);
    }
  }
});
