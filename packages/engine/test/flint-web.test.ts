import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Inventory, World, createHunger, blockId, freshStack, stackId, parseSave, createAgent } from "../src";
import { Game } from "../../../apps/web/src/application/game";
class Cell { click() {} remove() {} }
function game(world: World = new World(12345)) {
  const g = Object.assign(Object.create(Game.prototype), { statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] }), ownership = () => ({ busy: false, records: [], reconcileLoadedReferences: vi.fn(), validateCrossReferences: vi.fn() });
  Object.assign(g, { world, inventory: new Inventory(), hunger: createHunger(), playerStatus: {}, recoverySections: [], recoveryOriginal: null, drinkOwner: { elapsed: .7 }, leashes: ownership(), balloons: ownership(), paused: false, dead: false, stopped: false, mode: "survival", health: 20,
    body: { position: { x: .5, y: 32, z: .5 }, yaw: 0, pitch: 0, velocity: { x: 0, y: 0, z: 0 } }, hud: { message: vi.fn(), flashDamage: vi.fn() }, keyboard: { reset: vi.fn() }, screenOpen: () => false,
    markLeashRecovery: vi.fn(), markBalloonRecovery: vi.fn(), leashContext: () => ({}), name: "Gravel decisions", savePayload: vi.fn(() => '{"version":1}') });
  return g;
}
const rawSave = (gravelHarvests: unknown, extra: Record<string, unknown> = {}) => `\n${JSON.stringify({ version: 1, name: "Flint", seed: 12345, mode: "survival", player: { position: { x: .5, y: 32, z: .5 }, yaw: 0, pitch: 0 }, inventory: new Inventory().toJSON(), edits: [], gravelHarvests, ...extra }, null, 2)}\n`;
beforeEach(() => vi.stubGlobal("document", { createElement: () => new Cell(), pointerLockElement: null }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); (Game as unknown as { activeWriter: Game | null }).activeWriter = null; });
it("actual raw-decision load helper freezes commands, handoffs, death, drink and saves with precise feedback and original backup", async () => {
  const original = rawSave({ version: 1, records: [{ x: 9, y: 23, z: -23, flint: "yes" }] });
  const storage = { getItem: vi.fn(() => original), setItem: vi.fn() }; vi.stubGlobal("localStorage", storage);
  const g = game(); g.restoreGravelHarvests({ gravelHarvestInvalid: true });
  expect(g.recoverySections).toEqual(["gravel harvest decisions"]); expect(g.recoveryOriginal).toBe(original); expect(g.drinkOwner).toBeNull();
  const reply = "Damaged gravel harvest decisions. Export a backup before using commands";
  expect(g.runChat("/give flint")).toBe(reply); expect(g.hud.message).toHaveBeenCalledTimes(1); expect(g.hud.message).toHaveBeenCalledWith(reply);
  expect(g.giveHeldToAgent()).toBe("Damaged gravel harvest decisions. Export a backup before moving items"); expect(g.teleportAgent()).toBe(false);
  g.playerStatus = { poison: { remaining: 4, elapsed: 1.2 } }; g.updatePlayerStatus(2); expect(g.playerStatus).toEqual({ poison: { remaining: 4, elapsed: 1.2 } }); expect(g.health).toBe(20); expect(g.runProgram({ name: "Blocked", blocks: [] })).toBe(false); expect(g.dropStack({ id: stackId("gravel"), count: 1 })).toBe(false);
  g.deathState = { phase: "pending" }; expect(g.tryDeathTransfer()).toBe(false); expect(g.deathError).toContain("Damaged gravel harvest decisions");
  g.inventory.setSlot(0, freshStack(stackId("water_bottle"))); g.interact(false, false, true, false, 2); expect(g.inventory.selectedStack()?.id).toBe(stackId("water_bottle")); expect(g.drinkOwner).toBeNull();
  g.selectHudHotbar(1); expect(g.inventory.selected).toBe(0);
  (Game as unknown as { activeWriter: Game | null }).activeWriter = g; expect(g.save()).toBe(false); expect(g.saveError).toContain("gravel harvest decisions"); expect(g.savePayload).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  let backup: Blob | undefined; vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { backup = blob as Blob; return "blob:gravel"; }); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); vi.useFakeTimers(); g.exportSaveBackup(); expect(JSON.parse(await backup!.text()).recoveryOriginalSave).toBe(original);
});
it("raw parse diagnostic survives sanitation; spoofed derived flag alone cannot freeze a legacy save", () => {
  const bad = rawSave({ version: 1, records: [{ x: 9, y: 23, z: -23, flint: "yes" }] }), parsed = parseSave(bad);
  expect(parsed.gravelHarvestInvalid).toBe(true); vi.stubGlobal("localStorage", { getItem: () => bad }); const g = game(); g.restoreGravelHarvests(parsed); expect(g.recoveryOriginal).toBe(bad);
  const clean = JSON.parse(rawSave(undefined, { gravelHarvestInvalid: true })); delete clean.gravelHarvests; const legacy = parseSave(JSON.stringify(clean)); expect(legacy.gravelHarvestInvalid).not.toBe(true); const old = game(); old.restoreGravelHarvests(legacy); expect(old.recoverySections).toEqual([]);
});
it("actual post-edits restore refuses a structurally valid decision whose source is no longer Gravel", () => {
  const world = new World(12345), original = rawSave({ version: 1, records: [{ x: 9, y: 23, z: -23, flint: true }] }); world.importEdits([[9,23,-23,blockId("stone")]]);
  vi.stubGlobal("localStorage", { getItem: () => original }); const g = game(world); g.restoreGravelHarvests(parseSave(original)); expect(g.recoverySections).toEqual(["gravel harvest decisions"]); expect(g.recoveryOriginal).toBe(original); expect(g.drinkOwner).toBeNull();
});

