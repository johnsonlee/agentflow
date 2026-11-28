import {Tile,hex}from'../atlas/pixels';
/** Original stylized straw ends and longitudinal straw bound by two red straps.
 * Procedural application art; no native pixels or exact Education graphics claim.
 */
export const HAY_BLOCK_TILE_GENERATORS=Object.freeze({
 hay_block_top:(t:Tile)=>t.fill((x,y)=>hex(['#e0bf51','#c69f32','#edd579','#b58b24'][(Math.floor(x/2)+Math.floor(y/2)*3+x*y%3)%4])),
 hay_block_side:(t:Tile)=>t.fill((x,y)=>{if(y===3||y===4||y===11||y===12)return hex((x+y)%3===0?'#ad3427':'#7e2922');return hex(['#d3ab35','#eed06a','#b79124','#dfbc49'][(x*3+Math.floor(y/3))%4]);}),
});
