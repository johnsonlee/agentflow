import { describe, expect, it } from "vitest";
import {
  AIR, AGENT_SLOTS, Inventory, ProgramRunner, World, blockId, createAgent, giveAgent, itemId, parseCommand, parseSave, runAgentCommand,
  serializeSave, validateProgram, type AgentCommand, type CodeProgram,
} from "../src";

const STONE = blockId("stone");
const PLANKS = blockId("oak_planks");

function flat(): World {
  const w = new World(5);
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
    w.setBlock(x, 50, z, STONE);
    for (let y = 51; y <= 56; y++) w.setBlock(x, y, z, AIR);
  }
  return w;
}

describe("Agent commands", () => {
  it("moves relative to its facing, turns, flies up and down, and is blocked by solid blocks", () => {
    const w = flat();
    const a = createAgent(0, 51, 0, 2); // facing -Z (north)
    expect(runAgentCommand(w, a, { op: "move", dir: "forward" }).ok).toBe(true);
    expect([a.x, a.y, a.z]).toEqual([0, 51, -1]);
    runAgentCommand(w, a, { op: "move", dir: "right" }); // right of north is east (+X)
    expect([a.x, a.z]).toEqual([1, -1]);
    runAgentCommand(w, a, { op: "turn", side: "right" }); // now facing east
    runAgentCommand(w, a, { op: "move", dir: "forward" });
    expect([a.x, a.z]).toEqual([2, -1]);
    runAgentCommand(w, a, { op: "move", dir: "up" });
    expect(a.y).toBe(52);
    // It flies: no falling between commands. Moving down twice hits the floor.
    expect(runAgentCommand(w, a, { op: "move", dir: "down" }).ok).toBe(true);
    expect(runAgentCommand(w, a, { op: "move", dir: "down" })).toMatchObject({ ok: false, message: "Blocked" });
    w.setBlock(3, 51, -1, STONE);
    expect(runAgentCommand(w, a, { op: "move", dir: "forward" }).ok).toBe(false);
    expect(a.x).toBe(2);
  });

  it("places from its own inventory and destroys into it; detect and inspect report the block", () => {
    const w = flat();
    const a = createAgent(0, 51, 0, 2);
    expect(runAgentCommand(w, a, { op: "place", dir: "forward" })).toMatchObject({ ok: false });
    giveAgent(a, PLANKS, 2);
    expect(runAgentCommand(w, a, { op: "place", dir: "forward" }).ok).toBe(true);
    expect(w.getBlock(0, 51, -1)).toBe(PLANKS);
    expect(a.slots[0]).toEqual({ id: PLANKS, count: 1 });
    expect(runAgentCommand(w, a, { op: "detect", dir: "forward" }).value).toBe(true);
    expect(runAgentCommand(w, a, { op: "inspect", dir: "forward" }).value).toBe("oak_planks");
    expect(runAgentCommand(w, a, { op: "place", dir: "forward" }).ok).toBe(false); // occupied
    expect(runAgentCommand(w, a, { op: "destroy", dir: "down" }).ok).toBe(true); // stone below -> cobblestone
    expect(w.getBlock(0, 50, 0)).toBe(AIR);
    expect(a.slots[1]).toEqual({ id: blockId("cobblestone"), count: 1 });
    expect(runAgentCommand(w, a, { op: "detect", dir: "down" }).value).toBe(false);
    expect(runAgentCommand(w, a, { op: "destroy", dir: "up" }).ok).toBe(false);
    expect(a.slots).toHaveLength(AGENT_SLOTS);
  });

  it("obeys Allow/Deny: no building or breaking above a Deny block", () => {
    const w = flat();
    w.setBlock(0, 49, -1, blockId("deny"));
    const a = createAgent(0, 51, 0, 2);
    giveAgent(a, PLANKS, 5);
    expect(runAgentCommand(w, a, { op: "place", dir: "forward" })).toMatchObject({ ok: false, message: "Building isn't allowed here (Deny)" });
    expect(w.getBlock(0, 51, -1)).toBe(AIR);
    expect(runAgentCommand(w, a, { op: "destroy", dir: "down" }).ok).toBe(true); // (0,50,0) isn't above the Deny block
  });

  it("selects slots, drops (gives) items to the player, and attacks through the game hook", () => {
    const w = flat();
    const a = createAgent(0, 51, 0, 2);
    giveAgent(a, PLANKS, 3);
    giveAgent(a, itemId("stick"), 1);
    expect(runAgentCommand(w, a, { op: "select", slot: 1 }).ok).toBe(true);
    expect(runAgentCommand(w, a, { op: "place", dir: "forward" }).ok).toBe(false); // a stick isn't a block
    const player = new Inventory();
    expect(runAgentCommand(w, a, { op: "drop", slot: 0 }, { giveToPlayer: (s) => player.addStack(s) }).ok).toBe(true);
    expect(player.slots[0]).toEqual({ id: PLANKS, count: 3 });
    expect(a.slots[0]).toBeNull();
    const hits: number[][] = [];
    expect(runAgentCommand(w, a, { op: "attack", dir: "forward" }, { attack: (x, y, z) => (hits.push([x, y, z]), true) }).ok).toBe(true);
    expect(hits).toEqual([[0, 51, -1]]);
    expect(runAgentCommand(w, a, { op: "select", slot: 27 }).ok).toBe(false);
  });

  it("/agent and /code chat commands parse", () => {
    expect(parseCommand("/agent tp")).toEqual({ type: "agent", action: "tp" });
    expect(parseCommand("/code Build")).toEqual({ type: "code", command: "build" });
  });
});

