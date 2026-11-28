import { Tile, hex } from "../atlas/pixels";

/** Original pale boards, not copied native pixels or a native-render equivalence claim. */
export function birchPlanksTile(tile: Tile): Tile {
  const base = hex("#d8c995"), light = hex("#e7d9a9"), grain = hex("#c4b47e"), seam = hex("#a49461");
  return tile.fill((x, y) => {
    if (y % 4 === 3 || x === (Math.floor(y / 4) * 5 + 2) % 16) return seam;
    if ((x + y * 3) % 11 === 0) return grain;
    return tile.rand() < .18 ? light : base;
  });
}
export const BIRCH_PLANK_TILE_GENERATORS = Object.freeze({ birch_planks: birchPlanksTile });
