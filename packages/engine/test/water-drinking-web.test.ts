import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach, expect, it, vi } from "vitest";
import { Inventory, blockId, createHunger, freshStack, stackId } from "../src";
import { KeyboardMouseInput } from "../../input/src/devices/keyboard-mouse";
import { Game } from "../../../apps/web/src/application/game";
function game(cells: Record<string, number> = {}) {
  const g = Object.assign(Object.create(Game.prototype), { statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] }), ownership = () => ({ busy: false, records: [], reconcileLoadedReferences: vi.fn(), validateCrossReferences: vi.fn() });
  Object.assign(g, { inventory: new Inventory(), hunger: createHunger(), playerStatus: {}, recoverySections: [], recoveryOriginal: null, drinkOwner: null,
    leashes: ownership(), balloons: ownership(), paused: false, dead: false, stopped: false, running: true, touch: true, mode: "survival", health: 20,
    world: { composters: {busy:false,loadIssues:[],isDisposed:false}, getBlock: (x: number, y: number, z: number) => cells[`${x},${y},${z}`] ?? 0, setBlock: vi.fn() }, body: { position: { x: .5, y: 32, z: .5 }, yaw: 0, pitch: 0, velocity: { x: 0, y: 0, z: 0 } },
    mobs: { raycast: () => null }, hud: { message: vi.fn(), flashDamage: vi.fn() }, keyboard: { reset: vi.fn(), enabled: true, requestPointerLock: vi.fn() }, screenOpen: () => false,
    placeCooldown: 0, creativeCooldown: 0, attackCooldown: 0, eatTimer: 0, redstone: { interact: () => false }, openInventory: vi.fn(), openNpcDialog: vi.fn(),
    save: vi.fn(() => true), events: { onPause: vi.fn(), onDeath: vi.fn() }, spawn: { x: 2, y: 32, z: 2 }, lastPos: { x: .5, z: .5 } });
  for (const field of ["chat", "chalkDialog", "bookScreen", "codeBuilder", "npcDialog", "portfolioScreen"]) g[field] = { open: false, hide: vi.fn() };
  g.inventoryScreen = { open: false, resumePending: vi.fn(() => false), freezeForDeath: vi.fn() };
  g.inventory.setSlot(0, freshStack(stackId("water_bottle")));
  return g;
}
const hold = (g: ReturnType<typeof game>, dt: number) => g.interact(false, false, true, false, dt);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("actual full-hunger hold finishes at1.6s, returns exactly one empty container and leaves hunger/status/Poison unchanged", () => {
  for (const mode of ["survival", "creative"]) {
    const g = game(); g.mode = mode; g.playerStatus = { poison: { remaining: 4, elapsed: .3 } }; const before = JSON.stringify([g.hunger, g.playerStatus]);
    hold(g, 1.59); expect(g.inventory.selectedStack().id).toBe(stackId("water_bottle")); hold(g, .01);
    expect(g.inventory.selectedStack()).toEqual({ id: stackId("glass_bottle"), count: 1 }); expect(JSON.stringify([g.hunger, g.playerStatus])).toBe(before); expect(g.health).toBe(20); expect(g.world.setBlock).not.toHaveBeenCalled();
    hold(g, 3); expect(g.inventory.selectedStack()).toEqual({ id: stackId("glass_bottle"), count: 1 }); expect(g.drinkOwner).toBeNull();
  }
});
it("actual release and source replacement/count changes restart a separate owner-bound clock", () => {
  const released = game(); hold(released, 1); released.interact(false, false, false, false, .1); hold(released, .7); expect(released.inventory.selectedStack().id).toBe(stackId("water_bottle")); hold(released, .9); expect(released.inventory.selectedStack().id).toBe(stackId("glass_bottle"));
  const replaced = game(); hold(replaced, 1.2); replaced.inventory.setSlot(0, freshStack(stackId("water_bottle"))); hold(replaced, .5); expect(replaced.inventory.selectedStack().id).toBe(stackId("water_bottle")); hold(replaced, 1.1); expect(replaced.inventory.selectedStack().id).toBe(stackId("glass_bottle"));
  const count = game(); hold(count, 1); count.inventory.slots[0]!.count = 2; hold(count, .7); expect(count.inventory.slots[0]!.count).toBe(2); count.inventory.slots[0]!.count = 1; hold(count, .9); expect(count.inventory.selectedStack().id).toBe(stackId("water_bottle")); hold(count, .7); expect(count.inventory.selectedStack().id).toBe(stackId("glass_bottle"));
});
it("actual hotbar helper and digit key intent cancel away-and-back selection between simulation frames", () => {
  const ui = game(); hold(ui, 1); ui.selectHotbar(1); ui.selectHotbar(0); hold(ui, .7); expect(ui.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  const keys = game(); hold(keys, 1); keys.onKey({ code: "Digit2" }); keys.onKey({ code: "Digit1" }); hold(keys, .7); expect(keys.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  const index = game(); index.inventory.setSlot(1, freshStack(stackId("water_bottle"))); hold(index, 1); index.inventory.selected = 1; hold(index, .7); expect(index.inventory.slots[1]!.id).toBe(stackId("water_bottle"));
});
it("actual modal, pause, ownership/recovery/death and stopped guards cancel progress before any container commit", () => {
  vi.stubGlobal("document", { pointerLockElement: null });
  for (const field of ["paused", "dead", "stopped", "modal", "recovery", "transfer"]) {
    const g = game(); hold(g, 1);
    if (field === "modal") g.screenOpen = () => true; else if (field === "recovery") g.recoverySections.push("saved items"); else if (field === "transfer") g.leashes.busy = true; else g[field] = true;
    hold(g, 1); expect(g.drinkOwner).toBeNull(); expect(g.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  }
  const pause = game(); hold(pause, 1); pause.pause(); expect(pause.drinkOwner).toBeNull(); pause.resume(); hold(pause, .7); expect(pause.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  const modal = game(); hold(modal, 1); modal.suspendInput(); expect(modal.drinkOwner).toBeNull(); expect(modal.keyboard.enabled).toBe(false);
  const stop = game(); hold(stop, 1); stop.save.mockReturnValue(false); expect(stop.stop()).toBe(false); expect(stop.drinkOwner).toBeNull();
});
it("actual mode change, death and respawn clear partial use and a new session starts from zero", () => {
  vi.stubGlobal("document", { pointerLockElement: null });
  const mode = game(); hold(mode, 1); mode.setMode("creative"); hold(mode, .7); expect(mode.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  const dead = game(); hold(dead, 1); dead.health = 1; dead.tryDeathTransfer = vi.fn(() => true); dead.hurt(2, "fall"); expect(dead.dead).toBe(true); expect(dead.drinkOwner).toBeNull();
  dead.drinkOwner = { elapsed: 1 }; dead.resumeInput = vi.fn(); expect(dead.respawn()).toBe(true); expect(dead.drinkOwner).toBeNull();
  const cold = game(); hold(cold, .7); expect(cold.inventory.selectedStack().id).toBe(stackId("water_bottle"));
});
it("actual NPC/station/balloon/ordinary-actor priority interrupts drinking; full bag needs no spare destination", () => {
  for (const name of ["crafting_table", "furnace", "element_constructor"]) {
    const g = game({ "0,33,-2": blockId(name) }); g.furnaces = new Map(); g.drinkOwner = { elapsed: 1 };
    g.interact(false, true, true, false, 2); expect(g.inventory.selectedStack().id).toBe(stackId("water_bottle")); expect(g.drinkOwner).toBeNull(); expect(g.openInventory).toHaveBeenCalledOnce();
  }
  const npc = game(); npc.mobs.raycast = () => ({ distance: 1, mob: { id: 3, kind: "npc" } }); npc.interact(false, true, true, false, 2); expect(npc.openNpcDialog).toHaveBeenCalledOnce(); expect(npc.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  const mob = game(); mob.mobs.raycast = () => ({ distance: 1, mob: { id: 3, kind: "pig" } }); hold(mob, 2); expect(mob.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  const balloon = game(); balloon.balloons.records = [{ key: 1, phase: "active", position: { x: .5, y: 33.4, z: -1 } }]; hold(balloon, 2); expect(balloon.inventory.selectedStack().id).toBe(stackId("water_bottle"));
  const full = game(); for (let i = 1; i < 36; i++) full.inventory.setSlot(i, freshStack(stackId("coal"), 64)); const refs = full.inventory.slots.slice(1); hold(full, 1.6);
  expect(full.inventory.selectedStack()).toEqual({ id: stackId("glass_bottle"), count: 1 }); refs.forEach((owner:unknown, i:number) => expect(full.inventory.slots[i + 1]).toBe(owner));
});
it("actual invalid owner and atomic reducer refusal never debit, and ongoing hold cannot refill the empty result", () => {
  for (const count of [0, 2, NaN]) { const bad = game(); bad.inventory.slots[0] = { id: stackId("water_bottle"), count }; hold(bad, 1.6); expect(bad.inventory.slots[0]!.count).toBe(count); expect(bad.hud.message).toHaveBeenCalledWith("This bottle needs attention before it can be used."); }
  const refused = game(); const source = refused.inventory.selectedStack(); vi.spyOn(refused.inventory, "drinkSelectedWaterBottle").mockReturnValue({ ok: false, reason: "invalid-state" }); hold(refused, 1.6); expect(refused.inventory.selectedStack()).toBe(source); expect(refused.drinkOwner).toBeNull();
  const water = game({ "0,33,-2": blockId("water") }); hold(water, 1.6); expect(water.inventory.selectedStack().id).toBe(stackId("glass_bottle")); hold(water, 2); expect(water.inventory.selectedStack().id).toBe(stackId("glass_bottle")); water.interact(false, true, false, false, .1); expect(water.inventory.selectedStack().id).toBe(stackId("water_bottle"));
});
it("actual Chat opens and cancels partial use immediately, even before another simulation frame", () => {
  vi.stubGlobal("document", { pointerLockElement: null }); const g = game(); g.chat.show = vi.fn(); hold(g, 1);
  g.openChat("/"); expect(g.chat.show).toHaveBeenCalledWith("/"); expect(g.drinkOwner).toBeNull();
});

it("actual canvas pointer cancellation clears PC use without needing mouseup/blur, while ordinary mouse pointerup is not a right-use release", () => {
  const mouse = game(); hold(mouse, .7); mouse.endDrinkPointer({ type: "pointercancel", pointerType: "mouse" }); expect(mouse.drinkOwner).toBeNull();
  const touch = game(); hold(touch, .7); touch.endDrinkPointer({ type: "pointerup", pointerType: "touch" }); expect(touch.drinkOwner).toBeNull();
  const other = game(); hold(other, .7); other.endDrinkPointer({ type: "pointerup", pointerType: "mouse" }); expect(other.drinkOwner.elapsed).toBe(.7);
});

it("actual mousecancel releases underlying use without dropping W and later polls cannot drink without a fresh press", () => {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget(); vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
  const input = new KeyboardMouseInput(canvas as unknown as HTMLElement), g = game(); g.keyboard = input;
  const send = (target: EventTarget, type: string, data: object) => { const event = new Event(type); Object.assign(event, data); target.dispatchEvent(event); };
  canvas.addEventListener("pointercancel", e => g.endDrinkPointer(e as PointerEvent));
  try {
    send(win, "keydown", { code: "KeyW" }); send(canvas, "mousedown", { button: 2 }); let frame = input.poll(); g.interact(frame.breaking, frame.place, frame.using, frame.pick, .7);
    send(canvas, "pointercancel", { pointerType: "mouse" }); expect(g.drinkOwner).toBeNull();
    for (let i = 0; i < 2; i++) { frame = input.poll(); expect(frame.forward).toBe(1); g.interact(frame.breaking, frame.place, frame.using, frame.pick, .8); }
    expect(g.inventory.selectedStack()).toEqual({ id: stackId("water_bottle"), count: 1 }); expect(input.poll().using).toBe(false);
    send(canvas, "mousedown", { button: 2 }); for (let i = 0; i < 2; i++) { frame = input.poll(); g.interact(frame.breaking, frame.place, frame.using, frame.pick, .8); }
    expect(g.inventory.selectedStack()).toEqual({ id: stackId("glass_bottle"), count: 1 });
  } finally { input.dispose(); }
});
