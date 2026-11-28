import {Tile,hex} from '../atlas/pixels';
/** Original app icons, no native texture samples or Education matching claim. */
function bone(tile:Tile):Tile{return tile.fill((x,y)=>{
 const shaft=Math.abs(x+y-15)<=1&&x>=4&&x<=11;
 const ends=[[3,11],[4,13],[11,2],[13,4]].some(([cx,cy])=>(x-cx)**2+(y-cy)**2<=3);
 if(!shaft&&!ends)return null;
 return hex(x+y<15?'#f6efcf':x+y>15?'#8d8b7b':'#d4d2b7');
});}
function meal(tile:Tile):Tile{return tile.fill((x,y)=>{
 const grain=[[4,11],[8,11],[11,10],[6,8],[10,7],[8,4]].find(([cx,cy])=>Math.abs(x-cx)+Math.abs(y-cy)<=2);
 if(!grain)return null;
 return hex(y<grain[1]?'#fff5dc':y>grain[1]?'#aaa798':'#ded9c6');
});}
export const BONE_MEAL_TILE_GENERATORS=Object.freeze({item_bone:bone,item_bone_meal:meal});