it("actual player break refusal caches its first result and cold retry delivers it once with one tool debit", () => {
  const w = new World(12345), g = game(w), at = { x: 9, y: 23, z: -23, id: blockId("gravel"), distance: 2, normal: { x: 0, y: 1, z: 0 } };
  g.inventory.setSlot(0, freshStack(stackId("iron_shovel"))); g.beginFenceRelease = () => ({ kind: "none" }); g.dropSink = vi.fn(() => null);
  const original = JSON.stringify(g.inventory.toJSON()); vi.spyOn(Math, "random").mockReturnValue(0); g.breakAt(at);
  expect(w.getBlock(at.x, at.y, at.z)).toBe(at.id); expect(JSON.stringify(g.inventory.toJSON())).toBe(original); expect(w.gravelHarvests.exportState().records).toEqual([{ x: 9, y: 23, z: -23, flint: true }]);
  const restored = new World(12345); restored.importEdits(w.exportEdits()); const cold = game(restored); cold.restoreGravelHarvests({ gravelHarvests: w.gravelHarvests.exportState() }); cold.inventory = Inventory.fromJSON(g.inventory.toJSON()); cold.beginFenceRelease = () => ({ kind: "none" });
  const accepted: unknown[] = []; cold.dropSink = (stacks: unknown) => ({ commit: () => { accepted.push(stacks); return true; } }); vi.mocked(Math.random).mockReturnValue(.99); cold.breakAt(at);
  expect(accepted).toEqual([[{ id: stackId("flint"), count: 1 }]]); expect(restored.getBlock(at.x, at.y, at.z)).toBe(0); expect(cold.inventory.selectedStack()?.damage).toBe(1); expect(restored.gravelHarvests.exportState().records).toEqual([]);
  cold.breakAt(at); expect(accepted).toHaveLength(1); expect(cold.inventory.selectedStack()?.damage).toBe(1);
});
it("actual Agent command tick uses the same world decision after a refused player break", () => {
  const w = new World(12345), g = game(w), at = { x: 9, y: 23, z: -23, id: blockId("gravel"), distance: 2, normal: { x: 0, y: 1, z: 0 } };
  g.inventory.setSlot(0, freshStack(stackId("iron_shovel"))); g.beginFenceRelease = () => ({ kind: "none" }); g.dropSink = () => null; vi.spyOn(Math, "random").mockReturnValue(0); g.breakAt(at);
  const accepted: unknown[] = []; g.dropSink = (stacks: unknown) => ({ commit: () => { accepted.push(stacks); return true; } }); g.agent = createAgent(9, 24, -23); g.agentView = { moveTo: vi.fn() }; g.furnaces = new Map(); g.stepTimer = 0; g.clock = 0; g.runnerStarted = 0; g.runnerName = "Natural gravel"; g.runner = { next: () => ({ op: "destroy", dir: "down" }) }; vi.mocked(Math.random).mockReturnValue(.99);
  g.stepAgent(1); expect(accepted).toEqual([[{ id: stackId("flint"), count: 1 }]]); expect(w.getBlock(9, 23, -23)).toBe(0); expect(w.gravelHarvests.exportState().records).toEqual([]); expect(g.agentView.moveTo).toHaveBeenCalled();
});
it("actual save payload exports the world decisions and post-edits cold restore retains them, while legacy omits empty state", () => {
  const g = game(), at = { x: 9, y: 23, z: -23, id: blockId("gravel"), distance: 2, normal: { x: 0, y: 1, z: 0 } }; g.inventory.setSlot(0, freshStack(stackId("iron_shovel"))); g.beginFenceRelease = () => ({ kind: "none" }); g.dropSink = () => null; vi.spyOn(Math, "random").mockReturnValue(.99); g.breakAt(at);
  Object.assign(g, { timeOfDay: .2, inventoryScreen: { pendingItems: () => [] }, snowballProjectiles: { toJSON: () => ({ version: 1, nextKey: 1, records: [] }) }, worldDrops: { toJSON: () => ({ nextKey: 1, records: [] }) }, leashes: { ...g.leashes, toJSON: () => ({ version: 1, nextKey: 1, records: [] }) }, balloons: { ...g.balloons, toJSON: () => ({ version: 1, nextKey: 1, records: [] }) }, mobs: { exportFireballs:()=>({version:1,nextKey:1,records:[]}),fireballBusy:false,exportState: () => ({ nextId: 1, records: [] }), exportNpcs: () => [], spawning: false }, chalkboards: new Map(), agent: createAgent(0, 32, 0), programs: [], furnaces: new Map(), redstone: { exportScheduled: () => [] }, farming: { toJSON: () => ({ version: 1, crops: [] }) } });
  const payload = (Game.prototype as unknown as { savePayload(): string }).savePayload.call(g), saved = parseSave(payload); expect(saved.gravelHarvests?.records).toEqual([{ x: 9, y: 23, z: -23, flint: false }]); expect(payload).not.toContain("gravelHarvestInvalid"); const cold = game(new World(saved.seed)); cold.world.importEdits(saved.edits); cold.restoreGravelHarvests(saved); expect(cold.recoverySections).toEqual([]); expect(cold.world.gravelHarvests.exportState()).toEqual(saved.gravelHarvests);
  g.world.gravelHarvests.restore(undefined); const legacy = JSON.parse((Game.prototype as unknown as { savePayload(): string }).savePayload.call(g)); expect(legacy).not.toHaveProperty("gravelHarvests");
});
