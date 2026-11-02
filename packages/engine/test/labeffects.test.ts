import { describe, expect, it } from "vitest";
import {
  AIR, EFFECT_LIMIT, EFFECT_RADIUS, FERTILIZER_LIMIT, Inventory, World, blockById, blockId, breakBlock, dropOf, emission, fertilizeAround,
  freezeAround, meltAround, nameOf, placeBlock, stackId, useLabProduct,
} from "../src";

const B = blockId;
const far = { x: 100, y: 100, z: 100 };

/** Stone below y 50, air above, over x/z -12..12. */
function flat(): World {
  const world = new World(1);
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let y = 40; y < 70; y++) world.setBlock(x, y, z, y <= 50 ? B("stone") : AIR);
  return world;
}
const count = (world: World, id: number) => {
  let n = 0;
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let y = 40; y < 70; y++) if (world.getBlock(x, y, z) === id) n++;
  return n;
};
const holding = (name: string) => {
  const inv = new Inventory();
  inv.add(stackId(name), 5);
  return inv;
};

describe("ice bomb", () => {
  it("freezes nearby water into ice, within the radius", () => {
    const world = flat();
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) world.setBlock(x, 50, z, B("water"));
    const n = freezeAround(world, 0, 50, 0);
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThanOrEqual(EFFECT_LIMIT);
    expect(world.getBlock(0, 50, 0)).toBe(B("ice"));
    expect(world.getBlock(EFFECT_RADIUS + 1, 50, 0)).toBe(B("water"));
    expect(count(world, B("ice"))).toBe(n);
  });

  it("changes at most EFFECT_LIMIT blocks in a big lake", () => {
    const world = flat();
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) for (let y = 46; y <= 52; y++) world.setBlock(x, y, z, B("water"));
    expect(freezeAround(world, 0, 49, 0)).toBe(EFFECT_LIMIT);
    expect(count(world, B("ice"))).toBe(EFFECT_LIMIT);
  });

  it("is used on a targeted block: freezes around the cell in front of it; nothing on dry land", () => {
    const world = flat();
    world.setBlock(0, 51, 0, B("water"));
    expect(useLabProduct(world, stackId("ice_bomb"), { x: 0, y: 50, z: 0, normal: { x: 0, y: 1, z: 0 } })).toBe(1);
    expect(world.getBlock(0, 51, 0)).toBe(B("ice"));
    expect(useLabProduct(world, stackId("ice_bomb"), { x: 5, y: 50, z: 5, normal: { x: 0, y: 1, z: 0 } })).toBe(0);
    expect(useLabProduct(world, stackId("salt"), { x: 0, y: 50, z: 0, normal: { x: 0, y: 1, z: 0 } })).toBe(-1);
    expect(freezeAround(world, NaN, 50, 0)).toBe(0);
  });
});

describe("heat block", () => {
  it("melts snow, snowy grass and ice nearby when placed; nothing far away", () => {
    const world = flat();
    world.setBlock(1, 51, 0, B("snow"));
    world.setBlock(0, 50, 1, B("snowy_grass"));
    world.setBlock(-1, 51, 0, B("ice"));
    world.setBlock(8, 51, 0, B("snow"));
    expect(placeBlock(world, holding("heat_block"), "survival", 0, 51, 0, far)).toBe(true);
    expect(nameOf(world.getBlock(0, 51, 0))).toBe("placed_heat_block");
    expect(world.getBlock(1, 51, 0)).toBe(AIR);
    expect(world.getBlock(0, 50, 1)).toBe(B("grass"));
    expect(world.getBlock(-1, 51, 0)).toBe(B("water"));
    expect(world.getBlock(8, 51, 0)).toBe(B("snow"));
    expect(meltAround(world, 0, 51, 0)).toBe(0);
  });

  it("breaks back into the Heat Block item and gives off no light, as in Education Edition", () => {
    const world = flat();
    placeBlock(world, holding("heat_block"), "creative", 0, 51, 0, far);
    expect(dropOf(world.getBlock(0, 51, 0))).toBe(stackId("heat_block"));
    const inv = new Inventory();
    expect(breakBlock(world, inv, "survival", 0, 51, 0)).toBe(true);
    expect(inv.slots[0]).toEqual({ id: stackId("heat_block"), count: 1 });
    expect(emission(B("placed_heat_block"))).toBe(0);
  });
});

describe("underwater torch and glow stick", () => {
  it("the underwater torch and glow stick go in water; an ordinary torch doesn't", () => {
    const world = flat();
    for (const x of [0, 2, 4]) world.setBlock(x, 51, 0, B("water"));
    expect(placeBlock(world, holding("torch"), "survival", 0, 51, 0, far)).toBe(false);
    expect(world.getBlock(0, 51, 0)).toBe(B("water"));
    const inv = holding("underwater_torch");
    expect(placeBlock(world, inv, "survival", 2, 51, 0, far)).toBe(true);
    expect(nameOf(world.getBlock(2, 51, 0))).toBe("placed_underwater_torch");
    expect(inv.slots[0]!.count).toBe(4);
    expect(placeBlock(world, holding("glow_stick"), "survival", 4, 51, 0, far)).toBe(true);
    expect(nameOf(world.getBlock(4, 51, 0))).toBe("placed_glow_stick");
  });

  it("both emit block light that reaches neighbours", () => {
    const world = flat();
    placeBlock(world, holding("underwater_torch"), "creative", 0, 51, 0, far);
    placeBlock(world, holding("glow_stick"), "creative", 8, 51, 0, far);
    expect(world.getLight(1, 51, 0) & 15).toBe(13);
    expect(world.getLight(9, 51, 0) & 15).toBe(9);
    expect(blockById(B("placed_glow_stick")).waterproof).toBe(true);
  });

  it("other items still place nothing", () => {
    const world = flat();
    for (const n of ["salt", "ice_bomb", "super_fertilizer", "oxygen"]) expect(placeBlock(world, holding(n), "survival", 0, 51, 0, far)).toBe(false);
  });
});

describe("super fertilizer", () => {
  it("grows tall grass and flowers on open grass nearby, bounded", () => {
    const world = flat();
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) world.setBlock(x, 50, z, B("grass"));
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = fertilizeAround(world, 0, 50, 0, rand);
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThanOrEqual(FERTILIZER_LIMIT);
    expect([B("tall_grass"), B("dandelion"), B("poppy")]).toContain(world.getBlock(0, 51, 0));
    const plants = count(world, B("tall_grass")) + count(world, B("dandelion")) + count(world, B("poppy"));
    expect(plants).toBe(n);
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
      if (Math.hypot(x, z) > EFFECT_RADIUS) expect(world.getBlock(x, 51, z)).toBe(AIR);
    }
  });

  it("does nothing unless used on grass", () => {
    const world = flat();
    expect(fertilizeAround(world, 0, 50, 0)).toBe(0);
    expect(useLabProduct(world, stackId("super_fertilizer"), { x: 0, y: 50, z: 0, normal: { x: 0, y: 1, z: 0 } })).toBe(-1);
    world.setBlock(0, 50, 0, B("grass"));
    expect(useLabProduct(world, stackId("super_fertilizer"), { x: 0, y: 50, z: 0, normal: { x: 0, y: 1, z: 0 } })).toBeGreaterThan(0);
  });
});
