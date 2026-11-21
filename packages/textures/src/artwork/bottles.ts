import { Tile, hex } from "../atlas/pixels";

/** Original glass outlines and water fill, drawn here without sampled game imagery. */
const bottle = (water: boolean) => (tile: Tile): Tile => {
  tile.fill(() => null);
  const body = (x: number, y: number) =>
    (y >= 1 && y <= 2 && x >= 6 && x <= 9) ||
    (y >= 3 && y <= 5 && x >= 7 && x <= 8) ||
    (y === 6 && x >= 5 && x <= 10) ||
    (y >= 7 && y <= 12 && x >= 4 && x <= 11) ||
    (y === 13 && x >= 5 && x <= 10);
  for (let y = 1; y <= 13; y++) for (let x = 4; x <= 11; x++) {
    if (!body(x, y)) continue;
    const edge = !body(x - 1, y) || !body(x + 1, y) || !body(x, y - 1) || !body(x, y + 1);
    if (edge) tile.set(x, y, hex(x <= 6 ? "#bbdfe4" : "#658d9a"));
    else if (water && y >= 8) tile.set(x, y, hex(y === 8 ? "#69d7ef" : x < 8 ? "#3ba9d1" : "#237ba8"));
    else tile.set(x, y, hex("#c5e7ea"), 48);
  }
  tile.set(6, 1, hex("#efffff"));
  tile.set(7, 1, hex("#efffff"));
  tile.set(5, 8, hex("#ecffff"));
  tile.set(5, 9, hex("#ecffff"));
  return tile;
};
export const BOTTLE_ITEM_GENERATORS: Readonly<Record<string, (tile: Tile) => Tile>> = Object.freeze({
  item_glass_bottle: bottle(false),
  item_water_bottle: bottle(true),
});
