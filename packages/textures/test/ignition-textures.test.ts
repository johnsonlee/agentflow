import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames } from "@craft/engine";
import { buildAtlas, generateTile, hasItemTile } from "../src/index";
import baseline from "./fixtures/ignition-8933e09.json";

const hash = (pixels: Uint8ClampedArray) => createHash("sha256").update(pixels).digest("hex");

it("keeps every old tile pixel and UV while adding distinct transparent flame and ignition sprites", () => {
  const names = allAtlasTextureNames(), atlas = buildAtlas(names);
  expect(names.slice(0, baseline.names.length)).toEqual(baseline.names);
  expect(names.slice(baseline.names.length, baseline.names.length + 2)).toEqual(["fire", "item_flint_and_steel"]);
  for (const name of baseline.names) {
    const previous = baseline.tiles[name as keyof typeof baseline.tiles];
    expect(hash(generateTile(name)), name).toBe(previous.rgbaSHA256);
    expect(hash(atlas.tilePixels(name)), name).toBe(previous.rgbaSHA256);
    expect(atlas.uv(name), name).toEqual(previous.uv);
  }
  const flame = generateTile("fire"), tool = generateTile("item_flint_and_steel");
  expect(hasItemTile("item_flint_and_steel")).toBe(true);
  expect(hasItemTile("fire")).toBe(false);
  expect(hash(flame)).not.toBe(hash(tool));
  for (const pixels of [flame, tool]) {
    const alpha = pixels.filter((_, i) => i % 4 === 3);
    expect(alpha.includes(0)).toBe(true);
    expect(alpha.includes(255)).toBe(true);
    expect(Object.values(baseline.tiles).some(old => old.rgbaSHA256 === hash(pixels))).toBe(false);
  }
});
