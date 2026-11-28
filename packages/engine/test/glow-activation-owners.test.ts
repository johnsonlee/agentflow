import { describe, expect, it } from "vitest";
import {
  AIR, ITEMS, BLOCKS, RECIPES, allAtlasTextureNames, Inventory, PlayerDeathTransfer, World, WorldDrops, blockId, cloneStack, craftOnce, createAgent,
  freshStack, giveAgent, createFurnace, setFurnaceInput, furnaceContents, parseSave, placeBlock, runAgentCommand, sanitizeAgent, sanitizeFurnaces,
  sanitizeWorldDrops, serializeSave, stackId, validatePlayerDeathOwnership, type ItemStack, type PlayerDeathState,
} from "../src/index";
const red = stackId("red_glow_stick"), green = stackId("glow_stick");
const active = (id = red): ItemStack => ({ id, count: 1, glow: { state: "active" } });
const inactive = (count = 1, id = red): ItemStack => ({ id, count, glow: { state: "inactive" } });
const floor = { getLoadedBlock: (_x: number, y: number, _z: number) => y === 0 ? blockId("stone") : AIR };
const at = { x: .5, y: 1, z: .5 };
const saveBase = { name: "Glow owner conservation", seed: 1, mode: "survival" as const, timeOfDay: .2,
  player: { position: at, yaw: 0, pitch: 0, flying: false }, edits: [] };

