import { expect, it, vi } from "vitest";
import {
  World, createAgent, blockId, stackId, inspectLoadedAgentBlock, runAgentCommand,
  ProgramRunner, startProgram, validateProgram, loadPrograms, parseSave, serializeSave,
  type CodeProgram, type CodeBlock, type SaveData, Inventory,
} from "../src";

const named = (name = "diamond_ore") => ({ type: "block-is" as const, name });
const turn = (side: "left" | "right"): CodeBlock => ({ type: "command", cmd: { op: "turn", side } });
const program = (blocks: CodeBlock[]): CodeProgram => ({ name: "Material decision", trigger: { type: "run" }, blocks });
const branch = (name = "diamond_ore"): CodeBlock => ({ type: "if", dir: "up", condition: named(name), then: [turn("right")], else: [turn("left")] });
function fixture() {
  const world = new World(7, 3), agent = createAgent(0, 80, 0, 2);
  world.setBlock(0, 81, 0, 0);
  return { world, agent, inspect: (dir: Parameters<typeof inspectLoadedAgentBlock>[2]) => inspectLoadedAgentBlock(world, agent, dir) };
}

it("runs the true material branch after the preceding real placement and conserves finite cargo", () => {
  const { world, agent, inspect } = fixture();
  agent.slots[0] = { id: stackId("stone"), count: 2 };
  const p = program([{ type: "command", cmd: { op: "place", dir: "up" } }, branch("stone")]);
  const runner = new ProgramRunner(p, 1000, () => { throw Error("Named conditions must not use solid detect"); }, inspect);
  const placed = runner.next()!;
  expect(runAgentCommand(world, agent, placed).ok).toBe(true);
  expect(runner.next()).toEqual({ op: "turn", side: "right" });
  expect(runner.next()).toBeNull();
  expect(agent.slots[0]).toEqual({ id: stackId("stone"), count: 1 });
  expect(world.getBlock(0, 81, 0)).toBe(blockId("stone"));
});
it("takes else for a different loaded block and retains the exact physical-state identity", () => {
  const { world, inspect } = fixture(); world.setBlock(0, 81, 0, blockId("hay_block_x"));
  expect(new ProgramRunner(program([branch("hay_block")]), 1000, undefined, inspect).next()).toEqual({ op: "turn", side: "left" });
  expect(new ProgramRunner(program([branch("hay_block_x")]), 1000, undefined, inspect).next()).toEqual({ op: "turn", side: "right" });
});
it("repeat until rechecks the changed real world after one committed placement", () => {
  const { world, agent, inspect } = fixture(); agent.slots[0] = { id: stackId("stone"), count: 2 };
  const runner = new ProgramRunner(program([{ type: "until", dir: "up", condition: named("stone"), body: [{ type: "command", cmd: { op: "place", dir: "up" } }] }, turn("right")]), 1000, undefined, inspect);
  expect(runAgentCommand(world, agent, runner.next()!).ok).toBe(true);
  expect(runner.next()).toEqual({ op: "turn", side: "right" }); expect(runner.next()).toBeNull();
  expect(agent.slots[0]?.count).toBe(1);
});
it("a false empty named until is bounded by the same 1000 work-step quota", () => {
  const inspect = vi.fn(() => "air"), runner = new ProgramRunner(program([{ type: "until", dir: "forward", condition: named(), body: [] }]), undefined, undefined, inspect);
  expect(runner.next()).toBeNull(); expect(runner.error).toBe("Stopped: more than 1000 steps");
  expect(runner.steps).toBe(1001); expect(inspect).toHaveBeenCalledTimes(1000);
});
it("Stop prevents even a predicate read and a missing or unloaded reader never runs else", () => {
  const inspect = vi.fn(() => "diamond_ore"), stopped = new ProgramRunner(program([branch()]), 1000, undefined, inspect);
  stopped.stop(); expect(stopped.next()).toBeNull(); expect(inspect).not.toHaveBeenCalled();
  for (const reader of [undefined, () => undefined]) {
    const r = new ProgramRunner(program([branch()]), 1000, () => true, reader);
    expect(r.next()).toBeNull(); expect(r.error).toContain("load the Agent's target");
  }
});
it("read-only inspection keeps unknown chunks and outside-world targets unknown without generating", () => {
  const world = new World(7, 3), agent = createAgent(0, 80, 0, 2), generate = vi.spyOn(world, "getChunk"), read = vi.spyOn(world, "getBlock");
  expect(inspectLoadedAgentBlock(world, agent, "forward")).toBeUndefined();
  agent.y = 95; expect(inspectLoadedAgentBlock(world, agent, "up")).toBeUndefined();
  agent.x = 30_000_000; expect(inspectLoadedAgentBlock(world, agent, "right")).toBeUndefined();
  expect(read).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(world.exportEdits()).toEqual([]);
});
it("loaded empty space is a real air identity and all facing-relative directions use current Agent pose", () => {
  const { world, agent } = fixture();
  expect(inspectLoadedAgentBlock(world, agent, "up")).toBe("air");
  world.setBlock(1, 80, 0, blockId("diamond_ore"));
  expect(inspectLoadedAgentBlock(world, agent, "right")).toBe("diamond_ore");
  agent.facing = 3; expect(inspectLoadedAgentBlock(world, agent, "forward")).toBe("diamond_ore");
});
it.each([undefined, null, {}, { type: "block-is", name: "missing" }, { type: "block-is", name: "diamond" }, { type: "block-is", name: 3 }, { type: "inspect", name: "stone" }, { type: "block-is", name: "stone", typo: true }])("rejects a malformed present condition without treating it as solid: %j", condition => {
  const raw = program([branch()]) as unknown as { blocks: Array<{ condition: unknown }> }; raw.blocks[0].condition = condition;
  expect(validateProgram(raw)).toContain("Invalid specific block condition"); expect(startProgram(raw)).toHaveProperty("error");
  expect(loadPrograms([raw]).programs).toEqual([]);
  const r = new ProgramRunner(raw as unknown as CodeProgram, 1000, () => true, () => "stone");
  expect(r.next()).toBeNull(); expect(r.error).toContain("invalid block condition");
});
it("condition accessors are refused without evaluating outer or name getters", () => {
  let reads = 0;
  for (const accessor of ["outer", "name"]) {
    const raw = program([branch()]);
    if (accessor === "outer") Object.defineProperty(raw.blocks[0], "condition", { get() { reads++; throw Error("getter"); } });
    else Object.defineProperty((raw.blocks[0] as Extract<CodeBlock, { type: "if" }>).condition!, "name", { get() { reads++; throw Error("getter"); } });
    expect(validateProgram(raw)).toContain("Invalid specific block condition");
  }
  expect(reads).toBe(0);
});
it("legacy if/until JSON remains byte-identical, uses only original detect callback and keeps nesting limits", () => {
  const legacy = program([{ type: "if", dir: "forward", then: [turn("left")], else: [turn("right")] }, { type: "until", dir: "up", body: [] }]);
  const original = JSON.stringify(legacy), inspect = vi.fn(() => { throw Error("legacy must not inspect"); }), detect = vi.fn(() => true);
  const loaded = loadPrograms(JSON.parse(`[${original}]`)); expect(loaded.errors).toEqual([]); expect(JSON.stringify(loaded.programs[0])).toBe(original);
  const runner = new ProgramRunner(legacy, 1000, detect, inspect); expect(runner.next()).toEqual({ op: "turn", side: "left" }); expect(runner.next()).toBeNull();
  expect(inspect).not.toHaveBeenCalled(); expect(detect).toHaveBeenCalledTimes(2);
  let nested: CodeBlock = branch(); for (let i = 0; i < 5; i++) nested = { type: "repeat", times: 1, body: [nested] };
  expect(validateProgram(program([nested])).some(e => e.includes("4 deep"))).toBe(true);
});
it("new named programs survive ordinary save parse/serialize without saving runtime state", () => {
  const p = program([branch()]), raw: SaveData = { version: 1, name: "Named code", seed: 7, generatorVersion: 3, mode: "survival", timeOfDay: .25, player: { position: { x: .5, y: 80, z: .5 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [], programs: [p] };
  const cold = parseSave(serializeSave(raw)); expect(loadPrograms(cold.programs)).toEqual({ programs: [p], errors: [] });
  expect(Object.keys(cold.programs![0]).sort()).toEqual(["blocks", "name", "trigger"]);
});
it("an entered legacy until retains its original direction while later editor changes stay outside that loop", () => {
  const block: Extract<CodeBlock, { type: "until" }> = { type: "until", dir: "forward", body: [turn("left")] };
  const detect = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true), r = new ProgramRunner(program([block]), 1000, detect);
  expect(r.next()).toEqual({ op: "turn", side: "left" }); block.dir = "up";
  expect(r.next()).toBeNull(); expect(detect.mock.calls.map(call => call[0])).toEqual(["forward", "forward"]);
});
