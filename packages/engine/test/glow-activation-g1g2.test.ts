import { describe, expect, it } from "vitest";
import { Inventory, type ItemStack } from "../src/ownership/inventory";
import { stackId } from "../src/catalog/items";
import { parseSave, serializeSave } from "../src/persistence/save";
import { sanitizeAgent, sanitizeFurnaces, sanitizeInventoryPending, sanitizeStack } from "../src/persistence/savecheck";
const active = (): ItemStack => ({ id: stackId("red_glow_stick"), count: 1, glow: { state: "active" } });
const bad = () => ({ id: stackId("red_glow_stick"), count: 1, glow: { state: "expired" } });
const rawSave = () => ({ version: 1, name: "Raw glow ownership", seed: 1, mode: "survival", timeOfDay: .2,
  player: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0, flying: false }, edits: [], inventory: { slots: new Array(36).fill(null), selected: 0 } });
const agent = (stack: unknown) => ({ x: 0, y: 32, z: 0, facing: 0, selected: 0, slots: [stack] });
const furnace = (key: string, stack: unknown) => ({ x: 0, y: 32, z: 0, state: { input: null, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0, [key]: stack } });

describe("G1/G2 proposed persistence and public setter boundary", () => {
  it("preserves detached valid glow across stack, bag, pending, Agent and furnace loaders", () => {
    const stack = active(); expect(sanitizeStack(stack)).toEqual(stack);
    const bag = new Inventory(); bag.slots[0] = stack;
    expect(Inventory.fromJSON(bag.toJSON()).slots[0]).toEqual(stack);
    expect(sanitizeInventoryPending([stack])).toEqual([stack]);
    expect(sanitizeAgent(agent(stack))!.slots[0]).toEqual(stack);
    for (const key of ["input", "fuel", "output"] as const) expect(sanitizeFurnaces([furnace(key, stack)]).furnaces[0].state[key]).toEqual(stack);
    const clean = sanitizeStack(stack)!; clean.glow!.state = "inactive"; expect(stack.glow!.state).toBe("active");
    const old = { id: stack.id, count: 64 }; expect(sanitizeStack(old)).toEqual(old);
    expect(Object.prototype.hasOwnProperty.call(sanitizeStack(old), "glow")).toBe(false);
  });
  it("rejects malformed PRESENT glow rather than silently resetting it", () => {
    for (const stack of [bad(), { ...active(), count: 2 }, { ...active(), glow: null }, { ...active(), glow: undefined }, { ...active(), glow: { state: "active", timer: 300 } }, { ...active(), id: stackId("stone") }]) expect(sanitizeStack(stack)).toBeNull();
  });
  it.each(["inventory", "pending", "agent", "input", "fuel", "output", "drops", "mobLoot", "equipment"])("diagnoses malformed raw %s owner BEFORE sanitization and never trusts serialized diagnostic", owner => {
    const raw: Record<string, any> = rawSave(); const stack = bad(); let path = "";
    if (owner === "inventory") { raw.inventory.slots[0] = stack; path = "inventory.slots[0]"; }
    if (owner === "pending") { raw.inventoryPending = [stack]; path = "inventoryPending[0]"; }
    if (owner === "agent") { raw.agent = agent(stack); path = "agent.slots[0]"; }
    if (["input", "fuel", "output"].includes(owner)) { raw.furnaces = [furnace(owner, stack)]; path = `furnaces[0].state.${owner}`; }
    if (owner === "drops") { raw.worldDrops = { nextKey: 2, records: [{ stack }] }; path = "worldDrops.records[0].stack"; }
    if (owner === "mobLoot") { raw.mobs = { nextId: 2, records: [{ pendingLoot: [stack] }] }; path = "mobs.records[0].pendingLoot[0]"; }
    if (owner === "equipment") { raw.inventory.equipment = { head: stack }; path = "inventory.equipment.head"; }
    raw.glowOwnershipIssues = []; const original = JSON.stringify(raw); const parsed = parseSave(original);
    expect(parsed.glowOwnershipIssues).toEqual(expect.arrayContaining([{ path, reason: "invalid glow shape" }]));
    expect(JSON.stringify(raw)).toBe(original);
    if (owner === "pending") expect(parsed.inventoryPending).toEqual([]); // Diagnostic survived the existing repair path.
    const exported = JSON.parse(serializeSave(parsed)); expect(exported).not.toHaveProperty("glowOwnershipIssues");
  });
  it("detects valid glow that a truncated or rejected owner envelope would otherwise lose", () => {
    const raw: Record<string, any> = rawSave(); raw.inventory.slots[36] = active(); raw.inventoryPending = new Array(10).fill(null).concat(active());
    raw.agent = { ...agent(active()), x: "invalid" }; raw.furnaces = [{ ...furnace("input", active()), y: -1 }];
    raw.inventory.equipment = { head: active() }; raw.mobs = { records: [{ pendingLoot: [active()] }] };
    const paths = parseSave(JSON.stringify(raw)).glowOwnershipIssues!.map(issue => issue.path);
    for (const path of ["inventory.slots[36]", "inventoryPending[10]", "agent.slots[0]", "furnaces[0].state.input", "inventory.equipment.head", "mobs.records[0].pendingLoot[0]"]) expect(paths).toContain(path);
  });
  it("retains old metadata-less saves without creating a diagnostic or new state", () => {
    const raw: Record<string, any> = rawSave(); raw.inventory.slots[0] = { id: stackId("glow_stick"), count: 64 };
    const parsed = parseSave(JSON.stringify(raw)); expect(parsed.glowOwnershipIssues).toBeUndefined();
    expect(Inventory.fromJSON(parsed.inventory).slots[0]).toEqual(raw.inventory.slots[0]);
  });
  it("public setSlot refuses activecount2 without replacing owner, and successful set clones state", () => {
    const bag = new Inventory(); const previous = { id: stackId("stone"), count: 3 }; bag.slots[0] = previous;
    const cursor = { ...active(), count: 2 }; expect(bag.setSlot(0, cursor)).toBe(false);
    expect(bag.slots[0]).toBe(previous); expect(cursor.count).toBe(2); // Caller must retain cursor/debit only after true.
    expect(bag.setSlot(-1, active())).toBe(false); expect(bag.setSlot(36, active())).toBe(false);
    const valid = active(); expect(bag.setSlot(0, valid)).toBe(true); valid.glow!.state = "inactive";
    expect(bag.slots[0]).toEqual(active()); expect(bag.setSlot(0, null)).toBe(true); expect(bag.slots[0]).toBeNull();
  });
});
