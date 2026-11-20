import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BLOCKS, DYE_COLORS, ELEMENTS, itemTextureNames, textureNames } from "@craft/engine";
import legacyTextures from "./fixtures/legacy-textures-a81.json";
import { ELEMENT_BLOCK_TILE_GENERATORS, TILE_NAMES, TILE_SIZE, buildAtlas, generateTile, hasItemTile } from "../src";

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
      [
        "blue_torch", "red_torch", "purple_torch", "green_torch",
        "birch_leaves", "dandelion", "glass", "glow_stick_block", "oak_leaves", "poppy", "tall_grass", "torch", "underwater_torch_block", "water",
        "lever_off", "lever_on", "redstone_torch_on", "redstone_torch_off", ...Array.from({ length: 16 }, (_, p) => `redstone_dust_${p}`),
        ...Array.from({ length: 8 }, (_, age) => `wheat_stage_${age}`),
      ].sort(),
    );
  });

  it("covers all generic element faces with distinct fully opaque periodic-table art", () => {
    const names = ["element_block_0_unknown", ...ELEMENTS.map((e) => `element_block_${e.z}_${e.symbol}`)];
    expect(Object.keys(ELEMENT_BLOCK_TILE_GENERATORS).sort()).toEqual([...names].sort());
    const worldFaces = new Set(BLOCKS.filter((b) => b.id >= 32768).flatMap((b) => Object.values(b.faces)));
    expect([...worldFaces].sort()).toEqual([...names].sort());
    const atlas = buildAtlas([...textureNames(), ...itemTextureNames()]);
    const hashes = new Set<string>();
    for (const name of names) {
      expect(TILE_NAMES).toContain(name);
      expect(atlas.tiles.has(name)).toBe(true);
      const data = generateTile(name);
      for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
      expect(Buffer.from(atlas.tilePixels(name)).equals(Buffer.from(data))).toBe(true);
      hashes.add(Buffer.from(data).toString("base64"));
    }
    expect(hashes.size).toBe(119);
  });

  it("keeps every pre-element-world block and inventory texture byte-identical", () => {
    // Recorded from frozen 9c5d8d0: 130 block face keys and 519 item icons.
    const names = legacyTextures.names.filter((n) => !n.startsWith("element_block_"));
    expect(names).toHaveLength(649);
    const hash = createHash("sha256");
    for (const name of names) hash.update(name + "\0").update(generateTile(name));
    expect(hash.digest("hex")).toBe("e730bdce08dc1ccb353ed281d84090428c29f652ab575c47b6c0b1c95a7dfd2a");
  });

  it("covers all sixteen canonical dyes and wool colors with distinct original art", () => {
    expect(DYE_COLORS).toHaveLength(16);
    const dyeKeys = new Set(itemTextureNames());
    const dyes = new Set<string>();
    const wools = new Set<string>();
    for (const color of DYE_COLORS) {
      const dye = `item_${color.name}_dye`;
      const wool = `${color.name}_wool`;
      expect(dyeKeys.has(dye)).toBe(true);
      expect(hasItemTile(dye)).toBe(true);
      expect(TILE_NAMES).toContain(wool);
      const definition = BLOCKS.find((b) => b.name === wool);
      expect(definition).toBeDefined();
      expect(new Set(Object.values(definition!.faces))).toEqual(new Set([wool]));
      const woolPixels = generateTile(wool);
      for (let i = 3; i < woolPixels.length; i += 4) expect(woolPixels[i]).toBe(255);
      const dyePixels = generateTile(dye);
      const opaque = Array.from(dyePixels).filter((_, i) => i % 4 === 3 && dyePixels[i] === 255).length;
      expect(opaque).toBeGreaterThan(10);
      expect(opaque).toBeLessThan(128);
      dyes.add(Buffer.from(dyePixels).toString("base64"));
      wools.add(Buffer.from(woolPixels).toString("base64"));
    }
    expect(dyes.size).toBe(16);
    expect(wools.size).toBe(16);
  });

  it("preserves all 768 pre-dye block and inventory textures pixel-for-pixel", () => {
    expect(legacyTextures.names).toHaveLength(768);
    const current = new Set([...textureNames(), ...itemTextureNames()]);
    const hash = createHash("sha256");
    for (const name of legacyTextures.names) {
      expect(current.has(name)).toBe(true);
      hash.update(name + "\0").update(generateTile(name));
    }
    expect(hash.digest("hex")).toBe(legacyTextures.sha256);
  });

  it("grass side has a green top fringe over dirt", () => {
    const d = generateTile("grass_side");
    const px = (x: number, y: number) => Array.from(d.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 3));
    const [r0, g0] = px(4, 0);
    const [r1, g1] = px(4, 15);
    expect(g0).toBeGreaterThan(r0);
    expect(r1).toBeGreaterThan(g1);
  });

  it("preserves the renamed NaClO flask while distinguishing the manufactured bleach product", () => {
    const oldCompound = Buffer.from(generateTile("item_compound_bleach"));
    const compound = Buffer.from(generateTile("item_compound_sodium_hypochlorite"));
    const product = Buffer.from(generateTile("item_product_bleach"));
    expect(hasItemTile("item_compound_sodium_hypochlorite")).toBe(true);
    expect(hasItemTile("item_product_bleach")).toBe(true);
    expect(compound.equals(oldCompound)).toBe(true);
    expect(product.equals(compound)).toBe(false);
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

  it("draws an original sprite for every item: transparent background, distinct, deterministic", () => {
    const names = itemTextureNames();
    expect(names.filter((n) => !hasItemTile(n))).toEqual([]);
    const hashes = new Set<string>();
    for (const n of names) {
      const d = generateTile(n);
      let opaque = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] === 255) opaque++;
      // A sprite, not a full tile and not the magenta "missing" checkerboard.
      expect(opaque).toBeGreaterThan(10);
      expect(opaque).toBeLessThan(TILE_SIZE * TILE_SIZE / 2);
      expect(Buffer.from(d).equals(Buffer.from(generateTile(n)))).toBe(true);
      hashes.add(Buffer.from(d).toString("base64"));
    }
    expect(hashes.size).toBe(names.length);
  });
});
