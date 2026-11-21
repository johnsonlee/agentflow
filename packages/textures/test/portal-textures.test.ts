import { createHash } from "node:crypto";
import { expect,it } from "vitest";
import { allAtlasTextureNames,blockById } from "@craft/engine";
import { buildAtlas,generateTile,hasItemTile } from "../src/index";
import baseline from "./fixtures/portals-6ce46ce.json";
const hash=(data:Uint8ClampedArray)=>createHash("sha256").update(data).digest("hex");
it("preserves every published874 pixel/UV and appends one shared portal key",()=>{
 const names=allAtlasTextureNames(),atlas=buildAtlas(names);expect(names.slice(0,874)).toEqual(baseline.names);expect(names.slice(874)).toEqual(["nether_portal"]);
 for(const name of baseline.names){const prior=baseline.tiles[name as keyof typeof baseline.tiles];expect(hash(generateTile(name)),name).toBe(prior.rgbaSHA256);expect(hash(atlas.tilePixels(name)),name).toBe(prior.rgbaSHA256);expect(atlas.uv(name),name).toEqual(prior.uv);}
});
it("binds both hidden orientations to a distinct original translucent surface",()=>{
 const pixels=generateTile("nether_portal"),alphas=pixels.filter((_,i)=>i%4===3);expect([...new Set(alphas)]).toEqual([210]);expect(hasItemTile("nether_portal")).toBe(false);
 expect(hash(pixels)).not.toBe(hash(generateTile("obsidian")));expect(hash(pixels)).not.toBe(hash(generateTile("water")));
 for(const id of [192,193]){const block=blockById(id);expect(block.faces).toEqual({top:"nether_portal",side:"nether_portal",bottom:"nether_portal"});expect(block.creative).toBe(false);expect(block.solid).toBe(false);}
});
it("keeps explicit user portal raster overrides detached from procedural fallback",()=>{
 const rgba=generateTile("nether_portal"),before=Uint8ClampedArray.from(rgba);const atlas=buildAtlas(allAtlasTextureNames(),new Map([["nether_portal",{width:16,height:16,rgba}]]));rgba.fill(0);
 expect(atlas.tilePixels("nether_portal")).toEqual(before);expect(atlas.report.directAppliedKeys).toEqual(["nether_portal"]);expect(atlas.report.appliedKeys).toEqual(["nether_portal"]);
});
