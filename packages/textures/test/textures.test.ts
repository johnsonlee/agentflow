import { allAtlasTextureNames, STATION_FACE_KEYS } from "@craft/engine";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BLOCKS, DYE_COLORS, GLOW_STICK_COLORS, ELEMENTS, itemTextureNames, textureNames } from "@craft/engine";
import leashBaseline from "./fixtures/leash-oak-fence-baseline.json";
import spiderStringBaseline from "./fixtures/spider-string-e3.json";
import glowColorsBaseline from "./fixtures/glow-stick-colors-f64.json";
import legacyTextures from "./fixtures/legacy-textures-a81.json";
import legacyGlassTextures from "./fixtures/legacy-textures-96.json";
import legacyGlowstoneTextures from "./fixtures/legacy-textures-0f9.json";
import { STAINED_GLASS_TILE_GENERATORS, ELEMENT_BLOCK_TILE_GENERATORS, TILE_NAMES, TILE_SIZE, buildAtlas, generateTile, hasItemTile } from "../src/index";

// Historical pixel/UV assertions retain the exact first825 keys. Full catalog is tested separately.
const stationKeys = new Set(STATION_FACE_KEYS);
const historical825Names = () => allAtlasTextureNames().slice(0, 825);

const addedGlowKeys = new Set(GLOW_STICK_COLORS.filter(color => color.color !== "green").map(color => color.icon));

