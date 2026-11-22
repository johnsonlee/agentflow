import {expect,it} from "vitest";
import {createHash} from "node:crypto";
import {buildAtlas} from "../src/atlas/atlas";
import {allAtlasTextureNames} from "../../engine/src/catalog/atlas-texture-names";
import {hasItemTile} from "../src/atlas/tiles";
import baseline from "../../engine/test/fixtures/nether-7c-baseline.json";
it("preserves all875 clean7c original pixel hashes and UVs, appending only10 original Nether tiles",()=>{
 const names=allAtlasTextureNames(),a=buildAtlas(names);expect(names.length).toBe(885);expect(names.slice(0,875)).toEqual(baseline.tiles.map(t=>t.name));
 for(const t of baseline.tiles){expect(createHash("sha256").update(a.tilePixels(t.name)).digest("hex")).toBe(t.rgbaSHA256);expect(a.uv(t.name)).toEqual(t.uv);}
 const hashes=names.slice(875).map(n=>createHash("sha256").update(a.tilePixels(n)).digest("hex"));expect(new Set(hashes).size).toBe(10);
});
it("provides deliberate transparent item sprites and distinct visible Wart stages",()=>{
 const a=buildAtlas(allAtlasTextureNames());for(const n of ["item_nether_brick","item_nether_wart","item_blaze_rod","item_blaze_powder"]){expect(hasItemTile(n)).toBe(true);const p=a.tilePixels(n);expect([...p].filter((_,i)=>i%4===3&&p[i]>0).length).toBeGreaterThan(10);expect(p[3]).toBe(0);}
 for(let age=0;age<3;age++){const p=a.tilePixels(`nether_wart_stage_${age}`);expect(p[3]).toBe(0);expect([...p].filter((_,i)=>i%4===3&&p[i]>0).length).toBeGreaterThan(10);}
});
