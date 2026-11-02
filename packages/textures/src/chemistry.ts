import { TILE_SIZE, Tile, hex, shade, type Rgb } from "./pixels";

/**
 * Original chemistry sprites: element and isotope cards (symbol plus atomic or mass number in a
 * tiny pixel font), compound flasks, lab products, and the four chemistry station blocks.
 */

const S = TILE_SIZE;

/** 3x5 pixel glyphs (rows top to bottom, "#" = ink). Lowercase letters use the bottom 4 rows. */
const GLYPHS = new Map<string, readonly string[]>([
  ["0", ["###", "#.#", "#.#", "#.#", "###"]],
  ["1", [".#.", "##.", ".#.", ".#.", "###"]],
  ["2", ["##.", "..#", ".#.", "#..", "###"]],
  ["3", ["##.", "..#", ".#.", "..#", "##."]],
  ["4", ["#.#", "#.#", "###", "..#", "..#"]],
  ["5", ["###", "#..", "##.", "..#", "##."]],
  ["6", [".##", "#..", "###", "#.#", "###"]],
  ["7", ["###", "..#", ".#.", ".#.", ".#."]],
  ["8", ["###", "#.#", "###", "#.#", "###"]],
  ["9", ["###", "#.#", "###", "..#", "##."]],
  ["A", [".#.", "#.#", "###", "#.#", "#.#"]],
  ["B", ["##.", "#.#", "##.", "#.#", "##."]],
  ["C", [".##", "#..", "#..", "#..", ".##"]],
  ["F", ["###", "#..", "##.", "#..", "#.."]],
  ["G", [".##", "#..", "#.#", "#.#", ".##"]],
  ["H", ["#.#", "#.#", "###", "#.#", "#.#"]],
  ["K", ["#.#", "##.", "#..", "##.", "#.#"]],
  ["L", ["#..", "#..", "#..", "#..", "###"]],
  ["M", ["#.#", "###", "###", "#.#", "#.#"]],
  ["N", ["#.#", "###", "###", "###", "#.#"]],
  ["O", [".#.", "#.#", "#.#", "#.#", ".#."]],
  ["P", ["##.", "#.#", "##.", "#..", "#.."]],
  ["S", [".##", "#..", ".#.", "..#", "##."]],
  ["T", ["###", ".#.", ".#.", ".#.", ".#."]],
  ["V", ["#.#", "#.#", "#.#", "#.#", ".#."]],
  ["Z", ["###", "..#", ".#.", "#..", "###"]],
  ["a", ["##.", ".##", "#.#", "###"]],
  ["c", [".##", "#..", "#..", ".##"]],
  ["e", [".#.", "###", "#..", ".##"]],
  ["g", [".##", "#.#", ".##", "##."]],
  ["i", [".#.", "...", ".#.", ".#."]],
  ["l", ["#..", "#..", "#..", ".##"]],
  ["n", ["##.", "#.#", "#.#", "#.#"]],
  ["o", [".#.", "#.#", "#.#", ".#."]],
  ["r", ["#.#", "##.", "#..", "#.."]],
  ["s", [".##", "##.", ".##", "##."]],
  ["u", ["#.#", "#.#", "#.#", ".##"]],
]);

/** Draws `text` with its top-left at (x, y); lowercase glyphs sit one row lower. Returns the width. */
function text(t: Tile, value: string, x: number, y: number, c: Rgb): number {
  let cx = x;
  for (const ch of value) {
    const g = GLYPHS.get(ch);
    if (!g) continue;
    const dy = g.length === 4 ? 1 : 0;
    g.forEach((row, ry) => [...row].forEach((p, rx) => p === "#" && t.set(cx + rx, y + dy + ry, c)));
    cx += 4;
  }
  return cx - x - 1;
}

