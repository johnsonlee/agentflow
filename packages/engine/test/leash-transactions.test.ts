import { expect, it } from "vitest";
import {
  AIR, Inventory, LeashStore, MobLootResolver, World, WorldDrops, blockId, breakBlock, createAgent,
  createMob, joinLeashRefundSink, mobSnapshot, parseSave, restoreMobSnapshot, runAgentCommand,
  serializeSave, stackId, type LeashContext, type ReleaseLease,
} from "../src/index";
const p = { x: .5, y: 1, z: .5 }, F = blockId("oak_fence"), L = () => stackId("lead_rope");
function fixture(kind: "pig" | "sheep" | "chicken" = "pig") {
  const w = new World(7);
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) { w.setBlock(x, 0, z, blockId("stone")); for (let y = 1; y <= 4; y++) w.setBlock(x, y, z, AIR); }
  const mobs = [createMob(1, kind, { x: 2, y: 1, z: .5 })], ctx: LeashContext = { mobs, player: { ...p }, getLoadedBlock: w.getLoadedBlock.bind(w) }, inv = new Inventory(), store = new LeashStore(), drops = new WorldDrops(w);
  inv.setSlot(0, { id: L(), count: 1 }); expect(store.attachFromInventory(inv, "survival", mobs[0], ctx)).toBe(true);
  return { w, mobs, ctx, inv, store, drops };
}
function lease(store: LeashStore, ctx: LeashContext): ReleaseLease {
  const a = store.beginRelease(store.records.map(r => r.key), ctx); expect(a.kind).toBe("ready"); if (a.kind !== "ready") throw Error("No lease"); return a.lease;
}
const total = (rows: readonly { id: number; count: number }[], id = L()) => rows.filter(x => x.id === id).reduce((n, s) => n + s.count, 0);

it("holds a global lock across plan/commit, rejects busy-as-none, save and every public reentrant mutation", () => {
  const f = fixture(), held = new Inventory(); held.setSlot(0, { id: L(), count: 2 }); f.w.setBlock(1, 1, 0, F);
  f.ctx.player = { x: 20, y: 1, z: .5 }; f.w.setBlock(19, 1, 0, F);
  const other = createMob(9, "pig", { x: 19, y: 1, z: .5 }); f.mobs.push(other);
  const original = f.store.toJSON(), selected = lease(f.store, f.ctx); let plans = 0, commits = 0, nestedPlans = 0;
  const check = () => {
    expect(f.store.busy).toBe(true); expect(f.store.beginRelease([], f.ctx).kind).toBe("refused"); expect(f.store.attachFromInventory(held, "creative", other, f.ctx)).toBe(false);
    expect(f.store.retieToFence([1], { x: 19, y: 1, z: 0 }, f.ctx)).toBe(false); expect(() => f.store.toJSON()).toThrow(/busy/);
    f.store.update(.1, f.ctx, () => { nestedPlans++; return null; }); expect(nestedPlans).toBe(0); f.store.reconcileLoadedReferences(f.ctx); f.store.dispose(); expect(selected.valid()).toBe(true);
  };
  try {
    const sink = joinLeashRefundSink(selected, (stacks, position) => { plans++; check(); const batch = f.drops.planSpawnBatch(stacks, position)!; return { commit: () => { commits++; check(); return batch.commit(); } }; });
    const batch = sink([], p)!; expect(f.store.records).toHaveLength(1); expect(f.drops.records).toEqual([]); expect(batch.commit()).toBe(true); expect(batch.commit()).toBe(false);
  } finally { selected.cancel(); }
  expect(plans).toBe(1); expect(commits).toBe(1); expect(f.store.records).toEqual([]); expect(f.drops.records.map(r => r.stack)).toEqual([{ id: L(), count: 1 }]); expect(held.selectedStack()?.count).toBe(2);
  expect(f.store.beginRelease([original.records[0].key], f.ctx).kind).toBe("refused");
});