describe("procedural textures", () => {
  it("appends an original brown Lead coil while retaining every824 published pixel and UV", () => {
    const names = historical825Names();
    expect(names).toHaveLength(825); expect(names.at(-1)).toBe("item_lead"); expect(names.slice(0, -1)).toEqual(leashBaseline.names);
    const previous = buildAtlas(leashBaseline.names), current = buildAtlas(names);
    expect(createHash("sha256").update(previous.data).digest("hex")).toBe(leashBaseline.atlasRGBA_SHA256);
    expect([current.width, current.height, current.tileSize]).toEqual([512, 512, 16]);
    for (const name of leashBaseline.names) { expect(current.tilePixels(name)).toEqual(previous.tilePixels(name)); expect(current.uv(name)).toEqual(previous.uv(name)); }
    expect(hasItemTile("item_lead")).toBe(true); const pixels = generateTile("item_lead");
    expect(pixels.some((c, i) => i % 4 === 3 && c === 255)).toBe(true); expect(pixels.some((c, i) => i % 4 === 3 && c === 0)).toBe(true);
    expect(current.tilePixels("item_lead")).toEqual(pixels); expect(pixels).not.toEqual(generateTile("item_string"));
  });

  it("appends an original string coil while retaining all823 published tile pixels and UVs", () => {
    const names = historical825Names().filter(name => name !== "item_lead");
    expect(names).toHaveLength(824); expect(names.at(-1)).toBe("item_string");
    expect(names.slice(0, -1)).toEqual(spiderStringBaseline.names);
    const previous = buildAtlas(spiderStringBaseline.names), current = buildAtlas(names);
    expect(createHash("sha256").update(previous.data).digest("hex")).toBe(spiderStringBaseline.atlasRGBA_SHA256);
    expect([current.width, current.height, current.tileSize]).toEqual([512, 512, 16]);
    for (const name of spiderStringBaseline.names) {
      expect(current.tilePixels(name)).toEqual(previous.tilePixels(name));
      expect(current.uv(name)).toEqual(previous.uv(name));
    }
    expect(hasItemTile("item_string")).toBe(true);
    const pixels = generateTile("item_string");
    expect(pixels.some((c, i) => i % 4 === 3 && c === 255)).toBe(true);
    expect(pixels.some((c, i) => i % 4 === 3 && c === 0)).toBe(true);
    expect(current.tilePixels("item_string")).toEqual(pixels);
    expect(pixels).not.toEqual(generateTile("item_feather"));
  });

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

  it("keeps every original tile distinct and permits only the eight explicit legacy station aliases", () => {
    const originalNames = TILE_NAMES.filter(name => !stationKeys.has(name));
    const hashes = new Map(originalNames.map(name => [Buffer.from(generateTile(name)).toString("base64"), name]));
    expect(hashes.size).toBe(originalNames.length);
    for (const key of STATION_FACE_KEYS) expect(hashes.get(Buffer.from(generateTile(key)).toString("base64"))).toBe("chem_station_top");
    expect(new Set(TILE_NAMES.map(name => Buffer.from(generateTile(name)).toString("base64"))).size).toBe(TILE_NAMES.length - 8);
  });

  it("uses transparency only where Minecraft does (leaves, glass, plants, water)", () => {
    const alphaTiles = TILE_NAMES.filter((n) => {
      const d = generateTile(n);
      for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
      return false;
    });
    expect(alphaTiles.sort()).toEqual(
      [
        ...DYE_COLORS.map((c) => `${c.name}_stained_glass`),
        "sugar_cane_plant", "item_sugar_cane", "item_paper",
        "blue_torch", "red_torch", "purple_torch", "green_torch",
        "birch_leaves", "dandelion", "fire", "glass", "glow_stick_block", "nether_portal", "oak_leaves", "poppy", "tall_grass", "torch", "underwater_torch_block", "water",
        "lever_off", "lever_on", "redstone_torch_on", "redstone_torch_off", ...Array.from({ length: 16 }, (_, p) => `redstone_dust_${p}`),
        ...Array.from({ length: 8 }, (_, age) => `wheat_stage_${age}`),
        ...Array.from({ length: 3 }, (_, age) => `nether_wart_stage_${age}`),
        "item_nether_brick", "item_nether_wart", "item_blaze_rod", "item_blaze_powder",
        "item_awkward_potion", "item_antidote", "item_elixir", "item_eye_drops", "item_tonic",
      ].sort(),
    );
  });

  it("covers all generic element faces with distinct fully opaque periodic-table art", () => {
    const names = ["element_block_0_unknown", ...ELEMENTS.map((e) => `element_block_${e.z}_${e.symbol}`)];
    expect(Object.keys(ELEMENT_BLOCK_TILE_GENERATORS).sort()).toEqual([...names].sort());
    const worldFaces = new Set(BLOCKS.filter((b) => b.id >= 32768).flatMap((b) => Object.values(b.faces)));
    expect([...worldFaces].sort()).toEqual([...names].sort());
    const atlas = buildAtlas(allAtlasTextureNames());
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
    const current = new Set(historical825Names());
    const hash = createHash("sha256");
    for (const name of legacyTextures.names) {
      expect(current.has(name)).toBe(true);
      hash.update(name + "\0").update(generateTile(name));
    }
    expect(hash.digest("hex")).toBe(legacyTextures.sha256);
  });

  it("provides sixteen distinct genuinely translucent tinted cube textures", () => {
    const names = DYE_COLORS.map((c) => `${c.name}_stained_glass`);
    expect(Object.keys(STAINED_GLASS_TILE_GENERATORS).sort()).toEqual([...names].sort());
    const hashes = new Set<string>();
    for (const name of names) {
      const definition = BLOCKS.find((b) => b.name === name)!;
      expect(definition.translucent).toBe(true);
      expect(definition.solid).toBe(true);
      expect(new Set(Object.values(definition.faces))).toEqual(new Set([name]));
      const tile = generateTile(name);
      const alpha = new Set<number>();
      for (let i = 3; i < tile.length; i += 4) {
        expect(tile[i]).toBeGreaterThan(0);
        expect(tile[i]).toBeLessThan(255);
        alpha.add(tile[i]);
      }
      expect(alpha.size).toBeGreaterThan(1);
      hashes.add(Buffer.from(tile).toString("base64"));
    }
    expect(hashes.size).toBe(16);
  });

  it("preserves all 792 pre-stained textures including plain cutout glass", () => {
    expect(legacyGlassTextures.names).toHaveLength(792);
    const current = new Set(historical825Names());
    const hash = createHash("sha256");
    for (const name of legacyGlassTextures.names) {
      expect(current.has(name)).toBe(true);
      hash.update(name + "\0").update(generateTile(name));
    }
    expect(hash.digest("hex")).toBe(legacyGlassTextures.sha256);
  });

  it("appends an original visible glowstone powder sprite without changing all 808 older tiles", () => {
    expect(legacyGlowstoneTextures.names).toHaveLength(808);
    const names = historical825Names().filter(name => name !== "item_lead").filter(name => name !== "item_string").filter(name => name !== "item_snowball" && !addedGlowKeys.has(name));
    expect(names).toHaveLength(809);
    expect(names.filter(n => !legacyGlowstoneTextures.names.includes(n))).toEqual(["item_glowstone_dust"]);
    const hash = createHash("sha256");
    for (const name of legacyGlowstoneTextures.names) hash.update(name + "\0").update(generateTile(name));
    expect(hash.digest("hex")).toBe(legacyGlowstoneTextures.sha256);
    expect(hasItemTile("item_glowstone_dust")).toBe(true);
    const dust = generateTile("item_glowstone_dust");
    const opaque = Array.from(dust).filter((_, i) => i % 4 === 3 && dust[i] === 255).length;
    expect(opaque).toBeGreaterThan(10); expect(opaque).toBeLessThan(128);
    expect(dust.some((a, i) => i % 4 === 3 && a === 0)).toBe(true);
    expect(Buffer.from(dust).equals(Buffer.from(generateTile("item_glowstone_dust")))).toBe(true);
    expect(Buffer.from(dust).equals(Buffer.from(generateTile("item_yellow_dye")))).toBe(false);
    const atlas = buildAtlas(names);
    expect(atlas.tiles.size).toBe(809);
    expect(Buffer.from(atlas.tilePixels("item_glowstone_dust")).equals(Buffer.from(dust))).toBe(true);
  });

  it("appends a distinct original snowball icon while retaining every published atlas key", () => {
    const names = historical825Names().filter(name => name !== "item_lead").filter(name => name !== "item_string").filter(name => !addedGlowKeys.has(name));
    expect(names).toHaveLength(810); expect(names.at(-1)).toBe("item_snowball");
    expect(hasItemTile("item_snowball")).toBe(true);
    const snowball = generateTile("item_snowball");
    expect(snowball.some((channel, i) => i % 4 === 3 && channel === 255)).toBe(true);
    expect(snowball.some((channel, i) => i % 4 === 3 && channel === 0)).toBe(true);
    expect(Buffer.from(snowball).equals(Buffer.from(generateTile("item_glowstone_dust")))).toBe(false);
    const atlas = buildAtlas(names);
    expect(atlas.tiles.size).toBe(810); expect(atlas.tilePixels("item_snowball")).toEqual(snowball);
  });

  it("appends thirteen distinct original glow colors while preserving all810 prior pixels, names, UVs and layout", () => {
    const names = historical825Names().filter(name => name !== "item_lead").filter(name => name !== "item_string");
    expect(names).toHaveLength(823); expect(addedGlowKeys.size).toBe(13);
    expect(names.filter(name => !addedGlowKeys.has(name))).toEqual(glowColorsBaseline.names);
    const previous = buildAtlas(glowColorsBaseline.names), current = buildAtlas(names);
    expect(createHash("sha256").update(previous.data).digest("hex")).toBe(glowColorsBaseline.atlasRGBA_SHA256);
    expect([current.width, current.height, current.tileSize]).toEqual([512, 512, 16]);
    for (const name of glowColorsBaseline.names) {
      expect(current.tilePixels(name)).toEqual(previous.tilePixels(name));
      expect(current.uv(name)).toEqual(previous.uv(name));
    }
    const hashes = new Set<string>();
    for (const variant of GLOW_STICK_COLORS) {
      expect(hasItemTile(variant.icon)).toBe(true);
      const pixels = generateTile(variant.icon);
      expect(pixels.some((channel, i) => i % 4 === 3 && channel === 255)).toBe(true);
      expect(pixels.some((channel, i) => i % 4 === 3 && channel === 0)).toBe(true);
      hashes.add(createHash("sha256").update(pixels).digest("hex"));
      expect(current.tilePixels(variant.icon)).toEqual(pixels);
    }
    expect(hashes.size).toBe(14);
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
