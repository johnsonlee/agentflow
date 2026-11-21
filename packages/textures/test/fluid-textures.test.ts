import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { allAtlasTextureNames } from "@craft/engine";
import { buildAtlas, generateTile, hasItemTile } from "../src/index";
import baseline from "./fixtures/fluids-8635914.json";
const hash=(v:Uint8ClampedArray)=>createHash("sha256").update(v).digest("hex");
it("preserves all870 published pixels and UVs while appending four fluid bindings",()=>{
 const names=allAtlasTextureNames(),atlas=buildAtlas(names);
 expect(names.slice(0,baseline.names.length)).toEqual(baseline.names);expect(names.slice(baseline.names.length)).toEqual(["lava","obsidian","item_water_bucket","item_lava_bucket"]);
 for(const name of baseline.names){const old=baseline.tiles[name as keyof typeof baseline.tiles];expect(hash(generateTile(name)),name).toBe(old.rgbaSHA256);expect(hash(atlas.tilePixels(name)),name).toBe(old.rgbaSHA256);expect(atlas.uv(name),name).toEqual(old.uv);}
 const fresh=names.slice(baseline.names.length).map(name=>hash(generateTile(name)));expect(new Set(fresh).size).toBe(4);
 for(const name of ["item_water_bucket","item_lava_bucket"]){expect(hasItemTile(name)).toBe(true);const a=generateTile(name).filter((_,i)=>i%4===3);expect(a.includes(0)).toBe(true);expect(a.includes(255)).toBe(true);}
 for(const name of ["lava","obsidian"]){expect(hasItemTile(name)).toBe(false);expect(generateTile(name).filter((_,i)=>i%4===3).every(a=>a===255)).toBe(true);}
});