it("stale actor identity/position/health or fence mutation after planning cannot commit any refund", () => {
  for (const mutate of [(f: ReturnType<typeof fixture>) => { f.mobs[0].health--; }, (f: ReturnType<typeof fixture>) => { f.mobs[0].position.x++; }, (f: ReturnType<typeof fixture>) => { f.mobs[0] = { ...f.mobs[0] }; }]) {
    const f = fixture(), selected = lease(f.store, f.ctx); let commits = 0;
    try { const batch = joinLeashRefundSink(selected, () => { mutate(f); return { commit: () => { commits++; return true; } }; })([], p); expect(batch).toBeNull(); } finally { selected.cancel(); }
    expect(commits).toBe(0); expect(f.store.records).toHaveLength(1); expect(f.store.busy).toBe(false);
  }
  const f = fixture(); f.w.setBlock(1, 1, 0, F); f.store.retieToFence([1], { x: 1, y: 1, z: 0 }, f.ctx); const selected = lease(f.store, f.ctx);
  try { const batch = joinLeashRefundSink(selected, () => ({ commit: () => { throw Error("stale source must not commit"); } }))([], p)!; f.w.setBlock(1, 1, 0, AIR); expect(batch.commit()).toBe(false); } finally { selected.cancel(); }
  expect(f.store.records).toHaveLength(1);
});

it("receiver refusal/throw retains ownership, cancellation is idempotent, and mutable refund snapshots cannot forge units", () => {
  const f = fixture(), original = f.store.toJSON();
  for (const sink of [() => null, () => ({ commit: () => false }), () => { throw Error("plan refused"); }, () => ({ commit: () => { throw Error("commit refused before publication"); } })]) {
    const selected = lease(f.store, f.ctx), leaked = selected.refundStacks; (leaked[0] as { count: number }).count = 99; expect(selected.refundStacks[0].count).toBe(1);
    try { const batch = joinLeashRefundSink(selected, sink)([], p); expect(batch?.commit() ?? false).toBe(false); } catch (e) { expect(String(e)).toContain("refused"); } finally { selected.cancel(); selected.cancel(); }
    expect(f.store.toJSON()).toEqual(original); expect(f.store.busy).toBe(false); expect(f.drops.records).toEqual([]);
  }
});

it.each([0, 1, 2])("joins an actual cached chicken feather roll%i with one Lead in one receiver, preserving cache on refusal/Continue", feathers => {
  const f = fixture("chicken"), mob = f.mobs[0]; mob.health = -4; // Actual fatal state is allowed by a previously validated release source.
  let rolls = 0; const resolver = new MobLootResolver(() => { rolls++; return feathers / 2; }); let selected = lease(f.store, f.ctx), attempts = 0;
  try { expect(resolver.tryDrop(mob, joinLeashRefundSink(selected, stacks => { attempts++; expect(total(stacks)).toBe(1); return null; }), mob.position)).toBe(false); } finally { selected.cancel(); }
  expect(rolls).toBe(1); expect(attempts).toBe(1); expect(f.store.records).toHaveLength(1); expect(f.drops.records).toEqual([]);
  mob.health = 1; const savedMob = mobSnapshot(mob, resolver.exportPending(mob)), savedLeashes = f.store.toJSON();
  const raw = serializeSave({ name: "joint roll", seed: 7, mode: "survival", timeOfDay: .3, player: { position: p, yaw: 0, pitch: 0, flying: false }, inventory: f.inv.toJSON(), edits: f.w.exportEdits(), mobs: { nextId: 2, records: [savedMob] }, leashes: savedLeashes });
  const parsed = parseSave(raw), restoredMob = restoreMobSnapshot(parsed.mobs!.records[0]), restored = new LeashStore(parsed.leashes), ctx = { ...f.ctx, mobs: [restoredMob] };
  expect(restored.validateCrossReferences(ctx)).toBe(0); const cached = new MobLootResolver(() => { throw Error("No reroll after Continue"); }); expect(cached.restorePending(restoredMob, savedMob.pendingLoot)).toBe(true); restoredMob.health = -4;
  selected = lease(restored, ctx); let plans = 0, commits = 0;
  try { expect(cached.tryDrop(restoredMob, joinLeashRefundSink(selected, (stacks, at) => { plans++; expect(total(stacks)).toBe(1); const batch = f.drops.planSpawnBatch(stacks, at)!; return { commit: () => { commits++; return batch.commit(); } }; }), restoredMob.position)).toBe(true); } finally { selected.cancel(); }
  expect(plans).toBe(1); expect(commits).toBe(1); expect(restored.records).toEqual([]); const stacks = f.drops.records.map(r => r.stack);
  expect(total(stacks, stackId("raw_chicken"))).toBe(1); expect(total(stacks, stackId("feather"))).toBe(feathers); expect(total(stacks)).toBe(1);
});

