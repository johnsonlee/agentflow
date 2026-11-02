import { describe, expect, it } from "vitest";
import { AIR, MOB_SPECS, blockId, createMob, damageMob, mulberry32, raycastMob, stepMob } from "../src";

const STONE = blockId("stone");
const flat = (x: number, y: number, z: number) => (y <= 9 ? STONE : AIR);

describe("mobs", () => {
  it("fall onto the ground and wander around", () => {
    const pig = createMob(1, "pig", { x: 0.5, y: 15, z: 0.5 });
    const rand = mulberry32(7);
    for (let i = 0; i < 60 * 20; i++) stepMob(flat, pig, 1 / 60, rand);
    expect(pig.onGround).toBe(true);
    expect(pig.position.y).toBeCloseTo(10, 2);
    expect(Math.hypot(pig.position.x - 0.5, pig.position.z - 0.5)).toBeGreaterThan(1);
  });

  it("hop up one-block steps but are stopped by walls", () => {
    const wall = (x: number, y: number, z: number) => (y <= 9 || (x === 3 && y <= 11) ? STONE : AIR);
    const sheep = createMob(2, "sheep", { x: 0.5, y: 10, z: 0.5 }, { yaw: -Math.PI / 2 });
    const rand = () => 0.1; // always walk, always same heading decision
    sheep.thinkTimer = 100;
    sheep.walking = true;
    for (let i = 0; i < 60 * 5; i++) stepMob(wall, sheep, 1 / 60, rand);
    expect(sheep.position.x).toBeLessThan(3 - MOB_SPECS.sheep.width / 2 + 0.01);

    const step = (x: number, y: number, z: number) => (y <= 9 || (x >= 3 && y <= 10) ? STONE : AIR);
    const pig = createMob(3, "pig", { x: 0.5, y: 10, z: 0.5 }, { yaw: -Math.PI / 2 });
    pig.thinkTimer = 100;
    pig.walking = true;
    for (let i = 0; i < 60 * 5; i++) stepMob(step, pig, 1 / 60, rand);
    expect(pig.position.x).toBeGreaterThan(3.5);
    expect(pig.position.y).toBeCloseTo(11, 1);
  });

  it("take damage, flee and die; NPCs are invulnerable and stationary", () => {
    const chicken = createMob(4, "chicken", { x: 0, y: 10, z: 0 });
    expect(damageMob(chicken, 2, 0)).toBe(false);
    expect(chicken.hurtTimer).toBeGreaterThan(0);
    expect(damageMob(chicken, 2, 0)).toBe(true);

    const npc = createMob(5, "npc", { x: 0.5, y: 10, z: 0.5 }, { name: "Guide", dialogue: "Hi" });
    expect(npc.name).toBe("Guide");
    expect(damageMob(npc, 100, 0)).toBe(false);
    for (let i = 0; i < 600; i++) stepMob(flat, npc, 1 / 60, mulberry32(1));
    expect(npc.position.x).toBe(0.5);
    expect(npc.position.z).toBe(0.5);
  });

  it("can be targeted by a ray", () => {
    const pig = createMob(6, "pig", { x: 0.5, y: 10, z: -3 });
    expect(raycastMob({ x: 0.5, y: 10.5, z: 0 }, { x: 0, y: 0, z: -1 }, pig, 5)).toBeCloseTo(2.55, 2);
    expect(raycastMob({ x: 0.5, y: 10.5, z: 0 }, { x: 0, y: 0, z: 1 }, pig, 5)).toBeNull();
    expect(raycastMob({ x: 0.5, y: 10.5, z: 0 }, { x: 0, y: 0, z: -1 }, pig, 2)).toBeNull();
  });
});
