import {readFileSync}from 'node:fs';import{createHash}from 'node:crypto';import{expect,it}from 'vitest';
import{allAtlasTextureNames}from '../../engine/src/catalog/atlas-texture-names';import{buildAtlas}from '../src/atlas/atlas';import{TILE_NAMES,generateTile}from '../src/atlas/tiles';
const baseline=JSON.parse(readFileSync(new URL('../../engine/test/fixtures/birch-prefix-6893.json',import.meta.url),'utf8'));
const sha=(x:string|Uint8Array|Uint8ClampedArray)=>createHash('sha256').update(x).digest('hex');
it('preserves every892 oldRGBA/UV address and302 generator names while appending one originalBirch tile',()=>{
 const names=allAtlasTextureNames(),atlas=buildAtlas(names);expect(names).toHaveLength(919);expect(names[892]).toBe('birch_planks');expect(atlas.width).toBe(512);expect(atlas.height).toBe(512);expect(sha(JSON.stringify(names.slice(0,892).map(name=>({name,sha256:sha(atlas.tilePixels(name)),uv:atlas.uv(name)}))))).toBe(baseline.atlasEntriesSHA256);expect(TILE_NAMES).toHaveLength(329);expect(TILE_NAMES[302]).toBe('birch_planks');expect(sha(JSON.stringify(TILE_NAMES.slice(0,302)))).toBe(baseline.tileNamesSHA256);
});
it('newBirch artwork is deterministic opaque16px and distinct from all old originaltiles without native-image claims',()=>{
 const rgba=generateTile('birch_planks');expect(rgba).toHaveLength(1024);expect(generateTile('birch_planks')).toEqual(rgba);expect(Array.from(rgba).filter((_,i)=>i%4===3).every(a=>a===255)).toBe(true);expect(new Set(allAtlasTextureNames().slice(0,892).map(name=>sha(generateTile(name)))).has(sha(rgba))).toBe(false);
});
it('old892-key local packs explicitly fall back only for newBirch; an explicitBirch binding overrides noOak pixels',async()=>{
 const{parseLocalTexturePack}=await import('../src/resource-packs/resource-pack');const names=allAtlasTextureNames();
 const record=(key:string,rgba:Uint8ClampedArray)=>({key,width:16,height:16,rgbaBase64:Buffer.from(rgba).toString('base64')});
 const encode=(tiles:unknown[])=>new TextEncoder().encode(JSON.stringify({version:1,name:'Synthetic mapping only',tiles}));
 const oldBytes=encode(names.slice(0,892).map(key=>record(key,generateTile(key))));const old=await parseLocalTexturePack(oldBytes,names),atlas=buildAtlas(names,old.tiles);
 expect(old.contentSha256).toBe(sha(oldBytes));expect(atlas.report.directAppliedKeys).toEqual(names.slice(0,892));expect(atlas.report.fallbackKeys).toEqual(['birch_planks','chest_top','chest_side','chest_bottom','sugar_cane_plant','item_sugar_cane','item_paper','item_leather_helmet','item_leather_chestplate','item_leather_leggings','item_leather_boots','iron_block','gold_block','diamond_block','item_iron_nugget','item_gold_nugget','hay_block_top','hay_block_side','item_bone','item_bone_meal','composter_inside','composter_side','composter_bottom','composter_top','composter_compost','composter_ready','item_camera']);expect(atlas.tilePixels('birch_planks')).toEqual(generateTile('birch_planks'));
 const rgba=Uint8ClampedArray.from({length:1024},(_,i)=>i%4===3?255:(i*7)%256),bytes=encode([record('birch_planks',rgba)]),pack=await parseLocalTexturePack(bytes,names),custom=buildAtlas(names,pack.tiles);
 expect(pack.contentSha256).toBe(sha(bytes));expect(custom.report.directAppliedKeys).toEqual(['birch_planks']);expect(custom.report.fallbackKeys).toEqual(names.filter(n=>n!=='birch_planks'));expect(custom.tilePixels('birch_planks')).toEqual(rgba);expect(custom.tilePixels('oak_planks')).toEqual(generateTile('oak_planks'));
 await expect(parseLocalTexturePack(encode([record('birch_planks',rgba),record('unknown_birch',rgba)]),names)).rejects.toThrow();expect(custom.tilePixels('birch_planks')).toEqual(rgba);
});
