import { Tile, hex } from "../atlas/pixels";

/** Original faceted metal fragments with transparent margins; no native pixels or render claim. */
function nugget(base: string, light: string, dark: string) {
  return (tile: Tile): Tile => tile.fill((x, y) => {
    const dx = x - 7.5, dy = y - 8;
    if (Math.abs(dx) * .9 + Math.abs(dy) > 5.8 || y < 4 || y > 12) return null;
    if (y === 4 || x + y < 12) return hex(light);
    if (y === 12 || x - y > 1) return hex(dark);
    return hex((x + y) % 7 === 0 ? light : base);
  });
}
export const METAL_NUGGET_TILE_GENERATORS = Object.freeze({
  item_iron_nugget: nugget("#b3bfc5", "#f2f6ef", "#697c89"),
  item_gold_nugget: nugget("#deb83f", "#fff3a4", "#957023"),
});
