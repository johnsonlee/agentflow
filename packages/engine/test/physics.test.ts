import { describe, expect, it } from "vitest";
import {
  AIR, World, blockId, bodyOverlapsBlock, createPlayerBody, isSolid, lookDirection, raycast, stepPlayer, WALK_SPEED,
  type MoveInput,
} from "../src";

const STONE = blockId("stone");
const idle: MoveInput = { forward: 0, strafe: 0, jump: false, descend: false, sprint: false };

/** A flat test world: stone at y <= 9, air above, plus optional extra blocks. */
function flat(extra: Record<string, number> = {}) {
  return (x: number, y: number, z: number) => extra[`${x},${y},${z}`] ?? (y <= 9 ? STONE : AIR);
}

function simulate(get: ReturnType<typeof flat>, body = createPlayerBody({ x: 0.5, y: 10, z: 0.5 }), input = idle, seconds = 1) {
  for (let t = 0; t < seconds; t += 1 / 60) stepPlayer(get, body, input, 1 / 60);
  return body;
}

describe("player physics", () => {
  it("falls under gravity and lands on the ground", () => {
    const body = simulate(flat(), createPlayerBody({ x: 0.5, y: 20, z: 0.5 }), idle, 3);
    expect(body.onGround).toBe(true);
    expect(body.position.y).toBeCloseTo(10, 2);
  });

  it("walks forward (-Z at yaw 0) at walking speed", () => {
    const body = simulate(flat(), undefined, { ...idle, forward: 1 }, 1);
    expect(body.position.z).toBeLessThan(0.5 - WALK_SPEED * 0.8);
    expect(Math.abs(body.position.x - 0.5)).toBeLessThan(1e-6);
  });

  it("strafes right (+X at yaw 0)", () => {
    const body = simulate(flat(), undefined, { ...idle, strafe: 1 }, 0.5);
    expect(body.position.x).toBeGreaterThan(1.5);
  });

  it("is stopped by walls", () => {
    const wall: Record<string, number> = {};
    for (let x = -3; x <= 3; x++) for (let y = 10; y <= 12; y++) wall[`${x},${y},-2`] = STONE;
    const body = simulate(flat(wall), undefined, { ...idle, forward: 1 }, 2);
    expect(body.position.z).toBeGreaterThan(-1);
    expect(body.position.z).toBeCloseTo(-1 + 0.3, 2);
  });

  it("jumps over a one-block step but not a two-block wall", () => {
    const step = { "0,10,-2": STONE };
    const body = createPlayerBody({ x: 0.5, y: 10, z: 0.5 });
    simulate(flat(step), body, idle, 0.2);
    for (let t = 0; t < 2; t += 1 / 60) stepPlayer(flat(step), body, { ...idle, forward: 1, jump: true }, 1 / 60);
    expect(body.position.z).toBeLessThan(-3);

    const wall = { "0,10,-2": STONE, "0,11,-2": STONE };
    const blocked = createPlayerBody({ x: 0.5, y: 10, z: 0.5 });
    for (let t = 0; t < 2; t += 1 / 60) stepPlayer(flat(wall), blocked, { ...idle, forward: 1, jump: true }, 1 / 60);
    expect(blocked.position.z).toBeGreaterThan(-1.5);
  });

  it("auto-jumps one-block ledges when enabled (touch controls)", () => {
    const step = { "0,10,-2": STONE };
    const body = simulate(flat(step), undefined, { ...idle, forward: 1, autoJump: true }, 2);
    expect(body.position.z).toBeLessThan(-3);
    expect(body.position.y).toBeGreaterThanOrEqual(10);
  });

  it("flies up and down and lands when touching the ground", () => {
    const body = createPlayerBody({ x: 0.5, y: 10, z: 0.5 });
    body.flying = true;
    simulate(flat(), body, { ...idle, jump: true }, 1);
    expect(body.position.y).toBeGreaterThan(14);
    expect(body.flying).toBe(true);
    simulate(flat(), body, { ...idle, descend: true }, 3);
    expect(body.flying).toBe(false);
    expect(body.position.y).toBeCloseTo(10, 2);
  });

  it("sneaking stops you walking off an edge", () => {
    const get = (x: number, y: number, z: number) => (y <= 9 && z >= 0 ? STONE : AIR);
    const body = simulate(get, createPlayerBody({ x: 0.5, y: 10, z: 0.5 }), idle, 0.2);
    simulate(get, body, { ...idle, forward: 1, descend: true }, 2);
    expect(body.position.y).toBeCloseTo(10, 2);
    expect(body.position.z).toBeGreaterThan(-0.31);
  });

  it("detects when a block would overlap the player", () => {
    expect(bodyOverlapsBlock({ x: 0.5, y: 10, z: 0.5 }, 0, 10, 0)).toBe(true);
    expect(bodyOverlapsBlock({ x: 0.5, y: 10, z: 0.5 }, 0, 11, 0)).toBe(true);
    expect(bodyOverlapsBlock({ x: 0.5, y: 10, z: 0.5 }, 0, 12, 0)).toBe(false);
    expect(bodyOverlapsBlock({ x: 0.5, y: 10, z: 0.5 }, 1, 10, 0)).toBe(false);
  });
});

describe("raycast", () => {
  it("hits the first solid block and reports the face normal", () => {
    const get = flat({ "0,12,-4": STONE });
    const hit = raycast(get, { x: 0.5, y: 12.5, z: 0.5 }, lookDirection(0, 0), 8, isSolid);
    expect(hit).toMatchObject({ x: 0, y: 12, z: -4, normal: { x: 0, y: 0, z: 1 } });
    expect(hit!.distance).toBeCloseTo(3.5, 5);
  });

  it("looks down onto the ground with an upward normal", () => {
    const hit = raycast(flat(), { x: 0.5, y: 11.6, z: 0.5 }, lookDirection(0, -Math.PI / 2), 8, isSolid);
    expect(hit).toMatchObject({ x: 0, y: 9, z: 0, normal: { x: 0, y: 1, z: 0 } });
  });

  it("returns null when nothing is in reach", () => {
    expect(raycast(flat(), { x: 0.5, y: 11.6, z: 0.5 }, lookDirection(0, 0), 5, isSolid)).toBeNull();
  });

  it("works against a generated world", () => {
    const world = new World(3);
    const h = world.generator.heightAt(10, 10);
    const hit = raycast((x, y, z) => world.getBlock(x, y, z), { x: 10.5, y: h + 5, z: 10.5 }, { x: 0, y: -1, z: 0 }, 20, isSolid);
    expect(hit?.y).toBeGreaterThanOrEqual(h);
  });
});
