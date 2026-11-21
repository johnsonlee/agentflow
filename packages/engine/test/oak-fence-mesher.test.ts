import { expect, it } from "vitest";
import { AIR, World, blockId, blockRenderBoxes, meshChunk } from "../src";
const uv = () => [0, 0, 1, 1] as const;
function emptyWorld() {
  const world = new World(1);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) world.getChunk(x, z).blocks.fill(AIR);
  return world;
}
it("meshes all sixteen fence connection masks as the same post and rails used by selection", () => {
  for (let mask = 0; mask < 16; mask++) {
    const world = emptyWorld(), fence = blockId("oak_fence"), at = [5, 40, 5] as const;
    world.setBlock(...at, fence);
    const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let bit = 0; bit < 4; bit++) if (mask & 1 << bit) world.setBlock(5 + neighbours[bit][0], 40, 5 + neighbours[bit][1], fence);
    const n = neighbours.filter((_, bit) => mask & 1 << bit).length;
    const boxes = blockRenderBoxes((x, y, z) => world.getBlock(x, y, z), ...at);
    expect(boxes).toHaveLength(1 + 2 * n);
    const mesh = meshChunk(world, 0, 0, uv);
    // Each neighbour connects back to the centre, so each adds a post and four rails total.
    expect(mesh.solid.indices.length).toBe((1 + 5 * n) * 36);
    expect(mesh.liquid.indices.length).toBe(0); expect(mesh.translucent.indices.length).toBe(0);
    const vertices = Array.from(mesh.solid.positions);
    for (let i = 1; i < vertices.length; i += 3) expect(vertices[i]).toBeGreaterThanOrEqual(40);
    expect(Math.max(...vertices.filter((_, i) => i % 3 === 1))).toBe(41);
  }
});
it("connects across a chunk boundary and remeshes both changed sides after neighbour removal", () => {
  const world = emptyWorld(), fence = blockId("oak_fence"), changes: string[] = [];
  world.onChunkChanged((x, z) => changes.push(`${x},${z}`));
  world.setBlock(15, 40, 5, fence); changes.length = 0;
  world.setBlock(16, 40, 5, fence);
  // These are the actual notifications consumed by WorldRenderer's existing subscription.
  expect(changes).toContain("0,0"); expect(changes).toContain("1,0");
  expect(meshChunk(world, 0, 0, uv).solid.indices.length).toBe(108);
  expect(meshChunk(world, 1, 0, uv).solid.indices.length).toBe(108);
  changes.length = 0; world.setBlock(16, 40, 5, AIR);
  expect(changes).toContain("0,0"); expect(changes).toContain("1,0");
  expect(meshChunk(world, 0, 0, uv).solid.indices.length).toBe(36);
  expect(meshChunk(world, 1, 0, uv).solid.indices.length).toBe(0);
});
