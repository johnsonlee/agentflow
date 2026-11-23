import { expect, it } from "vitest";
import {
  AIR, BLOCKS, FENCE_CONNECTIONS, MAX_BLOCK_COLLISION_HEIGHT, BLOCK_COLLISION_ORIGIN_BELOW,
  blockById, blockCollisionBoxes, blockId, blockRenderBoxes, blockSelectionBoxes, bodyBox, boxCollides,
  createPlayerBody, fenceConnections, findPath, findSummonSpot, boxIntersectsFences, isSolid, raycast, standable, stepPlayer,
} from "../src/index";
const F = blockId("oak_fence"), S = blockId("stone");
function fixture() {
  const blocks = new Map<string, number>();
  const get = (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? (y === 0 ? S : AIR);
  const set = (x: number, y: number, z: number, id = F) => blocks.set(`${x},${y},${z}`, id);
  return { get, set, blocks };
}

it("appends explicit188 and preserves all previous block definitions/order without new atlas faces", () => {
  expect(BLOCKS).toHaveLength(345); expect(BLOCKS[307]).toMatchObject({ id: 188, name: "oak_fence", shape: "fence", solid: true, transparent: true, faces: { top: "oak_planks", side: "oak_planks", bottom: "oak_planks" }, hardness: 3, tool: "axe" });
  expect(new Set(BLOCKS.map(x => x.id)).size).toBe(345); expect(F).toBe(188);
  expect(MAX_BLOCK_COLLISION_HEIGHT).toBe(1.5); expect(BLOCK_COLLISION_ORIGIN_BELOW).toBe(1);
});

it("derives every one of16 connection masks and bounded post/arm collision/render/selection parts", () => {
  const dirs = [[0, -1, FENCE_CONNECTIONS.north], [1, 0, FENCE_CONNECTIONS.east], [0, 1, FENCE_CONNECTIONS.south], [-1, 0, FENCE_CONNECTIONS.west]];
  for (let mask = 0; mask < 16; mask++) {
    const w = fixture(); w.set(0, 1, 0);
    for (const [dx, dz, bit] of dirs) if (mask & bit) w.set(dx, 1, dz);
    expect(fenceConnections(w.get, 0, 1, 0), `mask${mask}`).toBe(mask);
    const arms = dirs.filter(([, , bit]) => mask & bit).length;
    const collision = blockCollisionBoxes(w.get, 0, 1, 0), render = blockRenderBoxes(w.get, 0, 1, 0);
    expect(collision).toHaveLength(arms + 1); expect(render).toHaveLength(arms * 2 + 1);
    expect(blockSelectionBoxes(w.get, 0, 1, 0)).toEqual(render);
    for (const b of collision) { expect(b[1]).toBe(0); expect(b[4]).toBe(1.5); expect(b[0]).toBeGreaterThanOrEqual(0); expect(b[3]).toBeLessThanOrEqual(1); expect(b[2]).toBeGreaterThanOrEqual(0); expect(b[5]).toBeLessThanOrEqual(1); }
    for (const b of render) expect(b[4]).toBeLessThanOrEqual(1);
  }
});

it("connects to full opaque cubes, updates after removal and excludes glass/doors/farmland/plants", () => {
  const w = fixture(); w.set(0, 1, 0); w.set(1, 1, 0, S); expect(fenceConnections(w.get, 0, 1, 0)).toBe(2);
  for (const name of ["glass", "farmland_0", "door_wooden_lower_0_0", "dandelion"]) {
    w.set(1, 1, 0, blockId(name)); expect(fenceConnections(w.get, 0, 1, 0), name).toBe(0);
  }
  w.set(1, 1, 0); expect(fenceConnections(w.get, 0, 1, 0)).toBe(2); expect(fenceConnections(w.get, 1, 1, 0)).toBe(8);
  w.set(1, 1, 0, AIR); expect(fenceConnections(w.get, 0, 1, 0)).toBe(0);
});

it("finds collisions originating one cell below, clears above1.5 and keeps empty corners free", () => {
  for (const [x, y, z] of [[0, 10, 0], [-3, 127, -4]]) {
    const w = fixture(); w.set(x, y, z);
    for (const feet of [y + 1.01, y + 1.49]) expect(boxCollides(w.get, bodyBox({ x: x + .5, y: feet, z: z + .5 }, .25, .25))).toBe(true);
    expect(boxCollides(w.get, bodyBox({ x: x + .5, y: y + 1.5001, z: z + .5 }, .25, .25))).toBe(false);
    expect(boxCollides(w.get, bodyBox({ x: x + .1, y: y + .1, z: z + .1 }, .1, .1))).toBe(false);
    expect(boxCollides(w.get, bodyBox({ x: x + .5, y: y + .1, z: z + .5 }, .1, .1))).toBe(true);
  }
  const w = fixture(); w.set(0, 1, 0); w.set(1, 1, 0);
  expect(boxCollides(w.get, bodyBox({ x: .9, y: 2.4, z: .5 }, .1, .1))).toBe(true);
  for (const width of [.25, .4, .6, .9, 1.4]) expect(boxCollides(w.get, bodyBox({ x: .5, y: 1.1, z: .5 }, width, .3))).toBe(true);
});

it("retains bounded corrupt-box guards and legacy farmland/cube behavior", () => {
  let reads = 0; const get = () => { reads++; return AIR; };
  for (const b of [{ minX: NaN, maxX: 1 }, { minX: -100, maxX: 100 }]) expect(boxCollides(get, { minY: 0, minZ: 0, maxY: 1, maxZ: 1, ...b })).toBe(true);
  expect(reads).toBe(0);
  const w = fixture(); w.set(0, 1, 0, blockId("farmland_0"));
  expect(blockCollisionBoxes(w.get, 0, 1, 0)).toEqual([[0, 0, 0, 1, 15 / 16, 1]]);
  expect(boxCollides(w.get, bodyBox({ x: .5, y: 1.95, z: .5 }, .6, 1.8))).toBe(false);
  expect(blockSelectionBoxes(w.get, 0, 1, 0)).toEqual([[0, 0, 0, 1, 1, 1]]);
});

it.each(["walk", "manualJump", "autoJump"])("actual%s physics cannot cross a connected1.5-high fence", mode => {
  const w = fixture(); for (let z = -8; z <= 8; z++) w.set(2, 1, z);
  const player = createPlayerBody({ x: .5, y: 1, z: .5 }); player.yaw = -Math.PI / 2;
  for (let i = 0; i < 240; i++) stepPlayer(w.get, player, { forward: 1, strafe: 0, jump: mode === "manualJump", autoJump: mode === "autoJump", descend: false, sprint: false }, 1 / 60);
  expect(player.position.x).toBeLessThan(2.08); expect(player.position.x).toBeGreaterThan(1);
  expect(boxCollides(w.get, bodyBox(player.position))).toBe(false);
});

it("fence ray targets actual posts/rails with true distances/normals and passes unused corners", () => {
  const w = fixture(); w.set(0, 1, 0); w.set(0, 1, -2, S);
  const hit = raycast(w.get, { x: .5, y: 1.2, z: 2 }, { x: 0, y: 0, z: -1 }, 5, isSolid)!;
  expect(hit).toMatchObject({ x: 0, y: 1, z: 0, id: F, normal: { x: 0, y: 0, z: 1 } }); expect(hit.distance).toBeCloseTo(1.375);
  expect(raycast(w.get, { x: .5, y: 1.2, z: 2 }, { x: 0, y: 0, z: -1 }, 1.3, isSolid)).toBeNull();
  const gap = raycast(w.get, { x: .1, y: 1.2, z: 2 }, { x: 0, y: 0, z: -1 }, 5, isSolid)!; expect(gap.z).toBe(-2); expect(gap.distance).toBe(3);
  w.set(1, 1, 0); const rail = raycast(w.get, { x: .8, y: 2, z: .5 }, { x: 0, y: -1, z: 0 }, 2, isSolid)!;
  expect(rail.normal).toEqual({ x: 0, y: 1, z: 0 }); expect(rail.distance).toBeCloseTo(1 / 16);
  w.set(0, 1, 0, blockId("torch")); expect(raycast(w.get, { x: .1, y: 1.2, z: 2 }, { x: 0, y: 0, z: -1 }, 5, id => id !== AIR)?.distance).toBe(1);
});

it("integer path nodes do not stand above, step onto or diagonally cut through a fence barrier", () => {
  const w = fixture(); for (let z = -2; z <= 2; z++) w.set(2, 1, z);
  expect(standable(w.get, 2, 2, 0)).toBe(false);
  const route = findPath(w.get, { x: .5, y: 1, z: .5 }, { x: 4.5, y: 1, z: .5 }, { radius: 8 })!;
  expect(route.at(-1)).toEqual({ x: 4, y: 1, z: 0 });
  expect(route.some(n => n.x === 2 && Math.abs(n.z) <= 2)).toBe(false);
  expect(route.every(n => n.y === 1)).toBe(true);
});

it("actual-width summon probes detect a neighboring fence extending above the otherwise valid floor", () => {
  const w = fixture(); w.set(1, 0, 0);
  const narrow = findSummonSpot(w.get, .5, .5, 1, 1, 4, .6)!;
  expect(narrow).toEqual({ x: .5, y: 1, z: .5 });
  expect(boxIntersectsFences(w.get, bodyBox(narrow, 1.4, .9))).toBe(true);
  const wide = findSummonSpot(w.get, .5, .5, 1, 1, 4, 1.4)!;
  expect(wide).not.toEqual(narrow); expect(boxIntersectsFences(w.get, bodyBox(wide, 1.4, .9))).toBe(false);
});
