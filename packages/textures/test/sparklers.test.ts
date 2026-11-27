import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames, SPARKLER_COLORS } from "@craft/engine";
import { buildAtlas, generateTile, hasItemTile } from "../src/index";
import baseline from "./fixtures/sparklers-83eee13.json";

const hash = (pixels: Uint8ClampedArray) => createHash("sha256").update(pixels).digest("hex");

it("appends ten sparkler states without changing any of the 849 published tile pixels or addresses", () => {
  const names = allAtlasTextureNames();
  expect(names.slice(0, 849)).toEqual(baseline.names);
  expect(names.slice(849, 859)).toEqual(SPARKLER_COLORS.flatMap(color => [color.iconInactive, color.iconActive]));
  expect(names.slice(885, 890)).toEqual(["item_awkward_potion", "item_antidote", "item_elixir", "item_eye_drops", "item_tonic"]);
  expect(names.slice(890, 892)).toEqual(["brewing_stand_base", "brewing_stand_rod"]);
  expect(names).toHaveLength(919);
  const atlas = buildAtlas(names);
  expect([atlas.width, atlas.height, atlas.tileSize]).toEqual([baseline.atlas.width, baseline.atlas.height, baseline.atlas.tileSize]);
  for (const name of baseline.names) {
    const old = baseline.tiles[name as keyof typeof baseline.tiles];
    expect(hash(generateTile(name)), name).toBe(old.rgbaSHA256);
    expect(hash(atlas.tilePixels(name)), name).toBe(old.rgbaSHA256);
    expect(atlas.uv(name), name).toEqual(old.uv);
  }
});

it("provides five distinct original unlit and lit sprites with transparent backgrounds", () => {
  const oldPixels = new Set(Object.values(baseline.tiles).map(tile => tile.rgbaSHA256));
  const added = new Set<string>();
  expect(SPARKLER_COLORS.map(color => color.color)).toEqual(["orange", "blue", "red", "purple", "green"]);
  for (const color of SPARKLER_COLORS) {
    const inactive = generateTile(color.iconInactive), active = generateTile(color.iconActive);
    for (const [key, pixels] of [[color.iconInactive, inactive], [color.iconActive, active]] as const) {
      expect(hasItemTile(key), key).toBe(true);
      expect(pixels).toHaveLength(16 * 16 * 4);
      expect(generateTile(key)).toEqual(pixels);
      const alpha = pixels.filter((_, index) => index % 4 === 3);
      expect(alpha.includes(0), key).toBe(true);
      expect(alpha.includes(255), key).toBe(true);
      expect(oldPixels.has(hash(pixels)), key).toBe(false);
      added.add(hash(pixels));
    }
    expect(hash(active)).not.toBe(hash(inactive));
    const opaque = (pixels: Uint8ClampedArray) => pixels.filter((value, index) => index % 4 === 3 && value > 0).length;
    expect(opaque(active)).toBeGreaterThan(opaque(inactive));
  }
  expect(added.size).toBe(10);
});
