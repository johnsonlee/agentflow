import { describe, expect, it } from "vitest";
import { AIR, CHUNK_SIZE, SEA_LEVEL, SimplexNoise, World, WORLD_HEIGHT, blockId, isSolid, seedFromString, toLocalCoord, toChunkCoord } from "../src";

describe("coordinates", () => {
  it("maps negative coordinates to chunks and local offsets", () => {
    expect(toChunkCoord(-1)).toBe(-1);
    expect(toLocalCoord(-1)).toBe(CHUNK_SIZE - 1);
    expect(toChunkCoord(16)).toBe(1);
    expect(toLocalCoord(16)).toBe(0);
  });
});

describe("noise", () => {
  it("is deterministic and bounded", () => {
    const a = new SimplexNoise(42);
    const b = new SimplexNoise(42);
    for (let i = 0; i < 200; i++) {
      const v = a.fbm2(i * 0.37, i * -0.21, 4);
      expect(v).toBe(b.fbm2(i * 0.37, i * -0.21, 4));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.01);
    }
    expect(new SimplexNoise(1).noise2(3.3, 4.4)).not.toBe(new SimplexNoise(2).noise2(3.3, 4.4));
  });

  it("derives numeric seeds from text", () => {
    expect(seedFromString("1234")).toBe(1234);
    expect(seedFromString("hello")).toBe(seedFromString("hello"));
    expect(seedFromString("hello")).not.toBe(seedFromString("world"));
  });
});

describe("terrain generation", () => {
  it("generates the same chunk for the same seed", () => {
    const a = new World(7).getChunk(3, -2).blocks;
    const b = new World(7).getChunk(3, -2).blocks;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const c = new World(8).getChunk(3, -2).blocks;
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });

  it("has bedrock at the bottom, solid ground and air above", () => {
    const world = new World(123);
    for (const [x, z] of [[0, 0], [37, -81], [-200, 15]]) {
      expect(world.getBlock(x, 0, z)).toBe(blockId("bedrock"));
      const h = world.generator.heightAt(x, z);
      expect(isSolid(world.getBlock(x, h, z))).toBe(true);
      expect(world.getBlock(x, WORLD_HEIGHT - 1, z)).toBe(AIR);
    }
  });

  it("fills oceans with water up to sea level", () => {
    const world = new World(5);
    let found = false;
    for (let x = -400; x < 400 && !found; x += 7) {
      for (let z = -400; z < 400 && !found; z += 7) {
        const h = world.generator.heightAt(x, z);
        if (h < SEA_LEVEL - 2) {
          expect(world.getBlock(x, SEA_LEVEL, z)).toBe(blockId("water"));
          expect(world.getBlock(x, SEA_LEVEL + 1, z)).not.toBe(blockId("water"));
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("grows trees and places ores", () => {
    const world = new World(99);
    const counts = new Map<number, number>();
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        for (const id of world.getChunk(cx, cz).blocks) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const logs = (counts.get(blockId("oak_log")) ?? 0) + (counts.get(blockId("birch_log")) ?? 0);
    expect(logs).toBeGreaterThan(0);
    expect(counts.get(blockId("coal_ore")) ?? 0).toBeGreaterThan(0);
    expect(counts.get(blockId("iron_ore")) ?? 0).toBeGreaterThan(0);
  });
});

describe("world edits", () => {
  it("sets blocks, notifies neighbours on borders and round-trips edits", () => {
    const world = new World(1);
    const changed: string[] = [];
    world.onChunkChanged((cx, cz) => changed.push(`${cx},${cz}`));
    world.setBlock(0, 70, 5, blockId("glass"));
    expect(world.getBlock(0, 70, 5)).toBe(blockId("glass"));
    expect(changed).toEqual(["0,0", "-1,0"]);

    world.setBlock(-17, 71, 33, blockId("bricks"));
    const edits = world.exportEdits();
    expect(edits).toEqual(expect.arrayContaining([[0, 70, 5, blockId("glass")], [-17, 71, 33, blockId("bricks")]]));

    const restored = new World(1);
    restored.importEdits(edits);
    expect(restored.getBlock(-17, 71, 33)).toBe(blockId("bricks"));
  });

  it("re-applies edits when an unloaded chunk is regenerated", () => {
    const world = new World(1);
    world.setBlock(3, 80, 3, blockId("gold_ore"));
    world.unloadChunk(0, 0);
    expect(world.hasChunk(0, 0)).toBe(false);
    expect(world.getBlock(3, 80, 3)).toBe(blockId("gold_ore"));
  });

  it("ignores writes outside the vertical range", () => {
    const world = new World(1);
    world.setBlock(0, -1, 0, blockId("stone"));
    world.setBlock(0, WORLD_HEIGHT, 0, blockId("stone"));
    expect(world.exportEdits()).toEqual([]);
  });
});
