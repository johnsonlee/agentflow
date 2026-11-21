import { afterEach, expect, it, vi } from "vitest";
import { KeyboardMouseInput } from "../src/devices/keyboard-mouse";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const send = (target: EventTarget, type: string, data: object = {}) => { const e = new Event(type, { cancelable: true }); for (const [key, value] of Object.entries(data)) Object.defineProperty(e, key, { value, configurable: true }); target.dispatchEvent(e); };
it("actual canvas mousecancel clears all mouse buttons/latched actions while preserving held movement and keyboard one-shots", () => {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget(); vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
  const input = new KeyboardMouseInput(canvas as unknown as HTMLElement);
  try {
    send(win, "keydown", { code: "KeyW" }); send(win, "keydown", { code: "Digit3" });
    send(win, "keydown", { code: "Space", repeat: false, timeStamp: 10 }); send(win, "keyup", { code: "Space" }); send(win, "keydown", { code: "Space", repeat: false, timeStamp: 90 });
    for (const button of [0, 1, 2]) send(canvas, "mousedown", { button }); send(canvas, "wheel", { deltaY: 1 });
    send(canvas, "pointercancel", { pointerType: "mouse" }); const frame = input.poll();
    expect(frame).toMatchObject({ breaking: false, using: false, place: false, pick: false, forward: 1, jump: true, hotbarSlot: 2, hotbarScroll: 1, toggleFly: true });
  } finally { input.dispose(); }
});
it("any canvas pointercancel clears possible compatibility mouse buttons and the listener is disposed", () => {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget(); vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
  const add = vi.spyOn(canvas, "addEventListener"), remove = vi.spyOn(canvas, "removeEventListener"), input = new KeyboardMouseInput(canvas as unknown as HTMLElement);
  for (const pointerType of ["touch", "pen"]) {
    send(canvas, "mousedown", { button: 2 }); send(canvas, "pointercancel", { pointerType }); expect(input.poll().using).toBe(false);
  }
  const handler = add.mock.calls.find(([type]) => type === "pointercancel")?.[1]; input.dispose();
  expect(handler).toBeDefined(); expect(remove).toHaveBeenCalledWith("pointercancel", handler, undefined);
});
