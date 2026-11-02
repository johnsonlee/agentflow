import { describe, expect, it } from "vitest";
import { AIR, Inventory, World, blockId, blockLightOf, emission, itemId, matchRecipe, placeBlock, skyOf, stackId, type CraftingGrid } from "../src";

const STONE = blockId("stone");
const TORCH = blockId("torch");

/** A sealed 9x3x9 stone room deep underground (floor y = 9, air y = 10..12). */
function darkRoom(): World {
  const world = new World(7);
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) for (let y = 6; y <= 16; y++) world.setBlock(x, y, z, STONE);
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) for (let y = 10; y <= 12; y++) world.setBlock(x, y, z, AIR);
  return world;
}

const block = (w: World, x: number, y: number, z: number) => blockLightOf(w.getLight(x, y, z));
const sky = (w: World, x: number, y: number, z: number) => skyOf(w.getLight(x, y, z));

describe("block light", () => {
  it("emitters: torch 14, glowstone 15", () => {
    expect(emission(TORCH)).toBe(14);
    expect(emission(blockId("glowstone"))).toBe(15);
    expect(emission(STONE)).toBe(0);
  });

  it("a sealed underground room is dark", () => {
    const w = darkRoom();
    expect(w.getLight(0, 11, 0)).toBe(0);
  });

  it("a torch lights its surroundings, falling off by 1 per block (Manhattan distance)", () => {
    const w = darkRoom();
    w.setBlock(0, 10, 0, TORCH);
    expect(block(w, 0, 10, 0)).toBe(14);
    expect(block(w, 1, 10, 0)).toBe(13);
    expect(block(w, 3, 10, 0)).toBe(11);
    expect(block(w, 0, 10, 4)).toBe(10);
    expect(block(w, 2, 12, 2)).toBe(14 - 6);
    expect(block(w, 4, 12, 4)).toBe(14 - 10);
    // Opaque blocks hold no light, and light doesn't leak through the walls.
    expect(block(w, 5, 10, 0)).toBe(0);
    expect(sky(w, 0, 10, 0)).toBe(0);
  });

  it("walls occlude light", () => {
    const w = darkRoom();
    for (let z = -4; z <= 4; z++) for (let y = 10; y <= 12; y++) w.setBlock(2, y, z, STONE);
    w.setBlock(0, 10, 0, TORCH);
    expect(block(w, 1, 10, 0)).toBe(13);
    expect(block(w, 3, 10, 0)).toBe(0);
    // Opening one hole lets light around the wall.
    w.setBlock(2, 12, 0, AIR);
    expect(block(w, 2, 12, 0)).toBe(14 - 4);
    expect(block(w, 3, 12, 0)).toBe(14 - 5);
    expect(block(w, 3, 10, 0)).toBe(14 - 7);
  });

  it("removing a torch removes its light; two torches overlap", () => {
    const w = darkRoom();
    w.setBlock(-3, 10, 0, TORCH);
    w.setBlock(3, 10, 0, TORCH);
    expect(block(w, 0, 10, 0)).toBe(11);
    w.setBlock(3, 10, 0, AIR);
    expect(block(w, 0, 10, 0)).toBe(11);
    expect(block(w, 3, 10, 0)).toBe(8);
    w.setBlock(-3, 10, 0, AIR);
    for (let x = -4; x <= 4; x++) expect(block(w, x, 10, 0)).toBe(0);
  });
});

describe("sky light", () => {
  it("is 15 in the open and comes straight down", () => {
    const w = new World(7);
    expect(sky(w, 0, 90, 0)).toBe(15);
    expect(sky(w, 0, 80, 0)).toBe(15);
  });

  it("a roof shades the space beneath (light creeps in from the edges); removing it restores full sky", () => {
    const w = new World(7);
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) w.setBlock(x, 85, z, STONE);
    expect(sky(w, 0, 86, 0)).toBe(15);
    expect(sky(w, 0, 84, 0)).toBe(15 - 4);
    expect(sky(w, 3, 84, 0)).toBe(14);
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) w.setBlock(x, 85, z, AIR);
    expect(sky(w, 0, 84, 0)).toBe(15);
    expect(sky(w, 0, 80, 0)).toBe(15);
  });

  it("does not reach a sealed room", () => {
    const w = darkRoom();
    expect(sky(w, 0, 11, 0)).toBe(0);
  });
});

describe("torch item", () => {
  it("is crafted from coal or charcoal over a stick (4 torches)", () => {
    const s = (n: string) => ({ id: stackId(n), count: 1 });
    const grid: CraftingGrid = [s("coal"), null, s("stick"), null];
    expect(matchRecipe(grid, 2)?.result).toEqual({ id: TORCH, count: 4 });
    expect(matchRecipe([s("charcoal"), null, s("stick"), null], 2)?.result).toEqual({ id: TORCH, count: 4 });
    expect(itemId("coal")).toBeGreaterThan(0);
  });

  it("is placed on block tops or sides, never floating or on a ceiling only", () => {
    const w = darkRoom();
    const inv = new Inventory();
    inv.setSlot(0, { id: TORCH, count: 4 });
    const feet = { x: 100, y: 100, z: 100 };
    expect(placeBlock(w, inv, "survival", 0, 10, 0, feet)).toBe(true); // on the floor
    expect(placeBlock(w, inv, "survival", 4, 11, 0, feet)).toBe(true); // on the wall
    expect(placeBlock(w, inv, "survival", 0, 12, 1, feet)).toBe(false); // only a ceiling above
    expect(block(w, 4, 11, 0)).toBe(14);
  });
});
