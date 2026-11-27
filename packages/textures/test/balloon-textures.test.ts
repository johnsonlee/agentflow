import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames } from "@craft/engine";
import { BALLOON_COLORS } from "../../engine/src/catalog/balloon-colors";
import baseline from "../../engine/test/fixtures/balloon-baseline-ebab.json";
import { buildAtlas, generateTile, hasItemTile } from "../src/index";
const hash = (data: Uint8ClampedArray) => createHash("sha256").update(data).digest("hex");
it("appends exactly sixteen original color icons and preserves all833 catalog entries, original pixels and UVs", () => {
  const names = allAtlasTextureNames(), atlas = buildAtlas(names), historical = buildAtlas(baseline.names);
  expect(names.slice(885, 890)).toEqual(["item_awkward_potion", "item_antidote", "item_elixir", "item_eye_drops", "item_tonic"]);
  expect(names.slice(890, 892)).toEqual(["brewing_stand_base", "brewing_stand_rod"]);
  expect(names).toHaveLength(919); expect(names.slice(0, 833)).toEqual(baseline.names);
  expect(names.slice(833, 849)).toEqual(BALLOON_COLORS.map(color => color.icon));
  expect(new Set(names).size).toBe(919); expect([atlas.width, atlas.height, atlas.tileSize]).toEqual(baseline.layout);
  expect(hash(historical.data)).toBe(baseline.atlasRGBA_SHA256);
  for (const name of baseline.names) {
    expect(hash(generateTile(name))).toBe(baseline.tiles[name as keyof typeof baseline.tiles]);
    expect(atlas.uv(name)).toEqual(baseline.uvs[name as keyof typeof baseline.uvs]);
    expect(atlas.tilePixels(name)).toEqual(historical.tilePixels(name));
  }
  const hashes = new Set<string>();
  for (const { icon } of BALLOON_COLORS) {
    expect(hasItemTile(icon)).toBe(true);
    const pixels = generateTile(icon); hashes.add(hash(pixels));
    expect(pixels).toEqual(generateTile(icon)); expect(pixels.length).toBe(1024);
    const alpha = Array.from(pixels).filter((_, i) => i % 4 === 3);
    expect(alpha).toContain(0); expect(alpha).toContain(255);
    expect(atlas.tilePixels(icon)).toEqual(pixels);
  }
  expect(hashes.size).toBe(16);
  // Only the eight documented station aliases may share any original atlas pixels.
  expect(new Set(names.map(name => hash(generateTile(name)))).size).toBe(names.length - 8);
});
