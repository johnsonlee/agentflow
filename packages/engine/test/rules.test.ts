import { describe, expect, it } from "vitest";
import {
  AIR, DAY_LENGTH, HOTBAR_SIZE, Inventory, MAX_STACK, World, blockId, breakBlock, breakTime, canBuildAt, parseSave,
  placeBlock, serializeSave, skyAt,
} from "../src";

function clearArea(world: World) {
  for (let x = -2; x < 6; x++) for (let z = -2; z < 6; z++) {
    for (let y = 0; y < 90; y++) world.setBlock(x, y, z, y <= 50 ? blockId("stone") : AIR);
  }
}

describe("inventory", () => {
  it("stacks to 64 and spills into new slots", () => {
    const inv = new Inventory();
    expect(inv.add(blockId("dirt"), 70)).toBe(0);
    expect(inv.slots[0]).toEqual({ id: blockId("dirt"), count: MAX_STACK });
    expect(inv.slots[1]).toEqual({ id: blockId("dirt"), count: 6 });
  });

  it("selects and scrolls the hotbar with wrap-around", () => {
    const inv = new Inventory();
    inv.select(8);
    inv.scroll(1);
    expect(inv.selected).toBe(0);
    inv.scroll(-1);
    expect(inv.selected).toBe(HOTBAR_SIZE - 1);
  });

  it("creative pick reuses a hotbar slot already holding the block", () => {
    const inv = new Inventory();
    inv.setSlot(4, { id: blockId("glass"), count: 1 });
    inv.pick(blockId("glass"));
    expect(inv.selected).toBe(4);
    inv.select(0);
    inv.pick(blockId("bricks"));
    expect(inv.slots[0]?.id).toBe(blockId("bricks"));
  });

  it("serialises to JSON and back", () => {
    const inv = new Inventory();
    inv.add(blockId("sand"), 3);
    inv.select(2);
    const copy = Inventory.fromJSON(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(copy.slots[0]).toEqual({ id: blockId("sand"), count: 3 });
    expect(copy.selected).toBe(2);
  });
});

describe("break and place rules", () => {
  const feet = { x: 100.5, y: 60, z: 100.5 };

  it("creative breaks instantly without drops; survival collects the drop", () => {
    const world = new World(1);
    clearArea(world);
    const inv = new Inventory();
    world.setBlock(0, 51, 0, blockId("grass"));
    expect(breakTime("creative", blockId("stone"))).toBe(0);
    expect(breakBlock(world, inv, "creative", 0, 51, 0)).toBe(true);
    expect(inv.slots.every((s) => s === null)).toBe(true);

    world.setBlock(0, 51, 0, blockId("grass"));
    expect(breakTime("survival", blockId("grass"))).toBeGreaterThan(0);
    expect(breakBlock(world, inv, "survival", 0, 51, 0)).toBe(true);
    expect(world.getBlock(0, 51, 0)).toBe(AIR);
    expect(inv.slots[0]).toEqual({ id: blockId("dirt"), count: 1 });
  });

  it("survival cannot break bedrock; creative can", () => {
    const world = new World(1);
    const inv = new Inventory();
    expect(breakBlock(world, inv, "survival", 0, 0, 0)).toBe(false);
    expect(breakBlock(world, inv, "creative", 0, 0, 0)).toBe(true);
  });

  it("breaking a block also breaks the plant on top of it", () => {
    const world = new World(1);
    clearArea(world);
    world.setBlock(1, 51, 1, blockId("grass"));
    world.setBlock(1, 52, 1, blockId("poppy"));
    breakBlock(world, new Inventory(), "creative", 1, 51, 1);
    expect(world.getBlock(1, 52, 1)).toBe(AIR);
  });

  it("places the selected block, consuming it only in survival", () => {
    const world = new World(1);
    clearArea(world);
    const inv = new Inventory();
    inv.setSlot(0, { id: blockId("bricks"), count: 2 });
    expect(placeBlock(world, inv, "creative", 0, 51, 0, feet)).toBe(true);
    expect(inv.slots[0]?.count).toBe(2);
    expect(placeBlock(world, inv, "survival", 1, 51, 0, feet)).toBe(true);
    expect(placeBlock(world, inv, "survival", 2, 51, 0, feet)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(placeBlock(world, inv, "survival", 3, 51, 0, feet)).toBe(false);
  });

  it("refuses to place into occupied cells or the player's body", () => {
    const world = new World(1);
    clearArea(world);
    const inv = new Inventory();
    inv.setSlot(0, { id: blockId("bricks"), count: 1 });
    expect(placeBlock(world, inv, "creative", 0, 50, 0, feet)).toBe(false);
    expect(placeBlock(world, inv, "creative", 0, 51, 0, { x: 0.5, y: 51, z: 0.5 })).toBe(false);
  });

  it("plants need solid ground", () => {
    const world = new World(1);
    clearArea(world);
    const inv = new Inventory();
    inv.setSlot(0, { id: blockId("dandelion"), count: 1 });
    expect(placeBlock(world, inv, "creative", 0, 55, 0, feet)).toBe(false);
    expect(placeBlock(world, inv, "creative", 0, 51, 0, feet)).toBe(true);
  });

  it("implements Education Edition Allow / Deny blocks in survival", () => {
    const world = new World(1);
    clearArea(world);
    world.setBlock(0, 50, 0, blockId("deny"));
    world.setBlock(1, 50, 0, blockId("allow"));
    world.setBlock(2, 48, 0, blockId("allow"));
    world.setBlock(2, 50, 0, blockId("deny"));
    expect(canBuildAt(world, "survival", 0, 51, 0)).toBe(false);
    expect(canBuildAt(world, "survival", 0, 70, 0)).toBe(false);
    expect(canBuildAt(world, "survival", 1, 51, 0)).toBe(true);
    expect(canBuildAt(world, "survival", 2, 51, 0)).toBe(false);
    expect(canBuildAt(world, "creative", 0, 51, 0)).toBe(true);
    const inv = new Inventory();
    inv.setSlot(0, { id: blockId("dirt"), count: 5 });
    expect(placeBlock(world, inv, "survival", 0, 51, 0, feet)).toBe(false);
    expect(placeBlock(world, inv, "survival", 1, 51, 0, feet)).toBe(true);
    expect(breakBlock(world, inv, "survival", 0, 50, 0)).toBe(false);
  });
});

describe("day / night cycle", () => {
  it("is bright at noon and dark at midnight", () => {
    const noon = skyAt(0.25);
    const midnight = skyAt(0.75);
    expect(noon.light).toBeCloseTo(1, 5);
    expect(midnight.light).toBeCloseTo(0.2, 5);
    expect(noon.sky[2]).toBeGreaterThan(midnight.sky[2]);
    expect(DAY_LENGTH).toBe(1200);
  });

  it("wraps times outside [0, 1)", () => {
    expect(skyAt(1.25)).toEqual(skyAt(0.25));
    expect(skyAt(-0.75)).toEqual(skyAt(0.25));
  });
});

describe("save files", () => {
  it("round-trips and validates", () => {
    const text = serializeSave({
      name: "Test",
      seed: 9,
      mode: "survival",
      timeOfDay: 0.3,
      player: { position: { x: 1, y: 2, z: 3 }, yaw: 0.5, pitch: -0.1, flying: false },
      inventory: { slots: [null], selected: 0 },
      edits: [[1, 2, 3, 4]],
    });
    const data = parseSave(text);
    expect(data.seed).toBe(9);
    expect(data.edits).toEqual([[1, 2, 3, 4]]);
    expect(() => parseSave("{}")).toThrow();
    // An invalid mode is repaired (to creative), so a damaged save stays loadable.
    expect(parseSave(JSON.stringify({ ...data, mode: "hardcore" })).mode).toBe("creative");
  });
});
