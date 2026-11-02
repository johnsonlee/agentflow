import { DoubleTap, emptyFrame, type InputFrame } from "./actions";

export interface KeyboardMouseOptions {
  /** Radians per pixel of mouse movement. */
  sensitivity?: number;
}

/**
 * Java/Bedrock PC controls: WASD move, Space jump (double-tap to fly), Shift sneak/descend,
 * Ctrl sprint, mouse look (pointer lock), left click break, right click place,
 * middle click pick, 1-9 / wheel hotbar.
 */
export class KeyboardMouseInput {
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private breaking = false;
  /** Latches a click so a press shorter than one frame still breaks a block. */
  private breakClicked = false;
  private place = false;
  private pick = false;
  private toggleFly = false;
  private slot: number | null = null;
  private scroll = 0;
  private readonly flyTap = new DoubleTap();
  private readonly sensitivity: number;
  private readonly disposers: Array<() => void> = [];
  enabled = true;

  constructor(
    private readonly target: HTMLElement,
    options: KeyboardMouseOptions = {},
  ) {
    this.sensitivity = options.sensitivity ?? 0.0025;
    this.listen(window, "keydown", (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, "keyup", (e) => this.keys.delete((e as KeyboardEvent).code));
    this.listen(window, "blur", () => this.reset());
    this.listen(document, "mousemove", (e) => this.onMouseMove(e as MouseEvent));
    this.listen(target, "mousedown", (e) => this.onMouseDown(e as MouseEvent));
    this.listen(window, "mouseup", (e) => {
      if ((e as MouseEvent).button === 0) this.breaking = false;
    });
    this.listen(target, "wheel", (e) => {
      this.scroll += Math.sign((e as WheelEvent).deltaY);
    }, { passive: true });
    this.listen(target, "contextmenu", (e) => e.preventDefault());
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.target;
  }

  requestPointerLock(): void {
    try {
      const result = this.target.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Pointer lock is unavailable (e.g. some embedded browsers); drag-to-look still works.
    }
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Returns and clears the accumulated input since the last call. */
  poll(): InputFrame {
    const f = emptyFrame();
    if (!this.enabled) {
      this.consume();
      return f;
    }
    const k = this.keys;
    f.forward = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    f.strafe = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    f.jump = k.has("Space");
    f.descend = k.has("ShiftLeft") || k.has("ShiftRight");
    f.sprint = k.has("ControlLeft") || k.has("ControlRight") || k.has("KeyR");
    f.lookYaw = -this.lookX * this.sensitivity;
    f.lookPitch = -this.lookY * this.sensitivity;
    f.breaking = this.breaking || this.breakClicked;
    f.place = this.place;
    f.pick = this.pick;
    f.toggleFly = this.toggleFly;
    f.hotbarSlot = this.slot;
    f.hotbarScroll = this.scroll;
    this.consume();
    return f;
  }

  reset(): void {
    this.keys.clear();
    this.breaking = false;
    this.consume();
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }

  private consume(): void {
    this.lookX = 0;
    this.lookY = 0;
    this.breakClicked = false;
    this.place = false;
    this.pick = false;
    this.toggleFly = false;
    this.slot = null;
    this.scroll = 0;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (e.code === "Space" && !e.repeat && this.flyTap.press(performance.now())) this.toggleFly = true;
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) this.slot = n - 1;
    }
    this.keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.enabled) return;
    // With pointer lock use raw deltas; without it, look while a button is held (drag to look).
    if (this.pointerLocked || e.buttons & 4) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled) return;
    if (e.button === 0) {
      this.breaking = true;
      this.breakClicked = true;
    }
    else if (e.button === 2) this.place = true;
    else if (e.button === 1) {
      this.pick = true;
      e.preventDefault();
    }
  }

  private listen(t: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.disposers.push(() => t.removeEventListener(type, fn, opts));
  }
}
