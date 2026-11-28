import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hud } from "../../../apps/web/src/ui/hud";
import { KeyboardMouseInput } from "../../input/src/devices/keyboard-mouse";
vi.mock("../../../apps/web/src/ui/icons", () => ({ blockIcon: () => "test:unused-icon" }));

/** Node EventTarget harness: supplies only DOM construction and explicit bubble ancestry.
 * The actual Hud registers the button listener; actual KeyboardMouseInput registers window listeners.
 * Native browser focus, default button click synthesis and Game modal dispatch are separate browser proof. */
class Key extends Event {
  stopped = false;
  constructor(readonly code: string, type = "keydown", readonly repeat = false) { super(type, { bubbles: true, cancelable: true }); }
  override stopPropagation() { this.stopped = true; super.stopPropagation(); }
}
class Cell extends EventTarget {
  children: Cell[] = []; parent: EventTarget | null = null;
  dataset: Record<string, string> = {}; className = ""; textContent = "";
  setAttribute(_name: string, _value: string) {}
  append(...cells: Cell[]) { for (const cell of cells) { cell.parent = this; this.children.push(cell); } }
  appendChild(cell: Cell) { this.append(cell); return cell; }
  prepend(...cells: Cell[]) { for (const cell of cells) cell.parent = this; this.children.unshift(...cells); }
  override dispatchEvent(event: Event): boolean {
    const result = super.dispatchEvent(event);
    if (event.bubbles && !(event as Key).stopped) this.parent?.dispatchEvent(event);
    return result;
  }
}
let input: KeyboardMouseInput;
let button: Cell;
let windowTarget: EventTarget;
let shake: ReturnType<typeof vi.fn>;
beforeEach(() => {
  windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { createElement: () => new Cell(), pointerLockElement: null });
  vi.stubGlobal("window", windowTarget); vi.stubGlobal("document", documentTarget);
  const container = new Cell(); container.parent = windowTarget;
  shake = vi.fn();
  const hud = new Hud(container as unknown as HTMLElement, {} as never, { onShakeGlow: shake } as never, false);
  button = (hud as unknown as { shakeGlow: Cell }).shakeGlow;
  input = new KeyboardMouseInput(new Cell() as unknown as HTMLElement);
});
afterEach(() => { input.dispose(); vi.unstubAllGlobals(); });

it("focused actual Shake button lets Digit2 reach actual window keyboard input", () => {
  const key = new Key("Digit2"); button.dispatchEvent(key);
  expect(key.stopped).toBe(false); expect(input.poll().hotbarSlot).toBe(1);
  button.dispatchEvent(new Key("Digit2", "keyup")); expect(input.isDown("Digit2")).toBe(false);
});
it("focused actual Shake button passes inventory/pause keys and movement through window", () => {
  const seen: string[] = []; windowTarget.addEventListener("keydown", e => seen.push((e as Key).code));
  for (const code of ["KeyE", "Escape", "KeyW"]) button.dispatchEvent(new Key(code));
  expect(seen).toEqual(["KeyE", "Escape", "KeyW"]);
  expect(input.isDown("KeyE")).toBe(true); expect(input.isDown("Escape")).toBe(true); expect(input.poll().forward).toBe(1);
  button.dispatchEvent(new Key("KeyW", "keyup")); expect(input.poll().forward).toBe(0);
});
it("Space/Enter stay local without preventing native button default activation", () => {
  const seen: string[] = []; windowTarget.addEventListener("keydown", e => seen.push((e as Key).code));
  for (const code of ["Space", "Enter", "NumpadEnter"]) {
    const key = new Key(code); button.dispatchEvent(key);
    expect(key.stopped).toBe(true); expect(key.defaultPrevented).toBe(false); expect(input.isDown(code)).toBe(false);
  }
  expect(seen).toEqual([]); expect(input.poll().jump).toBe(false);
  button.dispatchEvent(new Event("click", { bubbles: true })); expect(shake).toHaveBeenCalledTimes(1);
});
