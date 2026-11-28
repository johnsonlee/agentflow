import { Tile, hex } from "../atlas/pixels";

/** Original stone plating and warm metal textures; no native image samples or UV claims. */
export function brewingStandBaseTile(tile: Tile): Tile {
  tile.fill((x,y)=>hex(x===0||y===0||x===15||y===15?"#363c3c":y%5===0?"#515653":(x*7+y*11)%13<4?"#989281":"#777b70"));
  for(const [x,y] of [[3,3],[12,3],[3,12],[12,12]]){tile.set(x,y,hex("#d1bb79"));tile.set(x+1,y,hex("#4d4635"));}
  return tile;
}
export function brewingStandRodTile(tile: Tile): Tile {
  return tile.fill((x,y)=>hex(x===0||x===15?"#4f3a28":x<4?"#8d622e":x<7?"#f1c163":x<10?"#d69b3d":y%5===0?"#785329":"#aa742e"));
}
export const BREWING_STAND_TILE_GENERATORS = Object.freeze({
  brewing_stand_base: brewingStandBaseTile,
  brewing_stand_rod: brewingStandRodTile,
});
