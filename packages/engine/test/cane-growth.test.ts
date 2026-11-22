import { expect, it, vi } from "vitest";
import { World } from "../src/world/world";
import { WORLD_HEIGHT } from "../src/world/chunk";
import { blockId } from "../src/catalog/blocks";
import { hash3 } from "../src/core/random";
import { CaneGrowthSystem, CANE_GROWTH_SALT, CANE_GROWTH_CHANCE, planCaneGrowth } from "../src/simulation/cane-growth";
import { emptyCaneGrowthState } from "../src/persistence/cane-growth-state";

const CANE = 204;
function bed(x = 8, height = 1, y = 80) {
  const world = new World(7, 3);
  world.setBlock(x, y - 1, 8, blockId("sand")); world.setBlock(x - 1, y - 1, 8, blockId("water"));
  for (let dy = 0; dy < 4 && y + dy < WORLD_HEIGHT; dy++) world.setBlock(x, y + dy, 8, dy < height ? CANE : 0);
  return world;
}
function tickFor(x = 8, y = 80, z = 8, after = 0): number {
  for (let tick = after + 1; tick <= after + 10000; tick++) if (hash3(7 ^ tick ^ CANE_GROWTH_SALT, x, y, z) < CANE_GROWTH_CHANCE) return tick;
  throw Error("No deterministic fixture opportunity");
}
const atTick = (tick: number) => ({ ...emptyCaneGrowthState(), tick: tick - 1 });

