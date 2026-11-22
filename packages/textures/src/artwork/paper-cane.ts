import {Tile,hex}from '../atlas/pixels';
/** Original static reeds and ingredients; not native pixels or native growth/geometry evidence. */
const cane=(tile:Tile)=>tile.fill((x,y)=>[3,4,7,8,11,12].includes(x)?hex(y%5===0?'#41772c':x%4===0?'#b2c766':'#75a54b'):((y===4&&x>=1&&x<=5)||(y===9&&x>=9&&x<=14))?hex('#619442'):null);
const ingredient=(tile:Tile)=>tile.fill((x,y)=>y>=2&&y<=14&&[5,6,9,10].includes(x)?hex(y%4===1?'#4d762b':'#8caf50'):y>=4&&y<=7&&x>=2&&x<=12&&x+y===11?hex('#619442'):null);
const paper=(tile:Tile)=>tile.fill((x,y)=>x>=3&&x<=12&&y>=2&&y<=13?(x===12||y===13?hex('#aaa990'):(x+y)%9===0?hex('#dedfca'):hex('#f1efdc')):null);
export const PAPER_CANE_TILE_GENERATORS=Object.freeze({sugar_cane_plant:cane,item_sugar_cane:ingredient,item_paper:paper});
