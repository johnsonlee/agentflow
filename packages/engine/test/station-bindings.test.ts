import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import baseline from "./fixtures/station-binding-067.json";
import { AIR, World, meshChunk, ATLAS_TEXTURE_CATALOG, BLOCKS, ITEMS, RECIPES, STATION_FACE_KEYS, STATION_FACE_TEXTURES, allAtlasTextureNames, blockById, itemTextureNames, textureNames } from "../src/index";
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v) + "\n").digest("hex");
const expected = [[44, "element_constructor"], [45, "compound_creator"], [46, "material_reducer"], [47, "lab_table"]] as const;
it("changes exactly eight top/bottom texture references on four stable stations; every other definition, item and recipe stays exact", () => {
  expect([BLOCKS.length, ITEMS.slice(0, 552).length, RECIPES.slice(0, 144).length]).toEqual([309, 552, 144]);
  const old = structuredClone(baseline.blockDefs);
  for (const [id, name] of expected) {
    const row = old.find(def => def.id === id)!;
    expect(row.name).toBe(name); expect(row.faces).toEqual({ top: "chem_station_top", side: `${name}_side`, bottom: "chem_station_top" });
    row.faces.top = `${name}_top`; row.faces.bottom = `${name}_bottom`;
    expect(blockById(id).faces).toEqual({ top: `${name}_top`, side: `${name}_side`, bottom: `${name}_bottom` });
  }
  // The captured JSON cannot represent own undefined properties; compare canonical JSON on both sides.
  expect(JSON.parse(JSON.stringify(BLOCKS.slice(0,308)))).toEqual(old);
  expect(digest(ITEMS.slice(0, 552))).toBe(baseline.itemDefsSHA256); expect(digest(RECIPES.slice(0, 144))).toBe(baseline.recipesSHA256);
});
it("publishes an immutable eight-key binding table and a detached validated append-only atlas catalog", () => {
  expect(STATION_FACE_KEYS).toEqual(expected.flatMap(([, name]) => [`${name}_top`, `${name}_bottom`]));
  expect(Object.keys(STATION_FACE_TEXTURES)).toEqual(expected.map(([, name]) => name));
  const names = allAtlasTextureNames(); expect(names).toHaveLength(870); expect(names.slice(825, 833)).toEqual(STATION_FACE_KEYS);
  expect(names).toContain("chem_station_top"); expect(new Set(names).size).toBe(870);
  expect([...textureNames(), ...itemTextureNames()].every(key => names.includes(key))).toBe(true);
  names.pop(); expect(allAtlasTextureNames()).toHaveLength(870); expect(Object.isFrozen(ATLAS_TEXTURE_CATALOG)).toBe(true);
  expect(Object.isFrozen(STATION_FACE_KEYS)).toBe(true); expect(Object.values(STATION_FACE_TEXTURES).every(Object.isFrozen)).toBe(true);
});
it("refuses an unregistered referenced face instead of silently changing atlas addresses", () => {
  const def = blockById(44), original = def.faces;
  try { def.faces = { ...original, top: "unregistered_station_face" }; expect(() => allAtlasTextureNames()).toThrow("missing from atlas catalog"); }
  finally { def.faces = original; }
  expect(allAtlasTextureNames()).toHaveLength(870);
});

it("meshes each station with distinct top and bottom UV bindings and unchanged side faces", () => {
  const names = allAtlasTextureNames();
  for (const [id, name] of expected) {
    const world = new World(1);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.getChunk(cx, cz).blocks.fill(AIR);
    world.setBlock(5, 40, 5, id);
    const lookedUp: string[] = [];
    const { solid } = meshChunk(world, 0, 0, key => {
      lookedUp.push(key); const address = names.indexOf(key); expect(address).toBeGreaterThanOrEqual(0);
      return [address / 1024, 0, (address + 1) / 1024, 1];
    });
    expect(solid.indices).toHaveLength(36); expect(lookedUp.sort()).toEqual([`${name}_top`, `${name}_bottom`, ...Array(4).fill(`${name}_side`)].sort());
    for (let vertex = 0; vertex < 24; vertex++) {
      const ny = solid.normals[vertex * 3 + 1];
      const key = `${name}_${ny === 1 ? "top" : ny === -1 ? "bottom" : "side"}`;
      const u = solid.uvs[vertex * 2], address = names.indexOf(key);
      expect([address / 1024, (address + 1) / 1024]).toContain(u);
    }
  }
});
