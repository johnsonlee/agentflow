import { TILE_SIZE } from "./pixels";
import { generateTile } from "./tiles";

/** Texture rectangle in GL UV space: [u0, vBottom, u1, vTop]. */
export type UvRect = readonly [number, number, number, number];

export interface TextureAtlas {
  width: number;
  height: number;
  tileSize: number;
  columns: number;
  /** RGBA pixels, top row first. */
  data: Uint8ClampedArray<ArrayBuffer>;
  /** Tile positions in the grid. */
  tiles: ReadonlyMap<string, { col: number; row: number }>;
  /**
   * UVs for a tile, for a texture uploaded with flipY = false (row 0 of `data` at v = 0).
   * Insets by a tiny amount to avoid sampling neighbouring tiles.
   */
  uv(name: string): UvRect;
  /** RGBA pixels of a single tile (copied). */
  tilePixels(name: string): Uint8ClampedArray<ArrayBuffer>;
}

/** Packs the named tiles into a square power-of-two atlas. */
export function buildAtlas(names: readonly string[]): TextureAtlas {
  const unique = [...new Set(names)];
  let columns = 1;
  while (columns * columns < unique.length) columns *= 2;
  const width = columns * TILE_SIZE;
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4);
  const tiles = new Map<string, { col: number; row: number }>();

  unique.forEach((name, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    tiles.set(name, { col, row });
    const pixels = generateTile(name);
    for (let y = 0; y < TILE_SIZE; y++) {
      const src = y * TILE_SIZE * 4;
      const dst = ((row * TILE_SIZE + y) * width + col * TILE_SIZE) * 4;
      data.set(pixels.subarray(src, src + TILE_SIZE * 4), dst);
    }
  });

  const eps = 0.01 / width;
  const missing = tiles.get(unique[0]) ?? { col: 0, row: 0 };
  return {
    width,
    height,
    tileSize: TILE_SIZE,
    columns,
    data,
    tiles,
    uv(name) {
      const t = tiles.get(name) ?? missing;
      const u0 = t.col / columns + eps;
      const u1 = (t.col + 1) / columns - eps;
      // Tile pixel row 0 (its visual top) lies at the smaller v.
      const vTop = t.row / columns + eps;
      const vBottom = (t.row + 1) / columns - eps;
      return [u0, vBottom, u1, vTop];
    },
    tilePixels(name) {
      const t = tiles.get(name) ?? missing;
      const out = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
      for (let y = 0; y < TILE_SIZE; y++) {
        const src = ((t.row * TILE_SIZE + y) * width + t.col * TILE_SIZE) * 4;
        out.set(data.subarray(src, src + TILE_SIZE * 4), y * TILE_SIZE * 4);
      }
      return out;
    },
  };
}
