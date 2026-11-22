import { Tile, hex, shade, type Rgb } from "../atlas/pixels";

export type BrewingIconKind = "awkward" | "antidote" | "elixir" | "eye_drops" | "tonic";
type Span = readonly [left: number, right: number];
interface BottleProfile {
  readonly rows: readonly (Span | null)[];
  readonly cap: Rgb;
  readonly fluid: Rgb;
  readonly outline: Rgb;
  readonly label: readonly string[];
  readonly labelX: number;
  readonly labelY: number;
}
const rows = (...spans: (Span | null)[]) => spans;
const profiles: Readonly<Record<BrewingIconKind, BottleProfile>> = {
  awkward: {
    rows: rows(null, [6, 9], [6, 9], [6, 9], [6, 9], [6, 9], [5, 10], [4, 11], [3, 12], [3, 12], [3, 12], [3, 12], [3, 12], [4, 11], [5, 10]),
    cap: hex("#8e6548"), fluid: hex("#6b9695"), outline: hex("#344b50"),
    label: ["010", "101", "010", "000"], labelX: 6, labelY: 9,
  },
  antidote: {
    rows: rows(null, [6, 9], [6, 9], [6, 9], [6, 9], [5, 10], [4, 11], [4, 11], [4, 11], [4, 11], [4, 11], [4, 11], [4, 11], [4, 11], [5, 10]),
    cap: hex("#b4c3b4"), fluid: hex("#c29939"), outline: hex("#4e4f38"),
    label: ["010", "101", "111", "101"], labelX: 6, labelY: 8,
  },
  elixir: {
    rows: rows([6, 9], [6, 9], [6, 9], [6, 9], [6, 9], [6, 9], [6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9]),
    cap: hex("#315487"), fluid: hex("#5f7bcb"), outline: hex("#293b63"),
    label: ["111", "100", "110", "111"], labelX: 6, labelY: 9,
  },
  eye_drops: {
    rows: rows([7, 8], [6, 9], [6, 9], [6, 9], [6, 9], [6, 9], [5, 10], [4, 11], [4, 11], [4, 11], [4, 11], [4, 11], [4, 11], [5, 10]),
    cap: hex("#385965"), fluid: hex("#66b9ad"), outline: hex("#315653"),
    label: ["001100", "010010", "101101", "010010"], labelX: 5, labelY: 8,
  },
  tonic: {
    rows: rows(null, [5, 10], [5, 10], [6, 9], [6, 9], [6, 9], [5, 10], [4, 11], [3, 12], [3, 12], [3, 12], [3, 12], [3, 12], [3, 12], [4, 11]),
    cap: hex("#c99b51"), fluid: hex("#b9689a"), outline: hex("#593c58"),
    label: ["111", "010", "010", "010"], labelX: 6, labelY: 9,
  },
};

/** Original application sprites. Bottle silhouettes, labels and palette are authored here;
 * no native raster is imported or sampled, and no Education visual equivalence is asserted. */
export function brewingItemTile(kind: BrewingIconKind): (tile: Tile) => Tile {
  const profile = profiles[kind];
  return tile => {
    tile.fill(() => null);
    const glass = hex("#c7e2df"), label = hex("#f0e4c4"), ink = profile.outline;
    profile.rows.forEach((span, y) => {
      if (!span) return;
      for (let x = span[0]; x <= span[1]; x++) {
        const cap = y <= 2 || kind === "eye_drops" && y <= 3;
        const edge = x === span[0] || x === span[1] || !profile.rows[y + 1];
        if (cap) tile.set(x, y, edge ? shade(profile.cap, .7) : shade(profile.cap, y === 1 ? 1.15 : 1));
        else if (edge) tile.set(x, y, profile.outline);
        else if (y >= 8) tile.set(x, y, shade(profile.fluid, x < 8 ? 1.12 : .85));
        else tile.set(x, y, glass, 205);
      }
    });
    // Two consistent highlights explain glass even at native16px size.
    for (const [x, y] of [[7, 4], [5, 7]]) if (tile.get(x, y)[3]) tile.set(x, y, hex("#e7f6ef"));
    const width = profile.label[0].length;
    for (let y = 0; y < profile.label.length; y++) for (let x = 0; x < width; x++) {
      tile.set(profile.labelX + x, profile.labelY + y, profile.label[y][x] === "1" ? ink : label);
    }
    return tile;
  };
}
export const BREWING_ITEM_GENERATORS = Object.freeze({
  item_awkward_potion: brewingItemTile("awkward"),
  item_antidote: brewingItemTile("antidote"),
  item_elixir: brewingItemTile("elixir"),
  item_eye_drops: brewingItemTile("eye_drops"),
  item_tonic: brewingItemTile("tonic"),
});
