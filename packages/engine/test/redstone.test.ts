import { describe, expect, it } from "vitest";
import {
  AIR, Inventory, MAX_DIRTY_PER_TICK, Redstone, World, blockId, breakBlock, dustLevel, nameOf, placeBlock, redstoneInfo, runAgentCommand,
  createAgent, sanitizeScheduled, stackId,
} from "../src";

const B = blockId;
const far = { x: 100, y: 100, z: 100 };
const Y = 51;

/** Stone up to y 50, air above, over x/z -20..20. */
function setup() {
  const world = new World(1);
  for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) for (let y = 44; y < 60; y++) world.setBlock(x, y, z, y <= 50 ? B("stone") : AIR);
  const rs = new Redstone(world);
  rs.settle();
  return { world, rs };
}
const name = (w: World, x: number, y: number, z: number) => nameOf(w.getBlock(x, y, z));

describe("redstone dust", () => {
  it("carries power from a lever, losing 1 per dust, up to 15 dust", () => {
    const { world, rs } = setup();
    world.setBlock(0, Y, 0, B("lever"));
    for (let x = 1; x <= 17; x++) world.setBlock(x, Y, 0, B("redstone_wire_0"));
    rs.settle();
    expect(dustLevel(world.getBlock(1, Y, 0))).toBe(0);
    expect(rs.interact(0, Y, 0)).toBe(true);
    rs.settle();
    expect(name(world, 0, Y, 0)).toBe("lever_on");
    expect([1, 2, 3, 15, 16, 17].map((x) => dustLevel(world.getBlock(x, Y, 0)))).toEqual([15, 14, 13, 1, 0, 0]);
    rs.interact(0, Y, 0);
    rs.settle();
    expect(dustLevel(world.getBlock(1, Y, 0))).toBe(0);
    expect(dustLevel(world.getBlock(10, Y, 0))).toBe(0);
  });

  it("steps up and down one block", () => {
    const { world, rs } = setup();
    world.setBlock(1, Y, 0, B("stone"));
    world.setBlock(0, Y, 0, B("redstone_wire_0"));
    world.setBlock(1, Y + 1, 0, B("redstone_wire_0"));
    world.setBlock(-1, Y, 0, B("lever_on"));
    rs.settle();
    expect(dustLevel(world.getBlock(0, Y, 0))).toBe(15);
    expect(dustLevel(world.getBlock(1, Y + 1, 0))).toBe(14);
  });
});

