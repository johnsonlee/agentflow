/**
 * Bounded A* path-finding on the block grid for walking mobs. A node is a foot cell the mob can
 * stand in: a solid block below and `height` free (non-solid) cells. Moves are the 4 horizontal
 * neighbours (plus diagonals when both side cells are open) on the same level, one step up (needs
 * head room above the start for the jump), or a drop of up to `maxDrop` blocks. The search stays
 * within `radius` of the start and expands at most `maxNodes` nodes, so it is cheap and always
 * terminates; if the goal is unreachable it returns a path to the closest node found.
 */
import { BLOCKS, isOpaque, isSolid } from "./blocks";

const TREE = new Set(BLOCKS.filter((b) => b.name.endsWith("_log") || b.name.endsWith("_leaves")).map((b) => b.id));
import type { BlockGetter } from "./physics";
import type { Vec3 } from "./math";

export interface PathOptions {
  /** Body height in blocks (zombie: 2). */
  height?: number;
  maxDrop?: number;
  radius?: number;
  maxNodes?: number;
}

export type PathNode = { x: number; y: number; z: number };

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

function free(get: BlockGetter, x: number, y: number, z: number, height: number): boolean {
  for (let i = 0; i < height; i++) if (isSolid(get(x, y + i, z))) return false;
  return true;
}

/** True if a mob of `height` can stand with its feet in cell (x, y, z). */
export function standable(get: BlockGetter, x: number, y: number, z: number, height = 2): boolean {
  return isSolid(get(x, y - 1, z)) && free(get, x, y, z, height);
}

/** Lowest standable cell at or below y within `maxDrop` (for snapping start / goal to the ground). */
function ground(get: BlockGetter, x: number, y: number, z: number, height: number, maxDrop: number): number | null {
  for (let d = 0; d <= maxDrop; d++) if (standable(get, x, y - d, z, height)) return y - d;
  return null;
}

const STEPS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Finds a walking path from `from` to `to` (feet positions). Returns the cell centres to visit
 * (excluding the start), or null if the start isn't on the ground.
 */
export function findPath(get: BlockGetter, from: Vec3, to: Vec3, opts: PathOptions = {}): PathNode[] | null {
  const height = opts.height ?? 2;
  const maxDrop = opts.maxDrop ?? 3;
  const radius = opts.radius ?? 24;
  const maxNodes = opts.maxNodes ?? 3000;
  const sx = Math.floor(from.x), sz = Math.floor(from.z);
  const sy = ground(get, sx, Math.floor(from.y + 0.01), sz, height, 2);
  if (sy === null) return null;
  const gx = Math.floor(to.x), gz = Math.floor(to.z);
  const gy = ground(get, gx, Math.floor(to.y + 0.01), gz, height, maxDrop) ?? Math.floor(to.y);

  const h = (x: number, y: number, z: number) => Math.abs(x - gx) + Math.abs(z - gz) + Math.abs(y - gy);
  const start: PathNode = { x: sx, y: sy, z: sz };
  const came = new Map<string, PathNode | null>([[key(sx, sy, sz), null]]);
  const cost = new Map<string, number>([[key(sx, sy, sz), 0]]);
  // Small binary heap on f = g + h.
  const heap: Array<{ n: PathNode; f: number }> = [{ n: start, f: h(sx, sy, sz) }];
  const push = (n: PathNode, f: number) => {
    heap.push({ n, f });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  let best = start;
  let bestH = h(sx, sy, sz);
  let expanded = 0;
  while (heap.length > 0 && expanded < maxNodes) {
    const { n } = pop();
    expanded++;
    const nh = h(n.x, n.y, n.z);
    if (nh < bestH) {
      best = n;
      bestH = nh;
    }
    if (n.x === gx && n.z === gz && Math.abs(n.y - gy) <= 1) {
      best = n;
      break;
    }
    const g = cost.get(key(n.x, n.y, n.z))!;
    for (const [dx, dz] of STEPS) {
      const nx = n.x + dx, nz = n.z + dz;
      if (Math.abs(nx - sx) > radius || Math.abs(nz - sz) > radius) continue;
      const diagonal = dx !== 0 && dz !== 0;
      // No corner cutting: both side cells must be passable at this level.
      if (diagonal && (!free(get, n.x + dx, n.y, n.z, height) || !free(get, n.x, n.y, n.z + dz, height))) continue;
      let ny: number | null = null;
      if (standable(get, nx, n.y, nz, height)) ny = n.y;
      else if (!diagonal && free(get, n.x, n.y + height, n.z, 1) && standable(get, nx, n.y + 1, nz, height)) ny = n.y + 1;
      else if (free(get, nx, n.y, nz, height)) {
        for (let d = 1; d <= maxDrop; d++) {
          if (standable(get, nx, n.y - d, nz, height)) {
            ny = n.y - d;
            break;
          }
          if (!free(get, nx, n.y - d, nz, 1)) break;
        }
      }
      if (ny === null) continue;
      const k = key(nx, ny, nz);
      const ng = g + (diagonal ? 1.414 : 1) + (ny > n.y ? 0.5 : 0);
      if (ng >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, ng);
      const next = { x: nx, y: ny, z: nz };
      came.set(k, n);
      push(next, ng + h(nx, ny, nz));
    }
  }

  const path: PathNode[] = [];
  for (let n: PathNode | null = best; n && !(n.x === sx && n.y === sy && n.z === sz); n = came.get(key(n.x, n.y, n.z)) ?? null) {
    path.push(n);
  }
  return path.reverse();
}

/**
 * Picks where to put a summoned mob near (x, z): the nearest column (rings out to `radius`)
 * with a standable cell within a few blocks of `nearY` (the summoner's feet), on an opaque floor
 * that isn't part of a tree (logs or leaves). So /summon in front of a tree lands on the ground
 * beside it, reachable on foot, instead of inside the trunk or on top of the canopy.
 * Returns the feet position (cell centre), or null if nothing fits.
 */
export function findSummonSpot(get: BlockGetter, x: number, z: number, nearY: number, height = 2, radius = 4): Vec3 | null {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const y0 = Math.floor(nearY);
  for (let r = 0; r <= radius; r++) {
    let best: { x: number; y: number; z: number; score: number } | null = null;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = 0; dy <= 6; dy++) {
          for (const y of dy === 0 ? [y0] : [y0 + dy, y0 - dy]) {
            if (dy > 3 && y > y0) continue; // at most 3 above the summoner
            const floor = get(cx + dx, y - 1, cz + dz);
            if (!isOpaque(floor) || TREE.has(floor)) continue;
            if (!standable(get, cx + dx, y, cz + dz, height)) continue;
            const score = Math.hypot(dx, dz) + Math.abs(y - y0) * 0.5;
            if (!best || score < best.score) best = { x: cx + dx, y, z: cz + dz, score };
          }
        }
      }
    }
    if (best) return { x: best.x + 0.5, y: best.y, z: best.z + 0.5 };
  }
  return null;
}