describe("untimed glow state across actual engine owners", () => {
  it("Agent keeps active singletons separate, rejects invalid bulk and preserves refused source metadata", () => {
    const agent = createAgent(0, 1, 0); const unit = active();
    expect(giveAgent(agent, unit)).toBe(0); expect(giveAgent(agent, active())).toBe(0);
    expect(agent.slots.filter(Boolean)).toEqual([active(), active()]);
    const before = structuredClone(agent); expect(giveAgent(agent, { ...active(), count: 2 })).toBe(2); expect(agent).toEqual(before);
    unit.glow!.state = "inactive"; expect(agent.slots[0]).toEqual(active());
    agent.slots.fill({ id: stackId("stone"), count: 64 }); const full = structuredClone(agent);
    expect(giveAgent(agent, active())).toBe(1); expect(agent).toEqual(full);
  });
  it("WorldDrops validates ORIGINAL active bulk before count1 normalization and never merges active units", () => {
    const drops = new WorldDrops(floor);
    expect(drops.planSpawnBatch([{ ...active(), count: 2 }], at)).toBeNull(); expect(drops.records).toEqual([]);
    expect(drops.spawnBatch([active(), active()], at)).toBe(true); drops.update(.1);
    expect(drops.records.map(record => record.stack)).toEqual([active(), active()]);
    const corrupt = drops.toJSON(); corrupt.records[0].stack.count = 2;
    expect(sanitizeWorldDrops(corrupt).invalid).toBeGreaterThan(0);
    const bulk = new WorldDrops(floor); expect(bulk.spawnBatch([inactive(130)], at)).toBe(true);
    expect(bulk.records.map(record => record.stack)).toEqual([inactive(64), inactive(64), inactive(2)]);
  });
  it("ground refusal/partial inactive pickup and accepted active pickup conserve exact metadata", () => {
    const drops = new WorldDrops(floor); drops.spawnBatch([inactive(3), active()], at); drops.update(.6);
    const before = drops.toJSON(); expect(drops.tryPickup(at, stack => { if (stack.glow) stack.glow.state = "inactive"; return stack.count; })).toBe(0); expect(drops.toJSON()).toEqual(before);
    expect(drops.tryPickup(at, stack => stack.glow?.state === "inactive" ? stack.count - 1 : stack.count)).toBe(1);
    expect(drops.records.map(record => record.stack)).toEqual([inactive(2), active()]);
    const bag = new Inventory(); expect(drops.tryPickup(at, stack => bag.addStack(stack))).toBe(3);
    expect(bag.slots.filter(Boolean)).toEqual([inactive(2), active()]); expect(drops.records).toEqual([]);
  });
  it("Agent drop reserves before debit and carries detached state on refusal, commit and collect", () => {
    const agent = createAgent(0, 1, 0), world = new World(1), drops = new WorldDrops(floor);
    giveAgent(agent, active()); const before = structuredClone(agent);
    const refused = runAgentCommand(world, agent, { op: "drop", slot: 0 }, { worldDrop: stacks => { stacks[0].glow!.state = "inactive"; return null; } });
    expect(refused.ok).toBe(false); expect(agent).toEqual(before);
    expect(runAgentCommand(world, agent, { op: "drop", slot: 0 }, { worldDrop: drops.planSpawnBatch.bind(drops) }).ok).toBe(true);
    expect(agent.slots[0]).toBeNull(); expect(drops.records[0].stack).toEqual(active());
    drops.update(.6); const position = drops.records[0].position;
    expect(drops.tryPickup(position, stack => giveAgent(agent, stack))).toBe(1); expect(agent.slots[0]).toEqual(active()); expect(drops.records).toEqual([]);
  });
  it("death refusal, cold pending restore, accepted retry and completed replay preserve active owners", () => {
    const bag = new Inventory(); bag.slots[0] = active(); const pending = [active()];
    const death: PlayerDeathState = { phase: "pending", position: at, keepInventory: false };
    const transfer = new PlayerDeathTransfer(), before = bag.toJSON(), pendingBefore = structuredClone(pending);
    expect(validatePlayerDeathOwnership(before, pending)).toBe(true);
    expect(transfer.tryTransfer(bag, pending, death, () => null, () => { pending.length = 0; })).toBe(false);
    expect(bag.toJSON()).toEqual(before); expect(pending).toEqual(pendingBefore);
    const parsed = parseSave(serializeSave({ ...saveBase, inventory: bag.toJSON(), inventoryPending: pending, playerState: { health: 0, death } }));
    expect(parsed.playerStateOwnershipInvalid).toBeUndefined(); const loaded = Inventory.fromJSON(parsed.inventory), screen = parsed.inventoryPending!;
    const drops = new WorldDrops(floor); expect(transfer.tryTransfer(loaded, screen, death, drops.planSpawnBatch.bind(drops), () => { screen.length = 0; })).toBe(true);
    expect(drops.records.map(record => record.stack)).toEqual([active(), active()]);
    expect(transfer.tryTransfer(loaded, screen, death, () => { throw Error("replay"); }, () => {})).toBe(true);
    expect(drops.records).toHaveLength(2);
    const kept = new Inventory(); kept.slots[0] = active(); const keep: PlayerDeathState = { phase: "pending", position: at, keepInventory: true };
    expect(new PlayerDeathTransfer().tryTransfer(kept, [], keep, () => { throw Error("keepInventory reserves no drop"); }, () => {})).toBe(true); expect(kept.slots[0]).toEqual(active());
  });
  it("explicit stateful green placement refuses for player/Agent while metadata-less green remains compatible", () => {
    const world = new World(1), bag = new Inventory(); world.setBlock(1, 0, 0, blockId("stone")); world.setBlock(1, 1, 0, AIR); world.setBlock(1, 2, 0, AIR);
    for (const unit of [active(green), inactive(1, green)]) {
      bag.slots[0] = cloneStack(unit);
      expect(placeBlock(world, bag, "survival", 1, 1, 0, { x: 5, y: 1, z: 5 })).toBe(false); expect(bag.slots[0]).toEqual(unit); expect(world.getBlock(1, 1, 0)).toBe(AIR);
      const agent = createAgent(0, 1, 0, 3); agent.slots[0] = cloneStack(unit);
      expect(runAgentCommand(world, agent, { op: "place", dir: "forward" }).ok).toBe(false); expect(agent.slots[0]).toEqual(unit); expect(world.getBlock(1, 1, 0)).toBe(AIR);
    }
    bag.slots[0] = { id: green, count: 1 }; expect(placeBlock(world, bag, "survival", 1, 1, 0, { x: 5, y: 1, z: 5 })).toBe(true);
    expect(world.getBlock(1, 1, 0)).toBe(blockId("placed_glow_stick")); expect(bag.slots[0]).toBeNull();
  });
  it("fresh grants and actual recipes create inactive state without changing identity/count or legacy transfers", () => {
    const bag = new Inventory(); expect(bag.add(red, 2)).toBe(0); expect(bag.slots[0]).toEqual(inactive(2));
    const agent = createAgent(0, 1, 0); expect(giveAgent(agent, red, 2)).toBe(0); expect(agent.slots[0]).toEqual(inactive(2));
    const grid = ["polyethylene", "hydrogen_peroxide", "polyethylene", "polyethylene", "red_dye", "polyethylene", "polyethylene", "luminol", "polyethylene"].map(name => ({ id: stackId(name), count: 1 }));
    expect(craftOnce(grid, 3)).toEqual(freshStack(red)); expect(grid.every(cell => cell === null)).toBe(true);
    const legacy = { id: green, count: 64 }; const target = new Inventory(); target.addStack(legacy); expect(target.slots[0]).toEqual(legacy);
  });
  it("cold valid active owners survive bag/pending/Agent/furnace/WorldDrops without aliasing or invented clocks", () => {
    const bag = new Inventory(); bag.slots[0] = active(); const agent = createAgent(0, 1, 0); giveAgent(agent, active());
    const drops = new WorldDrops(floor); drops.spawnBatch([active()], at);
    const furnaces = [{ x: 0, y: 1, z: 0, state: { input: active(), fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 } }];
    const parsed = parseSave(serializeSave({ ...saveBase, inventory: bag.toJSON(), inventoryPending: [inactive(2)], agent, furnaces, worldDrops: drops.toJSON() }));
    expect(parsed.glowOwnershipIssues).toBeUndefined(); expect(Inventory.fromJSON(parsed.inventory).slots[0]).toEqual(active());
    expect(parsed.inventoryPending).toEqual([inactive(2)]); expect(sanitizeAgent(parsed.agent)!.slots[0]).toEqual(active());
    expect(sanitizeFurnaces(parsed.furnaces).furnaces[0].state.input).toEqual(active()); expect(new WorldDrops(floor, parsed.worldDrops).records[0].stack).toEqual(active());
  });
  it("Creative pick separates fresh/active/legacy identities and furnace refusal preserves both owners", () => {
    const bag = new Inventory(); bag.slots[0] = active(); bag.selected = 1;
    bag.pick(red); expect(bag.slots[0]).toEqual(active()); expect(bag.slots[1]).toEqual(inactive());
    bag.pick(green, true); expect(bag.slots[1]).toEqual({ id: green, count: 1 });
    bag.selected = 2; bag.pick(green); expect(bag.slots[2]).toEqual(inactive(1, green));
    const furnace = createFurnace(), original = active(); furnace.input = original;
    const invalid = { ...active(), count: 2 }; expect(setFurnaceInput(furnace, invalid)).toBe(invalid); expect(furnace.input).toBe(original);
    const incoming = inactive(2); expect(setFurnaceInput(furnace, incoming)).toBe(original); expect(furnace.input).toBe(incoming);
    const contents = furnaceContents(furnace); contents[0].glow!.state = "active"; expect(furnace.input).toEqual(inactive(2));
  });

  it("retains existing Glow identities with the append-only Spider Eye catalog sizes", () => {
    expect([ITEMS.length, BLOCKS.length, RECIPES.length, allAtlasTextureNames().length]).toEqual([606,361,221,936]);
    expect(stackId("glow_stick")).toBe(426); expect(stackId("red_glow_stick")).toBe(793);
  });

});
