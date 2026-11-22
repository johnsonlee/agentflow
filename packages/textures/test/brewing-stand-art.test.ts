import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {allAtlasTextureNames} from "../../engine/src/catalog/atlas-texture-names";
import {buildAtlas} from "../src/atlas/atlas";
import {generateTile,TILE_NAMES} from "../src/atlas/tiles";
const sha=(x:string|Uint8ClampedArray)=>createHash("sha256").update(x).digest("hex");
const keys=["brewing_stand_base","brewing_stand_rod"];
it("preserves all890 original pixels/UVs and the300 prior generator names while appending only two stand tiles",()=>{
 const names=allAtlasTextureNames(),atlas=buildAtlas(names),old=names.slice(0,890).map(name=>({name,rgbaSHA256:sha(atlas.tilePixels(name)),uv:atlas.uv(name)}));
 expect(sha(JSON.stringify(old))).toBe("0e320189529357f622367fc57aa30188045943631776b02bacea331359746387");
 expect(sha(JSON.stringify(TILE_NAMES.slice(0,300)))).toBe("67397f8e828501ecae478a53a414f92b657e8d5de347c5322d69b2eb78470bbe");
 expect(names.slice(890,892)).toEqual(keys);expect(TILE_NAMES.slice(300,302)).toEqual(keys);
});
it("provides two distinct original deterministic opaque16px textures without changing any existing raster",()=>{
 const old=new Set(allAtlasTextureNames().slice(0,890).map(name=>sha(generateTile(name))));const added=new Set<string>();
 for(const name of keys){const rgba=generateTile(name);expect(rgba).toHaveLength(1024);expect(generateTile(name)).toEqual(rgba);expect(Array.from(rgba).filter((_,i)=>i%4===3).every(a=>a===255)).toBe(true);expect(old.has(sha(rgba))).toBe(false);added.add(sha(rgba));}
 expect(added.size).toBe(2);
});
