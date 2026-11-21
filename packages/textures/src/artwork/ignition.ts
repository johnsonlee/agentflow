import { Tile, hex } from "../atlas/pixels";

/** Original static flame artwork; native animation and Education pixel equivalence are not implied. */
export function fireTile(t: Tile): Tile {
  t.fill(() => null);
  const tips = [12, 9, 5, 3, 7, 9, 6, 1, 4, 7, 4, 8, 11, 13];
  for (let x = 1; x <= 14; x++) for (let y = tips[x - 1]; y < 16; y++) {
    const inward = Math.min(x - 1, 14 - x), rise = y - tips[x - 1];
    t.set(x, y, hex(rise < 2 || inward === 0 ? "#d44719" : y > 11 && inward > 2 ? "#fff1aa" : rise > 4 ? "#ffd15b" : "#f48d2b"));
  }
  // Separate tongues leave transparent gaps when rendered on crossed planes.
  for (const [x, y] of [[4, 5], [4, 6], [10, 6], [10, 7], [11, 8]]) t.set(x, y, [0, 0, 0], 0);
  return t;
}

/** Original steel striker and chipped Flint, distinct from the standalone Flint icon. */
export function flintAndSteelTile(t: Tile): Tile {
  t.fill(() => null);
  for (let y = 2; y <= 11; y++) for (let x = 5; x <= 13; x++) {
    const outer = x === 5 || x === 6 || y === 2 || y === 3 || (y >= 9 && x <= 10);
    if (outer) t.set(x, y, hex(x === 5 || y === 11 ? "#3c4e59" : y === 2 || x === 6 ? "#e6f0ed" : "#9aaeb4"));
  }
  for (let y = 7; y <= 14; y++) for (let x = 1; x <= 8; x++) {
    if (x + y < 10 || x + y > 20 || y - x > 12) continue;
    t.set(x, y, hex(x < 3 || y === 14 ? "#26333c" : x + y < 15 ? "#8a9a9f" : "#526671"));
  }
  t.set(7, 5, hex("#ffe29b")); t.set(8, 6, hex("#f3a94d"));
  return t;
}
