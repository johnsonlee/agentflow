import { describe, expect, it } from "vitest";
import { AIR, JUMP_VELOCITY, World, blockId, createMob, PATHFINDING, createPlayerBody, findPath, findSummonSpot, mobAttack, onBlockChangedNear, stepMob, stepPlayer, type Mob, type MobKind } from "../src";

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

describe("/summon placement", () => {
  /** A tree at (3, 51..55, 0) with a 5x5 leaf canopy at y 54..56, on flat stone. */
  function withTree(): World {
    const w = flat();
    const leaves = blockId("oak_leaves");
    for (let x = 1; x <= 5; x++) for (let z = -2; z <= 2; z++) for (let y = 54; y <= 56; y++) w.setBlock(x, y, z, leaves);
    for (let y = 51; y <= 55; y++) w.setBlock(3, y, 0, LOG);
    return w;
  }

  it("never lands inside or on top of a tree: picks ground beside it at the summoner's level", () => {
    const w = withTree();
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    const spot = findSummonSpot(get, 3.5, 0.5, 51, 2)!;
    expect(spot.y).toBe(51);
    expect(Math.hypot(spot.x - 3.5, spot.z - 0.5)).toBeLessThanOrEqual(1.5);
    expect(w.getBlock(Math.floor(spot.x), 50, Math.floor(spot.z))).toBe(STONE);
    // And a zombie summoned there reaches the player.
    const mob = createMob(1, "zombie", { ...spot, y: spot.y + 0.01 });
    const player = { x: 0.5, y: 51, z: 0.5 };
    let damage = 0;
    for (let i = 0; i < 30 * 30; i++) {
      stepMob(get, mob, 1 / 30, () => 0.5, player);
      damage += mobAttack(mob, player, 1 / 30);
    }
    expect(damage).toBeGreaterThan(0);
  });

  it("keeps the exact column when it is open ground", () => {
    const w = flat();
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    expect(findSummonSpot(get, 3.5, 0.5, 51, 2)).toEqual({ x: 3.5, y: 51, z: 0.5 });
  });

  it("returns null when nothing nearby fits (e.g. solid rock)", () => {
    const w = flat();
    for (let x = -6; x <= 10; x++) for (let z = -6; z <= 6; z++) for (let y = 51; y <= 58; y++) w.setBlock(x, y, z, STONE);
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    expect(findSummonSpot(get, 3.5, 0.5, 51, 2, 2)).toBeNull();
  });
});

describe("path-finding cost is bounded (review 0dc818e8)", () => {
  /** 8 zombies (the spawn cap) around a player sealed in a 1x2 stone cell with a roof. */
  function shelter() {
    const w = flat();
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 51; y <= 53; y++) {
      if (x === 0 && z === 0 && y < 53) continue;
      w.setBlock(x, y, z, STONE);
    }
    const mobs = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return createMob(i + 1, "zombie", { x: Math.cos(a) * 7 + 0.5, y: 51, z: Math.sin(a) * 7 + 0.5 });
    });
    return { w, mobs, get: (x: number, y: number, z: number) => w.getBlock(x, y, z) };
  }

  it("8 zombies vs a sealed-in player: at most budgetPerFrame nodes per frame, and little total work", () => {
    const { mobs, get } = shelter();
    const player = { x: 0.5, y: 51, z: 0.5 };
    const budget = { nodes: 0 };
    let total = 0;
    let worst = 0;
    let damage = 0;
    for (let f = 0; f < 8 * 60; f++) {
      budget.nodes = PATHFINDING.budgetPerFrame;
      for (const m of mobs) {
        stepMob(get, m, 1 / 60, () => 0.5, player, budget);
        damage += mobAttack(m, player, 1 / 60);
      }
      const used = PATHFINDING.budgetPerFrame - budget.nodes;
      worst = Math.max(worst, used);
      total += used;
    }
    expect(damage).toBe(0);
    expect(worst).toBeLessThanOrEqual(PATHFINDING.budgetPerFrame);
    // Before: every zombie re-ran a 3000-node search every 0.5 s = 8 x 16 x 3000 = 384,000 nodes in 8 s.
    // Now failed searches back off (1, 2, 4, 8 s) with smaller caps (3000, 1500, 750).
    expect(total).toBeLessThan(60_000);
  });

  it("zombies still reach the player once the shelter is opened (back-off is bounded)", () => {
    const { w, mobs, get } = shelter();
    const player = { x: 0.5, y: 51, z: 0.5 };
    const budget = { nodes: 0 };
    const run = (seconds: number) => {
      let damage = 0;
      for (let f = 0; f < seconds * 60; f++) {
        budget.nodes = PATHFINDING.budgetPerFrame;
        for (const m of mobs) {
          stepMob(get, m, 1 / 60, () => 0.5, player, budget);
          damage += mobAttack(m, player, 1 / 60);
        }
      }
      return damage;
    };
    expect(run(6)).toBe(0);
    w.setBlock(1, 51, 0, AIR);
    w.setBlock(1, 52, 0, AIR);
    // The longest back-off is 8 s (+ jitter), then the path is found and walked.
    expect(run(14)).toBeGreaterThan(0);
  });

  for (const fps of [20, 60]) {
    it(`with the shared per-frame budget, a zombie still goes around a trunk and a wall at ${fps} fps`, () => {
      for (const build of ["trunk", "wall"] as const) {
        const w = flat();
        if (build === "trunk") {
          w.setBlock(3, 51, 0, LOG);
          w.setBlock(3, 52, 0, LOG);
        } else for (let z = -2; z <= 2; z++) for (const y of [51, 52]) w.setBlock(3, y, z, STONE);
        const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
        const mob = createMob(1, "zombie", { x: 0.5, y: 51, z: 0.5 });
        const player = { x: 8.5, y: 51, z: 0.5 };
        const budget = { nodes: 0 };
        let damage = 0;
        for (let f = 0; f < 30 * fps; f++) {
          budget.nodes = PATHFINDING.budgetPerFrame;
          stepMob(get, mob, 1 / fps, () => 0.5, player, budget);
          damage += mobAttack(mob, player, 1 / fps);
        }
        expect(damage, build).toBeGreaterThan(0);
      }
    });
  }
});

