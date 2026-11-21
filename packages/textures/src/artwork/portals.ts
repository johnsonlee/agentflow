import { Tile, hex } from "../atlas/pixels";

/** Original static application surface, not sampled or calibrated native artwork. */
export function portalTile(tile: Tile): Tile {
  const colors = ["#42136d", "#64218d", "#8439b1", "#a85bce", "#713098"].map(hex);
  return tile.fill((x, y) => {
    const ribbon = Math.floor(x + 2.4 * Math.sin(y * .62) + y / 3);
    const band = ((ribbon % 9) + 9) % 9;
    return colors[band < 2 ? 0 : band < 4 ? 1 : band < 6 ? 2 : band === 6 ? 3 : 4];
  }, 210);
}