it("manual detach with an empty upstream batch refunds exactly one Lead without inventing mob loot", () => {
  const f = fixture();
  // A supported pig has nonzero native base loot; an actually empty permitted batch belongs to NPC,
  // so use a receiver's empty upstream batch to isolate one implicit Lead, never forge pig loot.
  const selected = lease(f.store, f.ctx);
  try { expect(joinLeashRefundSink(selected, f.drops.planSpawnBatch.bind(f.drops))([], p)!.commit()).toBe(true); } finally { selected.cancel(); }
  expect(f.drops.records.map(r => r.stack)).toEqual([{ id: L(), count: 1 }]);
});

it("player fence destruction publishes fence+all linked Leads+contents once before source removal and tool wear", () => {
  const f = fixture(), mobs = [...f.mobs, createMob(2, "sheep", { x: 2, y: 1, z: 1 }), createMob(3, "chicken", { x: 2, y: 1, z: -1 })]; f.ctx.mobs = mobs;
  const held = new Inventory(); held.setSlot(0, { id: L(), count: 2 }); for (const mob of mobs.slice(1)) expect(f.store.attachFromInventory(held, "survival", mob, f.ctx)).toBe(true);
  f.w.setBlock(1, 1, 0, F); const keys = f.store.records.map(r => r.key); expect(f.store.retieToFence(keys, { x: 1, y: 1, z: 0 }, f.ctx)).toBe(true);
  f.inv.setSlot(0, { id: stackId("iron_axe"), count: 1, damage: 10 }); const before = f.store.toJSON(); let selected = lease(f.store, f.ctx);
  try { expect(breakBlock(f.w, f.inv, "survival", 1, 1, 0, () => .5, [], joinLeashRefundSink(selected, () => null), { valid: selected.valid, afterReceiverCommit: () => {} })).toBe(false); } finally { selected.cancel(); }
  expect(f.w.getBlock(1, 1, 0)).toBe(F); expect(f.inv.selectedStack()?.damage).toBe(10); expect(f.store.toJSON()).toEqual(before);
  selected = lease(f.store, f.ctx); let plans = 0, commits = 0;
  try {
    const sink = joinLeashRefundSink(selected, (stacks, at) => { plans++; expect(total(stacks)).toBe(3); expect(total(stacks, F)).toBe(1); expect(total(stacks, stackId("iron_ingot"))).toBe(2); const batch = f.drops.planSpawnBatch(stacks, at)!; return { commit: () => { commits++; expect(f.w.getBlock(1, 1, 0)).toBe(F); expect(f.store.records).toHaveLength(3); return batch.commit(); } }; });
    expect(breakBlock(f.w, f.inv, "survival", 1, 1, 0, () => .5, [{ id: stackId("iron_ingot"), count: 2 }], sink, { valid: selected.valid, afterReceiverCommit: () => {} })).toBe(true);
  } finally { selected.cancel(); }
  expect(plans).toBe(1); expect(commits).toBe(1); expect(f.w.getBlock(1, 1, 0)).toBe(AIR); expect(f.inv.selectedStack()?.damage).toBe(11); expect(f.store.records).toEqual([]); expect(total(f.drops.records.map(r => r.stack))).toBe(3);
});

