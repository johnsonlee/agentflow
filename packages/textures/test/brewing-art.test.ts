import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames } from "../../engine/src/catalog/atlas-texture-names";
import { buildAtlas } from "../src/atlas/atlas";
import { generateTile, hasItemTile, TILE_NAMES } from "../src/atlas/tiles";
import { BREWING_ITEM_GENERATORS } from "../src/artwork/brewing";
const keys = ["item_awkward_potion", "item_antidote", "item_elixir", "item_eye_drops", "item_tonic"];
const sha = (data: string | Uint8ClampedArray) => createHash("sha256").update(data).digest("hex");

it("retains every clean1a15 original885 RGBA and UV address and all295 prior TILE_NAMES in order", () => {
  const names = allAtlasTextureNames(), atlas = buildAtlas(names);
  const old = names.slice(0, 885).map(name => ({ name, rgbaSHA256: sha(atlas.tilePixels(name)), uv: atlas.uv(name) }));
  // Captured before this artwork change from an exact clean1a15 textures tree and its git-pinned atlas order.
  expect(old).toHaveLength(885); expect(sha(JSON.stringify(old))).toBe("c8a4a0cd9d18184d64d7f5555cb163a30061528f7c73a4e0f9b2991954828ac3");
  expect(sha(JSON.stringify(TILE_NAMES.slice(0, 295)))).toBe("4526643c8224f9a3b1d52c32045c399cbb69ab33dd4794ada07d43d17d85b401");
  expect(TILE_NAMES.slice(295, 300)).toEqual(keys); expect(names.slice(885, 890)).toEqual(keys);
});
it("provides five original deterministic16px item rasters with distinct silhouettes and separate label marks", () => {
  expect(Object.keys(BREWING_ITEM_GENERATORS)).toEqual(keys);
  const rasters = keys.map(name => {
    expect(hasItemTile(name)).toBe(true); const rgba = generateTile(name);
    expect(rgba).toHaveLength(16 * 16 * 4); expect(generateTile(name)).toEqual(rgba);
    expect(rgba[3]).toBe(0); expect(rgba[15 * 16 * 4 + 3]).toBe(0);
    const alpha = Array.from({ length: 256 }, (_, i) => rgba[i * 4 + 3]);
    expect(alpha.filter(a => a > 0).length).toBeGreaterThan(60);
    expect(alpha.filter(a => a === 0).length).toBeGreaterThan(100);
    expect(alpha.some(a => a > 0 && a < 255)).toBe(true);
    return { rgba: sha(rgba), silhouette: sha(JSON.stringify(alpha.map(a => a > 0))) };
  });
  expect(new Set(rasters.map(r => r.rgba)).size).toBe(5); expect(new Set(rasters.map(r => r.silhouette)).size).toBe(5);
  const old = allAtlasTextureNames().slice(0, 885).map(name => sha(generateTile(name)));
  for (const raster of rasters) expect(old).not.toContain(raster.rgba);
});
