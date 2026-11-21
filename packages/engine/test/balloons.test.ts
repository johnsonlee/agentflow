import { expect, it } from "vitest";
import { BalloonStore, BALLOON_PROFILE, raycastBalloons } from "../src/ownership/balloons";
import { combineReleaseAttempts } from "../src/ownership/ownership-release";
import { LeashStore, joinLeashRefundSink, type LeashContext } from "../src/ownership/leashes";
import { Inventory } from "../src/ownership/inventory";
import { blockId } from "../src/catalog/blocks";
import { createMob, stepMob, type Mob } from "../src/simulation/entities";
import { stackId } from "../src/catalog/items";
import { WorldDrops } from "../src/ownership/world-drops";
import { parseSave, serializeSave } from "../src/persistence/save";
const red = stackId("red_balloon"), p = { x: .5, y: 1, z: .5 };
function context(mobs: Mob[] = [createMob(1, "pig", { x: 2, y: 1, z: .5 })]) {
  const blocks = new Map<string, number>(), state = { loaded: true };
  const ctx: LeashContext = { mobs, player: { ...p }, getLoadedBlock: (x, y, z) => state.loaded ? blocks.get(`${x},${y},${z}`) ?? (y === 0 ? blockId("stone") : 0) : undefined };
  return { ctx, mobs, blocks, state };
}
const inv = (count = 1) => { const bag = new Inventory(); bag.setSlot(0, { id: red, count }); return bag; };
const attach = (s: BalloonStore, c: ReturnType<typeof context>, bag = inv()) => s.attachFromInventory(bag, "survival", { kind: "mob", mobId: 1 }, c.ctx);
it("owns one whole color product; snapshots detached; creative copies explicit; duplicate refusal", () => {
  const c = context(), s = new BalloonStore(), bag = inv(2);
  expect(attach(s, c, bag)).toBe(true); expect(bag.selectedStack()).toEqual({ id: red, count: 1 });
  expect(attach(s, c, bag)).toBe(false); expect(s.records).toHaveLength(1);
  const snap = s.toJSON(); snap.records[0].position.y = 999; snap.records[0].target = { kind: "fence", x: 99, y: 1, z: 0 };
  expect(s.records[0].target).toEqual({ kind: "mob", mobId: 1 }); expect(s.records[0].position.y).toBeLessThan(10);
  const creative = new BalloonStore(); expect(creative.attachFromInventory(bag, "creative", { kind: "mob", mobId: 1 }, c.ctx)).toBe(true); expect(bag.selectedStack()?.count).toBe(1);
  creative.dispose(); expect(creative.records).toHaveLength(1); expect(creative.beginRelease([], c.ctx).kind).toBe("refused");
});
it("refuses malformed sources and unsupported targets with exact unchanged source/key", () => {
  const c = context();
  for (const source of [{ id: red, count: 0 }, { id: red, count: 65 }, { id: red, count: 1.5 }, { id: red, count: 1, damage: 0 }, { id: stackId("lead_rope"), count: 1 }]) {
    const bag = inv(); bag.slots[0] = source; const s = new BalloonStore(), original = structuredClone(bag.slots);
    expect(attach(s, c, bag)).toBe(false); expect(bag.slots).toEqual(original); expect(s.toJSON().nextKey).toBe(1);
  }
  for (const kind of ["npc", "zombie", "spider"] as const) { const c = context([createMob(1, kind, p)]); expect(attach(new BalloonStore(), c)).toBe(false); }
  c.mobs.push({ ...c.mobs[0] }); expect(attach(new BalloonStore(), c)).toBe(false);
});
it("bounds all owners/keyspace and permits several fence balloons", () => {
  const c = context(), s = new BalloonStore(), bag = inv(); c.blocks.set("1,1,0", blockId("oak_fence"));
  for (let i = 0; i < 128; i++) expect(s.attachFromInventory(bag, "creative", { kind: "fence", x: 1, y: 1, z: 0 }, c.ctx)).toBe(true);
  expect(s.attachFromInventory(bag, "creative", { kind: "fence", x: 1, y: 1, z: 0 }, c.ctx)).toBe(false); expect(s.toJSON().nextKey).toBe(129);
  const exhausted = new BalloonStore({ version: 1, nextKey: Number.MAX_SAFE_INTEGER, records: [] }); expect(attach(exhausted, c, bag)).toBe(false);
});
it("rejects exact-schema corruption and raw orphan/ambiguous/unsupported crossreferences", () => {
  const c = context(), s = new BalloonStore(); attach(s, c); const good = s.toJSON(), r = good.records[0];
  const bad = [null, {}, { ...good, extra: true }, { ...good, version: 2 }, { ...good, nextKey: 1 }, { ...good, records: [r, r] }, { ...good, records: [r, { ...r, key: 2 }], nextKey: 3 }, { ...good, records: Array(129).fill(r) },
    ...[{ key: 0 }, { itemId: stackId("lead_rope") }, { count: 1 }, { position: { ...p, x: NaN } }, { velocity: { ...p, y: Infinity } }, { velocity: { ...p, y: 65 } }, { target: { kind: "mob", mobId: 1.5 } }, { phase: "free" }, { reason: "actor-removed" }].map(patch => ({ ...good, records: [{ ...r, ...patch }] }))];
  for (const raw of bad) { const loaded = new BalloonStore(raw); expect(loaded.loadIssues).toBeGreaterThan(0); expect(() => loaded.toJSON()).toThrow(); }
  const accessor = { ...good }; Object.defineProperty(accessor, "version", { get() { throw Error("must not invoke"); } }); expect(new BalloonStore(accessor).loadIssues).toBe(1);
  const symbolic = { ...good, [Symbol()]: true }; expect(new BalloonStore(symbolic).loadIssues).toBe(1);
  const getterRecords = [r]; let invoked = false; Object.defineProperty(getterRecords, "0", { get() { invoked = true; return r; } }); expect(new BalloonStore({ ...good, records: getterRecords }).loadIssues).toBe(1); expect(invoked).toBe(false);
  const symbolRecords = Object.assign([r], { [Symbol()]: true }); expect(new BalloonStore({ ...good, records: symbolRecords }).loadIssues).toBe(1);
  for (const mobs of [[], [c.mobs[0], { ...c.mobs[0] }], [createMob(1, "zombie", p)]]) { const loaded = new BalloonStore(good); expect(loaded.validateCrossReferences({ ...c.ctx, mobs })).toBeGreaterThan(0); expect(loaded.records[0].phase).toBe("active"); }
});
it("defers unloaded fence validation, diagnoses initially loaded air and retains cold state", () => {
  const c = context(), s = new BalloonStore(); c.blocks.set("1,1,0", blockId("oak_fence")); s.attachFromInventory(inv(), "survival", { kind: "fence", x: 1, y: 1, z: 0 }, c.ctx);
  const loaded = new BalloonStore(s.toJSON()); c.state.loaded = false; expect(loaded.validateCrossReferences(c.ctx)).toBe(0); const before = loaded.toJSON(); loaded.update(.1, c.ctx, () => { throw Error("cold receiver"); }); expect(loaded.toJSON()).toEqual(before); expect(loaded.beginRelease([1], c.ctx).kind).toBe("refused");
  c.state.loaded = true; c.blocks.clear(); expect(loaded.validateCrossReferences(c.ctx)).toBeGreaterThan(0); expect(loaded.records[0].phase).toBe("active");
});
it("retains runtime missing target pending under refusal; refunds one intact balloon and no Lead", () => {
  const c = context(), s = new BalloonStore(); attach(s, c); c.mobs.length = 0; s.reconcileLoadedReferences(c.ctx); expect(s.records[0].phase).toBe("refund-pending");
  const before = s.toJSON(); s.update(.1, c.ctx, () => null); expect(s.toJSON()).toEqual(before);
  const restored = new BalloonStore(before); expect(restored.validateCrossReferences(c.ctx)).toBe(0);
  const drops = new WorldDrops({ getLoadedBlock: c.ctx.getLoadedBlock }); restored.update(.1, c.ctx, drops.planSpawnBatch.bind(drops)); expect(restored.records).toEqual([]); expect(drops.records.map(r => r.stack)).toEqual([{ id: red, count: 1 }]);
});
it("combines loot/Lead/balloon into one receiver; locks empty counterpart against reentry; replay/stale/refusal safe", () => {
  const c = context(), s = new BalloonStore(), leads = new LeashStore(); attach(s, c);
  const group = () => combineReleaseAttempts([() => leads.beginRelease([], c.ctx, true), () => s.beginRelease([1], c.ctx, true)]);
  const attempt = group(); expect(attempt.kind).toBe("ready"); if (attempt.kind !== "ready") throw Error("lease");
  const leadBag = inv(); leadBag.slots[0] = { id: stackId("lead_rope"), count: 1 };
  expect(leads.attachFromInventory(leadBag, "survival", c.mobs[0], c.ctx)).toBe(false); expect(leads.beginRelease([], c.ctx).kind).toBe("refused");
  let plans = 0, commits = 0;
  const batch = joinLeashRefundSink(attempt.lease, stacks => { plans++; expect(stacks).toEqual([{ id: stackId("raw_porkchop"), count: 2 }, { id: red, count: 1 }]); return { commit: () => { commits++; return true; } }; })([{ id: stackId("raw_porkchop"), count: 2 }], p)!;
  expect(batch.commit()).toBe(true); expect(batch.commit()).toBe(false); attempt.lease.cancel(); expect(plans).toBe(1); expect(commits).toBe(1); expect(s.records).toEqual([]); expect(leads.busy).toBe(false);
  attach(s, c); const key = s.records[0].key;
  const rejected = combineReleaseAttempts([() => s.beginRelease([key], c.ctx), () => ({ kind: "refused", reason: "no" })]); expect(rejected.kind).toBe("refused"); expect(s.busy).toBe(false);
  const thrown = combineReleaseAttempts([() => s.beginRelease([key], c.ctx), () => { throw Error("no"); }]); expect(thrown.kind).toBe("refused"); expect(s.busy).toBe(false);
  const stale = s.beginRelease([key], c.ctx); if (stale.kind !== "ready") throw Error("lease"); c.mobs[0].health--; expect(joinLeashRefundSink(stale.lease, () => { throw Error("must not publish"); })([], p)).toBeNull(); stale.lease.cancel(); expect(s.records).toHaveLength(1);
});
it("combines two occupied stores and cancels both after receiver refusal", () => {
  const c = context(), s = new BalloonStore(), leads = new LeashStore(); attach(s, c); const bag = inv(); bag.slots[0] = { id: stackId("lead_rope"), count: 1 }; leads.attachFromInventory(bag, "survival", c.mobs[0], c.ctx);
  for (const accepted of [false, true]) {
    const a = combineReleaseAttempts([() => leads.beginRelease([1], c.ctx, true), () => s.beginRelease([1], c.ctx, true)]); if (a.kind !== "ready") throw Error("lease");
    try { expect(joinLeashRefundSink(a.lease, stacks => { expect(stacks).toEqual([{ id: stackId("lead_rope"), count: 1 }, { id: red, count: 1 }]); return { commit: () => accepted }; })([], p)?.commit()).toBe(accepted); } finally { a.lease.cancel(); }
    expect(s.records.length).toBe(accepted ? 0 : 1); expect(leads.records.length).toBe(accepted ? 0 : 1); expect(s.busy || leads.busy).toBe(false);
  }
});
it("lifts the same actual actor through acceleration and ordinary collisions across frame rates", () => {
  for (const dt of [1 / 20, 1 / 60, 1 / 144]) {
    const c = context(), mob = c.mobs[0], s = new BalloonStore(); attach(s, c); mob.thinkTimer = 60;
    const original = mob, start = mob.position.y;
    for (let i = 0; i < Math.ceil(4 / dt); i++) { s.update(dt, c.ctx, () => null); stepMob((x, y, z) => c.ctx.getLoadedBlock(x, y, z)!, mob, dt, () => .99, null, undefined, 15, { x: 0, y: 0, z: 0 }, s.externalAcceleration(mob, c.ctx)); }
    expect(mob).toBe(original); expect(mob.position.y).toBeGreaterThan(start + 2); expect(mob.health).toBe(10); expect(s.records).toHaveLength(1); expect(mob.velocity.y).toBeLessThan(5);
  }
});
it("roof collision blocks body lift and Lead horizontal bias remains independent", () => {
  const c = context(), mob = c.mobs[0], s = new BalloonStore(); attach(s, c); mob.thinkTimer = 60;
  for (let x = -5; x < 15; x++) for (let z = -5; z < 5; z++) c.blocks.set(`${x},5,${z}`, blockId("stone"));
  for (let i = 0; i < 300; i++) { s.update(1 / 60, c.ctx, () => null); stepMob((x, y, z) => c.ctx.getLoadedBlock(x, y, z)!, mob, 1 / 60, () => .99, null, undefined, 15, { x: -.1, y: 0, z: 0 }, s.externalAcceleration(mob, c.ctx)); }
  expect(mob.position.y + .9).toBeLessThanOrEqual(5); expect(s.records[0].position.y + .4).toBeLessThanOrEqual(5); expect(mob.position.x).toBeLessThan(2);
});
it("zero/default external acceleration paths match exactly; nonfinite axes are zero", () => {
  const a = createMob(1, "pig", p), b = createMob(1, "pig", p), c = createMob(1, "pig", p), get = (_x: number, y: number) => y === 0 ? blockId("stone") : 0;
  for (let i = 0; i < 120; i++) { stepMob(get, a, 1 / 60, () => .9); stepMob(get, b, 1 / 60, () => .9, null, undefined, 0, p, { x: 0, y: 0, z: 0 }); stepMob(get, c, 1 / 60, () => .9, null, undefined, 0, p, { x: NaN, y: Infinity, z: -Infinity }); }
  // Compare like-for-like movement bias, then omitted and explicit zero defaults separately.
  expect(b).toEqual(c); const d = createMob(1, "pig", p); for (let i = 0; i < 120; i++) stepMob(get, d, 1 / 60, () => .9, null, undefined, 0, undefined, { x: 0, y: 0, z: 0 }); expect(a).toEqual(d);
});
it("pop is destructive; distance pop returns nothing; raycast finite nearest; optional raw save roundtrip", () => {
  const c = context(), s = new BalloonStore(); attach(s, c); const r = s.records[0]; expect(raycastBalloons({ ...r.position, z: -2 }, { x: 0, y: 0, z: 1 }, s.records, 5)?.key).toBe(1); expect(raycastBalloons(p, { x: NaN, y: 0, z: 1 }, s.records, 5)).toBeNull();
  const core = { name: "balloon", seed: 7, mode: "survival" as const, timeOfDay: .2, player: { position: p, yaw: 0, pitch: 0, flying: false }, inventory: inv().toJSON(), edits: [] };
  const parsed = parseSave(serializeSave({ ...core, balloons: s.toJSON() })); expect(parsed.balloons).toEqual(s.toJSON()); expect(parseSave(serializeSave(core)).balloons).toBeUndefined(); expect(parseSave(JSON.stringify({ ...core, version: 1, balloons: null })).balloons).toBeNull();
  expect(s.pop(1, c.ctx)).toBe(true); expect(s.pop(1, c.ctx)).toBe(false); attach(s, c); c.mobs[0].position.x += BALLOON_PROFILE.breakDistance + 1; let plans = 0; s.update(.1, c.ctx, () => { plans++; return null; }); expect(plans).toBe(0); expect(s.records).toEqual([]);
});
it("refuses initial low roof, intersecting wall and raised fence collision without consuming a product", () => {
  for (const obstruction of ["roof", "wall", "fence"] as const) {
    const c = context(), s = new BalloonStore(), bag = inv();
    if (obstruction === "roof") c.blocks.set("2,4,0", blockId("stone"));
    if (obstruction === "wall") c.blocks.set("1,3,0", blockId("stone"));
    if (obstruction === "fence") { c.mobs[0].position.x = 2.5; c.mobs[0].position.y = .5; c.blocks.set("2,2,0", blockId("oak_fence")); }
    const before = bag.toJSON(); expect(attach(s, c, bag)).toBe(false); expect(bag.toJSON()).toEqual(before); expect(s.toJSON()).toEqual({ version: 1, nextKey: 1, records: [] });
  }
});
it("refuses attachment when an off-center body cell or below-origin fence dependency is unknown", () => {
  for (const unknown of ["1,4,0", "1,2,0"] as const) {
    const c = context(), s = new BalloonStore(), bag = inv(), originalGet = c.ctx.getLoadedBlock;
    c.ctx.getLoadedBlock = (x, y, z) => `${x},${y},${z}` === unknown ? undefined : originalGet(x, y, z);
    const before = bag.toJSON(); expect(attach(s, c, bag)).toBe(false); expect(bag.toJSON()).toEqual(before); expect(s.toJSON().nextKey).toBe(1);
  }
});
it("unknown off-center balloon or mob body cells suspend force and retain exact balloon state", () => {
  for (const unknown of ["1,5,0", "1,4,0", "1,1,0", "1,0,0"] as const) {
    const c = context(), initial = new BalloonStore(); attach(initial, c);
    const raw = initial.toJSON(); raw.records[0].position.y += 1; // Positive extension produces measurable pull when known.
    const s = new BalloonStore(raw); expect(s.validateCrossReferences(c.ctx)).toBe(0); expect(s.externalAcceleration(c.mobs[0], c.ctx).y).toBeGreaterThan(0);
    const get = c.ctx.getLoadedBlock; c.ctx.getLoadedBlock = (x, y, z) => `${x},${y},${z}` === unknown ? undefined : get(x, y, z);
    const before = s.toJSON(); expect(s.externalAcceleration(c.mobs[0], c.ctx)).toEqual({ x: 0, y: 0, z: 0 });
    s.update(.1, c.ctx, () => { throw Error("unknown terrain must not publish"); }); expect(s.toJSON()).toEqual(before);
  }
});

it("unknown fence-arm dependencies suspend force and pending refunds, including below-origin probes", () => {
  const c = context(), initial = new BalloonStore(); attach(initial, c);
  const raw = initial.toJSON(); raw.records[0].position.y += 1;
  const s = new BalloonStore(raw); s.validateCrossReferences(c.ctx); c.blocks.set("1,3,0", blockId("oak_fence"));
  const get = c.ctx.getLoadedBlock; c.ctx.getLoadedBlock = (x, y, z) => x === 0 && y === 3 && z === 0 ? undefined : get(x, y, z);
  const before = s.toJSON(); expect(s.externalAcceleration(c.mobs[0], c.ctx)).toEqual({ x: 0, y: 0, z: 0 }); s.update(.1, c.ctx, () => { throw Error("no receiver"); }); expect(s.toJSON()).toEqual(before);
  c.mobs.length = 0; s.reconcileLoadedReferences(c.ctx); expect(s.records[0].phase).toBe("refund-pending");
  const pending = s.toJSON(); s.update(.1, c.ctx, () => { throw Error("no unknown-body refund"); }); expect(s.toJSON()).toEqual(pending);
});