/** A distinct colour per atomic number (hues spread by the golden angle). */
function hue(z: number, light = 0.5): Rgb {
  const h = (z * 137.508) % 360;
  const s = 0.55;
  const a = s * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * A periodic-table card: translucent coloured face, opaque frame, the number top-left and the
 * symbol below. Isotopes show their mass number and a marker in the top-right corner.
 */
function card(z: number, symbol: string, number: number, isotope: boolean): (t: Tile) => Tile {
  return (t) => {
    t.fill(() => null);
    const face = hue(z, 0.62);
    const frame = shade(hue(z, 0.5), 0.55);
    for (let y = 1; y <= 14; y++) {
      for (let x = 1; x <= 14; x++) {
        const edge = x === 1 || x === 14 || y === 1 || y === 14;
        t.set(x, y, edge ? frame : face, edge ? 255 : 190);
      }
    }
    const ink = hex("#1a1a1a");
    text(t, String(number), 3, 3, isotope ? hex("#7a1010") : ink);
    if (isotope) for (const [x, y] of [[11, 3], [12, 3], [11, 4], [12, 4]]) t.set(x, y, hex("#d8c21a"));
    const w = [...symbol].length * 4 - 1;
    text(t, symbol, Math.floor((S - w) / 2), 8, ink);
    return t;
  };
}

/** Deterministic colour from a name. */
function nameColour(name: string): Rgb {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return hue(h % 997, 0.55);
}

/** A round-bottomed flask: glass outline, coloured liquid, cork. */
function flask(name: string): (t: Tile) => Tile {
  return (t) => {
    t.fill(() => null);
    const glass = hex("#dfe9ef");
    const liquid = nameColour(name);
    const inBulb = (x: number, y: number) => Math.hypot(x - 7.5, y - 10) <= 4.6;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const neck = x >= 6 && x <= 9 && y >= 2 && y <= 6;
        if (!inBulb(x, y) && !neck) continue;
        const edge = neck ? x === 6 || x === 9 : !inBulb(x - 1, y) || !inBulb(x + 1, y) || !inBulb(x, y + 1) || (!inBulb(x, y - 1) && !(x >= 6 && x <= 9));
        if (edge) t.set(x, y, glass);
        else if (y >= 9) t.set(x, y, t.rand() < 0.2 ? shade(liquid, 1.15) : liquid);
        else t.set(x, y, glass, 90);
      }
    }
    for (let x = 6; x <= 9; x++) t.set(x, 1, hex("#9b6a3c"));
    return t;
  };
}

const PRODUCTS = new Map<string, (t: Tile) => Tile>([
  // An orange, glowing cube.
  ["heat_block", (t) => {
    t.fill(() => null);
    for (let y = 4; y <= 12; y++) for (let x = 4; x <= 12; x++) {
      const edge = x === 4 || x === 12 || y === 4 || y === 12;
      t.set(x, y, edge ? hex("#8a3b10") : t.pick(["#ff8a1c", "#ffb347", "#e8641a"].map(hex)));
    }
    return t;
  }],
  // A sack of green-flecked white powder.
  ["super_fertilizer", (t) => {
    t.fill(() => null);
    for (let y = 3; y <= 13; y++) for (let x = 3; x <= 12; x++) {
      if (Math.hypot(x - 7.5, y - 9) > 5.2 && y > 5) continue;
      if (y <= 5 && (x < 6 || x > 9)) continue;
      t.set(x, y, y === 5 ? hex("#6b4a28") : t.rand() < 0.25 ? hex("#4bab3f") : hex("#efeadd"));
    }
    return t;
  }],
  // A pale-blue frosty sphere.
  ["ice_bomb", (t) => {
    t.fill(() => null);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - 7.5, y - 8.5);
      if (r <= 5.2) t.set(x, y, r > 4.4 ? hex("#3d7fb3") : t.pick(["#bfe6ff", "#e8f7ff", "#9fd3f5"].map(hex)));
    }
    t.set(8, 2, hex("#5b5b5b")); t.set(8, 3, hex("#5b5b5b"));
    return t;
  }],
  // A torch with a magnesium-white head.
  ["underwater_torch", (t) => {
    t.fill(() => null);
    for (let y = 6; y <= 14; y++) for (let x = 7; x <= 8; x++) t.set(x, y, hex(x === 7 ? "#4a6fa8" : "#35528a"));
    for (let y = 2; y <= 5; y++) for (let x = 6; x <= 9; x++) t.set(x, y, hex(y === 2 ? "#ffffff" : "#d9f0ff"));
    return t;
  }],
  // A bent green glowing tube.
  ["glow_stick", (t) => {
    t.fill(() => null);
    for (let i = 0; i < 11; i++) for (const d of [0, 1]) t.set(3 + i, 13 - i + d, i === 0 || i === 10 ? hex("#2b2b2b") : hex(d ? "#5cff6a" : "#b4ffb9"));
    return t;
  }],
]);

