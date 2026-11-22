import { expect, it, vi } from "vitest";
import { blockId, createPlayerBody, hayFallDamageMultiplierAt, stepPlayer, WORLD_BORDER } from "../src";

it.each([208, 209, 210])("actual collision landing on Hay state %i gets the material factor", id => {
  const get = (x: number, y: number, z: number) => y === 60 ? (x === 0 && z === 0 ? id : blockId("stone")) : 0;
  const body = createPlayerBody({ x: .5, y: 80, z: .5 });
  for (let frame = 0; frame < 300 && !body.onGround; frame++) {
    stepPlayer(get, body, { forward: 0, strafe: 0, jump: false, descend: false, sprint: false }, 1 / 60);
  }
  expect(body.onGround).toBe(true);
  expect(body.position.y).toBeCloseTo(61, 3);
  expect(hayFallDamageMultiplierAt(get, body.position)).toBe(.2);
});

it("only overlapping supporting top faces count, including a mixed Stone/Hay edge", () => {
  const hay = blockId("hay_block"), stone = blockId("stone");
  const get = (x: number, y: number, z: number) => y === 60 && z === 0 ? (x === 0 ? hay : stone) : 0;
  expect(hayFallDamageMultiplierAt(get, { x: 1.29, y: 61, z: .5 })).toBe(.2);
  expect(hayFallDamageMultiplierAt(get, { x: 1.3, y: 61, z: .5 })).toBe(1);
  expect(hayFallDamageMultiplierAt(get, { x: .5, y: 62, z: .5 })).toBe(1);
  expect(hayFallDamageMultiplierAt(get, { x: .5, y: 60, z: .5 })).toBe(1);
  const below = (x: number, y: number, z: number) => y === 59 ? hay : y === 60 ? stone : 0;
  expect(hayFallDamageMultiplierAt(below, { x: .5, y: 61, z: .5 })).toBe(1);
});

it("all old non-Hay supports keep the unmodified factor", () => {
  for (const name of ["stone", "soul_sand", "glass", "farmland_7", "water", "air"]) {
    const id = blockId(name);
    expect(hayFallDamageMultiplierAt((_x, y) => y === 60 ? id : 0, { x: .5, y: 61, z: .5 })).toBe(1);
  }
});

it("invalid positions or widths do not read the world", () => {
  const get = vi.fn(() => blockId("hay_block"));
  for (const p of [{ x: NaN, y: 61, z: .5 }, { x: .5, y: Infinity, z: .5 }, { x: WORLD_BORDER + 65, y: 61, z: .5 }]) {
    expect(hayFallDamageMultiplierAt(get, p)).toBe(1);
  }
  for (const width of [0, -1, NaN, Infinity, 9]) expect(hayFallDamageMultiplierAt(get, { x: .5, y: 61, z: .5 }, width)).toBe(1);
  expect(get).not.toHaveBeenCalled();
});