describe("back-off reset and fair budget (review 6c484049)", () => {
  it("opening a shelter on the far side wakes a backed-off zombie at once (not after up to ~10 s)", () => {
    const w = flat();
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 51; y <= 53; y++) {
      if (x === 0 && z === 0 && y < 53) continue;
      w.setBlock(x, y, z, STONE);
    }
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    const player = { x: 0.5, y: 51, z: 0.5 };
    const zombie = createMob(1, "zombie", { x: 8.5, y: 51, z: 0.5 });
    const mobs = [zombie];
    // Same wiring as MobManager: block changes near the player or a zombie reset its back-off.
    w.onBlockChanged((x, y, z) => onBlockChangedNear(mobs, x, y, z, player));
    const budget = { nodes: 0 };
    const run = (seconds: number) => {
      let damage = 0;
      for (let f = 0; f < seconds * 60; f++) {
        budget.nodes = PATHFINDING.budgetPerFrame;
        stepMob(get, zombie, 1 / 60, () => 0.5, player, budget);
        damage += mobAttack(zombie, player, 1 / 60);
      }
      return damage;
    };
    expect(run(8)).toBe(0);
    expect(zombie.failCount ?? 0).toBeGreaterThanOrEqual(2);
    // Open the far (-X) side, away from the zombie (+X).
    w.setBlock(-1, 51, 0, AIR);
    w.setBlock(-1, 52, 0, AIR);
    expect(zombie.failCount ?? 0).toBe(0);
    // Walk round the shelter (about 12 blocks) and hit: well under the old back-off.
    expect(run(7)).toBeGreaterThan(0);
  });

  it("only search time is charged to the time budget", () => {
    const w = flat();
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    const pig = createMob(1, "pig", { x: 0.5, y: 51, z: 0.5 });
    const budget = { nodes: 400, ms: 3 };
    for (let i = 0; i < 200; i++) stepMob(get, pig, 1 / 60, () => 0.5, { x: 5, y: 51, z: 5 }, budget);
    expect(budget.ms).toBe(3);
    expect(budget.nodes).toBe(400);
    const zombie = createMob(2, "zombie", { x: 0.5, y: 51, z: 0.5 });
    const none = { nodes: 400, ms: 0 };
    for (let i = 0; i < 30; i++) stepMob(get, zombie, 1 / 60, () => 0.5, { x: 8.5, y: 51, z: 0.5 }, none);
    expect(none.nodes).toBe(400);
  });
});
