import {expect,it} from 'vitest';
import {generateTile,buildAtlas} from '../src/index';
import {allAtlasTextureNames} from '../../engine/src/catalog/atlas-texture-names';
import {itemById,stackId} from '../../engine/src/catalog/items';
it('append-only original Garbage product has a visible distinct generated icon and atlas address',()=>{const key=itemById(stackId('garbage')).icon,names=allAtlasTextureNames();expect(key).toBe('item_product_garbage');expect(names.at(-1)).toBe(key);expect(names).toHaveLength(920);const rgba=generateTile(key);expect(rgba).toHaveLength(1024);expect(rgba.some((_,i)=>i%4===3&&rgba[i]>0)).toBe(true);expect(rgba).not.toEqual(generateTile('item_product_bleach'));expect(buildAtlas(names).uv(key)).toBeDefined();});
