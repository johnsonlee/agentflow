import { Tile, hex } from "../atlas/pixels";

/** Original chipped-stone artwork; no imported native texture or active-pack match is implied. */
export function flintTile(t: Tile): Tile {
  t.fill(() => null);
  const inside = (x: number, y: number) => x >= 2 && x <= 12 && y >= 2 && y <= 13
    && x + y >= 11 && x + y <= 23 && 2 * x - y <= 20 && y - 2 * x <= 8;
  for (let y = 2; y <= 13; y++) for (let x = 2; x <= 12; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    t.set(x, y, hex(edge ? "#26333c" : x + y < 17 ? "#85949c" : x < 7 ? "#536873" : "#3c4b57"));
  }
  for (const [x, y] of [[10, 3], [9, 4], [8, 5], [7, 6], [6, 7], [5, 9], [4, 10]]) t.set(x, y, hex("#bac9ca"));
  t.set(8, 9, hex("#71858d")); t.set(9, 10, hex("#71858d"));
  return t;
}
