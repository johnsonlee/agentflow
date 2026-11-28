import { SPARKLER_COLORS } from "@craft/engine";
import { Tile, hex, shade } from "../atlas/pixels";

/** Original diagonal metal-coated rods and sparks; no sampled or imported game imagery. */
export const SPARKLER_ITEM_GENERATORS: Readonly<Record<string, (tile: Tile) => Tile>> = Object.freeze(
  Object.fromEntries(SPARKLER_COLORS.flatMap(({ iconInactive, iconActive, colorHex }) => {
    const color = hex(colorHex);
    const sprite = (lit: boolean) => (tile: Tile): Tile => {
      tile.fill(() => null);
      for (let x = 3; x <= 12; x++) {
        const y = 15 - x;
        const grip = x < 7;
        tile.set(x, y, grip ? hex("#9c7346") : shade(color, .58));
        tile.set(x + 1, y, grip ? hex("#62452b") : shade(color, .92));
      }
      tile.set(7, 9, hex("#d0d4d8"));
      tile.set(8, 8, hex("#858c93"));
      tile.set(12, 2, shade(color, 1.2));
      if (lit) {
        // A small white core and separated colored sparks remain readable at sixteen pixels.
        tile.set(12, 3, hex("#fff8d9"));
        tile.set(13, 3, hex("#ffffff"));
        tile.set(12, 4, hex("#fff0b0"));
        for (const [x, y] of [[10, 0], [14, 1], [15, 4], [14, 6], [10, 6], [8, 3]])
          tile.set(x, y, shade(color, 1.35));
        tile.set(11, 1, hex("#fff7df"));
        tile.set(15, 2, hex("#fff7df"));
      }
      return tile;
    };
    return [[iconInactive, sprite(false)], [iconActive, sprite(true)]];
  })),
);
