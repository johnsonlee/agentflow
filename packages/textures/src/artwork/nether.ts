import {Tile,hex} from "../atlas/pixels";
/** Original application artwork, no sampled or imported native pixels. */
export const netherrackTile=(t:Tile):Tile=>t.fill((x,y)=>hex((x*7+y*11)%17<3?"#3e171d":(x+y*3)%9<3?"#923f42":"#713035"));
export const soulSandTile=(t:Tile):Tile=>t.fill((x,y)=>{const eye=(x%8===2||x%8===5)&&y%8===3,mouth=x%8>=3&&x%8<=4&&y%8===5;return hex(eye||mouth?"#382e29":(x*3+y*7)%11<4?"#8b7560":"#685543");});
export const netherBricksTile=(t:Tile):Tile=>t.fill((x,y)=>hex(y%5===0||(x+(Math.floor(y/5)%2)*4)%8===0?"#21171e":(x+y)%7===0?"#61404e":"#412936"));
export const wartTile=(stage:number)=>(t:Tile):Tile=>{
 t.fill(()=>null);const bulbs=stage===0?[[5,13,2],[10,12,2]]:stage===1?[[4,11,2],[8,8,2],[12,11,2]]:[[3,10,2],[6,5,2],[10,7,3],[13,11,2]];
 for(const [cx,cy,r] of bulbs){for(let y=cy;y<16;y++)t.set(cx,y,hex("#6f2934"));for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++)if((x-cx)**2+(y-cy)**2<=r*r)t.set(x,y,hex(y<cy?"#db685c":x<cx?"#b63f4c":"#852d40"));}return t;
};
const item=(kind:"brick"|"wart"|"rod"|"powder")=>(t:Tile):Tile=>{t.fill(()=>null);for(let y=2;y<14;y++)for(let x=2;x<14;x++){
 const on=kind==="brick"?y>=5&&y<=11&&x>=3&&x<=12:kind==="rod"?Math.abs(x+y-15)<=1:kind==="powder"?y>=6&&Math.abs(x-8)<=Math.floor((y-3)/2):((x-8)**2+(y-8)**2<30&&((x+y)%4!==0));
 if(on)t.set(x,y,hex(kind==="brick"?(y===5?"#98616c":"#57313f"):kind==="wart"?((x+y)%3?"#be3d4b":"#6d2535"):kind==="rod"?(x+y===15?"#ffe99a":"#d88c25"):(x+y)%3?"#ffc957":"#e57b25"));
 }return t;};
export const NETHER_ITEM_GENERATORS={item_nether_brick:item("brick"),item_nether_wart:item("wart"),item_blaze_rod:item("rod"),item_blaze_powder:item("powder")};
