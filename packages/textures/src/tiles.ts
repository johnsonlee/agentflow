import { CHEMISTRY_TILE_GENERATORS, chemistryItemTile } from "./chemistry";
import { ITEM_TILE_GENERATORS } from "./items";
import { TILE_SIZE, Tile, hex, shade, type Rgb } from "./pixels";

const S = TILE_SIZE;

const DIRT = ["#866043", "#79553a", "#966c4a", "#6b4a30", "#5c3f29"].map(hex);
const GRASS = ["#5f9f35", "#56932f", "#6aad3d", "#4c8429", "#74b847"].map(hex);
const STONE = ["#7f7f7f", "#757575", "#878787", "#6d6d6d", "#8f8f8f"].map(hex);
const SAND = ["#dbd3a0", "#d3ca94", "#e3dcaf", "#cbc18a"].map(hex);
const SNOW = ["#f4fbfb", "#eaf4f4", "#dfeceE"].map(hex);
const PLANK = hex("#a7834f");

function dirt(t: Tile): Tile {
  return t.noise(DIRT, 1.8);
}

function stone(t: Tile): Tile {
  t.noise(STONE, 1.4);
  // A few darker streaks give the classic layered look.
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(t.rand() * S);
    const x0 = Math.floor(t.rand() * S);
    const len = 2 + Math.floor(t.rand() * 4);
    for (let x = x0; x < x0 + len; x++) t.set(x % S, y, hex("#686868"));
  }
  return t;
}

function grassFringe(t: Tile, palette: readonly Rgb[]): Tile {
  for (let x = 0; x < S; x++) {
    const depth = 3 + (t.rand() < 0.5 ? 1 : 0) + (t.rand() < 0.2 ? 1 : 0);
    for (let y = 0; y < depth; y++) t.set(x, y, t.pick(palette));
  }
  return t;
}

function ore(t: Tile, colors: readonly Rgb[]): Tile {
  stone(t);
  const clusters = 4 + Math.floor(t.rand() * 2);
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + Math.floor(t.rand() * 12);
    const cy = 2 + Math.floor(t.rand() * 12);
    for (let i = 0; i < 4; i++) {
      const x = cx + Math.floor(t.rand() * 3) - 1;
      const y = cy + Math.floor(t.rand() * 3) - 1;
      t.set(x, y, colors[i % colors.length]);
    }
    t.set(cx + 1, cy + 1, shade(colors[0], 0.6));
  }
  return t;
}

function planks(t: Tile, base: Rgb): Tile {
  const light = shade(base, 1.1);
  const dark = shade(base, 0.82);
  const seam = shade(base, 0.6);
  t.fill((x, y) => {
    if (y % 4 === 3) return seam;
    const board = Math.floor(y / 4);
    const split = (board * 7 + 3) % S;
    if (x === split) return seam;
    const r = t.rand();
    return r < 0.15 ? dark : r < 0.3 ? light : base;
  });
  return t;
}

function logSide(t: Tile, base: readonly Rgb[]): Tile {
  const columns = Array.from({ length: S }, () => t.pick(base));
  return t.fill((x) => (t.rand() < 0.12 ? shade(columns[x], 0.85) : columns[x]));
}

function logTop(t: Tile, bark: Rgb, inner: Rgb, ring: Rgb): Tile {
  return t.fill((x, y) => {
    if (x === 0 || y === 0 || x === S - 1 || y === S - 1) return bark;
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return Math.floor(d) % 2 === 0 ? ring : inner;
  });
}

function leaves(t: Tile, palette: readonly Rgb[]): Tile {
  t.noise(palette, 1.2);
  for (let i = 0; i < 40; i++) t.set(Math.floor(t.rand() * S), Math.floor(t.rand() * S), [0, 0, 0], 0);
  return t;
}

function wool(t: Tile, base: Rgb): Tile {
  return t.fill((x, y) => {
    const knit = (x + y * 3) % 4 === 0 ? 0.9 : (x * 2 + y) % 5 === 0 ? 1.06 : 1;
    const jitter = 0.96 + t.rand() * 0.08;
    return shade(base, Math.min(1.15, knit * jitter));
  });
}

