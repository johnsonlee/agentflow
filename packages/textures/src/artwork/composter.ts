import{Tile,hex}from'../atlas/pixels';
/** Original application wood vessel/organic fill art. No native pixels or graphics-match claim. */
const wood=(x:number,y:number)=>hex(['#93663d','#a57647','#795333','#b0804d'][(x*3+Math.floor(y/4))%4]);
export const COMPOSTER_TILE_GENERATORS=Object.freeze({
 composter_side:(t:Tile)=>t.fill((x,y)=>y===3||y===12?hex('#4c3a29'):x%4===3?hex('#61452e'):wood(x,y)),
 composter_inside:(t:Tile)=>t.fill((x,y)=>x%4===3?hex('#483422'):hex(['#775333','#69492e','#825e3d'][(x+y*3)%3])),
 composter_bottom:(t:Tile)=>t.fill((x,y)=>y%4===3?hex('#523b25'):wood(x,y)),
 composter_top:(t:Tile)=>t.fill((x,y)=>x%4===0||y%4===0?hex('#735132'):hex(['#bd8a54','#a77a4a','#c39159'][(x+y)%3])),
 composter_compost:(t:Tile)=>t.fill((x,y)=>hex(['#573d23','#74522d','#426239','#876337','#354e2c'][(x*7+y*3+x*y)%5])),
 composter_ready:(t:Tile)=>t.fill((x,y)=>hex(['#6b4c2c','#8a693d','#bcaa72','#546b39','#d1bf8b'][(x*3+y*7+x*y)%5])),
});
