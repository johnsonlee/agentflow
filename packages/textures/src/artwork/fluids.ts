import { Tile, hex } from "../atlas/pixels";

/** Original application artwork; no sampled Minecraft pixels. */
export function lavaTile(t: Tile): Tile {
  return t.fill((x,y)=> {
    const seam=(x+Math.floor(y/3)*3)%9===0 || (y+Math.floor(x/5)*2)%11===0;
    return hex(seam ? "#fff09a" : (x*3+y*5)%7<2 ? "#ffb632" : (x+y)%3 ? "#ed6423" : "#b7321d");
  });
}
export function obsidianTile(t: Tile): Tile {
  return t.fill((x,y)=> {
    const seam=(x+Math.floor(y/4)*3)%10===0 || (y+Math.floor(x/6)*2)%11===0;
    return hex(seam ? "#120f24" : (x*5+y*3)%13<3 ? "#615082" : (x+y)%4===0 ? "#44365e" : "#292336");
  });
}
const fluidBucket=(lava:boolean)=>(t:Tile):Tile=>{
  t.fill(()=>null);
  for(let x=5;x<=10;x++)t.set(x,1,hex("#bdccd3"));
  for(const x of [4,11]){t.set(x,2,hex("#7c929e"));t.set(x,3,hex("#b0c4cd"));}
  for(let y=4;y<=13;y++)for(let x=3;x<=12;x++){
    const left=y<7?3:y<11?4:5,right=15-left;if(x<left||x>right)continue;
    const edge=x===left||x===right||y===13;
    t.set(x,y,hex(y===4?"#dbe4e7":edge?(x<8?"#9aadb6":"#526874"):y<6?"#354954":lava?(y===6?"#ffd974":(x+y)%3?"#ed6423":"#ba3f22"):(y===6?"#85e5fa":x<8?"#339fd1":"#2469a6")));
  }
  t.set(4,5,hex("#f1fbff"));return t;
};
export const FLUID_ITEM_GENERATORS = Object.freeze({ item_water_bucket: fluidBucket(false), item_lava_bucket: fluidBucket(true) });
