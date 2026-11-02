import { describe, expect, it } from "vitest";
import { textureNames } from "@craft/engine";
import { TILE_NAMES, TILE_SIZE, buildAtlas, generateTile } from "../src";

describe("procedural textures", () => {
  it("provides a texture for every block face", () => {
    const missing = textureNames().filter((n) => !TILE_NAMES.includes(n));
    expect(missing).toEqual([]);
  });

  it("generates deterministic 16x16 RGBA tiles", () => {
    for (const name of TILE_NAMES) {
      const a = generateTile(name);
      expect(a.length).toBe(TILE_SIZE * TILE_SIZE * 4);
      expect(Buffer.from(a).equals(Buffer.from(generateTile(name)))).toBe(true);
    }
  });

  it("gives every tile a distinct look", () => {
    const hashes = new Set(TILE_NAMES.map((n) => Buffer.from(generateTile(n)).toString("base64")));
    expect(hashes.size).toBe(TILE_NAMES.length);
  });

  it("uses transparency only where Minecraft does (leaves, glass, plants, water)", () => {
    const alphaTiles = TILE_NAMES.filter((n) => {
      const d = generateTile(n);
      for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
      return false;
    });
    expect(alphaTiles.sort()).toEqual(
      ["birch_leaves", "dandelion", "glass", "oak_leaves", "poppy", "tall_grass", "water"].sort(),
    );
  });

  it("grass side has a green top fringe over dirt", () => {
    const d = generateTile("grass_side");
    const px = (x: number, y: number) => Array.from(d.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 3));
    const [r0, g0] = px(4, 0);
    const [r1, g1] = px(4, 15);
    expect(g0).toBeGreaterThan(r0);
    expect(r1).toBeGreaterThan(g1);
  });

  it("renders a magenta/black placeholder for unknown tiles", () => {
    const d = generateTile("does_not_exist");
    expect(Array.from(d.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(d.slice(8 * 4, 8 * 4 + 4))).toEqual([248, 0, 248, 255]);
  });
});

describe("texture atlas", () => {
  it("packs tiles into a power-of-two square and maps UVs", () => {
    const atlas = buildAtlas(["dirt", "stone", "sand", "glass", "water"]);
    expect(atlas.columns).toBe(4);
    expect(atlas.width).toBe(64);
    expect(atlas.data.length).toBe(64 * 64 * 4);
    const [u0, vBottom, u1, vTop] = atlas.uv("stone");
    expect(u0).toBeCloseTo(0.25, 3);
    expect(u1).toBeCloseTo(0.5, 3);
    expect(vTop).toBeCloseTo(0, 3);
    expect(vBottom).toBeCloseTo(0.25, 3);
    expect(Buffer.from(atlas.tilePixels("sand")).equals(Buffer.from(generateTile("sand")))).toBe(true);
  });

  it("fits all game textures", () => {
    const atlas = buildAtlas(TILE_NAMES);
    expect(atlas.columns * atlas.columns).toBeGreaterThanOrEqual(TILE_NAMES.length);
    expect(atlas.tiles.size).toBe(TILE_NAMES.length);
  });
});
