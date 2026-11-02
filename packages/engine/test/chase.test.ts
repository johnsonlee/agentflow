import { describe, expect, it } from "vitest";
import { AIR, JUMP_VELOCITY, World, blockId, createMob, createPlayerBody, findPath, mobAttack, stepMob, stepPlayer, type Mob, type MobKind } from "../src";

// Reproduces review bd1e2360: obstacles pinned the straight-line chase, and below ~30 fps mobs
// could not jump a 1-block step. Both must work at 20-144 fps.
const STONE = blockId("stone");
const LOG = blockId("oak_log");
const FPS = [20, 30, 60, 144];

function flat(): World {
  const w = new World(3);
  for (let x = -12; x <= 14; x++) for (let z = -12; z <= 12; z++) {
    w.setBlock(x, 50, z, STONE);
    for (let y = 51; y <= 56; y++) w.setBlock(x, y, z, AIR);
  }
  return w;
}

/** Runs a zombie chase for `seconds` at `fps`; returns damage dealt and the final mob. */
function chase(w: World, player: { x: number; y: number; z: number }, fps: number, seconds = 30, start = { x: 0.5, y: 51, z: 0.5 }) {
  const mob = createMob(1, "zombie", start);
  const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let damage = 0;
  const dt = 1 / fps;
  for (let i = 0; i < seconds * fps; i++) {
    stepMob(get, mob, dt, rand, player);
    damage += mobAttack(mob, player, dt);
  }
  return { damage, mob };
}

describe("zombie chase around obstacles (path-finding)", () => {
  for (const fps of FPS) {
    it(`reaches a player behind a 2-high tree trunk at ${fps} fps`, () => {
      const w = flat();
      w.setBlock(3, 51, 0, LOG);
      w.setBlock(3, 52, 0, LOG);
      expect(chase(w, { x: 8.5, y: 51, z: 0.5 }, fps).damage).toBeGreaterThan(0);
    });

    it(`goes around a 5-wide, 2-high wall at ${fps} fps`, () => {
      const w = flat();
      for (let z = -2; z <= 2; z++) for (const y of [51, 52]) w.setBlock(3, y, z, STONE);
      expect(chase(w, { x: 8.5, y: 51, z: 0.5 }, fps).damage).toBeGreaterThan(0);
    });

    it(`climbs 1-block ledges up to the player at ${fps} fps`, () => {
      const w = flat();
      // Two terraces: x >= 3 is one block up, x >= 6 two blocks up.
      for (let x = 3; x <= 14; x++) for (let z = -4; z <= 4; z++) {
        w.setBlock(x, 51, z, STONE);
        if (x >= 6) w.setBlock(x, 52, z, STONE);
      }
      expect(chase(w, { x: 9.5, y: 53, z: 0.5 }, fps).damage).toBeGreaterThan(0);
    });
  }

  it("drops down a 3-block ledge to reach the player", () => {
    const w = flat();
    for (let x = -4; x <= 2; x++) for (let z = -4; z <= 4; z++) for (const y of [51, 52, 53]) w.setBlock(x, y, z, STONE);
    expect(chase(w, { x: 8.5, y: 51, z: 0.5 }, 30, 30, { x: 0.5, y: 54, z: 0.5 }).damage).toBeGreaterThan(0);
  });

  it("finds a path around a wall on the grid (bounded A*)", () => {
    const w = flat();
    for (let z = -2; z <= 2; z++) for (const y of [51, 52]) w.setBlock(3, y, z, STONE);
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    const path = findPath(get, { x: 0.5, y: 51, z: 0.5 }, { x: 8.5, y: 51, z: 0.5 })!;
    expect(path.at(-1)).toEqual({ x: 8, y: 51, z: 0 });
    expect(path.every((n) => !(n.x === 3 && Math.abs(n.z) <= 2))).toBe(true);
  });

  it("still gives up gracefully when the player is unreachable (sealed in)", () => {
    const w = flat();
    for (let x = 7; x <= 10; x++) for (let z = -2; z <= 3; z++) for (const y of [51, 52, 53]) {
      if (x > 7 && x < 10 && z > -2 && z < 3 && y < 53) continue;
      w.setBlock(x, y, z, STONE);
    }
    const r = chase(w, { x: 8.5, y: 51, z: 0.5 }, 30, 10);
    expect(r.damage).toBe(0);
    expect(Number.isFinite(r.mob.position.x)).toBe(true);
  });
});

describe("frame-rate independent physics", () => {
  for (const fps of FPS) {
    it(`passive mobs climb a 1-block step at ${fps} fps`, () => {
      const w = flat();
      for (let x = 2; x <= 14; x++) for (let z = -12; z <= 12; z++) w.setBlock(x, 51, z, STONE);
      for (const kind of ["pig", "sheep", "chicken"] as MobKind[]) {
        const mob: Mob = createMob(1, kind, { x: 0.5, y: 51, z: 0.5 });
        mob.yaw = -Math.PI / 2; // facing +X
        const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
        for (let i = 0; i < 3 * fps; i++) {
          mob.walking = true;
          mob.thinkTimer = 10;
          mob.yaw = -Math.PI / 2;
          stepMob(get, mob, 1 / fps, () => 0.5);
        }
        expect(mob.position.y, `${kind} at ${fps} fps`).toBeGreaterThanOrEqual(52);
      }
    });

    it(`player jump height is the same at ${fps} fps`, () => {
      const w = flat();
      const body = createPlayerBody({ x: 0.5, y: 51, z: 0.5 });
      const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
      for (let i = 0; i < fps; i++) stepPlayer(get, body, { forward: 0, strafe: 0, jump: false, descend: false, sprint: false }, 1 / fps);
      let peak = body.position.y;
      for (let i = 0; i < fps; i++) {
        stepPlayer(get, body, { forward: 0, strafe: 0, jump: i === 0, descend: false, sprint: false }, 1 / fps);
        peak = Math.max(peak, body.position.y);
      }
      // Exact apex v^2 / 2g = 1.24 blocks.
      expect(peak - 51).toBeCloseTo((JUMP_VELOCITY * JUMP_VELOCITY) / (2 * 32), 1);
    });
  }
});
