import { expect, it, vi } from "vitest";
import { Scene } from "three";
import { World, blockId, createMob, type Mob } from "../src";
import { MobManager } from "../../../apps/web/src/mobs";
import { Game } from "../../../apps/web/src/game";

it("does not sample generating light for a passive squid in the player combat path", () => {
  const squid = createMob(1, "squid", { x: 1, y: 1, z: 1 });
  const pig = createMob(2, "pig", { x: 2, y: 1, z: 1 });
  const effectiveLight = vi.fn(() => 0);
  const state = { dead: false, mobs: { mobs: [squid, pig], effectiveLight }, body: { position: { x: 0, y: 1, z: 0 } } };
  (Game.prototype as unknown as { takeMobHits: (this: unknown, dt: number, light: number) => void }).takeMobHits.call(state, .1, 1);
  expect(effectiveLight.mock.calls).toHaveLength(1);
  expect(effectiveLight).toHaveBeenCalledWith(pig, 1);
});

it("reentrant environmental updates cannot mutate the actor holding a fatal transfer", () => {
  const world = new World(42), scene = new Scene();
  let before: string | undefined, after: string | undefined;
  const manager = new MobManager(world, scene, mob => {
    before = JSON.stringify(mob);
    manager.update(1, { x: 0, y: 1, z: 0 }, 1, 0, null);
    after = JSON.stringify(mob);
    return false;
  });
  manager.spawning = false;
  const mob = manager.spawn("squid", { x: .5, y: 1, z: .5 });
  mob.squidState!.airRemaining = 0; mob.squidState!.damageAccumulator = 1;
  vi.spyOn(world, "getBlock").mockImplementation(() => { throw new Error("Reentrant terrain generation"); });
  vi.spyOn(world, "getLight").mockImplementation(() => { throw new Error("Reentrant light generation"); });
  expect(manager.attack(mob, 20, 0)).toBe(false);
  expect(before).toBeDefined(); expect(after).toBe(before);
  expect(mob.health).toBe(1); expect(manager.mobs).toEqual([mob]);
  manager.dispose();
});

it("aquatic attempts and actual swimming leave the historical land RNG stream untouched", () => {
  const world = new World(42), manager = new MobManager(world, new Scene());
  manager.spawning = false;
  const internals = manager as unknown as { seed: number; aquaticSeed: number; spawnSquidNear: (p: { x: number; y: number; z: number }) => void };
  const seed = internals.seed, aquaticSeed = internals.aquaticSeed;
  vi.spyOn(world.generator, "biomeAt").mockReturnValue("plains");
  internals.spawnSquidNear({ x: 0, y: 1, z: 0 });
  expect(internals.seed).toBe(seed); expect(internals.aquaticSeed).not.toBe(aquaticSeed);
  vi.spyOn(world, "getLoadedBlock").mockReturnValue(blockId("water"));
  vi.spyOn(world, "getBlock").mockImplementation(() => { throw new Error("Swimming generated terrain"); });
  vi.spyOn(world, "getLight").mockImplementation(() => { throw new Error("Swimming generated light"); });
  const mob: Mob = manager.spawn("squid", { x: .5, y: 10, z: .5 }), start = { ...mob.position };
  manager.update(.1, { x: 0, y: 10, z: 0 }, 1, 0, null);
  expect(mob.position).not.toEqual(start); expect(internals.seed).toBe(seed);
  manager.dispose();
});
