import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Inventory, blockId, createHunger, freshStack, parseSave, stackId } from "../src";
import { Game, SAVE_KEY } from "../../../apps/web/src/application/game";
class Cell {
  children: Cell[] = []; hidden = false; style = {}; className = ""; textContent = "";
  append(...cells: Cell[]) { this.children.push(...cells); } appendChild(cell: Cell) { this.children.push(cell); return cell; }
  setAttribute() {} addEventListener() {} click() {} remove() {}
}
function game(cells: Record<string, number> = { "0,33,-2": blockId("water") }) {
  const g = Object.assign(Object.create(Game.prototype), { brewingStands: new Map(), brewingIssues: [] }), own = () => ({ busy: false, records: [], reconcileLoadedReferences: vi.fn(), validateCrossReferences: vi.fn() });
  Object.assign(g, { inventory: new Inventory(), hunger: createHunger(), playerStatus: {}, leashes: own(), balloons: own(), recoverySections: [], recoveryOriginal: null,
    dead: false, paused: false, stopped: false, mode: "survival", screenOpen: () => false, hud: { message: vi.fn() }, keyboard: { reset: vi.fn() },
    world: { getBlock: (x: number, y: number, z: number) => cells[`${x},${y},${z}`] ?? 0, setBlock: vi.fn() },
    body: { position: { x: .5, y: 32, z: .5 }, yaw: 0, pitch: 0 }, mobs: { raycast: () => null }, creativeCooldown: 0, placeCooldown: 0, attackCooldown: 0, eatTimer: 0,
    redstone: { interact: () => false }, openInventory: vi.fn(), openNpcDialog: vi.fn(), markLeashRecovery: vi.fn(), markBalloonRecovery: vi.fn(), leashContext: () => ({}),
    name: "Bottle recovery", savePayload: vi.fn(() => '{"version":1}') });
  return g;
}
const bottles = (g: ReturnType<typeof game>, count = 1) => { g.inventory.setSlot(0, freshStack(stackId("glass_bottle"), count)); return g; };
beforeEach(() => vi.stubGlobal("document", { createElement: () => new Cell() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); (Game as unknown as { activeWriter: Game | null }).activeWriter = null; });
it("actual use fills the first reachable water once and preserves water, hunger, status and normal nonliquid outline", () => {
  const g = bottles(game({ "0,33,-2": blockId("water"), "0,33,-4": blockId("crafting_table") }), 2);
  const before = JSON.stringify([g.hunger, g.playerStatus]); g.interact(false, true, false, false, .01);
  expect(g.inventory.slots[0]).toEqual({ id: stackId("glass_bottle"), count: 1 }); expect(g.inventory.slots[1]).toEqual({ id: stackId("water_bottle"), count: 1 });
  expect(g.target.id).toBe(blockId("crafting_table")); expect(g.openInventory).not.toHaveBeenCalled(); expect(g.world.setBlock).not.toHaveBeenCalled(); expect(JSON.stringify([g.hunger, g.playerStatus])).toBe(before);
  const owners = JSON.stringify(g.inventory.toJSON()); g.interact(false, false, true, false, 2); expect(JSON.stringify(g.inventory.toJSON())).toBe(owners);
});
it("actual fill respects walls, glass and fence posts while existing exact fence gaps remain usable", () => {
  for (const obstacle of ["stone", "glass", "oak_fence"]) {
    const g = bottles(game({ "0,33,-1": blockId(obstacle), "0,33,-2": blockId("water") }));
    const before = JSON.stringify(g.inventory.toJSON()); g.interact(false, true, false, false, .01); expect(JSON.stringify(g.inventory.toJSON())).toBe(before); expect(g.world.setBlock).not.toHaveBeenCalled();
  }
  const gap = bottles(game({ "0,33,-1": blockId("oak_fence"), "0,33,-2": blockId("water") })); gap.body.position.x = .1;
  gap.interact(false, true, false, false, .01); expect(gap.inventory.selectedStack()).toEqual({ id: stackId("water_bottle"), count: 1 });
});
it("water before NPC or balloon fills before their global branch, nearer or equal actors retain priority", () => {
  for (const distance of [3, .8, 1.5]) {
    const g = bottles(game()), npc = { id: 3, kind: "npc", position: { x: .5, y: 32, z: -distance } };
    g.mobs.raycast = () => ({ distance, mob: npc }); g.interact(false, true, false, false, .01);
    expect(g.inventory.selectedStack().id).toBe(stackId(distance === 3 ? "water_bottle" : "glass_bottle"));
    expect(g.openNpcDialog).toHaveBeenCalledTimes(distance === 3 ? 0 : 1);
  }
  for (const z of [-3, -.5]) {
    const g = bottles(game()); g.balloons.records = [{ key: 1, phase: "active", position: { x: .5, y: 33.4, z } }];
    g.interact(false, true, false, false, .01); expect(g.inventory.selectedStack().id).toBe(stackId(z === -3 ? "water_bottle" : "glass_bottle"));
  }
  const mob = bottles(game()); mob.mobs.raycast = () => ({ distance: .8, mob: { id: 4, kind: "pig" } }); mob.interact(false, true, false, false, .01); expect(mob.inventory.selectedStack().id).toBe(stackId("glass_bottle"));
});
it("first nearer stations and all nonempty held-item interactions keep their existing dispatch", () => {
  for (const name of ["crafting_table", "furnace", "element_constructor"]) {
    const g = bottles(game({ "0,33,-1": blockId(name), "0,33,-2": blockId("water") })); g.furnaces = new Map();
    g.interact(false, true, false, false, .01); expect(g.inventory.selectedStack().id).toBe(stackId("glass_bottle")); expect(g.openInventory).toHaveBeenCalledOnce();
  }
  for (const name of ["coal", "water_bottle"]) {
    const g = game({ "0,33,-2": blockId("water"), "0,33,-4": blockId("crafting_table") }); g.inventory.setSlot(0, freshStack(stackId(name)));
    g.interact(false, true, false, false, .01); expect(g.inventory.selectedStack().id).toBe(stackId(name)); expect(g.openInventory).toHaveBeenCalledWith("crafting_table");
  }
});
it("full-bag stacked fill refuses without debit or implicit drop, singleton succeeds and both modes own finite containers", () => {
  for (const mode of ["survival", "creative"]) {
    const g = game(); g.mode = mode; for (let i = 0; i < 36; i++) g.inventory.setSlot(i, freshStack(stackId("coal"), 64)); g.inventory.setSlot(0, freshStack(stackId("glass_bottle"), 2));
    const before = JSON.stringify(g.inventory.toJSON()); g.interact(false, true, false, false, .01); expect(JSON.stringify(g.inventory.toJSON())).toBe(before); expect(g.hud.message).toHaveBeenCalledWith("Make room for a Water Bottle before filling one."); expect(g.world.setBlock).not.toHaveBeenCalled();
    g.placeCooldown = 0; g.inventory.setSlot(0, freshStack(stackId("glass_bottle"))); g.interact(false, true, false, false, .01); expect(g.inventory.selectedStack()).toEqual({ id: stackId("water_bottle"), count: 1 });
  }
});
it("held-use without place, outside reach, cooldown and malformed source never manufacture a filled owner", () => {
  const held = bottles(game()); held.interact(false, false, true, false, 5); expect(held.inventory.selectedStack().id).toBe(stackId("glass_bottle"));
  const far = bottles(game({ "0,33,-6": blockId("water") })); far.interact(false, true, false, false, .01); expect(far.inventory.selectedStack().id).toBe(stackId("glass_bottle"));
  const cool = bottles(game()); cool.placeCooldown = .25; cool.interact(false, true, false, false, .01); expect(cool.inventory.selectedStack().id).toBe(stackId("glass_bottle"));
  const bad = game(); bad.inventory.slots[0] = { id: stackId("glass_bottle"), count: 0 }; bad.interact(false, true, false, false, .01); expect(bad.inventory.slots[0].count).toBe(0); expect(bad.hud.message).toHaveBeenCalledWith("These bottles need attention before they can be filled.");
});
it("raw malformed filled count freezes actual actions, preserves storage and exports exact original before any repair", async () => {
  const original = `\n${JSON.stringify({ version: 1, name: "Bottle", seed: 7, mode: "survival", timeOfDay: .2, player: { position: { x: .5, y: 32, z: .5 }, yaw: 0, pitch: 0 }, inventory: { ...new Inventory().toJSON(), slots: [{ id: stackId("water_bottle"), count: 2 }, ...Array(35).fill(null)] }, edits: [] }, null, 2)}\n`;
  const storage = { getItem: vi.fn(() => original), setItem: vi.fn() }; vi.stubGlobal("localStorage", storage); const parsed = parseSave(original);
  expect(parsed.bottleOwnershipIssues?.some(issue => issue.path.includes("slots"))).toBe(true); const g = bottles(game()); g.markBottleRecovery(parsed);
  expect(g.recoveryOriginal).toBe(original); expect(g.recoverySections).toEqual(["saved items"]); const before = JSON.stringify(g.inventory.toJSON()); g.interact(false, true, false, false, 1); expect(JSON.stringify(g.inventory.toJSON())).toBe(before);
  expect(g.runChat("/tp 0 100 0")).toContain("Saved items need repair"); (Game as unknown as { activeWriter: Game | null }).activeWriter = g;
  expect(g.save()).toBe(false); expect(storage.setItem).not.toHaveBeenCalled(); expect(g.savePayload).not.toHaveBeenCalled();
  let backup: Blob | undefined; vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { backup = blob as Blob; return "blob:bottle"; }); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); vi.useFakeTimers();
  g.exportSaveBackup(); expect(JSON.parse(await backup!.text()).recoveryOriginalSave).toBe(original); expect(storage.getItem).toHaveBeenCalledWith(SAVE_KEY); expect(storage.setItem).not.toHaveBeenCalled();
});
