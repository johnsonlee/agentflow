import { emptyFrame, type InputFrame } from "./actions";
import { classifyTouch, joystickVector, knobOffset } from "./joystick-math";

export interface TouchControlsOptions {
  /** Radians per pixel of drag on the look area. */
  sensitivity?: number;
  /** Joystick ring radius in CSS pixels. */
  radius?: number;
}

interface LookPointer {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  moved: number;
  breaking: boolean;
}

/**
 * Mobile controls modelled on Minecraft Bedrock/Education touch layout:
 * a floating virtual joystick on the left half, camera drag on the right,
 * tap to place, press-and-hold to break, plus jump / fly / descend buttons.
 *
 * Built on Pointer Events, so the same controls answer to touch, mouse and pen. Each active pointer
 * is tracked by id, which keeps multi-touch (stick + look + buttons at once) working.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly radius: number;
  private readonly sensitivity: number;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private look: LookPointer | null = null;
  private lookX = 0;
  private lookY = 0;
  private place = false;
  private toggleFly = false;
  private jumpHeld = false;
  private descendHeld = false;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  enabled = true;

  constructor(
    private readonly lookArea: HTMLElement,
    container: HTMLElement,
    options: TouchControlsOptions = {},
  ) {
    this.radius = options.radius ?? 56;
    this.sensitivity = options.sensitivity ?? 0.006;

    this.root = el("div", "touch-controls");
    const stickZone = el("div", "touch-stick-zone");
    this.base = el("div", "touch-stick-base");
    this.knob = el("div", "touch-stick-knob");
    this.base.appendChild(this.knob);
    stickZone.appendChild(this.base);
    this.root.appendChild(stickZone);

    const buttons = el("div", "touch-buttons");
    const jump = button("touch-jump", "⤒", "Jump");
    const fly = button("touch-fly", "✈", "Toggle flying");
    const down = button("touch-down", "⤓", "Sneak / descend");
    buttons.append(fly, down, jump);
    this.root.appendChild(buttons);
    container.appendChild(this.root);

    stickZone.addEventListener("pointerdown", (e) => this.onStickStart(e));
    stickZone.addEventListener("pointermove", (e) => this.onStickMove(e));
    stickZone.addEventListener("pointerup", (e) => this.onStickEnd(e));
    stickZone.addEventListener("pointercancel", (e) => this.onStickEnd(e));

    lookArea.addEventListener("pointerdown", (e) => this.onLookStart(e));
    lookArea.addEventListener("pointermove", (e) => this.onLookMove(e));
    lookArea.addEventListener("pointerup", (e) => this.onLookEnd(e, true));
    lookArea.addEventListener("pointercancel", (e) => this.onLookEnd(e, false));

    holdButton(jump, (down) => (this.jumpHeld = down));
    holdButton(down, (d) => (this.descendHeld = d));
    holdButton(fly, (d) => {
      if (d) this.toggleFly = true;
    });
    this.resetKnob();
  }

  /** Current joystick vector (exposed for diagnostics and tests). */
  get stickVector(): { x: number; y: number } {
    return { ...this.stick };
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "" : "none";
  }

  poll(): InputFrame {
    const f = emptyFrame();
    if (this.enabled) {
      f.forward = this.stick.y;
      f.strafe = this.stick.x;
      f.sprint = Math.hypot(this.stick.x, this.stick.y) > 0.95;
      f.jump = this.jumpHeld;
      f.descend = this.descendHeld;
      f.lookYaw = -this.lookX * this.sensitivity;
      f.lookPitch = -this.lookY * this.sensitivity;
      f.place = this.place;
      f.breaking = this.look?.breaking ?? false;
      f.toggleFly = this.toggleFly;
    }
    this.lookX = 0;
    this.lookY = 0;
    this.place = false;
    this.toggleFly = false;
    return f;
  }

  private onStickStart(e: PointerEvent): void {
    if (!isPrimaryButton(e)) return;
    // Suppresses compatibility mouse events and focus changes.
    e.preventDefault();
    if (this.stickId !== null) return;
    this.stickId = e.pointerId;
    capture(e);
    // Floating joystick: re-centre where the thumb lands.
    const zone = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    this.base.style.left = `${e.clientX - zone.left}px`;
    this.base.style.top = `${e.clientY - zone.top}px`;
    this.base.classList.add("active");
    this.updateStick(e.clientX, e.clientY);
  }

  private onStickMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) this.updateStick(e.clientX, e.clientY);
  }

  private onStickEnd(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.stick = { x: 0, y: 0 };
    this.base.classList.remove("active");
    this.resetKnob();
  }

  private updateStick(x: number, y: number): void {
    const dx = x - this.stickOrigin.x;
    const dy = y - this.stickOrigin.y;
    const v = joystickVector(dx, dy, this.radius);
    this.stick = { x: v.x, y: v.y };
    const k = knobOffset(dx, dy, this.radius);
    this.knob.style.transform = `translate(calc(-50% + ${k.x}px), calc(-50% + ${k.y}px))`;
  }

  private resetKnob(): void {
    this.knob.style.transform = "translate(-50%, -50%)";
    this.base.style.left = "";
    this.base.style.top = "";
  }

  private onLookStart(e: PointerEvent): void {
    if (!isPrimaryButton(e)) return;
    e.preventDefault();
    if (this.look) return;
    capture(e);
    this.look = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      // Event timestamps, not handler time: a slow frame between press and release must not
      // turn a quick tap into a hold.
      startTime: e.timeStamp,
      moved: 0,
      breaking: false,
    };
    const look = this.look;
    this.holdTimer = setTimeout(() => {
      if (this.look === look && classifyTouch(performance.now() - look.startTime, look.moved, false) === "hold") {
        look.breaking = true;
      }
    }, 320);
  }

  private onLookMove(e: PointerEvent): void {
    const look = this.look;
    if (!look || e.pointerId !== look.id) return;
    this.lookX += e.clientX - look.lastX;
    this.lookY += e.clientY - look.lastY;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    look.moved = Math.max(look.moved, Math.hypot(e.clientX - look.startX, e.clientY - look.startY));
  }

  private onLookEnd(e: PointerEvent, released: boolean): void {
    const look = this.look;
    if (!look || e.pointerId !== look.id) return;
    if (released && classifyTouch(e.timeStamp - look.startTime, look.moved, true) === "tap") this.place = true;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.look = null;
  }
}

/** Touch and pen contacts, or the left mouse button. */
function isPrimaryButton(e: PointerEvent): boolean {
  return e.pointerType !== "mouse" || e.button === 0;
}

/** Keeps delivering a pointer's moves and release to the element it started on. */
function capture(e: PointerEvent): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    // The pointer is already gone (released before the handler ran).
  }
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function button(className: string, label: string, title: string): HTMLElement {
  const b = el("button", `touch-button ${className}`);
  b.textContent = label;
  b.setAttribute("aria-label", title);
  return b;
}

function holdButton(b: HTMLElement, onChange: (down: boolean) => void): void {
  const pointers = new Set<number>();
  b.addEventListener("pointerdown", (e) => {
    if (!isPrimaryButton(e)) return;
    e.preventDefault();
    capture(e);
    pointers.add(e.pointerId);
    b.classList.add("pressed");
    onChange(true);
  });
  const up = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId) || pointers.size > 0) return;
    b.classList.remove("pressed");
    onChange(false);
  };
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  // Long presses must not open the context menu over the button.
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}
