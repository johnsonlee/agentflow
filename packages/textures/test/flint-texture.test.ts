import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames } from "@craft/engine";
import { buildAtlas, generateTile, hasItemTile } from "../src/index";
import baseline from "./fixtures/flint-240b979.json";
const hash = (data: Uint8ClampedArray) => createHash("sha256").update(data).digest("hex");
it("preserves all867 published pixels and UVs while appending one original Flint icon", () => {
  const names = allAtlasTextureNames(), atlas = buildAtlas(names);
  expect(names).toHaveLength(885); expect(names.slice(0, 867)).toEqual(baseline.names);
  expect(names.slice(867, 868)).toEqual(["item_flint"]); expect(new Set(names).size).toBe(885);
  expect([atlas.width, atlas.height, atlas.tileSize]).toEqual([baseline.atlas.width, baseline.atlas.height, baseline.atlas.tileSize]);
  for (const name of baseline.names) {
    const old = baseline.tiles[name as keyof typeof baseline.tiles];
    expect(hash(generateTile(name)), name).toBe(old.rgbaSHA256);
    expect(hash(atlas.tilePixels(name)), name).toBe(old.rgbaSHA256);
    expect(atlas.uv(name), name).toEqual(old.uv);
  }
  const pixels = generateTile("item_flint"); expect(hasItemTile("item_flint")).toBe(true);
  expect(pixels).toEqual(generateTile("item_flint")); expect(pixels).toHaveLength(1024);
  expect(Object.values(baseline.tiles).some(tile => tile.rgbaSHA256 === hash(pixels))).toBe(false);
  const alpha = pixels.filter((_, i) => i % 4 === 3); expect(alpha.includes(0)).toBe(true); expect(alpha.includes(255)).toBe(true);
});
