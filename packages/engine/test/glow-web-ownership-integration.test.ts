import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Inventory, createAgent, freshStack, parseSave, stackId } from "../src";
import { Game } from "../../../apps/web/src/application/game";
import { Hud, InventoryScreen } from "../../../apps/web/src/ui/hud";

vi.mock("../../../apps/web/src/ui/icons", () => ({ blockIcon: () => "test:existing-icon" }));
class Cell {
  style: Record<string, string> = {}; children: Cell[] = []; dataset: Record<string, string> = {}; className = ""; textContent = "";
  classList = { add: (..._names: string[]) => undefined, remove: (..._names: string[]) => undefined, toggle: (..._args: unknown[]) => undefined };
  listeners = new Map<string, (() => void)[]>();
  append(...cells: Cell[]) { this.children.push(...cells); }
  prepend(...cells: Cell[]) { this.children.unshift(...cells); }
  replaceChildren(...cells: Cell[]) { this.children = cells; }
  appendChild(cell: Cell) { this.children.push(cell); return cell; }
  setAttribute(_key: string, _value: string) {}
  addEventListener(event: string, handler: () => void) { this.listeners.set(event, [...this.listeners.get(event) ?? [], handler]); }
  click() { this.listeners.get("click")?.forEach(handler => (handler as (event: unknown) => void)({ stopPropagation() {} })); }
}
const red = stackId("red_glow_stick");
const active = () => ({ ...freshStack(red), glow: { state: "active" as const } });
function screen() {
  const value = Object.create(InventoryScreen.prototype);
  Object.assign(value, { inventory: new Inventory(), cursor: null, grid: Array(9).fill(null), width: 3, atlas: {}, mode: "survival", render: vi.fn() });
  return value;
}
function game() {
  const value = Object.assign(Object.create(Game.prototype), { markComposterStoreRecovery:vi.fn(), statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] });
  const ownership = () => ({ busy: false, reconcileLoadedReferences: vi.fn(), validateCrossReferences: vi.fn() });
  Object.assign(value, { inventory: new Inventory(), leashes: ownership(), balloons: ownership(), recoverySections: [], recoveryOriginal: null,
    stopped: false, dead: false, paused: false, screenOpen: () => false, hud: { message: vi.fn() }, glowStickView: { update: vi.fn(), shake: vi.fn() },
    leashContext: () => ({}), markLeashRecovery: vi.fn(), markBalloonRecovery: vi.fn(), keyboard: { reset: vi.fn() }, name: "Recovery", savePayload: vi.fn(() => '{"version":1}') });
  return value;
}
beforeEach(() => vi.stubGlobal("document", { createElement: () => new Cell() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("actual bag click retains both owners when the inventory refuses a write", () => {
  const ui = screen(); ui.inventory.setSlot(0, active()); ui.cursor = freshStack(red, 2);
  const before = JSON.stringify(ui.inventory.toJSON()), cursor = ui.cursor;
  vi.spyOn(ui.inventory, "setSlot").mockReturnValue(false);
  ui.slotCell(0).click(); expect(ui.cursor).toBe(cursor); expect(JSON.stringify(ui.inventory.toJSON())).toBe(before);
  ui.cursor = null; ui.slotCell(0).click(); expect(ui.cursor).toBeNull(); expect(JSON.stringify(ui.inventory.toJSON())).toBe(before);
});
it("actual bag and work-cell clicks preserve active/inactive identity and detached ownership", () => {
  const ui = screen(); ui.inventory.setSlot(0, active()); ui.cursor = freshStack(red, 2);
  ui.slotCell(0).click(); expect(ui.cursor).toEqual(active()); expect(ui.inventory.slots[0]).toEqual(freshStack(red, 2));
  ui.grid[0] = freshStack(red, 4); const cursor = ui.cursor, cell = ui.grid[0];
  ui.inputCell(0, "Input").click(); expect(ui.cursor).toBe(cursor); expect(ui.grid[0]).toBe(cell);
  for (const count of [NaN, undefined, .5]) { ui.cursor = { ...active(), count }; ui.grid[0] = null; const bad = ui.cursor; ui.inputCell(0, "Input").click(); expect(ui.cursor).toBe(bad); expect(ui.grid[0]).toBeNull(); }
  ui.cursor = cursor; ui.grid[0] = null; ui.inputCell(0, "Input").click(); expect(ui.cursor).toBeNull(); expect(ui.grid[0]).toEqual(active());
  expect(ui.grid[0].glow).not.toBe(cursor.glow);
});
it("actual chemistry output checks cursor state and capacity before consuming ingredients", () => {
  const ui = screen(), consume = vi.fn();
  for (const cursor of [active(), { id: red, count: 1 }, freshStack(red, 64)]) {
    ui.cursor = cursor; ui.resultCell({ id: red }, consume)[0].click(); expect(ui.cursor).toBe(cursor);
  }
  expect(consume).not.toHaveBeenCalled(); ui.cursor = freshStack(red, 63);
  ui.resultCell({ id: red }, consume)[0].click(); expect(consume).toHaveBeenCalledTimes(1); expect(ui.cursor).toEqual(freshStack(red, 64));
});
it("actual crafting output refuses incompatible cursor without ingredient debit, then crafts a fresh inactive unit", () => {
  const ui = screen();
  ui.grid = ["polyethylene", "hydrogen_peroxide", "polyethylene", "polyethylene", "red_dye", "polyethylene", "polyethylene", "luminol", "polyethylene"].map(name => freshStack(stackId(name)));
  const before = JSON.stringify(ui.grid); ui.cursor = active();
  ui.craftingSection().children[2].click(); expect(JSON.stringify(ui.grid)).toBe(before); expect(ui.cursor).toEqual(active());
  ui.cursor = freshStack(red, 63); ui.craftingSection().children[2].click();
  expect(ui.cursor).toEqual(freshStack(red, 64)); expect(ui.grid.every((cell: unknown) => cell === null)).toBe(true);
});
it("actual Game activation obeys lifecycle/modal/transfer/recovery guards without an ownership or visual change", () => {
  for (const key of ["paused", "dead", "stopped", "modal", "transfer", "recovery"]) {
    const g = game(); g.inventory.setSlot(0, freshStack(red, 2));
    if (key === "modal") g.screenOpen = () => true;
    else if (key === "transfer") g.leashes.busy = true;
    else if (key === "recovery") g.recoverySections.push("saved items");
    else g[key] = true;
    const before = JSON.stringify(g.inventory.toJSON()); expect(g.tryShakeSelectedGlow()).toBe(false);
    expect(JSON.stringify(g.inventory.toJSON())).toBe(before); expect(g.glowStickView.shake).not.toHaveBeenCalled();
  }
});
it("actual Game activation atomically splits, refuses a full bag, and never restarts an active stick", () => {
  const g = game(); g.inventory.setSlot(0, freshStack(red, 2)); expect(g.tryShakeSelectedGlow()).toBe(true);
  expect(g.inventory.slots[0]).toEqual(active()); expect(g.inventory.slots[1]).toEqual(freshStack(red));
  const after = JSON.stringify(g.inventory.toJSON()); expect(g.tryShakeSelectedGlow()).toBe(false); expect(JSON.stringify(g.inventory.toJSON())).toBe(after);
  expect(g.glowStickView.shake).toHaveBeenCalledTimes(1);
  const full = game(); full.inventory.slots.fill(freshStack(stackId("coal"), 64)); full.inventory.setSlot(0, freshStack(red, 2));
  const before = JSON.stringify(full.inventory.toJSON()); expect(full.tryShakeSelectedGlow()).toBe(false); expect(JSON.stringify(full.inventory.toJSON())).toBe(before);
  expect(full.glowStickView.shake).not.toHaveBeenCalled(); full.inventory.setSlot(0, freshStack(red)); expect(full.tryShakeSelectedGlow()).toBe(true);
});
it("raw duplicate furnace diagnostics reach Game before map repair, block saving, and export the byte-exact original", async () => {
  const furnace = { x: 0, y: 32, z: 0, state: { input: active(), fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 } };
  const original = JSON.stringify({ version: 1, name: "Recovery", seed: 1, mode: "survival", timeOfDay: .2,
    player: { position: { x: 0, y: 32, z: 0 }, yaw: 0, pitch: 0, flying: false }, edits: [], inventory: new Inventory().toJSON(), furnaces: [furnace, furnace] }, null, 2);
  const storage = { getItem: vi.fn(() => original), setItem: vi.fn() }; vi.stubGlobal("localStorage", storage);
  const parsed = parseSave(original); expect(parsed.glowOwnershipIssues?.length).toBeGreaterThan(0);
  const g = game(); g.markGlowRecovery(parsed); expect(g.recoveryOriginal).toBe(original); expect(g.recoverySections).toEqual(["saved items"]);
  const writer = Game as unknown as { activeWriter: Game | null }; writer.activeWriter = g;
  expect(g.save()).toBe(false); expect(storage.setItem).not.toHaveBeenCalled(); expect(g.savePayload).not.toHaveBeenCalled(); writer.activeWriter = null;
  let backup: Blob | undefined; vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { backup = blob as Blob; return "blob:backup"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); vi.useFakeTimers();
  g.exportSaveBackup(); expect(JSON.parse(await backup!.text()).recoveryOriginalSave).toBe(original); expect(storage.setItem).not.toHaveBeenCalled();
});

it("actual HUD Shake click uses its callback and same-slot metadata transition updates readable state", () => {
  const shake = vi.fn();
  const hud = new Hud(new Cell() as unknown as HTMLElement, {} as never, { onShakeGlow: shake } as never, false);
  const inventory = new Inventory(); inventory.setSlot(0, freshStack(red));
  hud.update(inventory, "survival", 20, 20, 0);
  const view = hud as unknown as { shakeGlow: Cell & { hidden: boolean; disabled: boolean }; slots: Cell[]; itemName: Cell };
  expect(view.shakeGlow.hidden).toBe(false); expect(view.shakeGlow.disabled).toBe(false);
  expect(view.slots[0].children[0]).toMatchObject({ alt: expect.stringContaining("Ready to shake") });
  view.shakeGlow.click(); expect(shake).toHaveBeenCalledTimes(1);
  inventory.activateSelectedGlow(); hud.update(inventory, "survival", 20, 20, 0);
  expect(view.shakeGlow.disabled).toBe(true); expect(view.shakeGlow.textContent).toBe("Glowing");
  expect(view.slots[0].children[0]).toMatchObject({ alt: expect.stringContaining("Glowing") });
  expect(view.itemName.textContent).toContain("Glowing");
});
it("actual Game Agent handoff copies one active unit in creative and debits survival only after admission", () => {
  const g = game(); g.agent = createAgent(0, 32, 0); g.mode = "creative"; g.inventory.setSlot(0, active());
  const source = g.inventory.selectedStack(); g.giveHeldToAgent();
  expect(g.inventory.selectedStack()).toBe(source); expect(g.agent.slots[0]).toEqual(active()); expect(g.agent.slots[0].glow).not.toBe(source.glow);
  g.mode = "survival"; g.agent.slots.fill(freshStack(stackId("coal"), 64)); const before = JSON.stringify(g.inventory.toJSON());
  g.giveHeldToAgent(); expect(JSON.stringify(g.inventory.toJSON())).toBe(before);
  g.agent.slots[0] = null; g.giveHeldToAgent(); expect(g.inventory.selectedStack()).toBeNull(); expect(g.agent.slots[0]).toEqual(active());
});
