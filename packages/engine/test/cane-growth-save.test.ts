import { expect, it } from "vitest";
import { Inventory } from "../src/ownership/inventory";
import { parseSave, serializeSave, type SaveData } from "../src/persistence/save";
import { captureDimensionWorld, replaceDimensionWorld } from "../src/persistence/dimension-world";
import { emptyCodeWorkspace } from "../src/persistence/code-workspace";
import type { CaneGrowthState } from "../src/persistence/cane-growth-state";
const clock = (tick: number): CaneGrowthState => ({ version: 1, tick, accumulator: .25, cursor: 3 });
function saved(): SaveData { return { version: 1, name: "Cane clocks", seed: 7, generatorVersion: 3, mode: "survival", timeOfDay: .25,
  player: { position: { x: .5, y: 80, z: .5 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [], programs: [] }; }
it("keeps absent legacy growth state absent and ignores caller-supplied derived flags", () => {
  const raw = JSON.stringify({ ...saved(), caneGrowthInvalid: true });
  expect(parseSave(raw).caneGrowth).toBeUndefined(); expect(parseSave(raw).caneGrowthInvalid).toBeUndefined();
  expect(JSON.parse(serializeSave(saved()))).not.toHaveProperty("caneGrowth");
});
it("round trips detached growth clocks without changing Agent/program/text/item owners", () => {
  const before = { ...saved(), caneGrowth: clock(53), codeWorkspace: emptyCodeWorkspace() };
  before.codeWorkspace.drafts.python.source = "inert invalid text";
  const after = parseSave(serializeSave(before)); expect(after.caneGrowth).toEqual(clock(53));
  expect(after.inventory).toEqual(before.inventory); expect(after.programs).toEqual(before.programs); expect(after.codeWorkspace).toEqual(before.codeWorkspace);
  after.caneGrowth!.tick = 80; expect(before.caneGrowth.tick).toBe(53);
  expect(JSON.parse(serializeSave(before))).not.toHaveProperty("caneGrowthInvalid");
});
it.each([null, { ...clock(3), version: 2 }, { ...clock(3), tick: -1 }, { ...clock(3), cursor: .5 }, { ...clock(3), foreign: 1 }])("diagnoses present malformed growth before dropping it, without trusting false flags: %j", bad => {
  const raw = { ...saved(), caneGrowth: bad, caneGrowthInvalid: false };
  const parsed = parseSave(JSON.stringify(raw)); expect(parsed.caneGrowthInvalid).toBe(true); expect(parsed.caneGrowth).toBeUndefined();
  expect(() => serializeSave(raw as unknown as SaveData)).toThrow(/Cane growth/);
  expect(() => serializeSave(parsed)).toThrow(/Cane growth/);
});
it("both partition paths reject diagnosed or unvalidated malformed growth, including target envelopes", () => {
  const good = { ...saved(), caneGrowth: clock(1) }, target = captureDimensionWorld({ ...saved(), caneGrowth: clock(2) });
  expect(() => captureDimensionWorld({ ...good, caneGrowthInvalid: true })).toThrow(/diagnostic/);
  expect(() => replaceDimensionWorld({ ...good, caneGrowthInvalid: true }, target)).toThrow(/diagnostic/);
  expect(() => captureDimensionWorld({ ...good, caneGrowth: { ...clock(1), tick: -1 } })).toThrow(/Cane growth/);
  expect(() => replaceDimensionWorld({ ...good, caneGrowth: { ...clock(1), tick: -1 } }, target)).toThrow(/Cane growth/);
  expect(() => replaceDimensionWorld(good, { ...target, caneGrowth: { ...clock(2), version: 2 } } as unknown as typeof target)).toThrow(/Cane growth/);
});
it("growth clocks belong to each world while source drafts remain global, and target absence clears old clocks", () => {
  const codeWorkspace = emptyCodeWorkspace(); codeWorkspace.drafts.javascript.source = "retained source";
  const source = { ...saved(), caneGrowth: clock(53), codeWorkspace };
  const target = captureDimensionWorld({ ...saved(), seed: 9, generatorVersion: 1, caneGrowth: clock(77) });
  const merged = replaceDimensionWorld(source, target); expect(merged.caneGrowth).toEqual(clock(77)); expect(merged.codeWorkspace).toEqual(codeWorkspace);
  expect(captureDimensionWorld(source)).not.toHaveProperty("codeWorkspace"); target.caneGrowth!.tick = 88; expect(merged.caneGrowth!.tick).toBe(77);
  expect(replaceDimensionWorld(source, captureDimensionWorld(saved())).caneGrowth).toBeUndefined();
});
it("retains distinct active and inactive clocks, refusing malformed inactive data instead of repairing it", () => {
  const active = { ...saved(), caneGrowth: clock(53) };
  const inactive = captureDimensionWorld({ ...saved(), seed: 9, generatorVersion: 1, caneGrowth: clock(77) });
  const combined = { ...active, dimensions: { version: 1 as const, active: "overworld" as const, inactive: { nether: inactive }, links: [] } };
  const restored = parseSave(serializeSave(combined)); expect(restored.caneGrowth).toEqual(clock(53)); expect(restored.dimensions!.inactive.nether!.caneGrowth).toEqual(clock(77));
  const bad = JSON.parse(JSON.stringify(combined)); bad.dimensions.inactive.nether.caneGrowth.tick = -1;
  const rejected = parseSave(JSON.stringify(bad)); expect(rejected.dimensionsInvalid).toBe(true);
  expect(rejected.dimensionOwnershipIssues!.some(x => x.path.includes("caneGrowth"))).toBe(true);
  expect(() => serializeSave(bad)).toThrow(/dimension/);
});
