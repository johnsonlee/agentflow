import { expect, it, vi } from "vitest";
import { Game } from "../src/application/game";
import { blockId, type PlayerBody } from "@craft/engine";

interface FallSubject {
  body: PlayerBody;
  mode: "creative" | "survival";
  fallStart: number | null;
  world: { getBlock(x: number, y: number, z: number): number };
  hurt: ReturnType<typeof vi.fn>;
}
const update = (Game.prototype as unknown as { updateFall(this: FallSubject, wasOnGround: boolean): void }).updateFall;
function subject(support: number): FallSubject {
  return {
    body: { position: { x: .5, y: 70, z: .5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, flying: false, inWater: false, onGround: true },
    mode: "survival", fallStart: 80, world: { getBlock: (_x, y) => y === 69 ? support : 0 }, hurt: vi.fn(),
  };
}

it.each([208, 209, 210])("actual Game landing dispatch reduces state %i damage once", id => {
  const game = subject(id);
  update.call(game, false);
  expect(game.hurt).toHaveBeenCalledTimes(1);
  expect(game.hurt.mock.calls[0][0]).toBeCloseTo(7 * .2, 10);
  expect(game.hurt.mock.calls[0][1]).toBe("fall");
  expect(game.fallStart).toBeNull();
  update.call(game, true);
  expect(game.hurt).toHaveBeenCalledTimes(1);
});

it("Stone still receives the same existing distance-based damage", () => {
  const game = subject(blockId("stone"));
  update.call(game, false);
  expect(game.hurt).toHaveBeenCalledWith(7, "fall");
});

it("flying, water, Creative, airborne and safe short falls do not dispatch damage", () => {
  for (const change of [(g: FallSubject) => { g.body.flying = true; }, (g: FallSubject) => { g.body.inWater = true; }, (g: FallSubject) => { g.mode = "creative"; }]) {
    const game = subject(208); change(game); update.call(game, false);
    expect(game.fallStart).toBeNull(); expect(game.hurt).not.toHaveBeenCalled();
  }
  const airborne = subject(208); airborne.body.onGround = false;
  update.call(airborne, false); expect(airborne.fallStart).toBe(80); expect(airborne.hurt).not.toHaveBeenCalled();
  const short = subject(208); short.fallStart = 73.9;
  update.call(short, false); expect(short.fallStart).toBeNull(); expect(short.hurt).not.toHaveBeenCalled();
});
