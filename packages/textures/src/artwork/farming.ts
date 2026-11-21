import { Tile, hex, shade } from "../atlas/pixels";

/** Original procedural farming art; no Minecraft texture data is copied. */
const DRY = ["#97704e", "#866043", "#a17a55"].map(hex);
const WET = ["#60412b", "#543622", "#6f4c30"].map(hex);
function farmland(t: Tile, wet: boolean): Tile {
  const colors = wet ? WET : DRY;
  return t.fill((x, y) => y % 4 === 0 ? shade(colors[0], 0.65)
    : y % 4 === 1 ? shade(colors[0], 1.12) : colors[Math.floor(t.rand() * colors.length)]);
}
function wheat(t: Tile, age: number): Tile {
  t.fill(() => null);
  const height = 3 + Math.floor(age * 1.55);
  const stem = hex(age >= 6 ? "#af8a30" : "#548c32");
  const leaf = hex(age >= 6 ? "#dfbf58" : age >= 3 ? "#80ac42" : "#6d9d39");
  for (const x of [2, 6, 10, 13]) {
    const top = 15 - height + (x % 3);
    for (let y = 15; y >= top; y--) {
      t.set(x, y, stem);
      if (y > top + 1 && y % 3 === 1) {
        t.set(x - 1, y - 1, leaf);
        t.set(x + 1, y - 2, leaf);
      }
      if (age >= 4 && y <= top + Math.min(4, age - 2)) {
        t.set(x - 1, y, leaf);
        t.set(x + 1, y, leaf);
      }
    }
  }
  return t;
}
export const FARMING_TILE_GENERATORS: Record<string, (t: Tile) => Tile> = {
  farmland_dry: (t) => farmland(t, false),
  farmland_wet: (t) => farmland(t, true),
};
for (let age = 0; age <= 7; age++) FARMING_TILE_GENERATORS[`wheat_stage_${age}`] = (t) => wheat(t, age);

export const FARMING_ITEM_GENERATORS: Record<string, (t: Tile) => Tile> = {
  item_wheat_seeds: (t) => {
    t.fill(() => null);
    for (const [x, y] of [[4, 5], [9, 3], [11, 9], [5, 11], [7, 7]]) {
      t.set(x, y, hex("#a1b65b"));
      t.set(x + 1, y, hex("#66823b"));
      t.set(x, y + 1, hex("#3e5b25"));
    }
    return t;
  },
  item_wheat: (t) => {
    wheat(t, 7);
    for (let x = 4; x <= 11; x++) t.set(x, 11, hex("#8d5730"));
    return t;
  },
  item_bread: (t) => {
    t.fill(() => null);
    for (let y = 5; y <= 12; y++) for (let x = 2; x <= 13; x++) {
      if ((x === 2 || x === 13) && (y === 5 || y === 12)) continue;
      const crust = y === 12 || x === 2 || x === 13;
      t.set(x, y, hex(crust ? "#965b29" : y < 8 ? "#e1b15b" : "#c18a3e"));
      if (y >= 6 && y <= 8 && (x === 5 || x === 9)) t.set(x, y, hex("#f1ce86"));
    }
    return t;
  },
};