/** Draws a plant on a transparent background. */
function plant(t: Tile, head: Rgb, center: Rgb): Tile {
  t.fill(() => null);
  const stem = hex("#3d8a2b");
  for (let y = 7; y < S; y++) t.set(7, y, stem);
  t.set(6, 11, stem); t.set(5, 10, stem); t.set(8, 12, stem); t.set(9, 11, stem);
  const petals: Array<[number, number]> = [[7, 3], [6, 4], [8, 4], [5, 5], [9, 5], [6, 6], [8, 6], [7, 7]];
  for (const [x, y] of petals) t.set(x, y, head);
  t.set(6, 5, head); t.set(8, 5, head);
  t.set(7, 5, center); t.set(7, 4, shade(head, 0.85)); t.set(7, 6, shade(head, 0.85));
  return t;
}

function framed(t: Tile, bg: Rgb, frame: Rgb, mark: Array<[number, number]>, markColor: Rgb): Tile {
  t.fill((x, y) => {
    if (x === 0 || y === 0 || x === S - 1 || y === S - 1) return frame;
    if (x === 1 || y === 1 || x === S - 2 || y === S - 2) return shade(bg, 0.8);
    return t.rand() < 0.1 ? shade(bg, 0.92) : bg;
  });
  for (const [x, y] of mark) {
    t.set(x, y, markColor);
    t.set(x + 1, y, markColor);
  }
  return t;
}