it("guarded block destruction rejects source changes after planning without publishing drops or consuming links", () => {
  const f = fixture(); f.w.setBlock(1, 1, 0, F); f.store.retieToFence([1], { x: 1, y: 1, z: 0 }, f.ctx); const selected = lease(f.store, f.ctx); let commits = 0;
  try {
    const sink = joinLeashRefundSink(selected, () => { f.w.setBlock(1, 2, 0, blockId("torch")); return { commit: () => { commits++; return true; } }; });
    expect(breakBlock(f.w, f.inv, "survival", 1, 1, 0, () => .5, [], sink, { valid: selected.valid, afterReceiverCommit: () => {} })).toBe(false);
  } finally { selected.cancel(); }
  expect(commits).toBe(0); expect(f.w.getBlock(1, 1, 0)).toBe(F); expect(f.store.records).toHaveLength(1);
});

it("Agent hook refuses recursive destruction before planning, joins one batch and refuses leashed legacy inventory", () => {
  const f = fixture(); f.w.setBlock(1, 1, 0, F); f.store.retieToFence([1], { x: 1, y: 1, z: 0 }, f.ctx); const agent = createAgent(1, 1, 1, 2);
  const hook = () => f.store.beginRelease(f.store.records.map(r => r.key), f.ctx);
  expect(runAgentCommand(f.w, agent, { op: "destroy", dir: "forward" }, { beginDestroyOwnership: hook }).ok).toBe(false); expect(f.store.busy).toBe(false); expect(f.w.getBlock(1, 1, 0)).toBe(F);
  let plans = 0, commits = 0;
  const env = { beginDestroyOwnership: hook, worldDrop: (stacks: readonly { id: number; count: number }[], at: typeof p) => { plans++; expect(runAgentCommand(f.w, agent, { op: "destroy", dir: "forward" }, env).ok).toBe(false); expect(total(stacks)).toBe(1); const batch = f.drops.planSpawnBatch(stacks, at)!; return { commit: () => { commits++; return batch.commit(); } }; } };
  expect(runAgentCommand(f.w, agent, { op: "destroy", dir: "forward" }, env).ok).toBe(true); expect(plans).toBe(1); expect(commits).toBe(1); expect(f.w.getBlock(1, 1, 0)).toBe(AIR); expect(f.store.records).toEqual([]); expect(total(f.drops.records.map(r => r.stack))).toBe(1);
});

it("Agent revalidates external contents after receiver planning and cancels its lease on thrown refusal", () => {
  const f = fixture(); f.w.setBlock(1, 1, 0, F); f.store.retieToFence([1], { x: 1, y: 1, z: 0 }, f.ctx); const agent = createAgent(1, 1, 1, 2);
  let count = 2, commits = 0; const hook = () => f.store.beginRelease([1], f.ctx);
  expect(runAgentCommand(f.w, agent, { op: "destroy", dir: "forward" }, { beginDestroyOwnership: hook, destroyContents: () => [{ id: stackId("iron_ingot"), count }], worldDrop: () => { count = 3; return { commit: () => { commits++; return true; } }; } }).ok).toBe(false);
  expect(commits).toBe(0); expect(f.w.getBlock(1, 1, 0)).toBe(F); expect(f.store.records).toHaveLength(1); expect(f.store.busy).toBe(false);
  expect(() => runAgentCommand(f.w, agent, { op: "destroy", dir: "forward" }, { beginDestroyOwnership: hook, worldDrop: () => { throw Error("atomic plan refused"); } })).toThrow(/refused/);
  expect(f.store.busy).toBe(false); expect(f.store.records).toHaveLength(1); expect(f.w.getBlock(1, 1, 0)).toBe(F);
});
