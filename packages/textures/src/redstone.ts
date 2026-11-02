import { TILE_SIZE, Tile, hex, shade, type Rgb } from "./pixels";

/**
 * Original redstone sprites: ore, dust at 16 power levels (brighter red with more power), lever,
 * button, pressure plate, redstone torch, lamp, repeater tops and doors. On top faces, tile
 * columns run along +x and rows along +z, so a repeater's arrow is drawn in world directions.
 */

const S = TILE_SIZE;
const STONE = ["#7f7f7f", "#757575", "#878787", "#6d6d6d", "#8f8f8f"].map(hex);
/** Horizontal facings as in the engine: 0 +z, 1 -x, 2 -z, 3 +x. */
const FACINGS: readonly (readonly [number, number])[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** Dust red for a power level: dark when unpowered, bright at 15. */
export function dustColour(level: number): Rgb {
  const t = Math.max(0, Math.min(15, level)) / 15;
  return [Math.round(90 + 165 * t), Math.round(8 + 40 * t), Math.round(4 + 20 * t)];
}

function dust(level: number): (t: Tile) => Tile {
  return (t) => {
    t.fill(() => null);
    const c = dustColour(level);
    // A cross of dust with scattered specks: it joins neighbours on every side.
    for (let i = 0; i < S; i++) {
      for (const w of [7, 8]) {
        t.set(i, w, t.rand() < 0.25 ? shade(c, 0.8) : c);
        t.set(w, i, t.rand() < 0.25 ? shade(c, 0.8) : c);
      }
    }
    for (let i = 0; i < 10; i++) t.set(2 + Math.floor(t.rand() * 12), 2 + Math.floor(t.rand() * 12), shade(c, 0.9));
    return t;
  };
}

/** A stick with a coloured tip on a cobblestone base (lever) or a red head (torch). */
function stickSprite(head: string, tilt: number, base: boolean): (t: Tile) => Tile {
  return (t) => {
    t.fill(() => null);
    for (let i = 0; i < 9; i++) {
      const x = 7 + Math.round((tilt * i) / 4);
      t.set(x, 14 - i, hex("#7a5430"));
      t.set(x + 1, 14 - i, hex("#664424"));
    }
    const tipX = 7 + Math.round((tilt * 9) / 4);
    for (let y = 3; y <= 5; y++) for (let x = tipX; x <= tipX + 1; x++) t.set(x, y, hex(head));
    if (base) for (let y = 13; y <= 15; y++) for (let x = 4; x <= 11; x++) t.set(x, y, t.pick(STONE));
    return t;
  };
}

function stone(t: Tile, border: string): Tile {
  t.fill(() => t.pick(STONE));
  for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) t.set(x, y, hex(border));
  return t;
}

/** A repeater top: a stone slab with an arrow towards the output, a fixed front torch and a back torch whose position shows the delay. */
function repeater(facing: number, delay: number, on: boolean): (t: Tile) => Tile {
  return (t) => {
    stone(t, "#5b5b5b");
    const [dx, dz] = FACINGS[facing];
    const at = (along: number, across: number): [number, number] => [
      Math.round(7.5 + dx * along - dz * across),
      Math.round(7.5 + dz * along + dx * across),
    ];
    const line = on ? hex("#ff3a24") : hex("#5a1410");
    for (let a = -6; a <= 6; a++) t.set(...at(a, 0), line);
    // Arrow head at the output end.
    for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) t.set(...at(6 - k, s * k), line);
    const torch = on ? hex("#ffd0a0") : hex("#7a2a20");
    for (const [a, b] of [[3, 0], [3, 1], [4, 0], [4, 1]]) t.set(...at(a, b - 0.5), torch);
    // Back torch: further back for longer delays (delay 1..4 -> 1..-5 along the arrow).
    const back = 1 - (delay - 1) * 2;
    for (const [a, b] of [[back, 0], [back, 1], [back - 1, 0], [back - 1, 1]]) t.set(...at(a, b - 0.5), torch);
    return t;
  };
}

