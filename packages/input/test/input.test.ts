import { describe, expect, it } from "vitest";
import { DoubleTap, classifyTouch, emptyFrame, joystickVector, knobOffset, mergeFrames } from "../src";

describe("virtual joystick", () => {
  it("returns zero inside the dead zone", () => {
    expect(joystickVector(3, 3, 50)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(joystickVector(0, 0, 50).magnitude).toBe(0);
  });

  it("maps up on screen to forward and right to strafe right", () => {
    const up = joystickVector(0, -50, 50);
    expect(up.y).toBeCloseTo(1);
    expect(up.x).toBeCloseTo(0);
    const right = joystickVector(50, 0, 50);
    expect(right.x).toBeCloseTo(1);
  });

  it("clamps beyond the ring and scales smoothly", () => {
    expect(joystickVector(0, -500, 50).magnitude).toBeCloseTo(1);
    const half = joystickVector(0, -25, 50, 0);
    expect(half.y).toBeCloseTo(0.5);
    const diag = joystickVector(100, 100, 50);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
  });

  it("keeps the knob within the ring", () => {
    expect(knobOffset(10, 0, 50)).toEqual({ x: 10, y: 0 });
    const k = knobOffset(0, 200, 50);
    expect(k.y).toBeCloseTo(50);
  });
});

describe("touch gestures", () => {
  it("classifies tap, hold and drag", () => {
    expect(classifyTouch(120, 2, true)).toBe("tap");
    expect(classifyTouch(120, 2, false)).toBe("pending");
    expect(classifyTouch(500, 3, false)).toBe("hold");
    expect(classifyTouch(80, 40, false)).toBe("drag");
    expect(classifyTouch(800, 40, true)).toBe("drag");
  });
});

describe("input frames", () => {
  it("merges keyboard and touch input with clamping", () => {
    const a = { ...emptyFrame(), forward: 1, place: true, hotbarSlot: 3 };
    const b = { ...emptyFrame(), forward: 0.7, strafe: -0.5, jump: true, lookYaw: 0.1 };
    const m = mergeFrames([a, b]);
    expect(m.forward).toBe(1);
    expect(m.strafe).toBe(-0.5);
    expect(m.jump && m.place).toBe(true);
    expect(m.hotbarSlot).toBe(3);
    expect(m.lookYaw).toBeCloseTo(0.1);
  });

  it("detects double taps within the window only", () => {
    const d = new DoubleTap(300);
    expect(d.press(0)).toBe(false);
    expect(d.press(200)).toBe(true);
    expect(d.press(300)).toBe(false);
    expect(d.press(900)).toBe(false);
  });
});
