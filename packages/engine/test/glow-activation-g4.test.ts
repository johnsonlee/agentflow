import { describe, expect, it } from "vitest";
import { parseSave } from "../src/persistence/save";
import { stackId } from "../src/catalog/items";
const badGlow = () => ({ id: stackId("red_glow_stick"), count: 1, glow: { state: "expired" } });
const rawSave = (): Record<string, any> => ({ version: 1, name: "G4 raw envelope", seed: 1, mode: "survival", timeOfDay: .2,
  player: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0, flying: false }, edits: [], inventory: { slots: new Array(36).fill(null), selected: 0 } });

describe("G4 known raw ownership container shape before sanitation", () => {
  it.each(["pending", "bag", "agent", "furnaces", "drops", "mobs", "mobLoot", "inventoryEnvelope", "equipment", "agentEnvelope"])("diagnoses malformed %s container and retains exact raw payload", kind => {
    const raw = rawSave(), hidden = { "0": badGlow() }; let path = "";
    if (kind === "pending") { raw.inventoryPending = hidden; path = "inventoryPending"; }
    if (kind === "bag") { raw.inventory.slots = hidden; path = "inventory.slots"; }
    if (kind === "agent") { raw.agent = { x: 0, y: 32, z: 0, facing: 0, selected: 0, slots: hidden }; path = "agent.slots"; }
    if (kind === "furnaces") { raw.furnaces = hidden; path = "furnaces"; }
    if (kind === "drops") { raw.worldDrops = { nextKey: 2, records: hidden }; path = "worldDrops.records"; }
    if (kind === "mobs") { raw.mobs = { nextId: 2, records: hidden }; path = "mobs.records"; }
    if (kind === "mobLoot") { raw.mobs = { nextId: 2, records: [{ pendingLoot: hidden }] }; path = "mobs.records[0].pendingLoot"; }
    if (kind === "inventoryEnvelope") { raw.inventory = [hidden]; path = "inventory"; }
    if (kind === "equipment") { raw.inventory.equipment = [badGlow()]; path = "inventory.equipment"; }
    if (kind === "agentEnvelope") { raw.agent = [hidden]; path = "agent"; }
    const original = JSON.stringify(raw); const parsed = parseSave(original);
    expect(parsed.glowOwnershipIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path, reason: expect.stringContaining("invalid owned-item") })]));
    expect(JSON.stringify(raw)).toBe(original); expect(JSON.parse(original)).toEqual(raw);
    if (kind === "pending") expect(parsed.inventoryPending).toEqual([]); // Repair occurred only after a diagnostic was derived.
  });
  it("diagnoses a malformed owned container even without glow metadata, as a data envelope issue", () => {
    const raw = rawSave(); raw.inventoryPending = { "0": { id: stackId("stone"), count: 1 } };
    expect(parseSave(JSON.stringify(raw)).glowOwnershipIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "inventoryPending", reason: "invalid owned-item container; expected array" }),
    ]));
  });
  it("does not add diagnostics for absent optional containers or valid empty arrays", () => {
    const raw = rawSave(); expect(parseSave(JSON.stringify(raw)).glowOwnershipIssues).toBeUndefined();
    raw.inventoryPending = []; raw.furnaces = []; raw.worldDrops = { nextKey: 1, records: [] }; raw.mobs = { nextId: 1, records: [] };
    expect(parseSave(JSON.stringify(raw)).glowOwnershipIssues).toBeUndefined();
  });
});
