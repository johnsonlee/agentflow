import { allAtlasTextureNames } from "@craft/engine";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { GLOW_STICK_COLORS, itemTextureNames, textureNames } from "@craft/engine";
import { MAX_PACK_BYTES, MAX_PACK_NAME_LENGTH, buildAtlas, generateTile, parseLocalTexturePack, sha256Hex, type SourceTile } from "../src";
// Historical pixel/UV assertions retain the exact first825 keys. Full catalog is tested separately.
const historical825Names = () => allAtlasTextureNames().slice(0, 825);

const addedGlowKeys = new Set(GLOW_STICK_COLORS.filter(color => color.color !== "green").map(color => color.icon));
const hash = (data: Uint8Array | Uint8ClampedArray) => createHash("sha256").update(data).digest("hex");
const bytes = (raw: unknown) => new TextEncoder().encode(JSON.stringify(raw));
const tile = (size: 16 | 32, seed = 0): SourceTile => ({ width: size, height: size, rgba: Uint8ClampedArray.from({ length: size * size * 4 }, (_, i) => (i * 37 + seed * 19) & 255) });
const record = (key = "stone", source = tile(16)) => ({ key, width: source.width, height: source.height, rgbaBase64: Buffer.from(source.rgba).toString("base64") });
const rawPack = () => ({ version: 1, name: "Synthetic local pack", tiles: [record()] });

it("matches published SHA256 vectors and Nodecrypto at padding boundaries and file budget, without WebCrypto", () => {
  vi.stubGlobal("crypto", undefined);
  try {
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    for (const length of [1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, MAX_PACK_BYTES]) {
      const backing = Uint8Array.from({ length: length + 23 }, (_, i) => (i * 71 + i * i) & 255), input = backing.subarray(11, 11 + length), before = hash(input);
      expect(sha256Hex(input)).toBe(hash(input)); expect(hash(input)).toBe(before);
    }
  } finally { vi.unstubAllGlobals(); }
});

it("preserves exact Unicode raw-file and per-tile content hashes, detached from caller bytes", async () => {
  const a = tile(16, 1), b = tile(32, 7), raw = { version: 1, name: "  化学 🧪 café  ", tiles: [record("stone", a), record("element_block_1_H", b)] };
  const input = bytes(raw), expected = hash(input), pending = parseLocalTexturePack(input, ["stone", "element_block_1_H"]);
  input.fill(0); const pack = await pending;
  expect(pack.name).toBe("化学 🧪 café"); expect(pack.version).toBe(1); expect(pack.contentSha256).toBe(expected);
  expect(pack.tileHashes.get("stone")).toBe(hash(a.rgba)); expect(pack.tileHashes.get("element_block_1_H")).toBe(hash(b.rgba));
  expect(pack.tiles.get("stone")!.rgba).toEqual(a.rgba); expect(pack.tiles.get("element_block_1_H")!.rgba).toEqual(b.rgba);
  a.rgba.fill(0); expect(pack.tiles.get("stone")!.rgba).not.toEqual(a.rgba);
});

it("rejects malformed/empty/oversized files and bounded names rather than applying a candidate prefix", async () => {
  for (const input of [new Uint8Array(), new Uint8Array(MAX_PACK_BYTES + 1), new Uint8Array([0xff]), new TextEncoder().encode("{bad json")]) await expect(parseLocalTexturePack(input, ["stone"])).rejects.toThrow();
  for (const raw of [null, [], {}, { ...rawPack(), version: 2 }, { ...rawPack(), name: " " }, { ...rawPack(), name: 1 }, { ...rawPack(), name: "🧪".repeat(MAX_PACK_NAME_LENGTH + 1) }, { ...rawPack(), tiles: [] }, { ...rawPack(), tiles: {} }, { ...rawPack(), unexpected: true }]) await expect(parseLocalTexturePack(bytes(raw), ["stone"])).rejects.toThrow();
  expect((await parseLocalTexturePack(bytes({ ...rawPack(), name: "🧪".repeat(MAX_PACK_NAME_LENGTH) }), ["stone"])).name).toBe("🧪".repeat(MAX_PACK_NAME_LENGTH));
  const exactBudget = new Uint8Array(MAX_PACK_BYTES); const valid = bytes(rawPack()); exactBudget.set(valid); exactBudget.fill(32, valid.length);
  expect((await parseLocalTexturePack(exactBudget, ["stone"])).contentSha256).toBe(hash(exactBudget));
});

it("rejects duplicate, unknown, malformed dimensions and noncanonical or wrong-size base64 wholesale", async () => {
  const zero = { width: 16, height: 16, rgba: new Uint8ClampedArray(1024) } as SourceTile, good = record("stone", zero);
  const cases = [
    { ...rawPack(), tiles: [good, good] }, { ...rawPack(), tiles: [good, record("unknown")] },
    ...[null, [], {}, { ...good, key: "constructor" }, { ...good, key: "__proto__" }, { ...good, width: 8 }, { ...good, width: "16" }, { ...good, height: 32 }, { ...good, extra: 1 }, { ...good, rgbaBase64: "" }, { ...good, rgbaBase64: good.rgbaBase64.slice(0, -1) }, { ...good, rgbaBase64: good.rgbaBase64.replace(/AA==$/, "AB==") }, { ...good, rgbaBase64: good.rgbaBase64.replace(/AA==$/, "A-==") }, { ...good, rgbaBase64: good.rgbaBase64.slice(0, -4) + "AAA=" }].map(value => ({ ...rawPack(), tiles: [value] })),
  ];
  for (const raw of cases) await expect(parseLocalTexturePack(bytes(raw), ["stone", "dirt"])).rejects.toThrow();
  const previous = await parseLocalTexturePack(bytes(rawPack()), ["stone", "dirt"]), before = Uint8ClampedArray.from(previous.tiles.get("stone")!.rgba);
  await expect(parseLocalTexturePack(bytes({ ...rawPack(), tiles: [good, record("unknown")] }), ["stone", "dirt"])).rejects.toThrow();
  expect(previous.tiles.get("stone")!.rgba).toEqual(before);
});

