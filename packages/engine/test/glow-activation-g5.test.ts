import { describe, expect, it } from "vitest";
import { parseSave } from "../src/persistence/save";
import { sanitizeFurnaces } from "../src/persistence/savecheck";
import { stackId } from "../src/catalog/items";
const active = () => ({ id: stackId("red_glow_stick"), count: 1, glow: { state: "active" } });
const furnace = (x: number, stack: unknown) => ({ x, y: 32, z: 0, state: { input: stack, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 } });
const rawSave = (furnaces: ReturnType<typeof furnace>[]) => ({ version: 1, name: "G5 furnace owners", seed: 1, mode: "survival", timeOfDay: .2,
  player: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0, flying: false }, edits: [], inventory: { slots: new Array(36).fill(null), selected: 0 }, furnaces });

describe("G5 duplicate raw furnace coordinate ownership", () => {
  it.each([false, true])("diagnoses duplicate before load when second entry active=%s, retaining all raw owners", secondActive => {
    const raw = rawSave([furnace(0, active()), furnace(0, secondActive ? active() : null)]);
    const original = JSON.stringify(raw), parsed = parseSave(original);
    expect(parsed.glowOwnershipIssues).toEqual(expect.arrayContaining([
      { path: "furnaces[1]", reason: "duplicate owned-item furnace coordinates; first owner at furnaces[0]" },
    ]));
    expect(JSON.stringify(raw)).toBe(original); expect(parsed.furnaces).toEqual(raw.furnaces);
    // Existing loader/Map assignment alone still loses owners. The future Game recovery gate MUST
    // consume the preceding raw diagnostic before exposing repaired ownership or overwriting raw save.
    const loaded = sanitizeFurnaces(parsed.furnaces).furnaces;
    expect(loaded).toHaveLength(2);
    const currentMap = new Map(loaded.map(record => [`${record.x},${record.y},${record.z}`, record.state]));
    expect(currentMap.size).toBe(1);
    expect([...currentMap.values()].filter(state => state.input?.glow?.state === "active")).toHaveLength(secondActive ? 1 : 0);
    expect(raw.furnaces.filter(record => record.state.input)).toHaveLength(secondActive ? 2 : 1);
  });
  it("preserves valid unique furnace coordinates and both active owners without diagnostic", () => {
    const raw = rawSave([furnace(0, active()), furnace(1, active())]), original = JSON.stringify(raw);
    const parsed = parseSave(original); expect(parsed.glowOwnershipIssues).toBeUndefined();
    const loaded = sanitizeFurnaces(parsed.furnaces).furnaces;
    const map = new Map(loaded.map(record => [`${record.x},${record.y},${record.z}`, record.state]));
    expect(map.size).toBe(2); expect([...map.values()].filter(state => state.input?.glow?.state === "active")).toHaveLength(2);
    expect(JSON.stringify(raw)).toBe(original);
  });
});
