import { BALLOON_COLORS } from "@craft/engine";
import { Tile, hex, shade } from "./pixels";

/** Original small pixel icons authored here; no native image payload or sampled pixels. */
export const BALLOON_ITEM_GENERATORS: Readonly<Record<string, (tile: Tile) => Tile>> = Object.freeze(
  Object.fromEntries(BALLOON_COLORS.map(({ icon, colorhex }) => [icon, (tile: Tile): Tile => {
    tile.fill(() => null);
    const color = hex(`#${colorhex.toString(16).padStart(6, "0")}`);
    const body = (x: number, y: number) => ((x - 7.5) / 4.5) ** 2 + ((y - 5.5) / 5) ** 2 <= 1;
    for (let y = 1; y <= 10; y++) for (let x = 3; x <= 12; x++) {
      if (!body(x, y)) continue;
      const edge = !body(x - 1, y) || !body(x + 1, y) || !body(x, y - 1) || !body(x, y + 1);
      tile.set(x, y, shade(color, edge ? .55 : x < 7 && y < 5 ? 1.24 : y > 7 ? .82 : 1));
    }
    tile.set(7, 11, shade(color, .7)); tile.set(8, 11, shade(color, .7));
    const rope = hex("#bc9b6c");
    for (const [x, y] of [[8, 12], [8, 13], [7, 14], [7, 15]]) tile.set(x, y, rope);
    tile.set(5, 3, shade(color, 1.55)); tile.set(5, 4, shade(color, 1.55));
    return tile;
  }])),
);
