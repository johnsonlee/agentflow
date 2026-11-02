import { describe, expect, it } from "vitest";
import { AIR, CHUNK_SIZE, World, WORLD_HEIGHT, blockId, meshChunk, type UvLookup } from "../src";

const uv: UvLookup = () => [0, 0, 1, 1];

/** World whose chunks are all air, with blocks placed manually. */
function emptyWorld(): World {
  const world = new World(1);
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) world.getChunk(cx, cz).blocks.fill(AIR);
  }
  return world;
}

describe("chunk mesher", () => {
  it("emits 6 faces for an isolated cube", () => {
    const world = emptyWorld();
    world.setBlock(5, 40, 5, blockId("stone"));
    const { solid, liquid } = meshChunk(world, 0, 0, uv);
    expect(solid.positions.length / 3).toBe(24);
    expect(solid.indices.length).toBe(36);
    expect(liquid.indices.length).toBe(0);
  });

  it("culls the shared face between two opaque cubes", () => {
    const world = emptyWorld();
    world.setBlock(5, 40, 5, blockId("stone"));
    world.setBlock(6, 40, 5, blockId("dirt"));
    expect(meshChunk(world, 0, 0, uv).solid.indices.length).toBe(10 * 6);
  });

  it("does not cull faces next to transparent blocks, but merges same-type glass", () => {
    const world = emptyWorld();
    world.setBlock(5, 40, 5, blockId("stone"));
    world.setBlock(6, 40, 5, blockId("glass"));
    expect(meshChunk(world, 0, 0, uv).solid.indices.length).toBe(11 * 6);
    world.setBlock(5, 40, 5, blockId("glass"));
    expect(meshChunk(world, 0, 0, uv).solid.indices.length).toBe(10 * 6);
  });

  it("culls against blocks in neighbouring chunks", () => {
    const world = emptyWorld();
    world.setBlock(CHUNK_SIZE - 1, 40, 5, blockId("stone"));
    world.setBlock(CHUNK_SIZE, 40, 5, blockId("stone"));
    expect(meshChunk(world, 0, 0, uv).solid.indices.length).toBe(5 * 6);
  });

  it("puts water into the translucent mesh with a lowered surface", () => {
    const world = emptyWorld();
    world.setBlock(5, 40, 5, blockId("water"));
    const { solid, liquid } = meshChunk(world, 0, 0, uv);
    expect(solid.indices.length).toBe(0);
    expect(liquid.indices.length).toBe(36);
    const ys = Array.from(liquid.positions.filter((_, i) => i % 3 === 1));
    expect(Math.max(...ys)).toBeCloseTo(40.875, 5);
  });

  it("renders plants as double-sided crossed quads", () => {
    const world = emptyWorld();
    world.setBlock(5, 39, 5, blockId("grass"));
    world.setBlock(5, 40, 5, blockId("poppy"));
    const { solid } = meshChunk(world, 0, 0, uv);
    // grass cube with its top face exposed (the plant is not opaque) + 4 plant quads
    expect(solid.indices.length).toBe(6 * 6 + 4 * 6);
  });

  it("darkens corners with ambient occlusion", () => {
    const world = emptyWorld();
    world.setBlock(5, 40, 5, blockId("stone"));
    world.setBlock(6, 41, 5, blockId("stone"));
    const { solid } = meshChunk(world, 0, 0, uv);
    const colors = Array.from(solid.colors);
    expect(Math.min(...colors)).toBeLessThan(0.5);
    expect(Math.max(...colors)).toBe(1);
  });

  it("produces consistent buffer sizes on a generated chunk", () => {
    const world = new World(42);
    const { solid } = meshChunk(world, 0, 0, uv);
    const vertices = solid.positions.length / 3;
    expect(vertices).toBeGreaterThan(100);
    expect(solid.normals.length).toBe(vertices * 3);
    expect(solid.colors.length).toBe(vertices * 3);
    expect(solid.uvs.length).toBe(vertices * 2);
    expect(Math.max(...solid.indices)).toBeLessThan(vertices);
    for (let i = 1; i < solid.positions.length; i += 3) {
      expect(solid.positions[i]).toBeGreaterThanOrEqual(0);
      expect(solid.positions[i]).toBeLessThanOrEqual(WORLD_HEIGHT);
    }
  });
});
