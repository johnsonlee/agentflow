import {Tile,hex} from '../atlas/pixels';
/** Original bounded wooden storage artwork; no native pixels. */
const make=(face:string)=>(tile:Tile)=>tile.fill((x,y)=>x===0||x===15||y===0||y===15||y===5?hex('#573819'):face==='side'&&x>=7&&x<=8&&y>=4&&y<=8?hex('#c7c4a6'):(x+y*3)%9===0?hex('#a67436'):hex(face==='top'?'#b28342':'#97612c'));
export const CHEST_TILE_GENERATORS=Object.freeze({chest_top:make('top'),chest_side:make('side'),chest_bottom:make('bottom')});