it("natural seeded opportunities grow one upper cell at a time and stop at the existing three-high policy", () => {
  const world = bed(), system = new CaneGrowthSystem(world), first = tickFor();
  for (let tick = 1; tick < first; tick++) system.update(1);
  expect(world.getLoadedBlock(8, 81, 8)).toBe(0); system.update(1);
  expect([80, 81, 82, 83].map(y => world.getLoadedBlock(8, y, 8))).toEqual([CANE, CANE, 0, 0]);
  const second = tickFor(8, 80, 8, first); for (let tick = first + 1; tick <= second + 100; tick++) system.update(1);
  expect([80, 81, 82, 83].map(y => world.getLoadedBlock(8, y, 8))).toEqual([CANE, CANE, CANE, 0]);
  system.dispose();
});
it("a checkpoint split preserves fractional loaded time and seeded future without wall-clock catchup", () => {
  const whole = bed(), split = bed(), a = new CaneGrowthSystem(whole), b = new CaneGrowthSystem(split);
  for (let i = 0; i < 7; i++) { a.update(.1); b.update(.1); }
  const clock = JSON.parse(JSON.stringify(b.toJSON())), edits = split.exportEdits(); b.dispose();
  const cold = new World(7, 3); cold.importEdits(edits); cold.getChunk(0, 0); const c = new CaneGrowthSystem(cold, clock);
  expect(c.toJSON()).toEqual(clock); for (let i = 0; i < 1000; i++) { a.update(.1); c.update(.1); }
  expect(c.toJSON()).toEqual(a.toJSON()); expect(cold.exportEdits()).toEqual(whole.exportEdits()); a.dispose(); c.dispose();
});
it("unknown border neighbors suspend even with one known Water, without creating terrain", () => {
  const world = bed(15), system = new CaneGrowthSystem(world, atTick(tickFor(15)));
  expect(world.hasChunk(1, 0)).toBe(false); const loaded = world.loadedChunkCount(); system.update(1);
  expect(world.loadedChunkCount()).toBe(loaded); expect(world.getLoadedBlock(15, 81, 8)).toBe(0);
  world.getChunk(1, 0); world.setBlock(16, 79, 8, blockId("stone"));
  const next = tickFor(15, 80, 8, system.toJSON().tick); for (let tick = system.toJSON().tick; tick < next; tick++) system.update(1);
  expect(world.getLoadedBlock(15, 81, 8)).toBe(CANE); system.dispose();
});
it.each(["occupied", "noWater", "badSoil", "overheight", "ceiling"])("%s never overwrites an occupied or unsupported target", condition => {
  const y = condition === "ceiling" ? WORLD_HEIGHT - 1 : 80, height = condition === "overheight" ? 4 : 1;
  const world = bed(8, height, y);
  if (condition === "occupied") world.setBlock(8, y + 1, 8, blockId("poppy"));
  if (condition === "noWater") world.setBlock(7, y - 1, 8, blockId("stone"));
  if (condition === "badSoil") world.setBlock(8, y - 1, 8, blockId("stone"));
  const before = world.exportEdits(), system = new CaneGrowthSystem(world, atTick(tickFor(8, y)));
  expect(planCaneGrowth(world, 8, y, 8)).toBeNull(); system.update(1); expect(world.exportEdits()).toEqual(before); system.dispose();
});
it("expected cells reject a same-ID remove/reinsert and stale water dependencies", () => {
  for (const replace of ["sameId", "water"]) {
    const world = bed(), plan = planCaneGrowth(world, 8, 80, 8)!; expect(plan).not.toBeNull();
    if (replace === "sameId") { world.setBlock(8, 80, 8, 0); world.setBlock(8, 80, 8, CANE); }
    else world.setBlock(7, 79, 8, blockId("stone"));
    expect(world.commitBlockBatch(plan.edits, undefined, plan.expected)).toBe(false); expect(world.getLoadedBlock(8, 81, 8)).toBe(0);
  }
});
it("busy lease and invalid elapsed calls leave the complete clock unchanged", () => {
  const world = bed(), system = new CaneGrowthSystem(world, atTick(tickFor())), before = system.toJSON();
  const lease = world.reserveBlockBatch([[8, 81, 8, CANE]])!; expect(lease).not.toBeNull(); system.update(1); expect(system.toJSON()).toEqual(before); lease.release();
  for (const dt of [NaN, Infinity, -1, 86401]) { system.update(dt); expect(system.toJSON()).toEqual(before); }
  system.update(1); expect(world.getLoadedBlock(8, 81, 8)).toBe(CANE); system.dispose();
});
it("refused commit consumes only a simulation opportunity, then an independent later opportunity can succeed", () => {
  const world = bed(), tick = tickFor(), system = new CaneGrowthSystem(world, atTick(tick));
  const commit = vi.spyOn(world, "commitBlockBatch").mockReturnValue(false); system.update(1);
  expect(system.toJSON().tick).toBe(tick); expect(world.getLoadedBlock(8, 81, 8)).toBe(0); commit.mockRestore();
  const next = tickFor(8, 80, 8, tick); for (let i = tick; i < next; i++) system.update(1);
  expect(world.getLoadedBlock(8, 81, 8)).toBe(CANE); system.dispose();
});
it("observer checkpoint sees committed world and cursor; reentry cannot duplicate and dispose stops later writes", () => {
  const world = bed(); world.setBlock(11, 79, 8, blockId("sand")); world.setBlock(10, 79, 8, blockId("water")); world.setBlock(11, 80, 8, CANE); world.setBlock(11, 81, 8, 0);
  let tick = 1; while (hash3(7 ^ tick ^ CANE_GROWTH_SALT, 8, 80, 8) >= CANE_GROWTH_CHANCE || hash3(7 ^ tick ^ CANE_GROWTH_SALT, 11, 80, 8) >= CANE_GROWTH_CHANCE) tick++;
  const system = new CaneGrowthSystem(world, atTick(tick)); let seen: ReturnType<CaneGrowthSystem["toJSON"]> | null = null;
  const stop = world.onBlockChanged((x, y, _z, id) => { if (x === 8 && y === 81 && id === CANE) { seen = system.toJSON(); system.update(1); system.dispose(); } });
  system.update(1); expect(seen).toEqual({ version: 1, tick, accumulator: 0, cursor: 1 });
  expect(world.getLoadedBlock(8, 81, 8)).toBe(CANE); expect(world.getLoadedBlock(11, 81, 8)).toBe(0); const state = system.toJSON(); system.update(99); expect(system.toJSON()).toEqual(state); stop();
});
it("resumable scans discover generated-style unedited Cane despite repeated mesh notifications", () => {
  const world = bed(); const chunk = world.getChunk(0, 0); world.setBlock(8, 80, 8, 0);
  // Fixture-only raw cell models a generator-owned plant absent from exported edit registration.
  chunk.set(5, 79, 5, blockId("sand")); chunk.set(4, 79, 5, blockId("water")); chunk.set(5, 80, 5, CANE); chunk.set(5, 81, 5, 0);
  const tick = tickFor(5, 80, 5), system = new CaneGrowthSystem(world, atTick(tick)); const loaded = world.loadedChunkCount();
  for (let i = 0; i < 6; i++) { system.update(0); world.setBlock(2, 79, 2, i % 2 ? blockId("sand") : blockId("stone")); }
  system.update(1); expect(world.getLoadedBlock(5, 81, 5)).toBe(CANE); expect(world.loadedChunkCount()).toBe(loaded); system.dispose();
});
it("a loaded newly planted root is tracked immediately after construction", () => {
  const world = bed(); world.setBlock(8, 80, 8, 0); const system = new CaneGrowthSystem(world, atTick(tickFor()));
  world.setBlock(8, 80, 8, CANE); system.update(1); expect(world.getLoadedBlock(8, 81, 8)).toBe(CANE); system.dispose();
});
it("generated upper harvest tracks its remaining lower stem before the scan reaches that height", () => {
  const world = new World(7, 3), chunk = world.getChunk(0, 0);
  chunk.set(5, 79, 5, blockId("sand")); chunk.set(4, 79, 5, blockId("water"));
  for (const y of [80, 81, 82]) chunk.set(5, y, 5, CANE); chunk.set(5, 83, 5, 0);
  const system = new CaneGrowthSystem(world, atTick(tickFor(5, 80, 5)));
  world.setBlock(5, 82, 5, 0); system.update(1);
  expect(world.getLoadedBlock(5, 82, 5)).toBe(CANE); system.dispose();
});
it("removing and replacing a lower stem cannot give one column an extra upper-anchor growth roll", () => {
  const world = bed(8, 2);
  let tick = 1; while (hash3(7 ^ tick ^ CANE_GROWTH_SALT, 8, 80, 8) < CANE_GROWTH_CHANCE || hash3(7 ^ tick ^ CANE_GROWTH_SALT, 8, 81, 8) >= CANE_GROWTH_CHANCE) tick++;
  const system = new CaneGrowthSystem(world, atTick(tick));
  world.setBlock(8, 80, 8, 0); world.setBlock(8, 80, 8, CANE); system.update(1);
  expect(world.getLoadedBlock(8, 82, 8)).toBe(0); system.dispose();
});
it("more than a batch of unloaded roots cannot starve an independent loaded root", () => {
  const world = new World(7, 3);
  for (let i = 0; i < 257; i++) { world.setBlock(i * 16 + 8, 79, 8, blockId("sand")); world.setBlock(i * 16 + 8, 80, 8, CANE); }
  const x = 5000; world.setBlock(x, 79, 8, blockId("sand")); world.setBlock(x - 1, 79, 8, blockId("water")); world.setBlock(x, 80, 8, CANE); world.setBlock(x, 81, 8, 0);
  const targetTick = tickFor(x, 80, 8, 1), system = new CaneGrowthSystem(world, { ...emptyCaneGrowthState(), tick: targetTick - 2 });
  for (let i = 0; i < 257; i++) world.unloadChunk(i, 0);
  const loaded = world.loadedChunkCount(), captures = vi.spyOn(world, "captureCell");
  system.update(1); expect(captures.mock.calls.length).toBeLessThanOrEqual(16); captures.mockRestore();
  expect(world.getLoadedBlock(x, 81, 8)).toBe(0); system.update(1);
  expect(world.getLoadedBlock(x, 81, 8)).toBe(CANE); expect(world.loadedChunkCount()).toBe(loaded); system.dispose();
});
it("clock snapshots detach and corrupt constructor state refuses rather than resetting", () => {
  const world = bed(), system = new CaneGrowthSystem(world); const copy = system.toJSON(); copy.tick = 999;
  expect(system.toJSON().tick).toBe(0); expect(() => new CaneGrowthSystem(world, { version: 2 } as never)).toThrow(/clock/); system.dispose(); system.dispose();
});
