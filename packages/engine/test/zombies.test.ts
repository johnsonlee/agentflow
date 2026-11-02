import { describe, expect, it } from "vitest";
import {
  AIR, MOB_SPECS, ZOMBIE, World, blockId, burnInDaylight, canHostileSpawn, createHunger, createMob, damageMob, eat, itemId,
  knockbackFrom, mobAttack, parseCommand, skyDarken, stepMob,
} from "../src";

const STONE = blockId("stone");

/** Flat stone floor at y = 50 with air above. */
function flat(): World {
  const w = new World(3);
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
    w.setBlock(x, 50, z, STONE);
    for (let y = 51; y <= 55; y++) w.setBlock(x, y, z, AIR);
  }
  return w;
}

describe("zombie", () => {
  it("is a hostile mob with Minecraft stats and drops rotten flesh", () => {
    expect(MOB_SPECS.zombie).toMatchObject({ maxHealth: 20, hostile: true, drop: ["rotten_flesh", 1] });
    expect(MOB_SPECS.pig.hostile).toBeUndefined();
    expect(parseCommand("/summon zombie")).toEqual({ type: "summon", kind: "zombie" });
  });

  it("chases a player within range and stops at melee distance", () => {
    const w = flat();
    const z = createMob(1, "zombie", { x: 0.5, y: 51, z: 0.5 });
    const player = { x: 8.5, y: 51, z: 0.5 };
    const get = (x: number, y: number, zz: number) => w.getBlock(x, y, zz);
    for (let i = 0; i < 60; i++) stepMob(get, z, 0.05, () => 0.5, player);
    expect(z.position.x).toBeGreaterThan(5);
    expect(Math.abs(z.position.z - 0.5)).toBeLessThan(0.3);
    for (let i = 0; i < 100; i++) stepMob(get, z, 0.05, () => 0.5, player);
    expect(player.x - z.position.x).toBeGreaterThan(0.4);
    expect(player.x - z.position.x).toBeLessThan(ZOMBIE.reach);
  });

  it("ignores a player out of range (or no target, e.g. creative)", () => {
    const w = flat();
    const get = (x: number, y: number, zz: number) => w.getBlock(x, y, zz);
    const z = createMob(1, "zombie", { x: 0.5, y: 51, z: 0.5 });
    for (let i = 0; i < 40; i++) stepMob(get, z, 0.05, () => 0.99, null);
    expect(Math.hypot(z.position.x - 0.5, z.position.z - 0.5)).toBeLessThan(0.01);
  });

  it("hits for 3 within reach, at most once per second, with knockback away from it", () => {
    const z = createMob(1, "zombie", { x: 0, y: 51, z: 0 });
    const near = { x: 1, y: 51, z: 0 };
    expect(mobAttack(z, near, 0.05)).toBe(3);
    expect(mobAttack(z, near, 0.5)).toBe(0);
    expect(mobAttack(z, near, 0.5)).toBe(3);
    expect(mobAttack(z, { x: 3, y: 51, z: 0 }, 2)).toBe(0);
    const kb = knockbackFrom(z, near);
    expect(kb.x).toBeGreaterThan(0);
    expect(kb.y).toBeGreaterThan(0);
    expect(mobAttack(createMob(2, "pig", { x: 0, y: 51, z: 0 }), near, 2)).toBe(0);
  });

  it("can be killed: 20 HP, so an iron sword (7) takes 3 hits", () => {
    const z = createMob(1, "zombie", { x: 0, y: 51, z: 0 });
    expect(damageMob(z, 7, 0)).toBe(false);
    expect(damageMob(z, 7, 0)).toBe(false);
    expect(damageMob(z, 7, 0)).toBe(true);
  });

  it("burns under open sky by day, not at night or in shade", () => {
    const z = createMob(1, "zombie", { x: 0, y: 51, z: 0 });
    expect(burnInDaylight(z, 15, skyDarken(0), 5)).toBe(false);
    expect(z.burning).toBe(false);
    expect(burnInDaylight(z, 14, skyDarken(1), 5)).toBe(false);
    expect(z.health).toBe(20);
    expect(burnInDaylight(z, 15, skyDarken(1), 5)).toBe(false);
    expect(z.burning).toBe(true);
    expect(z.health).toBe(15);
    expect(burnInDaylight(z, 15, skyDarken(1), 20)).toBe(true);
  });
});

describe("hostile spawn rule (Minecraft 1.18+: block light 0, sky light vs a 0-7 roll)", () => {
  const roomWorld = () => {
    const w = new World(3);
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 8; y <= 14; y++) w.setBlock(x, y, z, STONE);
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 10; y <= 12; y++) w.setBlock(x, y, z, AIR);
    return w;
  };
  const args = (w: World) => [(x: number, y: number, z: number) => w.getBlock(x, y, z), (x: number, y: number, z: number) => w.getLight(x, y, z)] as const;

  it("spawns in a dark cave at any time, but not next to a torch", () => {
    const w = roomWorld();
    expect(canHostileSpawn(...args(w), 0, 10, 0, skyDarken(1), 0)).toBe(true);
    w.setBlock(1, 10, 1, blockId("torch"));
    expect(canHostileSpawn(...args(w), 0, 10, 0, skyDarken(1), 0.99)).toBe(false);
  });

  it("spawns on the open surface only at night", () => {
    const w = flat();
    expect(canHostileSpawn(...args(w), 0, 51, 0, skyDarken(1), 0.99)).toBe(false);
    expect(canHostileSpawn(...args(w), 0, 51, 0, skyDarken(0), 0.99)).toBe(true);
    expect(skyDarken(0)).toBe(11);
    expect(skyDarken(1)).toBe(0);
  });

  it("needs a solid floor and two free cells", () => {
    const w = flat();
    expect(canHostileSpawn(...args(w), 0, 53, 0, 11, 0.99)).toBe(false);
    w.setBlock(0, 52, 0, STONE);
    expect(canHostileSpawn(...args(w), 0, 51, 0, 11, 0.99)).toBe(false);
  });
});

describe("rotten flesh", () => {
  it("feeds 4 but usually adds exhaustion (simplified Hunger effect)", () => {
    const h = createHunger();
    h.food = 10;
    h.saturation = 0;
    expect(eat(h, itemId("rotten_flesh"), () => 0.1)).toBe(true);
    expect(h.food).toBe(14);
    expect(h.exhaustion).toBeCloseTo(3);
    const lucky = createHunger();
    lucky.food = 10;
    eat(lucky, itemId("rotten_flesh"), () => 0.95);
    expect(lucky.exhaustion).toBe(0);
  });
});
