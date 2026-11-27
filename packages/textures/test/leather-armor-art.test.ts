import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {allAtlasTextureNames} from '../../engine/src';
import {buildAtlas} from '../src/atlas/atlas';
import {TILE_NAMES,generateTile,hasItemTile} from '../src/atlas/tiles';
import {parseLocalTexturePack} from '../src/resource-packs/resource-pack';
const base=JSON.parse(readFileSync(new URL('../../engine/test/fixtures/leather-prefix-49e6079.json',import.meta.url),'utf8'));
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const keys=['item_leather_helmet','item_leather_chestplate','item_leather_leggings','item_leather_boots'];
it('preserves all899 originalRGBA/UV and309 tile names, appending four distinct transparent original sprites',()=>{
 const names=allAtlasTextureNames(),atlas=buildAtlas(names);expect(names).toHaveLength(919);expect(hash(names.slice(0,899))).toBe(base.names);expect(hash(TILE_NAMES.slice(0,309))).toBe(base.tileNames);expect(hash(names.slice(0,899).map(name=>({name,rgbaSHA256:createHash('sha256').update(atlas.tilePixels(name)).digest('hex'),uv:atlas.uv(name)})))).toBe(base.atlasRows);expect(names.slice(899,903)).toEqual(keys);expect(TILE_NAMES.slice(309,313)).toEqual(keys);expect([atlas.width,atlas.height,atlas.tileSize]).toEqual([512,512,16]);
 const hashes=keys.map(key=>{const rgba=generateTile(key);expect(hasItemTile(key)).toBe(true);expect(rgba).toHaveLength(1024);expect(rgba.some((v,i)=>i%4===3&&v===0)).toBe(true);expect(rgba.some((v,i)=>i%4===3&&v===255)).toBe(true);return createHash('sha256').update(rgba).digest('hex');});expect(new Set(hashes).size).toBe(4);
});
it('old899-key local packs retain Leather and storage block fallbacks and explicit Leather override preserves source bytes',async()=>{
 const names=allAtlasTextureNames(),old=names.slice(0,899),pack=await parseLocalTexturePack(new TextEncoder().encode(JSON.stringify({version:1,name:'Original synthetic old899',tiles:old.map(key=>({key,width:16,height:16,rgbaBase64:Buffer.from(generateTile(key)).toString('base64')}))})),names),atlas=buildAtlas(names,pack.tiles);expect(atlas.report.directAppliedKeys).toEqual(old);expect(atlas.report.fallbackKeys).toEqual([...keys,'iron_block','gold_block','diamond_block','item_iron_nugget','item_gold_nugget','hay_block_top','hay_block_side','item_bone','item_bone_meal','composter_inside','composter_side','composter_bottom','composter_top','composter_compost','composter_ready','item_camera']);const rgba=new Uint8ClampedArray(1024);rgba.fill(79);const custom=buildAtlas(names,new Map([[keys[0],{width:16,height:16,rgba}]]));expect(custom.sourceTile(keys[0]).rgba).toEqual(rgba);expect(custom.sourceTile('item_paper').rgba).toEqual(generateTile('item_paper'));expect(custom.sourceTile('chest_top').rgba).toEqual(generateTile('chest_top'));
});
