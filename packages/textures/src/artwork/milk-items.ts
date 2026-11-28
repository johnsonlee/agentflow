import { Tile, hex } from "../atlas/pixels";

/** Original metal pails, beef cuts and hide, drawn without imported game imagery. */
const pail = (milk: boolean) => (t: Tile): Tile => {
  t.fill(() => null);
  for (let y = 4; y <= 13; y++) for (let x = 3; x <= 12; x++) {
    const left = y < 7 ? 3 : y < 11 ? 4 : 5, right = 15 - left;
    if (x < left || x > right) continue;
    const edge = x === left || x === right || y === 13;
    t.set(x, y, hex(y === 4 ? "#dbe4e7" : edge ? (x < 8 ? "#9aadb6" : "#526874") : milk && y >= 6 ? (y === 6 ? "#ffffff" : "#e8e6d6") : "#354954"));
  }
  for (let x = 5; x <= 10; x++) t.set(x, 1, hex("#bdccd3"));
  for (const x of [4, 11]) { t.set(x, 2, hex("#7c929e")); t.set(x, 3, hex("#b0c4cd")); }
  t.set(4, 5, hex("#f1fbff")); t.set(5, 9, hex("#b9cbd3"));
  return t;
};
const beef = (cooked: boolean) => (t: Tile): Tile => {
  t.fill(() => null);
  const shape = (x: number, y: number) => ((x - 7.5) / 5.4) ** 2 + ((y - 8) / 4.4) ** 2 <= 1 && !(x > 10 && y < 6);
  for (let y = 3; y <= 13; y++) for (let x = 2; x <= 13; x++) {
    if (!shape(x, y)) continue;
    const edge = !shape(x - 1, y) || !shape(x + 1, y) || !shape(x, y - 1) || !shape(x, y + 1);
    t.set(x, y, hex(edge ? (cooked ? "#4c3028" : "#762837") : cooked ? ((x + y) % 3 ? "#945b3e" : "#bd8050") : ((x + y) % 3 ? "#cf5368" : "#ef8390")));
  }
  for (const [x, y] of [[4, 7], [5, 6], [6, 6], [6, 9], [7, 10], [8, 10], [10, 8]]) t.set(x, y, hex(cooked ? "#d6af7f" : "#f9c3b4"));
  return t;
};
export const MILK_ITEM_GENERATORS: Readonly<Record<string, (tile: Tile) => Tile>> = Object.freeze({
  item_bucket: pail(false), item_milk_bucket: pail(true), item_raw_beef: beef(false), item_cooked_beef: beef(true),
  item_leather: (t: Tile): Tile => {
    t.fill(() => null);
    const shape = (x: number, y: number) => y >= 2 && y <= 13 && x >= 3 && x <= 12 &&
      !(y < 5 && x >= 6 && x <= 9) && !(y > 10 && (x < 5 || x > 10)) && !(y === 7 && (x === 3 || x === 12));
    for (let y = 2; y <= 13; y++) for (let x = 3; x <= 12; x++) if (shape(x, y)) {
      const edge = !shape(x - 1, y) || !shape(x + 1, y) || !shape(x, y - 1) || !shape(x, y + 1);
      t.set(x, y, hex(edge ? "#77462b" : (x + y) % 3 ? "#c28b53" : "#e0b375"));
    }
    for (const [x, y] of [[5, 5], [5, 8], [6, 11], [10, 6]]) t.set(x, y, hex("#f0cb90"));
    return t;
  },
});
