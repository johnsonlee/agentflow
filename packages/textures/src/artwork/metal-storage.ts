import { Tile, hex, type Rgb } from "../atlas/pixels";

/** Original beveled panels, authored in code. No native pixels or exact-render claim. */
function storagePanel(colors: readonly string[]): (tile: Tile) => Tile {
  const [base, light, dark, inset] = colors.map(hex) as Rgb[];
  return tile => tile.fill((x, y) => {
    if (x === 0 || y === 15) return dark;
    if (x === 15 || y === 0) return light;
    if (x === 2 || y === 13) return inset;
    if (x === 13 || y === 2) return light;
    if ((x === 4 || x === 11) && (y === 4 || y === 11)) return dark;
    return tile.rand() < .12 ? inset : base;
  });
}

export const METAL_STORAGE_TILE_GENERATORS = Object.freeze({
  iron_block: storagePanel(["#aeb7bf", "#edf2f4", "#596670", "#929fa9"]),
  gold_block: storagePanel(["#d9ad32", "#fff0a1", "#805d16", "#bb8a24"]),
  diamond_block: storagePanel(["#46c7ca", "#b5fcf5", "#126a80", "#31a3b3"]),
});
