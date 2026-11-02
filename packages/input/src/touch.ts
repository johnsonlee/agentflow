import { emptyFrame, type InputFrame } from "./actions";
import { classifyTouch, joystickVector, knobOffset } from "./joystick-math";

export interface TouchControlsOptions {
  /** Radians per pixel of drag on the look area. */
  sensitivity?: number;
  /** Joystick ring radius in CSS pixels. */
  radius?: number;
}

interface LookTouch {
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
  private look: LookTouch | null = null;
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

    stickZone.addEventListener("touchstart", (e) => this.onStickStart(e), { passive: false });
    stickZone.addEventListener("touchmove", (e) => this.onStickMove(e), { passive: false });
    stickZone.addEventListener("touchend", (e) => this.onStickEnd(e));
    stickZone.addEventListener("touchcancel", (e) => this.onStickEnd(e));

    lookArea.addEventListener("touchstart", (e) => this.onLookStart(e), { passive: false });
    lookArea.addEventListener("touchmove", (e) => this.onLookMove(e), { passive: false });
    lookArea.addEventListener("touchend", (e) => this.onLookEnd(e));
    lookArea.addEventListener("touchcancel", (e) => this.onLookEnd(e));

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

  private onStickStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.stickId !== null) return;
    const t = e.changedTouches[0];
    this.stickId = t.identifier;
    // Floating joystick: re-centre where the thumb lands.
    const zone = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.stickOrigin = { x: t.clientX, y: t.clientY };
    this.base.style.left = `${t.clientX - zone.left}px`;
    this.base.style.top = `${t.clientY - zone.top}px`;
    this.base.classList.add("active");
    this.updateStick(t.clientX, t.clientY);
  }

  private onStickMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) this.updateStick(t.clientX, t.clientY);
    }
  }

  private onStickEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.stick = { x: 0, y: 0 };
        this.base.classList.remove("active");
        this.resetKnob();
      }
    }
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

  private onLookStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.look) return;
    const t = e.changedTouches[0];
    this.look = {
      id: t.identifier,
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      lastY: t.clientY,
      startTime: performance.now(),
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

  private onLookMove(e: TouchEvent): void {
    e.preventDefault();
    const look = this.look;
    if (!look) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== look.id) continue;
      this.lookX += t.clientX - look.lastX;
      this.lookY += t.clientY - look.lastY;
      look.lastX = t.clientX;
      look.lastY = t.clientY;
      look.moved = Math.max(look.moved, Math.hypot(t.clientX - look.startX, t.clientY - look.startY));
    }
  }

  private onLookEnd(e: TouchEvent): void {
    const look = this.look;
    if (!look) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== look.id) continue;
      if (classifyTouch(performance.now() - look.startTime, look.moved, true) === "tap") this.place = true;
      if (this.holdTimer) clearTimeout(this.holdTimer);
      this.look = null;
    }
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
  b.addEventListener("touchstart", (e) => {
    e.preventDefault();
    b.classList.add("pressed");
    onChange(true);
  }, { passive: false });
  const up = () => {
    b.classList.remove("pressed");
    onChange(false);
  };
  b.addEventListener("touchend", up);
  b.addEventListener("touchcancel", up);
}