function door(base: string, dark: string, upper: boolean, iron: boolean): (t: Tile) => Tile {
  return (t) => {
    t.fill((x, y) => (x === 0 || x === S - 1 || y === (upper ? 0 : S - 1) ? hex(dark) : t.rand() < 0.2 ? shade(hex(base), 0.9) : hex(base)));
    if (upper) {
      // Two window panes.
      for (let y = 3; y <= 8; y++) for (const x0 of [3, 9]) for (let x = x0; x < x0 + 4; x++) t.set(x, y, iron ? hex("#c9d0d6") : hex("#a8c8e8"));
    } else {
      for (let y = 2; y <= 13; y += 4) for (let x = 2; x <= 13; x++) t.set(x, y, hex(dark));
      t.set(12, 1, hex("#3a3a3a"));
      t.set(12, 2, hex(iron ? "#e0e0e0" : "#3a3a3a"));
    }
    return t;
  };
}

export const REDSTONE_TILE_GENERATORS: Record<string, (t: Tile) => Tile> = {
  redstone_ore: (t) => {
    t.fill(() => t.pick(STONE));
    for (let i = 0; i < 7; i++) {
      const x = 2 + Math.floor(t.rand() * 11);
      const y = 2 + Math.floor(t.rand() * 11);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) t.set(x + ox, y + oy, t.pick(["#c41c10", "#ff3020", "#8e0e08"].map(hex)));
    }
    return t;
  },
  lever_off: stickSprite("#5a5a5a", -2, true),
  lever_on: stickSprite("#d8d8d8", 2, true),
  stone_button: (t) => stone(t, "#4e4e4e"),
  pressure_plate: (t) => {
    stone(t, "#5f5f5f");
    for (let i = 2; i < S - 2; i++) for (const [x, y] of [[i, 2], [i, S - 3], [2, i], [S - 3, i]]) t.set(x, y, hex("#9a9a9a"));
    return t;
  },
  redstone_torch_on: stickSprite("#ff3a24", 0, false),
  redstone_torch_off: stickSprite("#5a1410", 0, false),
  redstone_lamp_off: (t) => t.fill((x, y) => ((x + y) % 5 === 0 || x % 6 === 0 || y % 6 === 0 ? hex("#3b2414") : t.pick(["#6b4a2a", "#7a5531", "#5c3e22"].map(hex)))),
  redstone_lamp_on: (t) => t.fill((x, y) => ((x + y) % 5 === 0 || x % 6 === 0 || y % 6 === 0 ? hex("#8a5a2a") : t.pick(["#f8d890", "#ffe6a8", "#e8b860"].map(hex)))),
  repeater_side: (t) => stone(t, "#6a6a6a"),
  door_wooden_lower: door("#9c7646", "#5d4426", false, false),
  door_wooden_upper: door("#9c7646", "#5d4426", true, false),
  door_iron_lower: door("#c8c8c8", "#8a8a8a", false, true),
  door_iron_upper: door("#c8c8c8", "#8a8a8a", true, true),
};
for (let p = 0; p <= 15; p++) REDSTONE_TILE_GENERATORS[`redstone_dust_${p}`] = dust(p);
for (let f = 0; f < 4; f++) for (let d = 1; d <= 4; d++) for (const on of [0, 1]) {
  REDSTONE_TILE_GENERATORS[`repeater_${f}_${d}_${on}`] = repeater(f, d, on === 1);
}

/** Item sprites (transparent background). */
export const REDSTONE_ITEM_GENERATORS: Record<string, (t: Tile) => Tile> = {
  // A small heap of red dust.
  item_redstone: (t) => {
    t.fill(() => null);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot((x - 7.5) / 1.2, y - 10);
      if (r <= 4.6 && y >= 6) t.set(x, y, t.pick(["#d8241a", "#ff3a24", "#9a140c"].map(hex)));
    }
    return t;
  },
  item_wooden_door: (t) => doorIcon(t, "#9c7646", "#5d4426", "#a8c8e8"),
  item_iron_door: (t) => doorIcon(t, "#c8c8c8", "#8a8a8a", "#e8eef2"),
};

function doorIcon(t: Tile, base: string, dark: string, glass: string): Tile {
  t.fill(() => null);
  for (let y = 1; y <= 14; y++) for (let x = 5; x <= 10; x++) {
    const edge = x === 5 || x === 10 || y === 1 || y === 14;
    t.set(x, y, edge ? hex(dark) : y >= 3 && y <= 6 ? hex(glass) : hex(base));
  }
  return t;
}