describe("lamps, torches, repeaters, buttons, plates", () => {
  it("lever -> dust -> lamp lights the lamp (block light 15) and turns it off again", () => {
    const { world, rs } = setup();
    world.setBlock(0, Y, 0, B("lever"));
    world.setBlock(1, Y, 0, B("redstone_wire_0"));
    world.setBlock(2, Y, 0, B("redstone_wire_0"));
    world.setBlock(3, Y, 0, B("redstone_lamp"));
    rs.settle();
    expect(name(world, 3, Y, 0)).toBe("redstone_lamp");
    rs.interact(0, Y, 0);
    rs.settle();
    expect(name(world, 3, Y, 0)).toBe("redstone_lamp_on");
    expect(world.getLight(3, Y + 1, 0) & 15).toBe(14);
    rs.interact(0, Y, 0);
    rs.settle();
    expect(name(world, 3, Y, 0)).toBe("redstone_lamp");
    expect(world.getLight(3, Y + 1, 0) & 15).toBe(0);
  });

  it("a lever on a block powers a lamp on the block's other side", () => {
    const { world, rs } = setup();
    world.setBlock(1, Y, 0, B("stone"));
    world.setBlock(0, Y, 0, B("lever_on"));
    world.setBlock(2, Y, 0, B("redstone_lamp"));
    rs.settle();
    expect(name(world, 2, Y, 0)).toBe("redstone_lamp_on");
  });

  it("a redstone torch turns off when its block is powered, after one tick", () => {
    const { world, rs } = setup();
    world.setBlock(0, Y, 0, B("stone"));
    world.setBlock(0, Y + 1, 0, B("redstone_torch"));
    world.setBlock(1, Y + 1, 0, B("redstone_wire_0"));
    world.setBlock(-1, Y, 0, B("lever"));
    rs.settle();
    expect(dustLevel(world.getBlock(1, Y + 1, 0))).toBe(15);
    expect(name(world, 0, Y + 1, 0)).toBe("redstone_torch");
    rs.interact(-1, Y, 0);
    rs.step();
    expect(name(world, 0, Y + 1, 0)).toBe("redstone_torch");
    rs.step();
    expect(name(world, 0, Y + 1, 0)).toBe("redstone_torch_off");
    rs.settle();
    expect(dustLevel(world.getBlock(1, Y + 1, 0))).toBe(0);
  });

  it("a repeater delays by its setting (1-4 ticks), points one way, and restores full power", () => {
    for (const delay of [1, 2, 3, 4]) {
      const { world, rs } = setup();
      world.setBlock(0, Y, 0, B("lever"));
      world.setBlock(1, Y, 0, B("redstone_wire_0"));
      world.setBlock(2, Y, 0, B(`repeater_3_${delay}_0`)); // facing +x
      world.setBlock(3, Y, 0, B("redstone_wire_0"));
      world.setBlock(4, Y, 0, B("redstone_lamp"));
      rs.settle();
      rs.interact(0, Y, 0);
      let ticks = 0;
      while (name(world, 4, Y, 0) !== "redstone_lamp_on" && ticks < 20) { rs.step(); ticks++; }
      expect(ticks).toBe(delay + 1);
      expect(dustLevel(world.getBlock(3, Y, 0))).toBe(15);
    }
    // Backwards it doesn't pass power.
    const { world, rs } = setup();
    world.setBlock(0, Y, 0, B("lever_on"));
    world.setBlock(1, Y, 0, B("redstone_wire_0"));
    world.setBlock(2, Y, 0, B("repeater_1_1_0")); // facing -x
    world.setBlock(3, Y, 0, B("redstone_lamp"));
    rs.settle();
    expect(name(world, 3, Y, 0)).toBe("redstone_lamp");
    expect(rs.interact(2, Y, 0)).toBe(true);
    expect(name(world, 2, Y, 0)).toBe("repeater_1_2_0");
  });

  it("a button powers for 10 ticks; a pressure plate while occupied", () => {
    const { world, rs } = setup();
    world.setBlock(0, Y, 0, B("stone_button"));
    world.setBlock(1, Y, 0, B("redstone_lamp"));
    rs.settle();
    rs.interact(0, Y, 0);
    rs.step();
    expect(name(world, 1, Y, 0)).toBe("redstone_lamp_on");
    for (let i = 0; i < 9; i++) rs.step();
    rs.settle();
    expect(name(world, 0, Y, 0)).toBe("stone_button");
    expect(name(world, 1, Y, 0)).toBe("redstone_lamp");

    world.setBlock(5, Y, 0, B("stone_pressure_plate"));
    world.setBlock(6, Y, 0, B("redstone_lamp"));
    rs.settle();
    rs.updatePlates(new Set(["5,51,0"]));
    rs.settle();
    expect(name(world, 6, Y, 0)).toBe("redstone_lamp_on");
    rs.updatePlates(new Set());
    rs.settle();
    expect(name(world, 6, Y, 0)).toBe("redstone_lamp");
  });
});

describe("doors", () => {
  it("are placed as two halves facing the look direction, open by hand (wooden only) and by power", () => {
    const { world, rs } = setup();
    const inv = new Inventory();
    inv.add(stackId("wooden_door"), 1);
    expect(placeBlock(world, inv, "survival", 0, Y, 0, far, 2)).toBe(true);
    expect([name(world, 0, Y, 0), name(world, 0, Y + 1, 0)]).toEqual(["door_wooden_lower_2_0", "door_wooden_upper_2_0"]);
    expect(rs.interact(0, Y + 1, 0)).toBe(true);
    expect([name(world, 0, Y, 0), name(world, 0, Y + 1, 0)]).toEqual(["door_wooden_lower_2_1", "door_wooden_upper_2_1"]);
    rs.interact(0, Y, 0);
    expect(redstoneInfo(world.getBlock(0, Y, 0))).toMatchObject({ kind: "door", open: false });

    const iron = new Inventory();
    iron.add(stackId("iron_door"), 1);
    placeBlock(world, iron, "creative", 4, Y, 0, far, 0);
    rs.interact(4, Y, 0);
    expect(name(world, 4, Y, 0)).toBe("door_iron_lower_0_0");
    world.setBlock(5, Y, 0, B("stone_button"));
    rs.settle();
    rs.interact(5, Y, 0);
    rs.step();
    expect(name(world, 4, Y, 0)).toBe("door_iron_lower_0_1");
    expect(name(world, 4, Y + 1, 0)).toBe("door_iron_upper_0_1");
    for (let i = 0; i < 12; i++) rs.step();
    expect(name(world, 4, Y, 0)).toBe("door_iron_lower_0_0");
  });

  it("breaking one half removes both and drops one door", () => {
    const { world } = setup();
    const inv = new Inventory();
    inv.add(stackId("wooden_door"), 1);
    placeBlock(world, inv, "survival", 0, Y, 0, far, 0);
    expect(breakBlock(world, inv, "survival", 0, Y + 1, 0)).toBe(true);
    expect(world.getBlock(0, Y, 0)).toBe(AIR);
    expect(inv.slots[0]).toEqual({ id: stackId("wooden_door"), count: 1 });
  });
});

