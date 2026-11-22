import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Inventory, blockId, freshStack, parseSave, stackId, SPARKLER_COLORS } from "../src";
import { Game } from "../../../apps/web/src/application/game";
import { Hud, InventoryScreen } from "../../../apps/web/src/ui/hud";
import { SparklerView } from "../../../apps/web/src/rendering/sparkler-view";
import { WorldDropsView } from "../../../apps/web/src/rendering/worldDropsView";
import { blockIcon } from "../../../apps/web/src/ui/icons";

class Cell {
  children: Cell[] = []; dataset: Record<string, string> = {}; className = ""; textContent = ""; hidden = false; removed = false;
  attributes: Record<string, string> = {};
  style = { opacity: "", setProperty: vi.fn() };
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  listeners = new Map<string, ((event: { code?: string; stopPropagation(): void }) => void)[]>();
  append(...cells: Cell[]) { this.children.push(...cells); }
  prepend(...cells: Cell[]) { this.children.unshift(...cells); }
  replaceChildren(...cells: Cell[]) { this.children = cells; }
  appendChild(cell: Cell) { this.children.push(cell); return cell; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(event: string, handler: (event: { code?: string; stopPropagation(): void }) => void) { this.listeners.set(event, [...this.listeners.get(event) ?? [], handler]); }
  dispatch(event: string, code?: string) { const stopPropagation = vi.fn(); this.listeners.get(event)?.forEach(handler => handler({ code, stopPropagation })); return stopPropagation; }
  click() { this.dispatch("click"); }
  remove() { this.removed = true; }
  getContext() { return { imageSmoothingEnabled: false, putImageData: vi.fn(), drawImage: vi.fn() }; }
  toDataURL() { return "test:original-atlas-icon"; }
}
const orange = () => stackId("orange_sparkler"), blue = () => stackId("blue_sparkler");
const active = (id = orange()) => ({ ...freshStack(id), sparkler: { state: "active" as const } });
const atlas = () => ({ tileSize: 16, tilePixels: vi.fn(() => new Uint8ClampedArray(16 * 16 * 4)), uv: vi.fn(() => [0, 0, 1, 1]), data: new Uint8ClampedArray(16 * 16 * 4), width: 16, height: 16 });
function screen() {
  const value = Object.create(InventoryScreen.prototype);
  Object.assign(value, { inventory: new Inventory(), cursor: null, grid: Array(9).fill(null), width: 3, atlas: atlas(), mode: "survival", render: vi.fn() });
  return value;
}
function game() {
  const value = Object.assign(Object.create(Game.prototype), { statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [] });
  const ownership = () => ({ busy: false, records: [], reconcileLoadedReferences: vi.fn(), validateCrossReferences: vi.fn() });
  Object.assign(value, { inventory: new Inventory(), leashes: ownership(), balloons: ownership(), recoverySections: [], recoveryOriginal: null,
    stopped: false, dead: false, paused: false, screenOpen: () => false, hud: { message: vi.fn() }, sparklerView: { update: vi.fn() },
    leashContext: () => ({}), markLeashRecovery: vi.fn(), markBalloonRecovery: vi.fn(), keyboard: { reset: vi.fn() }, name: "Sparkler recovery", savePayload: vi.fn(() => '{"version":1}'),
    world: { getBlock: () => 0 }, body: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0 }, mobs: { raycast: () => null },
    creativeCooldown: 0, placeCooldown: 0, attackCooldown: 0, mode: "survival", hunger: { food: 20 }, redstone: { interact: () => false },
    openInventory: vi.fn(), openNpcDialog: vi.fn(), releaseLeashes: vi.fn(() => true) });
  return value;
}
beforeEach(() => { vi.stubGlobal("document", { createElement: () => new Cell() }); vi.stubGlobal("ImageData", class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("actual offhand cell waits for setter acknowledgment and refuses non-sparkler cursor without touching either owner", () => {
  const ui = screen(); ui.inventory.setOffhand(active()); ui.cursor = freshStack(blue(), 2);
  const old = ui.cursor, before = JSON.stringify(ui.inventory.toJSON()); const setter = vi.spyOn(ui.inventory, "setOffhand").mockReturnValue(false);
  ui.offhandSection().children[1].click(); expect(ui.cursor).toBe(old); expect(JSON.stringify(ui.inventory.toJSON())).toBe(before);
  setter.mockRestore(); ui.cursor = freshStack(stackId("coal")); const coal = ui.cursor;
  ui.offhandSection().children[1].click(); expect(ui.cursor).toBe(coal); expect(JSON.stringify(ui.inventory.toJSON())).toBe(before);
  ui.cursor = freshStack(blue(), 2); const incoming = ui.cursor;
  ui.offhandSection().children[1].click(); expect(ui.cursor).toEqual(active()); expect(ui.inventory.offhand).toEqual(incoming);
  expect(ui.inventory.offhand.sparkler).not.toBe(incoming.sparkler);
});
it("actual inventory offhand swap conserves a separate cursor and refuses incompatible selected owners", () => {
  const ui = screen(); ui.inventory.setSlot(0, active()); ui.inventory.setOffhand(freshStack(blue(), 2)); ui.cursor = freshStack(stackId("coal"), 3);
  const cursor = ui.cursor; ui.offhandSection().children[2].click();
  expect(ui.cursor).toBe(cursor); expect(ui.inventory.selectedStack()).toEqual(freshStack(blue(), 2)); expect(ui.inventory.offhand).toEqual(active());
  ui.inventory.setSlot(0, freshStack(stackId("coal"))); const before = JSON.stringify(ui.inventory.toJSON());
  ui.offhandSection().children[2].click(); expect(JSON.stringify(ui.inventory.toJSON())).toBe(before); expect(ui.cursor).toBe(cursor);
});
it("actual bag and work-cell handlers never merge lit and unlit sparkler owners or debit on setter refusal", () => {
  const ui = screen(); ui.inventory.setSlot(0, active()); ui.cursor = freshStack(orange(), 2);
  ui.slotCell(0).click(); expect(ui.cursor).toEqual(active()); expect(ui.inventory.slots[0]).toEqual(freshStack(orange(), 2));
  ui.grid[0] = freshStack(orange(), 4); const cursor = ui.cursor, cell = ui.grid[0];
  ui.inputCell(0, "Input").click(); expect(ui.cursor).toBe(cursor); expect(ui.grid[0]).toBe(cell);
  const before = JSON.stringify(ui.inventory.toJSON()); vi.spyOn(ui.inventory, "setSlot").mockReturnValue(false);
  ui.slotCell(0).click(); expect(ui.cursor).toBe(cursor); expect(JSON.stringify(ui.inventory.toJSON())).toBe(before);
});
it("actual sparkler crafting refuses an incompatible lit cursor before consuming the five-color source recipes", () => {
  for (const color of SPARKLER_COLORS) {
    const ui = screen(); ui.grid = [null, freshStack(stackId(color.compound)), null, null, freshStack(stackId("magnesium")), null, null, freshStack(stackId("stick")), null];
    ui.cursor = active(stackId(color.itemName)); const before = JSON.stringify(ui.grid);
    ui.craftingSection().children[2].click(); expect(JSON.stringify(ui.grid)).toBe(before); expect(ui.cursor).toEqual(active(stackId(color.itemName)));
    ui.cursor = null; ui.craftingSection().children[2].click(); expect(ui.cursor).toEqual(freshStack(stackId(color.itemName))); expect(ui.grid.every((cell: unknown) => cell === null)).toBe(true);
  }
});
it("actual Game light guards both hands during lifecycle/modal/transfer/raw recovery without visual or ownership mutation", () => {
  for (const key of ["paused", "dead", "stopped", "modal", "transfer", "recovery"]) for (const offhand of [false, true]) {
    const g = game(); g.inventory.setSlot(0, freshStack(orange(), 2)); g.inventory.setOffhand(freshStack(blue(), 2));
    if (key === "modal") g.screenOpen = () => true; else if (key === "transfer") g.leashes.busy = true; else if (key === "recovery") g.recoverySections.push("saved items"); else g[key] = true;
    const before = JSON.stringify(g.inventory.toJSON()); expect(g.tryLightSparkler(offhand)).toBe(false); expect(g.trySwapOffhand()).toBe(false);
    expect(JSON.stringify(g.inventory.toJSON())).toBe(before); expect(g.sparklerView.update).not.toHaveBeenCalled();
  }
});
it("actual Game offhand activation splits only that owner into bag, refuses full room and never restarts", () => {
  const g = game(); g.inventory.setSlot(0, freshStack(stackId("coal"), 3)); g.inventory.setOffhand(freshStack(blue(), 2));
  const main = g.inventory.selectedStack(); expect(g.tryLightSparkler(true)).toBe(true); expect(g.inventory.selectedStack()).toBe(main);
  expect(g.inventory.offhand).toEqual(active(blue())); expect(g.inventory.slots[1]).toEqual(freshStack(blue()));
  const before = JSON.stringify(g.inventory.toJSON()); expect(g.tryLightSparkler(true)).toBe(false); expect(JSON.stringify(g.inventory.toJSON())).toBe(before);
  const full = game(); full.inventory.slots.fill(freshStack(stackId("coal"), 64)); full.inventory.setOffhand(freshStack(orange(), 2));
  const fullBefore = JSON.stringify(full.inventory.toJSON()); expect(full.tryLightSparkler(true)).toBe(false); expect(JSON.stringify(full.inventory.toJSON())).toBe(fullBefore);
  expect(full.sparklerView.update).not.toHaveBeenCalled();
});
it("actual right-use lights the selected sparkler alone, or offhand alone only when main hand is empty", () => {
  for (const main of ["sparkler", "empty", "other"]) {
    const g = game(); if (main === "sparkler") g.inventory.setSlot(0, freshStack(orange())); else if (main === "other") g.inventory.setSlot(0, freshStack(stackId("coal")));
    g.inventory.setOffhand(freshStack(blue())); g.interact(false, true, false, false, .01);
    expect(g.inventory.offhand).toEqual(main === "empty" ? active(blue()) : freshStack(blue()));
    if (main === "sparkler") expect(g.inventory.selectedStack()).toEqual(active());
    if (main === "other") expect(g.inventory.selectedStack()).toEqual(freshStack(stackId("coal")));
  }
});
it("actual right-use preserves NPC, crafting table and matching Lead release priority over lighting", () => {
  const npc = game(); npc.inventory.setSlot(0, freshStack(orange())); npc.inventory.setOffhand(freshStack(blue()));
  npc.mobs.raycast = () => ({ distance: 1, mob: { id: 3, kind: "npc", position: { x: 0, y: 32, z: 0 } } });
  const before = JSON.stringify(npc.inventory.toJSON()); npc.interact(false, true, false, false, .01);
  expect(npc.openNpcDialog).toHaveBeenCalledTimes(1); expect(JSON.stringify(npc.inventory.toJSON())).toBe(before);
  const table = game(); table.inventory.setSlot(0, freshStack(orange())); table.inventory.setOffhand(freshStack(blue())); table.world.getBlock = () => blockId("crafting_table");
  const tableBefore = JSON.stringify(table.inventory.toJSON()); table.interact(false, true, false, false, .01);
  expect(table.openInventory).toHaveBeenCalledWith("crafting_table"); expect(JSON.stringify(table.inventory.toJSON())).toBe(tableBefore);
  const lead = game(); lead.inventory.setOffhand(freshStack(blue())); lead.leashes.records = [{ key: 7, targetMobId: 3 }];
  lead.mobs.raycast = () => ({ distance: 1, mob: { id: 3, kind: "pig", position: { x: 0, y: 32, z: 0 } } });
  lead.interact(false, true, false, false, .01); expect(lead.releaseLeashes).toHaveBeenCalledTimes(1); expect(lead.releaseLeashes).toHaveBeenCalledWith([7]); expect(lead.inventory.offhand).toEqual(freshStack(blue()));
  lead.leashes.records = []; lead.placeCooldown = 0; lead.interact(false, true, false, false, .01); expect(lead.inventory.offhand).toEqual(active(blue()));
});
it("actual fence use retains player retie and fence release before offhand light, while an untethered fence permits light", () => {
  for (const action of ["retie", "release", "none"] as const) {
    const g = game(); g.inventory.setOffhand(freshStack(blue())); g.body.position = { x: .5, y: 32, z: .5 }; g.body.pitch = -.5;
    g.world.getBlock = (x: number, y: number, z: number) => x === 0 && y === 32 && z === -2 ? blockId("oak_fence") : 0;
    // A read-only target capture uses the production raycast, so the release anchor matches its actual voxel.
    g.interact(false, false, false, false, .01); const target = g.target;
    expect(target?.id).toBe(blockId("oak_fence"));
    g.leashes.retieToFence = vi.fn(() => true);
    if (action === "retie") g.leashes.records = [{ key: 7, phase: "active", anchor: { kind: "player" }, targetMobId: 3 }];
    if (action === "release") g.leashes.records = [{ key: 8, phase: "active", anchor: { kind: "fence", x: target.x, y: target.y, z: target.z }, targetMobId: 3 }];
    g.interact(false, true, false, false, .01);
    expect(g.inventory.offhand).toEqual(action === "none" ? active(blue()) : freshStack(blue()));
    if (action === "retie") { expect(g.leashes.retieToFence).toHaveBeenCalledTimes(1); expect(g.leashes.retieToFence).toHaveBeenCalledWith([7], { x: target.x, y: target.y, z: target.z }, {}); expect(g.releaseLeashes).not.toHaveBeenCalled(); }
    else if (action === "release") { expect(g.releaseLeashes).toHaveBeenCalledTimes(1); expect(g.releaseLeashes).toHaveBeenCalledWith([8]); expect(g.leashes.retieToFence).not.toHaveBeenCalled(); }
    else { expect(g.releaseLeashes).not.toHaveBeenCalled(); expect(g.leashes.retieToFence).not.toHaveBeenCalled(); }
  }
});
it("actual HUD actions preserve gameplay shortcut propagation and show same-ID main/offhand state changes", () => {
  const main = vi.fn(), swap = vi.fn(); const hud = new Hud(new Cell() as unknown as HTMLElement, atlas() as never, { onLightSparkler: main, onSwapOffhand: swap } as never, false);
  const inventory = new Inventory(); inventory.setSlot(0, freshStack(orange())); inventory.setOffhand(freshStack(blue()));
  hud.update(inventory, "survival", 20, 20, 0); const ui = hud as unknown as { lightSparkler: Cell & { disabled: boolean }; lightOffhand: Cell & { disabled: boolean }; swapOffhand: Cell; offhandName: Cell; itemName: Cell };
  ui.lightSparkler.click(); ui.lightOffhand.click(); ui.swapOffhand.click(); expect(main.mock.calls).toEqual([[false], [true]]); expect(swap).toHaveBeenCalledTimes(1);
  expect(ui.lightSparkler.dispatch("keydown", "Escape")).not.toHaveBeenCalled(); expect(ui.lightOffhand.dispatch("keydown", "KeyE")).not.toHaveBeenCalled(); expect(ui.lightSparkler.dispatch("keydown", "Enter")).toHaveBeenCalledTimes(1);
  inventory.activateSelectedSparkler(); inventory.activateOffhandSparkler(); hud.update(inventory, "survival", 20, 20, 0);
  expect(ui.lightSparkler.disabled).toBe(true); expect(ui.lightOffhand.disabled).toBe(true); expect(ui.itemName.textContent).toContain("Lit"); expect(ui.offhandName.textContent).toContain("Lit");
});
it("actual active icon resolver consumes distinct lit atlas keys without mutating item registry or cross-state icon cache", () => {
  const art = atlas(); const color = SPARKLER_COLORS[0]; const id = stackId(color.itemName);
  blockIcon(art as never, id, 64, freshStack(id)); blockIcon(art as never, id, 64, active(id)); blockIcon(art as never, id, 64, freshStack(id));
  expect(art.tilePixels.mock.calls.map(call => call[0])).toEqual([color.iconInactive, color.iconActive]);
});
it("actual two-hand view caps cosmetic sparks and clears them on hidden/selection/disposal; ground active owners use lit UVs", () => {
  const art = atlas(), container = new Cell(); const view = new SparklerView(container as unknown as HTMLElement, art as never);
  view.update(active(), active(blue()), true); expect(view.root.hidden).toBe(false);
  const hands = (view.root as unknown as Cell).children; expect(hands.map(hand => hand.children.filter(child => child.className === "sparkler-spark").length)).toEqual([8, 8]);
  view.update(null, active(blue()), true); expect(hands[0].children).toHaveLength(0); expect(hands[1].children).toHaveLength(10);
  view.update(active(), active(blue()), false); expect(view.root.hidden).toBe(true); expect(hands.every(hand => hand.children.length === 0)).toBe(true);
  view.update(active(), null, true); view.dispose(); expect((view.root as unknown as Cell).removed).toBe(true); expect(hands.every(hand => hand.children.length === 0)).toBe(true);
  const scene = new THREE.Scene(), store = { records: [{ key: 1, stack: active(), position: { x: 0, y: 0, z: 0 } }] };
  const ground = new WorldDropsView(scene, art as never, store as never); ground.update(0, new THREE.Vector3(), 10);
  expect(art.uv).toHaveBeenCalledWith(SPARKLER_COLORS[0].iconActive); ground.dispose(); expect(scene.children).toHaveLength(0);
});
it("actual raw offhand diagnostics reach Game early recovery, prevent save overwrite and export exact original text", async () => {
  const original = JSON.stringify({ version: 1, name: "Sparkler recovery", seed: 1, mode: "survival", timeOfDay: .2, player: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0, flying: false }, edits: [], inventory: { ...new Inventory().toJSON(), offhand: { ...active(), count: 2 } } }, null, 2);
  const storage = { getItem: vi.fn(() => original), setItem: vi.fn() }; vi.stubGlobal("localStorage", storage);
  const parsed = parseSave(original); expect(parsed.sparklerOwnershipIssues?.some(issue => issue.path.includes("offhand"))).toBe(true);
  const g = game(); g.markSparklerRecovery(parsed); expect(g.recoveryOriginal).toBe(original); expect(g.recoverySections).toEqual(["saved items"]);
  const writer = Game as unknown as { activeWriter: Game | null }; writer.activeWriter = g;
  expect(g.save()).toBe(false); expect(storage.setItem).not.toHaveBeenCalled(); expect(g.savePayload).not.toHaveBeenCalled(); writer.activeWriter = null;
  let backup: Blob | undefined; vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { backup = blob as Blob; return "blob:sparkler"; }); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); vi.useFakeTimers();
  g.exportSaveBackup(); expect(JSON.parse(await backup!.text()).recoveryOriginalSave).toBe(original); expect(storage.setItem).not.toHaveBeenCalled();
});
