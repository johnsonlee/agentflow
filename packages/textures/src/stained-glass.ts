import { DYE_PIGMENTS } from "./items";
import { TILE_SIZE, Tile, hex, shade } from "./pixels";

/** Original tinted glass. Alpha is an art choice, not a measured Education client property. */
export const STAINED_GLASS_TILE_GENERATORS: Record<string, (t: Tile) => Tile> = {};
for (const [color, pigment] of Object.entries(DYE_PIGMENTS)) {
  const base = hex(pigment);
  STAINED_GLASS_TILE_GENERATORS[`${color}_stained_glass`] = (t) => {
    // The interior blends with geometry behind it; no binary cutout substitutes for translucency.
    t.fill((x, y) => x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1 ? shade(base, 0.8) : base, 76);
    for (let i = 0; i < TILE_SIZE; i++) {
      t.set(i, 0, shade(base, 0.8), 174); t.set(i, TILE_SIZE - 1, shade(base, 0.8), 174);
      t.set(0, i, shade(base, 0.8), 174); t.set(TILE_SIZE - 1, i, shade(base, 0.8), 174);
    }
    for (const [x, y] of [[3, 4], [4, 3], [4, 5], [5, 4], [11, 10], [12, 11]]) t.set(x, y, shade(base, 1.15), 126);
    return t;
  };
}
