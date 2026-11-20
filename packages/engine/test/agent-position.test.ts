import { expect, it } from "vitest";
import { AIR, WORLD_BORDER, WORLD_HEIGHT, blockId, elementBlockId, findAgentPosition } from "../src";

const stone = blockId("stone");
const player = { x: 8.5, y: 60, z: 8.5 };

it("keeps the original left convention and tolerates tiny below-floor physics error", () => {
  const world = { getBlock: (_x: number, y: number, _z: number) => y < 60 ? stone : AIR };
  expect(findAgentPosition(world, player, 0)).toEqual({ x: 7, y: 60, z: 8 });
  expect(findAgentPosition(world, { ...player, y: 59.9999999 }, 0)).toEqual({ x: 7, y: 60, z: 8 });
  expect(findAgentPosition(world, player, Math.PI / 2)).toEqual({ x: 8, y: 60, z: 9 });
  // A genuine fractional feet height is not rounded up to a different cell.
  expect(findAgentPosition({ getBlock: () => AIR }, { ...player, y: 59.75 }, 0)?.y).toBe(59);
});

it("searches past both solid feet and obstructed headroom, including extended element cubes", () => {
  const gold = elementBlockId(79);
  for (const obstructionY of [60, 61]) {
    const world = { getBlock: (x: number, y: number, z: number) => y < 60 ? stone : x === 7 && z === 8 && y === obstructionY ? gold : AIR };
    const spot = findAgentPosition(world, player, 0)!;
    expect(spot).not.toEqual({ x: 7, y: 60, z: 8 });
    expect(spot.y).toBe(60); expect(spot.x === 8 && spot.z === 8).toBe(false);
    expect(world.getBlock(spot.x, spot.y, spot.z)).toBe(AIR);
    expect(world.getBlock(spot.x, spot.y + 1, spot.z)).toBe(AIR);
  }
});

it("prefers nearby grounded space and has an explicit unsupported flying fallback", () => {
  const empty = { getBlock: () => AIR };
  expect(findAgentPosition(empty, player, 0)).toEqual({ x: 7, y: 60, z: 8 });
  const world = { getBlock: (x: number, y: number, z: number) => x === 9 && y === 59 && z === 8 ? stone : AIR };
  expect(findAgentPosition(world, player, 0)).toEqual({ x: 9, y: 60, z: 8 });
});

it("never reads outside world bounds or teleports into the player's column at edges", () => {
  for (const y of [0, WORLD_HEIGHT - .001]) {
    const reads: number[][] = [];
    const world = { getBlock: (x: number, by: number, z: number) => { reads.push([x, by, z]); return AIR; } };
    const spot = findAgentPosition(world, { x: -WORLD_BORDER, y, z: WORLD_BORDER }, 0)!;
    expect(spot).not.toBeNull(); expect(spot.x === -WORLD_BORDER && spot.z === WORLD_BORDER).toBe(false);
    expect(spot.y).toBeGreaterThanOrEqual(0); expect(spot.y + 1).toBeLessThan(WORLD_HEIGHT);
    expect(reads.every(([x, by, z]) => Math.abs(x) <= WORLD_BORDER && Math.abs(z) <= WORLD_BORDER && by >= 0 && by < WORLD_HEIGHT)).toBe(true);
  }
});

it("refuses enclosed or invalid locations with a strictly bounded search", () => {
  let reads = 0;
  const enclosed = { getBlock: () => { reads++; return stone; } };
  expect(findAgentPosition(enclosed, player, 0)).toBeNull();
  expect(reads).toBeLessThanOrEqual(48 * 5 * 3);
  reads = 0;
  for (const p of [{ ...player, x: NaN }, { ...player, z: Infinity }, { ...player, x: WORLD_BORDER + 1 }, { ...player, y: -1 }, { ...player, y: WORLD_HEIGHT }])
    expect(findAgentPosition(enclosed, p, 0)).toBeNull();
  expect(findAgentPosition(enclosed, player, NaN)).toBeNull(); expect(reads).toBe(0);
});