describe("Code Builder interpreter", () => {
  const program = (blocks: CodeProgram["blocks"]): CodeProgram => ({ name: "p", trigger: { type: "run" }, blocks });
  const place: AgentCommand = { op: "place", dir: "forward" };
  const fwd: AgentCommand = { op: "move", dir: "forward" };

  it("runs commands in order and expands repeat loops (nested too)", () => {
    const r = new ProgramRunner(program([
      { type: "repeat", times: 2, body: [{ type: "command", cmd: place }, { type: "repeat", times: 2, body: [{ type: "command", cmd: fwd }] }] },
      { type: "command", cmd: { op: "turn", side: "left" } },
    ]));
    const ops: string[] = [];
    for (let c = r.next(); c; c = r.next()) ops.push(c.op);
    expect(ops).toEqual(["place", "move", "move", "place", "move", "move", "turn"]);
    expect(r.done).toBe(true);
    expect(r.error).toBeNull();
  });

  it("stops at the step limit with an error, and Stop interrupts", () => {
    const r = new ProgramRunner(program([{ type: "repeat", times: 100, body: [{ type: "repeat", times: 100, body: [{ type: "command", cmd: fwd }] }] }]), 50);
    let n = 0;
    while (r.next()) n++;
    expect(n).toBe(50);
    expect(r.error).toMatch(/more than 50 steps/);
    const s = new ProgramRunner(program([{ type: "repeat", times: 10, body: [{ type: "command", cmd: fwd }] }]));
    s.next();
    s.stop();
    expect(s.next()).toBeNull();
    expect(s.done).toBe(true);
  });

  it("repeat 4 [place forward; move forward] builds a line of 4 blocks in the world", () => {
    const w = flat();
    const a = createAgent(0, 51, 0, 2);
    giveAgent(a, PLANKS, 10);
    const r = new ProgramRunner(program([{ type: "repeat", times: 4, body: [{ type: "command", cmd: { op: "place", dir: "down" } }, { type: "command", cmd: fwd }] }]));
    // Place below needs air below: lift the Agent first.
    runAgentCommand(w, a, { op: "move", dir: "up" });
    for (let c = r.next(); c; c = r.next()) runAgentCommand(w, a, c);
    expect([0, -1, -2, -3].map((z) => w.getBlock(0, 51, z))).toEqual([PLANKS, PLANKS, PLANKS, PLANKS]);
    expect([a.x, a.y, a.z]).toEqual([0, 52, -4]);
  });

  it("validates loaded programs, and the Agent and programs survive saving", () => {
    expect(validateProgram(program([{ type: "repeat", times: 1000, body: [] }]))).toEqual(["repeat must be 0-100"]);
    const a = createAgent(1, 51, 2, 3);
    giveAgent(a, PLANKS, 7);
    const programs: CodeProgram[] = [{ name: "Wall", trigger: { type: "chat", command: "wall" }, blocks: [{ type: "command", cmd: place }] }];
    const save = parseSave(serializeSave({
      name: "w", seed: 1, mode: "creative", timeOfDay: 0.3,
      player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false },
      inventory: new Inventory().toJSON(), edits: [], agent: a, programs,
    }));
    expect(save.agent).toEqual(a);
    expect(save.programs).toEqual(programs);
  });
});
