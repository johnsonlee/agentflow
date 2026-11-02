/**
 * Minecraft-style light: two channels per block, 0-15. Sky light enters from above at 15 and
 * travels straight down without loss; block light comes from emitters (torch 14, glowstone 15).
 * Both spread by breadth-first flood fill, losing 1 per step, and stop at opaque blocks.
 * Incremental updates use the classic remove-then-refill passes, so placing or breaking a block
 * only touches the cells whose light actually changes.
 */
import { BLOCKS, isOpaque } from "./blocks";
import { WORLD_HEIGHT } from "./chunk";

export const MAX_LIGHT = 15;
export type LightChannel = "sky" | "block";

/** Light emitted by a block. */
export function emission(id: number): number {
  return BLOCKS[id]?.light ?? 0;
}

/** Packed light accessors over loaded chunks; `get` returns -1 for cells in unloaded chunks. */
export interface LightAccess {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, packed: number): void;
  block(x: number, y: number, z: number): number;
}

export function skyOf(packed: number): number {
  return packed >> 4;
}

export function blockLightOf(packed: number): number {
  return packed & 15;
}

const level = (packed: number, ch: LightChannel) => (ch === "sky" ? packed >> 4 : packed & 15);
const withLevel = (packed: number, ch: LightChannel, l: number) => (ch === "sky" ? (packed & 15) | (l << 4) : (packed & 0xf0) | l);

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
];

/** Flood-fills light outwards from the given cells (flat x,y,z triples). */
export function spread(a: LightAccess, seeds: number[], ch: LightChannel): void {
  const q = seeds;
  for (let i = 0; i < q.length; i += 3) {
    const x = q[i], y = q[i + 1], z = q[i + 2];
    const l = level(a.get(x, y, z), ch);
    if (l <= 1) continue;
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const p = a.get(nx, ny, nz);
      if (p < 0 || isOpaque(a.block(nx, ny, nz))) continue;
      // Full sky light keeps travelling straight down.
      const next = ch === "sky" && dy === -1 && l === MAX_LIGHT ? MAX_LIGHT : l - 1;
      if (level(p, ch) >= next) continue;
      a.set(nx, ny, nz, withLevel(p, ch, next));
      q.push(nx, ny, nz);
    }
  }
}

/**
 * Removes light that came from (x, y, z), whose level was `old` (already zeroed by the caller).
 * Returns the cells that must re-spread their own light into the darkened region.
 */
export function unspread(a: LightAccess, x: number, y: number, z: number, old: number, ch: LightChannel): number[] {
  const relight: number[] = [];
  const q: number[] = [x, y, z, old];
  for (let i = 0; i < q.length; i += 4) {
    const cx = q[i], cy = q[i + 1], cz = q[i + 2], l = q[i + 3];
    for (const [dx, dy, dz] of DIRS) {
      const nx = cx + dx, ny = cy + dy, nz = cz + dz;
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const p = a.get(nx, ny, nz);
      if (p < 0) continue;
      const nl = level(p, ch);
      if (nl === 0) continue;
      const fromHere = nl < l || (ch === "sky" && dy === -1 && l === MAX_LIGHT && nl === MAX_LIGHT);
      if (fromHere && emission(a.block(nx, ny, nz)) < nl) {
        a.set(nx, ny, nz, withLevel(p, ch, 0));
        q.push(nx, ny, nz, nl);
        if (ch === "block" && emission(a.block(nx, ny, nz)) > 0) {
          a.set(nx, ny, nz, withLevel(a.get(nx, ny, nz), ch, emission(a.block(nx, ny, nz))));
          relight.push(nx, ny, nz);
        }
      } else {
        relight.push(nx, ny, nz);
      }
    }
  }
  return relight;
}

/** Updates both channels after the block at (x, y, z) changed (the new id is already set). */
export function relightBlock(a: LightAccess, x: number, y: number, z: number): void {
  const id = a.block(x, y, z);
  for (const ch of ["block", "sky"] as const) {
    const p = a.get(x, y, z);
    if (p < 0) return;
    const old = level(p, ch);
    a.set(x, y, z, withLevel(p, ch, 0));
    const seeds = old > 0 ? unspread(a, x, y, z, old, ch) : [];
    if (ch === "block" && emission(id) > 0) {
      a.set(x, y, z, withLevel(a.get(x, y, z), ch, emission(id)));
      seeds.push(x, y, z);
    }
    if (!isOpaque(id)) {
      if (ch === "sky" && (y === WORLD_HEIGHT - 1 || skyOf(Math.max(0, a.get(x, y + 1, z))) === MAX_LIGHT)) {
        a.set(x, y, z, withLevel(a.get(x, y, z), ch, MAX_LIGHT));
        seeds.push(x, y, z);
      }
      // Let neighbours shine into the opened cell.
      for (const [dx, dy, dz] of DIRS) {
        const ny = y + dy;
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        if (a.get(x + dx, ny, z + dz) > 0) seeds.push(x + dx, ny, z + dz);
      }
    }
    spread(a, seeds, ch);
  }
}
