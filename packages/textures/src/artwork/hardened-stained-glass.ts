import { DYE_PIGMENTS } from "./items";
import { TILE_SIZE, Tile, hex, shade } from "../atlas/pixels";

/** Original reinforced-border art; not copied native pixels or a native appearance claim. */
export const HARDENED_STAINED_GLASS_TILE_GENERATORS: Record<string, (t: Tile) => Tile> = {};
for (const [color, pigment] of Object.entries(DYE_PIGMENTS)) {
  const base = hex(pigment);
  HARDENED_STAINED_GLASS_TILE_GENERATORS[`hardened_${color}_stained_glass`] = (t) => {
    t.fill(() => base, 76);
    for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) {
      const edge = Math.min(x, y, TILE_SIZE - 1 - x, TILE_SIZE - 1 - y);
      if (edge < 2) t.set(x, y, shade(base, edge === 0 ? .55 : 1.2), 210);
    }
    for (const [x, y] of [[3, 4], [4, 3], [11, 12], [12, 11]]) t.set(x, y, shade(base, 1.15), 126);
    return t;
  };
}