const CHECK: Array<[number, number]> = [[3, 8], [4, 9], [5, 10], [6, 11], [7, 10], [8, 9], [9, 8], [10, 7], [11, 6], [12, 5]];
const CROSS: Array<[number, number]> = [3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap((i) => [[i, i + 1], [i, 13 - i]] as Array<[number, number]>);

export const TILE_GENERATORS: Record<string, (t: Tile) => Tile> = {
  dirt,
  grass_top: (t) => t.noise(GRASS, 1.3),
  grass_side: (t) => grassFringe(dirt(t), GRASS),
  stone,
  cobblestone: (t) => {
    // Voronoi-style rounded stones with dark mortar.
    const centers = Array.from({ length: 9 }, () => [t.rand() * S, t.rand() * S, t.pick(STONE)] as const);
    return t.fill((x, y) => {
      let best = Infinity;
      let second = Infinity;
      let color: Rgb = STONE[0];
      for (const [cx, cy, c] of centers) {
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const d = Math.hypot(x + 0.5 - cx - ox, y + 0.5 - cy - oy);
          if (d < best) { second = best; best = d; color = c; } else if (d < second) second = d;
        }
      }
      if (second - best < 1.1) return hex("#4f4f4f");
      return best < 1.5 && t.rand() < 0.5 ? shade(color, 1.12) : color;
    });
  },
  oak_planks: (t) => planks(t, PLANK),
  oak_log: (t) => logSide(t, ["#6b5131", "#5a4326", "#7a5e3a", "#634a2c"].map(hex)),
  oak_log_top: (t) => logTop(t, hex("#5f4729"), hex("#b8945b"), hex("#a07c48")),
  oak_leaves: (t) => leaves(t, ["#3f8a24", "#357a1d", "#4c9b2d", "#2e6b19"].map(hex)),
  birch_log: (t) => {
    t.fill(() => t.pick(["#dcd9cf", "#d1cdc1", "#e6e3da"].map(hex)));
    for (let i = 0; i < 7; i++) {
      const y = Math.floor(t.rand() * S);
      const x0 = Math.floor(t.rand() * S);
      const len = 2 + Math.floor(t.rand() * 4);
      for (let x = x0; x < x0 + len; x++) t.set(x % S, y, hex("#33302b"));
    }
    return t;
  },
  birch_log_top: (t) => logTop(t, hex("#dcd9cf"), hex("#d3bf86"), hex("#bba56d")),
  birch_leaves: (t) => leaves(t, ["#6b9e40", "#5f9137", "#78ab4a", "#55842f"].map(hex)),
  sand: (t) => t.noise(SAND, 1.5),
  gravel: (t) => t.noise(["#857f7c", "#6f6966", "#99928e", "#5d5856", "#8a7d73"].map(hex), 1),
  water: (t) => {
    const base = hex("#3a6fd8");
    t.fill((x, y) => ((x + y * 2) % 7 === 0 || (x * 3 + y) % 11 === 0 ? hex("#5d8ef0") : base), 175);
    return t;
  },
  glass: (t) => {
    const frame = hex("#d6eef2");
    t.fill((x, y) => (x === 0 || y === 0 || x === S - 1 || y === S - 1 ? frame : null));
    for (const [x, y] of [[3, 4], [4, 3], [4, 5], [5, 4], [11, 10], [12, 11]] as Array<[number, number]>) t.set(x, y, [255, 255, 255]);
    return t;
  },
  bricks: (t) => {
    const mortar = hex("#b5a99c");
    const bricks = ["#97543f", "#8a4a37", "#a35e47"].map(hex);
    return t.fill((x, y) => {
      if (y % 4 === 3) return mortar;
      const row = Math.floor(y / 4);
      if ((x + (row % 2) * 4) % 8 === 7) return mortar;
      return t.rand() < 0.2 ? t.pick(bricks) : bricks[row % bricks.length];
    });
  },
  bedrock: (t) => t.noise(["#565656", "#353535", "#7a7a7a", "#1f1f1f", "#9a9a9a"].map(hex), 1),
  coal_ore: (t) => ore(t, ["#2b2b2b", "#3c3c3c", "#1b1b1b"].map(hex)),
  iron_ore: (t) => ore(t, ["#d8af93", "#c49478", "#e5c6ad"].map(hex)),
  gold_ore: (t) => ore(t, ["#fcee4b", "#e5c620", "#fff79a"].map(hex)),
  diamond_ore: (t) => ore(t, ["#5decf5", "#2ccdd8", "#a1fbff"].map(hex)),
  snow: (t) => t.noise(SNOW, 2),
  grass_snow_side: (t) => grassFringe(dirt(t), SNOW),
  white_wool: (t) => wool(t, hex("#e9ecec")),
  red_wool: (t) => wool(t, hex("#a12722")),
  orange_wool: (t) => wool(t, hex("#f07613")),
  yellow_wool: (t) => wool(t, hex("#f8c527")),
  lime_wool: (t) => wool(t, hex("#70b919")),
  blue_wool: (t) => wool(t, hex("#35399d")),
  purple_wool: (t) => wool(t, hex("#7a2aac")),
  black_wool: (t) => wool(t, hex("#1e1b1b")),
  glowstone: (t) => t.noise(["#f9d49c", "#c98f45", "#fff1c4", "#8f6328", "#ffd060"].map(hex), 1),
  bookshelf: (t) => {
    planks(t, PLANK);
    const spines = ["#a12722", "#35399d", "#3d8a2b", "#c9a43a", "#6b3b1e", "#7a2aac"].map(hex);
    for (const top of [1, 9]) {
      for (let x = 1; x < S - 1; x++) {
        const c = spines[(x * 7 + top) % spines.length];
        const h = 5 + ((x * 3 + top) % 2);
        for (let y = top + 6 - h; y < top + 6; y++) t.set(x, y, y === top + 6 - h ? shade(c, 1.2) : c);
      }
    }
    return t;
  },
  crafting_table_top: (t) => {
    planks(t, hex("#a7834f"));
    const dark = hex("#5d4426");
    for (let i = 0; i < S; i++) { t.set(i, 0, dark); t.set(i, S - 1, dark); t.set(0, i, dark); t.set(S - 1, i, dark); }
    for (let i = 2; i < S - 2; i++) { t.set(i, 5, dark); t.set(i, 10, dark); t.set(5, i, dark); t.set(10, i, dark); }
    return t;
  },
  crafting_table_side: (t) => {
    planks(t, hex("#9c7a48"));
    const metal = hex("#9a9a9a");
    const handle = hex("#5d4426");
    for (let y = 0; y < 3; y++) for (let x = 0; x < S; x++) t.set(x, y, hex("#7b5c36"));
    for (let i = 4; i < 12; i++) t.set(3, i, handle);
    for (let x = 2; x < 6; x++) t.set(x, 4, metal);
    for (let i = 5; i < 13; i++) t.set(i, 13 - (i - 5), metal);
    t.set(11, 12, handle); t.set(12, 13, handle);
    return t;
  },
  dandelion: (t) => plant(t, hex("#f4e04d"), hex("#e0a81b")),
  poppy: (t) => plant(t, hex("#d1281f"), hex("#2b2b2b")),
  tall_grass: (t) => {
    t.fill(() => null);
    for (let blade = 0; blade < 7; blade++) {
      const x0 = 1 + Math.floor(t.rand() * 14);
      const h = 6 + Math.floor(t.rand() * 9);
      const lean = t.rand() < 0.5 ? -1 : 1;
      for (let i = 0; i < h; i++) {
        const x = x0 + (i > h / 2 ? lean : 0);
        t.set(x, S - 1 - i, t.pick(GRASS));
      }
    }
    return t;
  },
  torch: (t) => {
    // A stick with a glowing head, centred on a transparent tile (drawn crosswise like plants).
    t.fill(() => null);
    for (let y = 7; y < S; y++) for (let x = 7; x <= 8; x++) t.set(x, y, hex(x === 7 ? "#8a6236" : "#6b4a28"));
    for (let y = 4; y <= 6; y++) for (let x = 7; x <= 8; x++) t.set(x, y, hex(y === 4 ? "#fff6c2" : y === 5 ? "#ffd23f" : "#ff9d1c"));
    t.set(7, 3, hex("#ffe98a"));
    return t;
  },
  furnace_top: (t) => {
    // Smooth dressed stone with a darker border.
    t.noise(STONE, 2.2);
    for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) t.set(x, y, hex("#5d5d5d"));
    return t;
  },
  furnace_front: (t) => {
    t.copyFrom(TILE_GENERATORS.cobblestone(new Tile("furnace_front_stone")));
    // Dark firebox opening with a grate across the top.
    for (let y = 8; y <= 13; y++) for (let x = 4; x <= 11; x++) t.set(x, y, y === 8 ? hex("#3a3a3a") : hex(y > 11 ? "#2a1a10" : "#141414"));
    for (let x = 4; x <= 11; x += 2) t.set(x, 9, hex("#4a4a4a"));
    for (let x = 5; x <= 10; x++) if (t.rand() < 0.5) t.set(x, 13, hex("#7a3b12"));
    return t;
  },
  allow: (t) => framed(t, hex("#4bab3f"), hex("#1f5e1a"), CHECK, hex("#ffffff")),
  deny: (t) => framed(t, hex("#c73a2e"), hex("#5e1612"), CROSS, hex("#ffffff")),
  ...CHEMISTRY_TILE_GENERATORS,
  border: (t) => {
    const red = hex("#a3241c");
    const black = hex("#1c1c1c");
    return t.fill((x, y) => {
      if (x === 0 || y === 0 || x === S - 1 || y === S - 1) return hex("#555555");
      return Math.floor((x + y) / 3) % 2 === 0 ? red : black;
    });
  },
};

/** True if `name` has an item sprite (fixed sprites, or a chemistry element/isotope/compound/product). */
export function hasItemTile(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ITEM_TILE_GENERATORS, name) || chemistryItemTile(name) !== undefined;
}

export const TILE_NAMES: readonly string[] = Object.keys(TILE_GENERATORS);

/** Generates the RGBA pixels of a named 16x16 tile. Unknown names produce a magenta/black "missing texture". */
export function generateTile(name: string): Uint8ClampedArray<ArrayBuffer> {
  const t = new Tile(name);
  const has = (o: object) => Object.prototype.hasOwnProperty.call(o, name);
  const gen = has(TILE_GENERATORS) ? TILE_GENERATORS[name] : has(ITEM_TILE_GENERATORS) ? ITEM_TILE_GENERATORS[name] : chemistryItemTile(name);
  if (gen) return gen(t).data;
  return t.fill((x, y) => ((x < 8) !== (y < 8) ? [248, 0, 248] : [0, 0, 0])).data;
}
