import { describe, expect, it, vi } from "vitest";
import { World, SEA_LEVEL, WORLD_BORDER, blockId, createMob } from "../src";
import { findLoadedSquidSummonSpot, isLoadedSquidWater, isNaturalSquidSpawnEligible } from "../../../apps/web/src/simulation/squid-habitat";
import { MobManager } from "../../../apps/web/src/simulation/mobs";

const water = blockId("water"), stone = blockId("stone");
function fixture(read: (x: number, y: number, z: number) => number | undefined, biome = "plains"): World {
  return { getLoadedBlock: vi.fn(read), getBlock: () => { throw new Error("Unexpected generation"); }, generator: { biomeAt: () => biome } } as unknown as World;
}

describe("loaded adult squid habitat and command application policy", () => {
  it("accepts genuinely generated loaded ocean water without generating during eligibility", () => {
    const world = new World(42);
    let ocean: { x: number; y: number; z: number } | undefined;
    for (let x = -128; x <= 128 && !ocean; x += 8)
      for (let z = -128; z <= 128 && !ocean; z += 8)
        if (world.generator.heightAt(x, z) <= SEA_LEVEL - 4) ocean = { x: x + .5, y: SEA_LEVEL - 2 + .2, z: z + .5 };
    expect(ocean).toBeDefined();
    world.getChunk(Math.floor(ocean!.x / 16), Math.floor(ocean!.z / 16));
    const before = world.loadedChunkCount();
    vi.spyOn(world, "getBlock").mockImplementation(() => { throw new Error("Eligibility generated terrain"); });
    expect(world.generator.biomeAt(ocean!.x, ocean!.z)).toBe("ocean");
    expect(isNaturalSquidSpawnEligible(world, ocean!)).toBe(true);
    expect(world.loadedChunkCount()).toBe(before);
  });
  it("rejects an artificial non-ocean pool, dry ocean, body wall/floor and unknown cells", () => {
    const at = { x: .5, y: 10.2, z: .5 };
    expect(isLoadedSquidWater(fixture(() => water), at)).toBe(true);
    expect(isNaturalSquidSpawnEligible(fixture(() => water), at)).toBe(false);
    expect(isNaturalSquidSpawnEligible(fixture(() => 0, "ocean"), at)).toBe(false);
    for (const read of [
      (x: number, y: number) => y === 10 ? stone : water,
      (x: number, y: number) => y === 11 ? stone : water,
      () => undefined,
    ]) expect(isLoadedSquidWater(fixture(read, "ocean"), at)).toBe(false);
    // A body spanning adjacent cells cannot pass a neighbouring wall.
    expect(isLoadedSquidWater(fixture(x => x === 1 ? stone : water), { ...at, x: .9 })).toBe(false);
  });
  it("prefers loaded water, supports a clear dry fallback, and refuses unknown/blocked/unsupported poses", () => {
    const origin = { x: .5, y: 10, z: .5 };
    const wet = fixture((x, y) => y >= 8 && y <= 12 ? water : y === 7 ? stone : 0);
    const wetAt = findLoadedSquidSummonSpot(wet, origin);
    expect(wetAt).not.toBeNull();
    expect(isLoadedSquidWater(wet, wetAt!)).toBe(true);
    const dry = fixture((x, y) => y === 9 ? stone : 0);
    const dryAt = findLoadedSquidSummonSpot(dry, origin);
    expect(dryAt).toEqual({ x: .5, y: 10.01, z: .5 });
    for (const read of [() => undefined, () => stone, () => 0]) {
      const world = fixture(read);
      expect(findLoadedSquidSummonSpot(world, origin)).toBeNull();
      expect(vi.mocked(world.getLoadedBlock).mock.calls.length).toBeLessThan(15000);
    }
  });
  it("keeps aquatic population separate from historical passive land quota", () => {
    const mobs = [createMob(1, "pig", { x: 0, y: 0, z: 0 }), createMob(2, "squid", { x: 0, y: 0, z: 0 }), createMob(3, "npc", { x: 0, y: 0, z: 0 })];
    const manager = { mobs } as MobManager;
    expect(MobManager.prototype.animalCount.call(manager)).toBe(1);
    expect(MobManager.prototype.squidCount.call(manager)).toBe(1);
  });
  it("refuses a dry pose intersecting the extended fence collision geometry", () => {
    const world = fixture((x, y) => y === 9 ? blockId("oak_fence") : 0);
    expect(findLoadedSquidSummonSpot(world, { x: .5, y: 10, z: .5 })).toBeNull();
  });
  it("searches existing elevated water and rejects invalid or out-of-border positions", () => {
    const origin = { x: .5, y: SEA_LEVEL + 10, z: .5 };
    const wet = fixture((x, y) => y >= SEA_LEVEL + 8 && y <= SEA_LEVEL + 12 ? water : y === SEA_LEVEL + 7 ? stone : 0);
    const at = findLoadedSquidSummonSpot(wet, origin);
    expect(at).not.toBeNull();
    if (at) expect(isLoadedSquidWater(wet, at)).toBe(true);
    const dry = fixture((x, y) => y === 9 ? stone : 0);
    for (const x of [NaN, WORLD_BORDER + 1000]) expect(findLoadedSquidSummonSpot(dry, { x, y: 10, z: .5 })).toBeNull();
  });
});
