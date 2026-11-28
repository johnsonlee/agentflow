export interface StickVector {
  /** -1..1, positive = right. */
  x: number;
  /** -1..1, positive = forward (up on screen). */
  y: number;
  /** 0..1 after the dead zone is removed. */
  magnitude: number;
}

/**
 * Converts a touch offset from the joystick centre (screen pixels, +y = down) into a
 * normalised movement vector, clamping to the ring and rescaling past the dead zone.
 */
export function joystickVector(dx: number, dy: number, radius: number, deadZone = 0.15): StickVector {
  const dist = Math.hypot(dx, dy);
  if (radius <= 0 || dist === 0) return { x: 0, y: 0, magnitude: 0 };
  const raw = Math.min(1, dist / radius);
  if (raw <= deadZone) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = (raw - deadZone) / (1 - deadZone);
  return { x: (dx / dist) * magnitude, y: (-dy / dist) * magnitude, magnitude };
}

/** Where to draw the knob: the touch point clamped to the joystick ring. */
export function knobOffset(dx: number, dy: number, radius: number): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist <= radius || dist === 0) return { x: dx, y: dy };
  return { x: (dx / dist) * radius, y: (dy / dist) * radius };
}

export type TouchGesture = "tap" | "hold" | "drag" | "pending";

/**
 * Bedrock-style touch classification on the look area: a quick, still touch is a tap
 * (place / use), a long still touch is a hold (break) and moving turns it into a camera drag.
 */
export function classifyTouch(elapsedMs: number, movedPx: number, ended: boolean, holdMs = 300, slopPx = 10): TouchGesture {
  if (movedPx > slopPx) return "drag";
  if (elapsedMs >= holdMs) return "hold";
  return ended ? "tap" : "pending";
}
