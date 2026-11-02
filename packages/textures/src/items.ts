import { TILE_SIZE, Tile, hex, shade, type Rgb } from "./pixels";

/**
 * Original 16x16 item sprites (transparent background), drawn diagonally like classic
 * Minecraft tool icons: handle from the bottom-left, head at the top-right.
 */

const S = TILE_SIZE;
const HANDLE = ["#7a5430", "#8f6539", "#664424"].map(hex);
const HEADS: Record<string, Rgb[]> = {
  wooden: ["#b08a52", "#9b7643", "#c39d63"].map(hex),
  stone: ["#8e8e8e", "#7b7b7b", "#a2a2a2"].map(hex),
  iron: ["#dcdcdc", "#c2c2c2", "#f0f0f0"].map(hex),
};

type Mask = (x: number, y: number) => boolean;

/** Paints the cells in `mask` from `palette`, darkening edge cells so the sprite reads on any background. */
function paint(t: Tile, mask: Mask, palette: readonly Rgb[]): void {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!mask(x, y)) continue;
      const edge = !mask(x - 1, y) || !mask(x + 1, y) || !mask(x, y - 1) || !mask(x, y + 1);
      t.set(x, y, edge ? shade(palette[0], 0.55) : t.pick(palette));
    }
  }
}

/** Two-pixel-wide diagonal handle from (x0, y0) up-right to (x1, y1). */
function handle(x0: number, y0: number, x1: number): Mask {
  return (x, y) => x >= x0 && x <= x1 && (x + y === x0 + y0 || x + y === x0 + y0 + 1);
}

const HEAD_MASKS: Record<string, Mask> = {
  // Crescent centred on the handle's end.
  pickaxe: (x, y) => {
    const r = Math.hypot(x - 2, y - 13);
    return r >= 9.2 && r <= 12.2 && x >= 3 && y <= 12;
  },
  // Blade on one side of the handle's top.
  axe: (x, y) => x >= 7 && x <= 13 && y >= 1 && y <= 7 && x + y >= 11 && x - y >= 2 && x + y <= 18,
  // Rounded spade.
  shovel: (x, y) => Math.abs(x - 11) + Math.abs(y - 4) <= 3,
  // Long blade along the diagonal, with a cross guard.
  sword: (x, y) => (x >= 6 && x <= 14 && Math.abs(x + y - 15) <= 1) || (x - y >= -3 && x - y <= -2 && Math.abs(x + y - 14) <= 3),
};

function stick(t: Tile): Tile {
  t.fill(() => null);
  paint(t, handle(3, 12, 12), HANDLE);
  return t;
}

function toolTile(material: string, kind: string): (t: Tile) => Tile {
  return (t) => {
    t.fill(() => null);
    paint(t, kind === "sword" ? handle(1, 13, 4) : handle(2, 12, kind === "shovel" ? 9 : 10), HANDLE);
    paint(t, HEAD_MASKS[kind], HEADS[material]);
    return t;
  };
}

/** A lump: an irregular blob filled from `palette` (coal, diamond, meat). */
function lump(palette: readonly Rgb[], shape: Mask): (t: Tile) => Tile {
  return (t) => {
    t.fill(() => null);
    paint(t, shape, palette);
    return t;
  };
}

const ROUND: Mask = (x, y) => Math.hypot(x - 7.5, y - 8) <= 5.6 && !(x + y <= 6);
const GEM: Mask = (x, y) => Math.abs(x - 7.5) + Math.abs(y - 7.5) <= 6.5 && y >= 3 && y <= 12;
/** An ingot seen from above at an angle: a long trapezoid. */
const INGOT: Mask = (x, y) => y >= 6 && y <= 10 && x >= 2 + (10 - y) * 0.5 && x <= 13 - (10 - y) * 0.5;
/** A cut of meat with a bone end. */
const CHOP: Mask = (x, y) => Math.hypot((x - 7) / 1.25, y - 8) <= 4.6 || (x >= 11 && x <= 14 && y >= 7 && y <= 9);
const DRUMSTICK: Mask = (x, y) => Math.hypot(x - 6, y - 6) <= 4.3 || (Math.abs(x - y) <= 1 && x >= 8 && x <= 13);

export const ITEM_TILE_GENERATORS: Record<string, (t: Tile) => Tile> = {
  item_stick: stick,
  item_coal: lump(["#2b2b2b", "#1c1c1c", "#3c3c3c"].map(hex), ROUND),
  item_charcoal: lump(["#3b3026", "#2c241c", "#4a3c2f"].map(hex), ROUND),
  item_diamond: lump(["#6fe0d6", "#4cc6bb", "#a8f2ec"].map(hex), GEM),
  item_iron_ingot: lump(["#d8d8d8", "#bdbdbd", "#efefef"].map(hex), INGOT),
  item_gold_ingot: lump(["#f2c94c", "#d9aa2a", "#fbe38e"].map(hex), INGOT),
  item_raw_porkchop: lump(["#e88f8f", "#d57272", "#f4b0a8"].map(hex), CHOP),
  item_cooked_porkchop: lump(["#a8683a", "#8c522a", "#c4874f"].map(hex), CHOP),
  item_raw_chicken: lump(["#f2c7b8", "#e2ab98", "#f8dccf"].map(hex), DRUMSTICK),
  item_cooked_chicken: lump(["#c8894a", "#a86c33", "#dca36a"].map(hex), DRUMSTICK),
};
for (const material of ["wooden", "stone", "iron"]) {
  for (const kind of ["pickaxe", "axe", "shovel", "sword"]) {
    ITEM_TILE_GENERATORS[`item_${material}_${kind}`] = toolTile(material, kind);
  }
}