it("keeps the actual frozen f7 default809 atlas bytes, source pixels, layout and UVs unchanged", () => {
  const currentNames = historical825Names();
  expect(currentNames).toHaveLength(825); expect(currentNames).toContain("item_snowball");
  // The appended snowball has its own tile; the complete published809-tile prefix stays exact.
  const names = currentNames.filter(name => name !== "item_lead" && name !== "item_string" && name !== "item_snowball" && !addedGlowKeys.has(name)), atlas = buildAtlas(names);
  expect(names).toHaveLength(809); expect(atlas.tiles.size).toBe(809); expect([atlas.width, atlas.height, atlas.tileSize, atlas.columns]).toEqual([512, 512, 16, 32]);
  // Captured from unmodified f7 atlas.ts before this increment, not generated by the new code.
  expect(hash(atlas.data)).toBe("8c9effe770e636b24c9b666c360960783bb40d66248df06420b3e18782ef5dac");
  for (const name of names) {
    const expected = generateTile(name); expect(atlas.tilePixels(name)).toEqual(expected); expect(atlas.sourceTile(name)).toEqual({ width: 16, height: 16, rgba: expected });
  }
  expect(atlas.report).toEqual({ appliedKeys: [], directAppliedKeys: [], inheritedAppliedKeys: [], fallbackKeys: names, source16Count: 809, source32Count: 0, expanded16To32Count: 0 });
  const small = buildAtlas(["dirt", "stone", "sand"]), eps = .01 / 32;
  expect(small.uv("stone")).toEqual([.5 + eps, .5 - eps, 1 - eps, eps]);
});

it("packs mixed32/16 RGBA without downsampling or Canvas loss, explicitly expands16 and reports original fallback", () => {
  const names = ["stone", "element_block_1_H", "chem_station_top", "item_compound_magnesium_nitrate"], a = tile(16, 3), b = tile(32, 5);
  a.rgba.set([21, 43, 65, 0], 0); b.rgba.set([111, 77, 33, 0], 0);
  const rawA = Uint8ClampedArray.from(a.rgba), rawB = Uint8ClampedArray.from(b.rgba), atlas = buildAtlas(names, new Map([["stone", a], ["element_block_1_H", b]]));
  expect(atlas.tileSize).toBe(32); expect([atlas.width, atlas.height, atlas.columns]).toEqual([64, 64, 2]);
  expect(atlas.tilePixels("element_block_1_H")).toEqual(rawB);
  const expanded = atlas.tilePixels("stone");
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) expect([...expanded.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)]).toEqual([...rawA.slice((Math.floor(y / 2) * 16 + Math.floor(x / 2)) * 4, (Math.floor(y / 2) * 16 + Math.floor(x / 2)) * 4 + 4)]);
  expect([...expanded.slice(0, 8)]).toEqual([21,43,65,0,21,43,65,0]); expect([...atlas.tilePixels("element_block_1_H").slice(0, 4)]).toEqual([111,77,33,0]);
  const eps = .01 / 64; expect(atlas.uv("element_block_1_H")).toEqual([.5 + eps, .5 - eps, 1 - eps, eps]);
  expect(atlas.report).toEqual({ appliedKeys: names.slice(0, 2), directAppliedKeys: names.slice(0, 2), inheritedAppliedKeys: [], fallbackKeys: names.slice(2), source16Count: 3, source32Count: 1, expanded16To32Count: 3 });
  for (const name of names.slice(2)) expect(atlas.sourceTile(name).rgba).toEqual(generateTile(name));
  a.rgba.fill(0); b.rgba.fill(0); expect(atlas.sourceTile("stone").rgba).toEqual(rawA); expect(atlas.sourceTile("element_block_1_H").rgba).toEqual(rawB);
  const returned = atlas.sourceTile("stone"); returned.rgba.fill(0); expect(atlas.sourceTile("stone").rgba).toEqual(rawA);
  expanded.fill(0); expect(atlas.tilePixels("stone").some(value => value !== 0)).toBe(true);
});

it("rejects bad direct atlas overrides and cannot accidentally infer either unmatched binding", () => {
  const names = historical825Names();
  for (const [key, value] of [["not_a_key", tile(16)], ["stone", { ...tile(16), height: 32 }], ["stone", { ...tile(16), rgba: new Uint8ClampedArray(4) }]] as Array<[string,SourceTile]>) expect(() => buildAtlas(names, new Map([[key,value]]))).toThrow();
  const atlas = buildAtlas(names, new Map([["stone", tile(32)]]));
  expect(atlas.report.appliedKeys).toEqual(["stone"]); expect(atlas.report.fallbackKeys).toContain("chem_station_top"); expect(atlas.report.fallbackKeys).toContain("item_compound_magnesium_nitrate");
});
