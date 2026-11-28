import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames } from "@craft/engine";
import { buildAtlas, generateTile, hasItemTile } from "../src/index";
import baseline from "./fixtures/milk-785f7f0.json";
const hash = (data: Uint8ClampedArray) => createHash("sha256").update(data).digest("hex");
it("preserves all862 published tile pixels and UVs while appending five original Cow resource and pail icons", () => {
  const names = allAtlasTextureNames(), atlas = buildAtlas(names);
  expect(names.slice(885, 890)).toEqual(["item_awkward_potion", "item_antidote", "item_elixir", "item_eye_drops", "item_tonic"]);
  expect(names.slice(890, 892)).toEqual(["brewing_stand_base", "brewing_stand_rod"]);
  expect(names).toHaveLength(920); expect(names.slice(0, 862)).toEqual(baseline.names);
  expect(names.slice(862, 867)).toEqual(["item_bucket", "item_milk_bucket", "item_raw_beef", "item_cooked_beef", "item_leather"]);
  expect(new Set(names).size).toBe(920);
  expect([atlas.width, atlas.height, atlas.tileSize]).toEqual([baseline.atlas.width, baseline.atlas.height, baseline.atlas.tileSize]);
  for (const name of baseline.names) {
    const old = baseline.tiles[name as keyof typeof baseline.tiles];
    expect(hash(generateTile(name)), name).toBe(old.rgbaSHA256);
    expect(hash(atlas.tilePixels(name)), name).toBe(old.rgbaSHA256);
    expect(atlas.uv(name), name).toEqual(old.uv);
  }
  const added = new Set<string>();
  for (const key of names.slice(862, 867)) {
    const pixels = generateTile(key); expect(hasItemTile(key)).toBe(true); expect(pixels).toHaveLength(1024);
    expect(pixels).toEqual(generateTile(key)); expect(Object.values(baseline.tiles).some(tile => tile.rgbaSHA256 === hash(pixels))).toBe(false);
    const alpha = pixels.filter((_, i) => i % 4 === 3); expect(alpha.includes(0)).toBe(true); expect(alpha.includes(255)).toBe(true); added.add(hash(pixels));
  }
  expect(added.size).toBe(5);
});
