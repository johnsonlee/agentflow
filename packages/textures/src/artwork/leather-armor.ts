import { Tile, hex } from "../atlas/pixels";

type Mask = (x: number, y: number) => boolean;

/** Original stitched silhouettes, not native pixels, dye state or worn armor geometry. */
function leather(mask: Mask): (tile: Tile) => Tile {
  return tile => tile.fill((x, y) => {
    if (!mask(x, y)) return null;
    const edge = !mask(x - 1, y) || !mask(x + 1, y) || !mask(x, y - 1) || !mask(x, y + 1);
    if (edge) return hex("#51351f");
    if ((y === 5 || y === 11) && x % 3 === 0) return hex("#d0a879");
    return hex((x + y) % 5 === 0 ? "#ab794b" : "#8b5c36");
  });
}

export const LEATHER_ARMOR_TILE_GENERATORS = Object.freeze({
  item_leather_helmet: leather((x, y) => x >= 3 && x <= 12 && y >= 3 && y <= 12 &&
    (y <= 6 || x <= 5 || x >= 10) && !(y === 3 && (x === 3 || x === 12))),
  item_leather_chestplate: leather((x, y) => y >= 2 && y <= 13 &&
    (y <= 6 ? x >= 1 && x <= 14 && !(x >= 6 && x <= 9 && y <= 4) : x >= 4 && x <= 11)),
  item_leather_leggings: leather((x, y) => x >= 3 && x <= 12 && y >= 2 && y <= 13 &&
    (y <= 5 || x <= 6 || x >= 9)),
  item_leather_boots: leather((x, y) => y >= 5 && y <= 13 &&
    ((x >= 3 && x <= 6) || (x >= 9 && x <= 12) || (y >= 11 && (x === 2 || x === 13)))),
});
