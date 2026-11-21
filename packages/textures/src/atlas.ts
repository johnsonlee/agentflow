import { STATION_FACE_FALLBACKS } from "@craft/engine";
import { TILE_SIZE } from "./pixels";
import { generateTile } from "./tiles";
import type { SourceTile } from "./resource-pack";

export interface AtlasSourceReport {
  /** Effective replaced slots, including inherited station faces. */
  appliedKeys: readonly string[];
  directAppliedKeys: readonly string[];
  inheritedAppliedKeys: readonly { readonly key: string; readonly fromKey: string }[];
  fallbackKeys: readonly string[];
  /** Counts every effective source tile, including original procedural fallback. */
  source16Count: number;
  source32Count: number;
  expanded16To32Count: number;
}

/** Texture rectangle in GL UV space: [u0, vBottom, u1, vTop]. */
export type UvRect = readonly [number, number, number, number];

export interface TextureAtlas {
  width: number;
  height: number;
  /** Uniform packed cell size; a source16 tile is explicitly expanded if any source is32. */
  tileSize: number;
  report: AtlasSourceReport;
  /** Detached original source raster, before any integer expansion. */
  sourceTile(name: string): SourceTile;
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
  /** RGBA pixels of one packed tileSize-square cell (copied); use sourceTile for raw provenance. */
  tilePixels(name: string): Uint8ClampedArray<ArrayBuffer>;
}

/** Packs the named tiles into a square power-of-two atlas. */
export function buildAtlas(names: readonly string[], overrides?: ReadonlyMap<string, SourceTile>): TextureAtlas {
  const unique = [...new Set(names)], known = new Set(unique), sources = new Map<string, SourceTile>();
  if (overrides) for (const [name, source] of overrides) {
    if (!known.has(name)) throw new Error(`Unknown atlas override key ${name}`);
    if (!source || (source.width !== 16 && source.width !== 32) || source.height !== source.width || !(source.rgba instanceof Uint8ClampedArray) || source.rgba.length !== source.width * source.height * 4) throw new Error(`Invalid atlas source raster ${name}`);
    sources.set(name, { width: source.width, height: source.height, rgba: Uint8ClampedArray.from(source.rgba) });
  }
  const directAppliedKeys = unique.filter(name => sources.has(name));
  const inheritedAppliedKeys: { readonly key: string; readonly fromKey: string }[] = [];
  // Validate and clone every explicit record before deriving any legacy aliases. Specific wins.
  for (const name of unique) {
    if (sources.has(name) || !Object.prototype.hasOwnProperty.call(STATION_FACE_FALLBACKS, name)) continue;
    const fromKey = STATION_FACE_FALLBACKS[name], source = sources.get(fromKey);
    if (!source) continue;
    sources.set(name, { width: source.width, height: source.height, rgba: Uint8ClampedArray.from(source.rgba) });
    inheritedAppliedKeys.push(Object.freeze({ key: name, fromKey }));
  }
  const appliedKeys = unique.filter(name => sources.has(name)), fallbackKeys = unique.filter(name => !sources.has(name));
  for (const name of fallbackKeys) sources.set(name, { width: TILE_SIZE, height: TILE_SIZE, rgba: generateTile(name) });
  const tileSize = [...sources.values()].some(source => source.width === 32) ? 32 : TILE_SIZE;
  const source32Count = [...sources.values()].filter(source => source.width === 32).length;
  const source16Count = sources.size - source32Count;
  const report: AtlasSourceReport = Object.freeze({ appliedKeys: Object.freeze(appliedKeys), directAppliedKeys: Object.freeze(directAppliedKeys), inheritedAppliedKeys: Object.freeze(inheritedAppliedKeys), fallbackKeys: Object.freeze(fallbackKeys), source16Count, source32Count, expanded16To32Count: tileSize === 32 ? source16Count : 0 });
  let columns = 1;
  while (columns * columns < unique.length) columns *= 2;
  const width = columns * tileSize;
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4);
  const tiles = new Map<string, { col: number; row: number }>();

  unique.forEach((name, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    tiles.set(name, { col, row });
    const source = sources.get(name)!;
    // Nearest integer expansion preserves all authored RGBA, including RGB hidden by alpha0.
    // It is reported explicitly, never a downsample or a Canvas/PNG decode roundtrip.
    const scale = tileSize / source.width;
    for (let y = 0; y < tileSize; y++) for (let x = 0; x < tileSize; x++) {
      const src = (Math.floor(y / scale) * source.width + Math.floor(x / scale)) * 4;
      const dst = ((row * tileSize + y) * width + col * tileSize + x) * 4;
      data.set(source.rgba.subarray(src, src + 4), dst);
    }
  });

  const eps = 0.01 / width;
  const missing = tiles.get(unique[0]) ?? { col: 0, row: 0 };
  return {
    width,
    height,
    tileSize,
    report,
    sourceTile(name) {
      const source = sources.get(name) ?? sources.get(unique[0]);
      return source ? { width: source.width, height: source.height, rgba: Uint8ClampedArray.from(source.rgba) }
        : { width: TILE_SIZE, height: TILE_SIZE, rgba: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4) };
    },
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
      const out = new Uint8ClampedArray(tileSize * tileSize * 4);
      for (let y = 0; y < tileSize; y++) {
        const src = ((t.row * tileSize + y) * width + t.col * tileSize) * 4;
        out.set(data.subarray(src, src + tileSize * 4), y * tileSize * 4);
      }
      return out;
    },
  };
}
