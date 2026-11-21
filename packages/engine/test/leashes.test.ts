import { expect, it } from "vitest";
import { AIR, Inventory, LEASH_PROFILE, LeashStore, WorldDrops, blockId, createMob, joinLeashRefundSink, parseSave, serializeSave, stackId, stepMob, type LeashContext, type LeashData, type Mob, type MobKind } from "../src";
const p = { x: .5, y: 1, z: .5 }, lead = (count = 1) => ({ id: stackId("lead_rope"), count });
function context(mobs: Mob[] = [createMob(1, "pig", { x: 2, y: 1, z: .5 })]) {
  const blocks = new Map<string, number>(), state = { loaded: true };
  const ctx: LeashContext = { mobs, player: { ...p }, getLoadedBlock: (x, y, z) => state.loaded ? blocks.get(`${x},${y},${z}`) ?? (y === 0 ? blockId("stone") : AIR) : undefined };
  return { ctx, mobs, blocks, state };
}
const inventory = (count = 3) => { const inv = new Inventory(); inv.setSlot(0, lead(count)); return inv; };
const core = { name: "World owned leads", seed: 7, mode: "survival" as const, timeOfDay: .3, player: { position: p, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [] };
const release = (store: LeashStore, ctx: LeashContext, sink: Parameters<typeof joinLeashRefundSink>[1], keys = store.records.map(r => r.key)) => {
  const attempt = store.beginRelease(keys, ctx); expect(attempt.kind).toBe("ready"); if (attempt.kind !== "ready") throw Error("missing lease");
  try { const batch = joinLeashRefundSink(attempt.lease, sink)([], p); return batch?.commit() ?? false; } finally { attempt.lease.cancel(); }
};

it("conserves bag+active+pending+ground units across attach, retie, refusal, fullbag and actual pickup", () => {
  const { ctx, mobs, blocks } = context(), inv = inventory(1), store = new LeashStore(), drops = new WorldDrops({ getLoadedBlock: ctx.getLoadedBlock });
  const units = () => (inv.slots.filter(s => s?.id === stackId("lead_rope")).reduce((n, s) => n + s!.count, 0)) + store.records.length + drops.records.filter(r => r.stack.id === stackId("lead_rope")).reduce((n, r) => n + r.stack.count, 0);
  expect(units()).toBe(1); expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(true); expect(inv.selectedStack()).toBeNull(); expect(units()).toBe(1);
  const original = store.toJSON(), key = original.records[0].key;
  blocks.set("1,1,0", blockId("oak_fence")); expect(store.retieToFence([key], { x: 1, y: 1, z: 0 }, ctx)).toBe(true);
  expect(store.retieToFence([key], { x: 1, y: 1, z: 0 }, ctx)).toBe(true); expect(store.records[0].key).toBe(key); expect(units()).toBe(1);
  const tied = store.toJSON(); expect(release(store, ctx, () => null)).toBe(false); expect(store.toJSON()).toEqual(tied); expect(units()).toBe(1);
  expect(release(store, ctx, () => ({ commit: () => false }))).toBe(false); expect(store.toJSON()).toEqual(tied); expect(units()).toBe(1);
  expect(release(store, ctx, drops.planSpawnBatch.bind(drops))).toBe(true); expect(store.records).toEqual([]); expect(units()).toBe(1);
  for (let i = 0; i < inv.slots.length; i++) inv.setSlot(i, { id: blockId("stone"), count: 64 });
  drops.update(.6); expect(drops.tryPickup(p, s => inv.addStack(s))).toBe(0); expect(drops.records[0].stack).toEqual(lead());
  inv.setSlot(0, null); expect(drops.tryPickup(p, s => inv.addStack(s))).toBe(1); expect(inv.selectedStack()).toEqual(lead()); expect(drops.records).toEqual([]);
});

it("requires one safe plain hotbar source, supported live reachable actual identity, and refuses without allocation", () => {
  const { ctx, mobs, state } = context(); const bad: unknown[] = [lead(0), lead(65), lead(1.5), lead(Number.MAX_SAFE_INTEGER), { ...lead(), damage: 0 }, { ...lead(), book: undefined }, { id: stackId("string"), count: 1 }];
  for (const stack of bad) { const inv = inventory(); inv.slots[0] = stack as never; const store = new LeashStore(), source = structuredClone(inv.slots); expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(false); expect(store.records).toEqual([]); expect(inv.slots).toEqual(source); expect(store.toJSON().nextKey).toBe(1); }
  for (const kind of ["zombie", "spider", "npc"] as MobKind[]) { const c = context([createMob(1, kind, { x: 2, y: 1, z: .5 })]); expect(new LeashStore().attachFromInventory(inventory(), "survival", c.mobs[0], c.ctx)).toBe(false); }
  const inv = inventory(), store = new LeashStore();
  expect(store.attachFromInventory(inv, "survival", { ...mobs[0] }, ctx)).toBe(false);
  mobs[0].health = 0; expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(false); mobs[0].health = 10;
  mobs[0].position.x = 8; expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(false); mobs[0].position.x = 2;
  state.loaded = false; expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(false); state.loaded = true;
  inv.selected = 9; inv.slots[9] = lead(); expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(false); inv.selected = 0;
  expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(true); const before = inv.toJSON(); expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(false); expect(inv.toJSON()).toEqual(before); expect(store.records).toHaveLength(1);
});

it("bounds capacity/keyspace without truncation and makes each creative copy an explicit owned unit", () => {
  const mobs = Array.from({ length: 129 }, (_, i) => createMob(i + 1, "chicken", { x: 2, y: 1, z: .5 })), { ctx } = context(mobs), store = new LeashStore(), inv = inventory(1);
  for (const mob of mobs.slice(0, 128)) expect(store.attachFromInventory(inv, "creative", mob, ctx)).toBe(true);
  expect(store.records).toHaveLength(128); expect(inv.selectedStack()).toEqual(lead()); expect(store.attachFromInventory(inv, "creative", mobs[128], ctx)).toBe(false); expect(store.toJSON().nextKey).toBe(129);
  const exhausted = new LeashStore({ version: 1, nextKey: Number.MAX_SAFE_INTEGER, records: [] }); expect(exhausted.loadIssues).toBe(0); expect(exhausted.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(false);
  const smaller = new LeashStore(), drops = new WorldDrops({ getLoadedBlock: ctx.getLoadedBlock }); expect(smaller.attachFromInventory(inv, "creative", mobs[0], ctx)).toBe(true);
  expect(release(smaller, ctx, drops.planSpawnBatch.bind(drops))).toBe(true); expect(inv.selectedStack()).toEqual(lead()); expect(drops.records.map(r => r.stack)).toEqual([lead()]);
});

it("keeps mode/death/disposal as world ownership and detaches every exported anchor/vector", () => {
  const { ctx, mobs } = context(), store = new LeashStore(), inv = inventory(1);
  store.attachFromInventory(inv, "survival", mobs[0], ctx); const snapshot = store.toJSON(), copy = store.records;
  copy[0].lastPosition.x = 999; copy[0].anchor = { kind: "fence", x: 9, y: 1, z: 0 }; snapshot.records[0].targetMobId = 90;
  expect(store.records[0]).toMatchObject({ targetMobId: 1, anchor: { kind: "player" }, lastPosition: { x: 2, y: 1, z: .5 } });
  const text = serializeSave({ ...core, mode: "creative", playerState: { health: 0, death: { phase: "pending", sequence: 1 } } as never, leashes: store.toJSON() });
  const parsed = parseSave(text); expect(parsed.leashes).toEqual(store.toJSON()); // Player death transfer never owns this separate section.
  const loaded = new LeashStore(parsed.leashes); expect(loaded.validateCrossReferences(ctx)).toBe(0); expect(loaded.toJSON()).toEqual(store.toJSON());
  loaded.dispose(); expect(loaded.records).toHaveLength(1); expect(loaded.attachFromInventory(inventory(), "creative", mobs[0], ctx)).toBe(false); expect(loaded.beginRelease([], ctx).kind).toBe("refused");
});

it("strictly rejects malformed present data without healing an owned suffix or raw active orphan", () => {
  const { ctx, mobs } = context(), store = new LeashStore(); store.attachFromInventory(inventory(), "survival", mobs[0], ctx); const good = store.toJSON();
  const r = good.records[0]; const bad: unknown[] = [null, [], {}, { ...good, version: 2 }, { ...good, extra: 1 }, { ...good, nextKey: 1 }, { ...good, nextKey: 1.5 }, { ...good, records: [r, { ...r }] }, { ...good, records: Array(129).fill(r) },
    ...[{ key: 0 }, { key: Number.MAX_SAFE_INTEGER }, { targetMobId: 0 }, { targetMobId: 1.5 }, { phase: "other" }, { reason: "actor-removed" }, { lastPosition: { ...p, x: NaN } }, { anchor: { kind: "fence", x: 0, y: 128, z: 0 } }, { anchor: { kind: "fence", x: .5, y: 1, z: 0 } }, { anchor: { kind: "player", id: 1 } }, { count: 2 }].map(patch => ({ ...good, records: [{ ...r, ...patch }] })),
    { ...good, records: [{ ...r, phase: "refund-pending" }] }, { ...good, records: [{ ...r, phase: "refund-pending", reason: "anchor-removed" }] }];
  for (const raw of bad) { const loaded = new LeashStore(raw); expect(loaded.loadIssues).toBeGreaterThan(0); expect(loaded.records).toEqual([]); expect(() => loaded.toJSON()).toThrow(); }
  expect(new LeashStore().toJSON()).toEqual({ version: 1, nextKey: 1, records: [] });
  const orphan = new LeashStore(good); expect(orphan.validateCrossReferences({ ...ctx, mobs: [] })).toBeGreaterThan(0); expect(orphan.records[0].phase).toBe("active"); expect(orphan.beginRelease([r.key], { ...ctx, mobs: [] }).kind).toBe("refused");
  const unsupported = new LeashStore(good); expect(unsupported.validateCrossReferences({ ...ctx, mobs: [createMob(1, "zombie", p)] })).toBeGreaterThan(0);
  const duplicate = new LeashStore(good); expect(duplicate.validateCrossReferences({ ...ctx, mobs: [mobs[0], { ...mobs[0] }] })).toBeGreaterThan(0);
  const text = JSON.stringify({ ...core, version: 1, leashes: null }); expect(parseSave(text).leashes).toBeNull();
});

it("defers unknown initial fence references, but a later initially missing fence is corruption, not a refund", () => {
  const { ctx, mobs, blocks } = context(), store = new LeashStore(); blocks.set("1,1,0", blockId("oak_fence")); store.attachFromInventory(inventory(), "survival", mobs[0], ctx); store.retieToFence([1], { x: 1, y: 1, z: 0 }, ctx);
  let anchorLoaded = false; const deferred = { ...ctx, getLoadedBlock: (x: number, y: number, z: number) => x === 1 && y === 1 && z === 0 && !anchorLoaded ? undefined : ctx.getLoadedBlock(x, y, z) };
  const loaded = new LeashStore(store.toJSON()); expect(loaded.validateCrossReferences(deferred)).toBe(0); expect(loaded.toJSON().records).toEqual(store.records); expect(loaded.beginRelease([1], deferred).kind).toBe("refused"); expect(loaded.movementBias(mobs[0], deferred)).toEqual({ x: 0, y: 0, z: 0 });
  anchorLoaded = true; blocks.delete("1,1,0"); loaded.reconcileLoadedReferences(deferred); expect(loaded.loadIssues).toBeGreaterThan(0); expect(loaded.records[0].phase).toBe("active"); expect(() => loaded.toJSON()).toThrow();
  const valid = new LeashStore(store.toJSON()); blocks.set("1,1,0", blockId("oak_fence")); expect(valid.validateCrossReferences(ctx)).toBe(0); expect(valid.toJSON()).toEqual(store.toJSON());
});

it("runtime unavoidable actor/anchor removal makes a durable pending owner; cold/refused retries retain it", () => {
  const c = context(), store = new LeashStore(); store.attachFromInventory(inventory(), "survival", c.mobs[0], c.ctx); c.mobs.length = 0;
  store.reconcileLoadedReferences(c.ctx); expect(store.records[0]).toMatchObject({ phase: "refund-pending", reason: "actor-removed" }); expect(store.protectsMob(1)).toBe(true);
  const saved = store.toJSON(), restored = new LeashStore(saved); expect(restored.validateCrossReferences(c.ctx)).toBe(0); expect(restored.toJSON()).toEqual(saved);
  c.state.loaded = false; let plans = 0; restored.update(.1, c.ctx, () => { plans++; return null; }); expect(plans).toBe(0); expect(restored.toJSON()).toEqual(saved);
  c.state.loaded = true; restored.update(.1, c.ctx, () => { plans++; return null; }); expect(plans).toBe(1); expect(restored.toJSON()).toEqual(saved);
  const drops = new WorldDrops({ getLoadedBlock: c.ctx.getLoadedBlock }); restored.update(.1, c.ctx, drops.planSpawnBatch.bind(drops)); expect(restored.records).toEqual([]); expect(drops.records.map(r => r.stack)).toEqual([lead()]);
  const a = context(), tied = new LeashStore(); a.blocks.set("1,1,0", blockId("oak_fence")); tied.attachFromInventory(inventory(), "survival", a.mobs[0], a.ctx); tied.retieToFence([1], { x: 1, y: 1, z: 0 }, a.ctx); a.blocks.delete("1,1,0"); tied.reconcileLoadedReferences(a.ctx); expect(tied.records[0]).toMatchObject({ phase: "refund-pending", reason: "anchor-removed" });
});

it("distance release preserves the active owner under refusal while capped following uses ordinary wall collision", () => {
  const c = context([createMob(1, "pig", { x: .5, y: 1, z: .5 })]), store = new LeashStore(); store.attachFromInventory(inventory(), "survival", c.mobs[0], c.ctx);
  c.ctx.player = { x: 7, y: 1, z: .5 }; const mob = c.mobs[0]; mob.thinkTimer = 60; mob.walking = false;
  expect(store.movementBias(mob, c.ctx)).toEqual({ x: 6, y: 0, z: 0 });
  for (let i = 0; i < 120; i++) stepMob((x, y, z) => c.ctx.getLoadedBlock(x, y, z)!, mob, 1 / 60, () => .99, null, undefined, 15, store.movementBias(mob, c.ctx));
  expect(mob.position.x).toBeGreaterThan(2); expect(mob.position.x).toBeLessThan(4); expect(mob.position.y).toBeCloseTo(1);
  for (let y = 1; y <= 4; y++) c.blocks.set(`4,${y},0`, blockId("stone")); c.ctx.player.x = 9;
  for (let i = 0; i < 120; i++) stepMob((x, y, z) => c.ctx.getLoadedBlock(x, y, z)!, mob, 1 / 60, () => .99, null, undefined, 15, store.movementBias(mob, c.ctx));
  expect(mob.position.x).toBeLessThanOrEqual(3.55 + .001); expect(mob.position.y).toBeCloseTo(1);
  c.ctx.player.x = 20; const owner = store.records[0].key; store.update(.1, c.ctx, () => null); expect(store.records[0].key).toBe(owner); expect(store.records[0].phase).toBe("active");
  c.state.loaded = false; expect(store.movementBias(mob, c.ctx)).toEqual({ x: 0, y: 0, z: 0 }); c.state.loaded = true;
  const drops = new WorldDrops({ getLoadedBlock: c.ctx.getLoadedBlock }); store.update(.1, c.ctx, drops.planSpawnBatch.bind(drops)); expect(store.records).toEqual([]); expect(drops.records.map(r => r.stack)).toEqual([lead()]);
  expect(LEASH_PROFILE.breakDistance).toBe(10);
});

it("refuses frozen or accessor hotbar sources before allocating any world unit", () => {
  const { ctx, mobs } = context();
  for (const kind of ["count-readonly", "slot-frozen", "accessor", "nonenumerable-extra"]) {
    const inv = inventory(kind === "slot-frozen" ? 1 : 2), store = new LeashStore();
    if (kind === "count-readonly") Object.defineProperty(inv.slots[0]!, "count", { writable: false });
    if (kind === "slot-frozen") Object.freeze(inv.slots);
    if (kind === "accessor") Object.defineProperty(inv.slots[0]!, "count", { get: () => 2 });
    if (kind === "nonenumerable-extra") Object.defineProperty(inv.slots[0]!, "damage", { value: 0 });
    expect(store.attachFromInventory(inv, "survival", mobs[0], ctx), kind).toBe(false);
    expect(store.toJSON()).toEqual({ version: 1, nextKey: 1, records: [] }); expect(inv.slots[0]!.count).toBe(kind === "slot-frozen" ? 1 : 2);
  }
});

it("rechecks the actual captured hotbar source after loaded-context callbacks change selection", () => {
  const c = context(), inv = inventory(2), store = new LeashStore(); inv.slots[9] = lead(2);
  const ctx = { ...c.ctx, getLoadedBlock: (x: number, y: number, z: number) => { inv.selected = 9; return c.ctx.getLoadedBlock(x, y, z); } };
  expect(store.attachFromInventory(inv, "survival", c.mobs[0], ctx)).toBe(false);
  expect(store.records).toEqual([]); expect(inv.slots[0]).toEqual(lead(2)); expect(inv.slots[9]).toEqual(lead(2)); expect(store.toJSON().nextKey).toBe(1);
});