describe("Agent, saves and bounds", () => {
  it("the Agent places a repeater pointing its way, dust and a door, and destroys them", () => {
    const { world } = setup();
    const agent = createAgent(0, Y, 0, 3);
    agent.slots[0] = { id: B("repeater"), count: 1 };
    expect(runAgentCommand(world, agent, { op: "place", dir: "forward" }).ok).toBe(true);
    expect(name(world, 1, Y, 0)).toBe("repeater_3_1_0");
    agent.slots[0] = { id: stackId("redstone"), count: 1 };
    expect(runAgentCommand(world, agent, { op: "place", dir: "back" }).ok).toBe(true);
    expect(name(world, -1, Y, 0)).toBe("redstone_wire_0");
    agent.slots[0] = { id: stackId("wooden_door"), count: 1 };
    agent.facing = 0;
    expect(runAgentCommand(world, agent, { op: "place", dir: "forward" }).ok).toBe(true);
    expect(name(world, 0, Y + 1, 1)).toBe("door_wooden_upper_0_0");
    expect(runAgentCommand(world, agent, { op: "destroy", dir: "forward" }).ok).toBe(true);
    expect(world.getBlock(0, Y + 1, 1)).toBe(AIR);
  });

  it("pending ticks round-trip and are sanitized", () => {
    const { world, rs } = setup();
    world.setBlock(0, Y, 0, B("stone_button"));
    rs.settle();
    rs.interact(0, Y, 0);
    const saved = JSON.parse(JSON.stringify(rs.exportScheduled()));
    expect(saved).toEqual([{ x: 0, y: Y, z: 0, due: 10, kind: "button" }]);
    const rs2 = new Redstone(world);
    rs2.restore(sanitizeScheduled(saved), world.exportEdits());
    rs2.settle(30);
    expect(name(world, 0, Y, 0)).toBe("stone_button");
    expect(sanitizeScheduled([{ x: 1.5, y: 0, z: 0, due: 1, kind: "torch" }, { x: 0, y: 0, z: 0, due: 1, kind: "__proto__" }, { x: 0, y: 999, z: 0, due: 1, kind: "torch" }, null, 7])).toEqual([]);
    expect(sanitizeScheduled("junk")).toEqual([]);
  });

  it("a large circuit settles with bounded work per tick and no long tick", () => {
    const { world, rs } = setup();
    // A 41x41 dust carpet with a lever in the middle.
    for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) world.setBlock(x, Y, z, B("redstone_wire_0"));
    world.setBlock(0, Y, 0, B("lever_on"));
    let worst = 0;
    for (let i = 0; i < 200 && (rs.pending().dirty > 0 || rs.pending().scheduled > 0); i++) {
      const t = performance.now();
      rs.step();
      worst = Math.max(worst, performance.now() - t);
      expect(rs.lastWork).toBeLessThanOrEqual(MAX_DIRTY_PER_TICK);
    }
    expect(rs.pending().dirty).toBe(0);
    expect(dustLevel(world.getBlock(1, Y, 0))).toBe(15);
    expect(dustLevel(world.getBlock(14, Y, 0))).toBe(2);
    expect(dustLevel(world.getBlock(20, Y, 20))).toBe(0);
    expect(worst).toBeLessThan(250);
  });
});