/** Generator for a chemistry item icon name, or undefined if `name` isn't one. */
export function chemistryItemTile(name: string): ((t: Tile) => Tile) | undefined {
  let m = /^item_element_(\d{1,2})_([A-Z][a-z]?)$/.exec(name);
  if (m) return card(Number(m[1]), m[2], Number(m[1]), false);
  m = /^item_isotope_(\d{1,2})_([A-Z][a-z]?)_(\d{1,3})$/.exec(name);
  if (m) return card(Number(m[1]), m[2], Number(m[3]), true);
  m = /^item_compound_([a-z_]{1,40})$/.exec(name);
  if (m) return flask(m[1]);
  m = /^item_product_([a-z_]{1,40})$/.exec(name);
  if (m) return PRODUCTS.get(m[1]);
  return undefined;
}

/** A chemistry station face: a metal frame around a coloured panel with an emblem. */
function station(panel: string, emblem: (t: Tile, ink: Rgb) => void): (t: Tile) => Tile {
  return (t) => {
    const metal = ["#9aa3ab", "#8a929a", "#aab3bb"].map(hex);
    const p = hex(panel);
    t.fill((x, y) => (x <= 1 || y <= 1 || x >= S - 2 || y >= S - 2 ? t.pick(metal) : t.rand() < 0.15 ? shade(p, 0.9) : p));
    for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) t.set(x, y, hex("#4f555a"));
    emblem(t, hex("#f4f4f4"));
    return t;
  };
}

export const CHEMISTRY_TILE_GENERATORS: Record<string, (t: Tile) => Tile> = {
  // Pale blue, slightly streaked.
  ice: (t) => t.fill((x, y) => ((x * 3 + y * 5) % 11 === 0 ? hex("#e8f6ff") : t.pick(["#9cc8f2", "#8fbdea", "#a9d2f6"].map(hex)))),
  // A glowing orange block with a dark frame.
  heat_block: (t) => t.fill((x, y) => (x === 0 || y === 0 || x === S - 1 || y === S - 1 ? hex("#7a3410") : t.pick(["#ff8a1c", "#ffb347", "#f07020"].map(hex)))),
  // A torch-shaped stick with a magnesium-white flame.
  underwater_torch_block: (t) => {
    t.fill(() => null);
    for (let y = 7; y < S; y++) for (let x = 7; x <= 8; x++) t.set(x, y, hex(x === 7 ? "#4a6fa8" : "#35528a"));
    for (let y = 4; y <= 6; y++) for (let x = 7; x <= 8; x++) t.set(x, y, hex(y === 4 ? "#ffffff" : "#d9f0ff"));
    return t;
  },
  // An upright green glowing tube.
  glow_stick_block: (t) => {
    t.fill(() => null);
    for (let y = 5; y < S; y++) for (let x = 7; x <= 8; x++) t.set(x, y, hex(y === 5 ? "#2b2b2b" : x === 7 ? "#b4ffb9" : "#5cff6a"));
    return t;
  },
  chem_station_top: (t) => {
    const metal = ["#b9c0c6", "#a8b0b6", "#c8ced3"].map(hex);
    t.noise(metal, 1.4);
    for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) t.set(x, y, hex("#5d646a"));
    return t;
  },
  // An atom: a nucleus with two crossing orbits.
  element_constructor_side: station("#2f5e9e", (t, ink) => {
    for (let a = 0; a < 40; a++) {
      const th = (a / 40) * Math.PI * 2;
      t.set(Math.round(7.5 + 5 * Math.cos(th)), Math.round(7.5 + 2 * Math.sin(th)), ink);
      t.set(Math.round(7.5 + 2 * Math.cos(th)), Math.round(7.5 + 5 * Math.sin(th)), ink);
    }
    for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) t.set(x, y, hex("#ff5a4a"));
  }),
  // Two joined molecules.
  compound_creator_side: station("#3f8a3a", (t, ink) => {
    for (const [cx, cy] of [[5, 6], [10, 10]]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) t.set(cx + x, cy + y, ink);
    for (let i = 0; i < 4; i++) t.set(7 + i, 7 + i, hex("#1c1c1c"));
  }),
  // A downward arrow into a hopper.
  material_reducer_side: station("#b4552a", (t, ink) => {
    for (let y = 3; y <= 8; y++) for (let x = 7; x <= 8; x++) t.set(x, y, ink);
    for (let i = 0; i < 4; i++) for (let x = 4 + i; x <= 11 - i; x++) t.set(x, 9 + i, ink);
  }),
  // A beaker.
  lab_table_side: station("#6b6f74", (t, ink) => {
    for (let y = 4; y <= 12; y++) { t.set(4, y, ink); t.set(11, y, ink); }
    for (let x = 4; x <= 11; x++) t.set(x, 12, ink);
    for (let y = 8; y <= 11; y++) for (let x = 5; x <= 10; x++) t.set(x, y, hex("#5ad0ff"));
  }),
};
