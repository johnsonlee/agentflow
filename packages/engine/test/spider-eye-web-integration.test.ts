import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Inventory, World, MobLootResolver, createHunger, createMob, createPlayerStatus, freshStack, parseSave, stackId } from "../src";
import { Game, SAVE_KEY } from "../../../apps/web/src/application/game";
import { MobManager } from "../../../apps/web/src/simulation/mobs";
import { Hud } from "../../../apps/web/src/ui/hud";
vi.mock("../../../apps/web/src/ui/icons", () => ({ blockIcon: () => "test:existing-icon" }));
class Cell {
  children: Cell[] = []; dataset: Record<string, string> = {}; style: Record<string, string> = {}; className = ""; textContent = ""; hidden = false;
  attributes: Record<string, string> = {};
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  append(...cells: Cell[]) { this.children.push(...cells); } prepend(...cells: Cell[]) { this.children.unshift(...cells); }
  replaceChildren(...cells: Cell[]) { this.children = cells; } appendChild(cell: Cell) { this.children.push(cell); return cell; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; } addEventListener() {} click() {} remove() {}
}
function game() {
  const g = Object.assign(Object.create(Game.prototype), { brewingStands: new Map(), brewingIssues: [] });
  const ownership = () => ({ busy: false, records: [], beginRelease: vi.fn(() => ({ kind: "none" })), reconcileLoadedReferences: vi.fn(), validateCrossReferences: vi.fn() });
  Object.assign(g, { inventory: new Inventory(), hunger: createHunger(), playerStatus: createPlayerStatus(), leashes: ownership(), balloons: ownership(),
    recoverySections: [], recoveryOriginal: null, stopped: false, dead: false, paused: false, mode: "survival", health: 20,
    screenOpen: () => false, hud: { message: vi.fn(), flashDamage: vi.fn() }, keyboard: { reset: vi.fn() },
    world: { getBlock: () => 0 }, body: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0 }, mobs: { raycast: () => null, mobs: [] },
    creativeCooldown: 0, placeCooldown: 0, attackCooldown: 0, eatTimer: 0, redstone: { interact: () => false }, leashContext: () => ({}),
    markLeashRecovery: vi.fn(), markBalloonRecovery: vi.fn(), name: "Poison recovery", savePayload: vi.fn(() => '{"version":1}') });
  return g;
}
beforeEach(() => { vi.stubGlobal("document", { createElement: () => new Cell() }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); (Game as unknown as { activeWriter: Game | null }).activeWriter = null; });
it("actual held-use commits one Eye meal only at completion and refuses malformed owner or full hunger atomically", () => {
  const g = game(); g.inventory.setSlot(0, freshStack(stackId("spider_eye"), 2)); g.hunger.food = 16;
  g.interact(false, false, true, false, 1.59); expect(g.inventory.selectedStack().count).toBe(2); expect(g.playerStatus).toEqual({}); expect(g.hunger.food).toBe(16);
  g.interact(false, false, true, false, .02); expect(g.inventory.selectedStack().count).toBe(1); expect(g.hunger.food).toBe(18); expect(g.playerStatus).toEqual({ poison: { remaining: 5, elapsed: 0 } });
  const full = game(); full.inventory.setSlot(0, freshStack(stackId("spider_eye"))); const before = JSON.stringify([full.inventory.toJSON(), full.hunger, full.playerStatus]);
  full.interact(false, false, true, false, 2); expect(JSON.stringify([full.inventory.toJSON(), full.hunger, full.playerStatus])).toBe(before);
  for (const count of [0, -1, 1.5, NaN, 65]) {
    const bad = game(); bad.inventory.slots[0] = { id: stackId("spider_eye"), count }; bad.hunger.food = 16;
    bad.interact(false, false, true, false, 2); expect(bad.inventory.selectedStack().count).toBe(count); expect(bad.hunger.food).toBe(16); expect(bad.playerStatus).toEqual({});
  }
});
it("actual status update pauses in every inactive lifecycle, counts creative time without damage, and never wears armor", () => {
  for (const condition of ["paused", "dead", "modal", "recovery"]) {
    const g = game(); g.playerStatus = { poison: { remaining: 5, elapsed: .5 } };
    if (condition === "modal") g.screenOpen = () => true; else if (condition === "recovery") g.recoverySections = ["player status"]; else g[condition] = true;
    g.updatePlayerStatus(2); expect(g.playerStatus).toEqual({ poison: { remaining: 5, elapsed: .5 } }); expect(g.health).toBe(20);
  }
  const g = game(); g.playerStatus = { poison: { remaining: 5, elapsed: 0 } }; g.health = 2;
  g.inventory.equipment.helmet = freshStack(stackId("iron_helmet")); const armor = JSON.stringify(g.inventory.equipment);
  g.updatePlayerStatus(5); expect(g.health).toBe(1); expect(g.playerStatus).toEqual({}); expect(JSON.stringify(g.inventory.equipment)).toBe(armor); expect(g.hud.flashDamage).toHaveBeenCalledOnce();
  const creative = game(); creative.mode = "creative"; creative.playerStatus = { poison: { remaining: 5, elapsed: 0 } };
  creative.updatePlayerStatus(5); expect(creative.health).toBe(20); expect(creative.playerStatus).toEqual({}); expect(creative.hud.flashDamage).not.toHaveBeenCalled();
});
it("actual transfer callback maps existing player/Agent/environment causes and resolver retains refused first owner", () => {
  for (const [cause, expected] of [["player", "player"], ["agent", "agent"], ["sunlight", "environment"], ["void", "environment"], ["suffocation", "environment"]]) {
    const g = game(), mob = createMob(1, "spider", { x: 0, y: 32, z: 0 }); g.mobs.mobs = [mob];
    const tryDrop = vi.fn(() => true); g.mobLoot = { tryDrop }; g.dropSink = vi.fn();
    expect(g.transferMobDeath(mob, cause)).toBe(true); expect(tryDrop.mock.calls[0][3]).toBe(expected);
  }
  const g = game(), mob = createMob(1, "spider", { x: 0, y: 32, z: 0 }); g.mobLoot = new MobLootResolver(() => 1); g.mobs.mobs = [mob];
  g.dropSink = () => null; expect(g.transferMobDeath(mob, "player")).toBe(false); expect(g.mobLoot.exportPendingCause(mob)).toBe("player");
  const committed: unknown[] = []; g.dropSink = (stacks: unknown) => ({ commit: () => { committed.push(stacks); return true; } });
  expect(g.transferMobDeath(mob, "agent")).toBe(true); expect(committed).toEqual([[{ id: stackId("string"), count: 2 }, { id: stackId("spider_eye"), count: 1 }]]);
});
it("actual MobManager state export/restore preserves attributed empty rolls without reroll", () => {
  const mob = createMob(3, "spider", { x: 0, y: 32, z: 0 }), loot = new MobLootResolver(() => 0);
  loot.tryDrop(mob, () => null, mob.position, "player");
  const manager = Object.create(MobManager.prototype); manager.mobs = [mob]; manager.nextId = 4;
  const state = manager.exportState(loot); expect(state.records[0].pendingLoot).toEqual([]); expect(state.records[0].pendingLootCause).toBe("player");
  const restored = Object.create(MobManager.prototype); Object.assign(restored,{world:new World(7),disposed:false,naturalSpawning:false}); restored.register = vi.fn(); const resolver = new MobLootResolver(() => { throw new Error("reroll"); });
  restored.restore(state, resolver); const owner = restored.register.mock.calls[0][0]; expect(resolver.exportPendingCause(owner)).toBe("player");
  expect(resolver.tryDrop(owner, () => ({ commit: () => true }), owner.position, "agent")).toBe(true);
});
it("raw invalid status survives parser sanitation, blocks actual actions and save, and exact original text is downloaded", async () => {
  const original = JSON.stringify({ version: 1, name: "Poison", seed: 7, mode: "survival", timeOfDay: .2, player: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0 }, inventory: new Inventory().toJSON(), edits: [], playerStatus: { poison: { remaining: 5, elapsed: 1.25 } } }, null, 2);
  const storage = { getItem: vi.fn(() => original), setItem: vi.fn() }; vi.stubGlobal("localStorage", storage);
  const parsed = parseSave(original); expect(parsed.playerStatusInvalid).toBe(true); const g = game(); g.restorePlayerStatus(parsed);
  expect(g.playerStatus).toEqual({}); expect(g.recoverySections).toEqual(["player status"]); expect(g.recoveryOriginal).toBe(original);
  g.inventory.setSlot(0, freshStack(stackId("spider_eye"))); g.hunger.food = 16; g.interact(false, false, true, false, 2);
  expect(g.inventory.selectedStack().count).toBe(1); expect(g.hunger.food).toBe(16); expect(g.runChat("/give spider_eye")).toContain("Damaged player status"); expect(g.teleportAgent()).toBe(false); expect(g.runProgram({})).toBe(false);
  (Game as unknown as { activeWriter: Game | null }).activeWriter = g;
  expect(g.save()).toBe(false); expect(storage.setItem).not.toHaveBeenCalled(); expect(g.savePayload).not.toHaveBeenCalled();
  let backup: Blob | undefined; vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { backup = blob as Blob; return "blob:status"; }); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); vi.useFakeTimers();
  g.exportSaveBackup(); expect(JSON.parse(await backup!.text()).recoveryOriginalSave).toBe(original); expect(storage.getItem).toHaveBeenCalledWith(SAVE_KEY); expect(storage.setItem).not.toHaveBeenCalled();
});
it("actual cold restore detaches remaining duration/phase and HUD exposes a readable effect then removes it", () => {
  const g = game(), saved = { playerStatus: { poison: { remaining: 3.4, elapsed: .6 } } }; g.restorePlayerStatus(saved);
  expect(g.playerStatus).toEqual(saved.playerStatus); expect(g.playerStatus.poison).not.toBe(saved.playerStatus.poison); g.updatePlayerStatus(.65); expect(g.health).toBe(19);
  const hud = Object.create(Hud.prototype); hud.playerStatus = new Cell(); hud.setPlayerStatus(g.playerStatus); expect(hud.playerStatus.textContent).toBe("Poison · 3s"); expect(hud.playerStatus.hidden).toBe(false);
  g.updatePlayerStatus(3); hud.setPlayerStatus(g.playerStatus); expect(hud.playerStatus.hidden).toBe(true); expect(hud.playerStatus.textContent).toBe("");
});
it("actual lethal damage and acknowledged respawn clear Poison even with keepInventory", () => {
  const g = game(); g.health = 1; g.playerStatus = { poison: { remaining: 4, elapsed: .3 } }; g.keepInventory = true;
  g.bookScreen = { hide: vi.fn() }; g.inventoryScreen = { freezeForDeath: vi.fn(), resumePending: vi.fn(() => false) };
  for (const key of ["npcDialog", "chalkDialog", "portfolioScreen", "codeBuilder", "chat"]) g[key] = { hide: vi.fn() };
  g.suspendInput = vi.fn(); g.tryDeathTransfer = vi.fn(() => true); g.events = { onDeath: vi.fn() };
  g.hurt(2, "fall"); expect(g.dead).toBe(true); expect(g.playerStatus).toEqual({}); expect(g.deathState.keepInventory).toBe(true);
  g.playerStatus = { poison: { remaining: 3, elapsed: .2 } }; g.spawn = { x: 2, y: 32, z: 2 }; g.resumeInput = vi.fn();
  expect(g.respawn()).toBe(true); expect(g.health).toBe(20); expect(g.playerStatus).toEqual({}); expect(g.events.onDeath).toHaveBeenCalledOnce();
});
