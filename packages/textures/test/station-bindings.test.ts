import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames, STATION_FACE_KEYS } from "@craft/engine";
import baseline from "./fixtures/station-binding-067.json";
import { buildAtlas, generateTile, parseLocalTexturePack, TILE_NAMES, type SourceTile } from "../src";
const hash = (v: Uint8Array | Uint8ClampedArray) => createHash("sha256").update(v).digest("hex");
const generic = "chem_station_top", names = allAtlasTextureNames();
const tile = (size: 16 | 32, seed: number): SourceTile => ({ width: size, height: size, rgba: Uint8ClampedArray.from({ length: size * size * 4 }, (_, i) => i % 4 === 3 ? (i % 12 === 3 ? 0 : 255) : (i * 37 + seed * 29) & 255) });
it("appends eight addresses with exact prior825 original pixels/UVs and exact legacy-seeded default aliases", () => {
  expect(names.slice(0, 825)).toEqual(baseline.names); expect(names.slice(825, 833)).toEqual(STATION_FACE_KEYS);
  const prior = buildAtlas(baseline.names), current = buildAtlas(names);
  expect(hash(prior.data)).toBe(baseline.atlasRGBA_SHA256); expect([current.width, current.height, current.tileSize]).toEqual([512, 512, 16]);
  for (const name of baseline.names) {
    expect(hash(generateTile(name))).toBe(baseline.tiles[name as keyof typeof baseline.tiles]);
    expect(current.tilePixels(name)).toEqual(prior.tilePixels(name)); expect(current.uv(name)).toEqual(prior.uv(name));
  }
  for (const key of STATION_FACE_KEYS) { expect(TILE_NAMES).toContain(key); expect(generateTile(key)).toEqual(generateTile(generic)); }
  const detached = generateTile(STATION_FACE_KEYS[0]); detached.fill(0); expect(generateTile(STATION_FACE_KEYS[0])).toEqual(generateTile(generic));
});
for (const size of [16, 32] as const) it(`inherits a v1 generic${size} override into eight effective faces without mutating supplied rasters`, () => {
  const source = tile(size, 5), before = Uint8ClampedArray.from(source.rgba), overrides = new Map([[generic, source]]);
  const atlas = buildAtlas(names, overrides);
  expect(atlas.report.directAppliedKeys).toEqual([generic]); expect(atlas.report.inheritedAppliedKeys).toEqual(STATION_FACE_KEYS.map(key => ({ key, fromKey: generic })));
  expect(atlas.report.appliedKeys).toHaveLength(9); expect(atlas.report.fallbackKeys).toHaveLength(names.length - 9);
  for (const key of [generic, ...STATION_FACE_KEYS]) { expect(atlas.sourceTile(key)).toEqual(source); expect(atlas.tilePixels(key)).toEqual(before); }
  expect(atlas.tileSize).toBe(size); expect(source.rgba).toEqual(before); expect(overrides.size).toBe(1);
  atlas.sourceTile(STATION_FACE_KEYS[0]).rgba.fill(77); expect(atlas.sourceTile(STATION_FACE_KEYS[1]).rgba).toEqual(before);
  source.rgba.fill(99); expect(atlas.sourceTile(generic).rgba).toEqual(before);
});
for (const [genericSize, specificSize] of [[32, 16], [16, 32]] as const) it(`specific${specificSize} wins over generic${genericSize}, retaining all source bytes and stable prior UVs`, () => {
  const source = tile(genericSize, 3), specific = tile(specificSize, 8), key = STATION_FACE_KEYS[0];
  const overrides = new Map([[generic, source], [key, specific]]), atlas = buildAtlas(names, overrides);
  expect(atlas.sourceTile(key)).toEqual(specific); expect(atlas.sourceTile(STATION_FACE_KEYS[1])).toEqual(source);
  expect(atlas.report.directAppliedKeys).toEqual([generic, key]); expect(atlas.report.inheritedAppliedKeys).toHaveLength(7);
  expect(atlas.report.appliedKeys).toHaveLength(9); expect(atlas.tileSize).toBe(32);
  const expected32 = genericSize === 32 ? 8 : 1;
  expect(atlas.report.source32Count).toBe(expected32); expect(atlas.report.expanded16To32Count).toBe(names.length - expected32);
  const prior = buildAtlas(baseline.names, new Map([[generic, source], ["stone", tile(32, 6)]]));
  // Compare normalized addresses at the same32-pixel cell size, not16-vs32 inset epsilon.
  for (const name of baseline.names) expect(atlas.uv(name)).toEqual(prior.uv(name));
  const raw = atlas.sourceTile(key).rgba, packed = atlas.tilePixels(key);
  if (specificSize === 32) expect(packed).toEqual(raw);
  else for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = (y * 32 + x) * 4, b = (Math.floor(y / 2) * 16 + Math.floor(x / 2)) * 4;
    expect(packed.slice(a, a + 4)).toEqual(raw.slice(b, b + 4));
  }
});
it("keeps raw v1 serialization and explicit hashes separate from effective inherited coverage", async () => {
  const source = tile(16, 7), text = JSON.stringify({ version: 1, name: "Legacy station pack", tiles: [{ key: generic, width: 16, height: 16, rgbaBase64: Buffer.from(source.rgba).toString("base64") }] });
  const bytes = new TextEncoder().encode(text), before = bytes.slice(); const pack = await parseLocalTexturePack(bytes, names);
  const atlas = buildAtlas(names, pack.tiles);
  expect(pack.tiles.size).toBe(1); expect([...pack.tileHashes.keys()]).toEqual([generic]); expect(pack.contentSha256).toBe(hash(bytes));
  expect(atlas.report.appliedKeys).toHaveLength(9); expect(bytes).toEqual(before); expect(pack.tiles.get(generic)).toEqual(source);
});
it("keeps specific-only overrides isolated and validates the full candidate before legacy expansion", () => {
  const key = STATION_FACE_KEYS[0], source = tile(16, 9), atlas = buildAtlas(names, new Map([[key, source]]));
  expect(atlas.report.appliedKeys).toEqual([key]); expect(atlas.report.inheritedAppliedKeys).toEqual([]);
  for (const other of [generic, ...STATION_FACE_KEYS.slice(1)]) expect(atlas.sourceTile(other).rgba).toEqual(generateTile(generic));
  const before = source.rgba.slice();
  expect(() => buildAtlas(names, new Map([[generic, source], [STATION_FACE_KEYS[1], { ...source, height: 32 }]]))).toThrow(); expect(source.rgba).toEqual(before);
  expect(() => buildAtlas(["stone"], new Map([[generic, source]]))).toThrow("Unknown atlas override");
});
