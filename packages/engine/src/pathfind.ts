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

/** Numeric node key (x, z within +-32768; y within the world height). */
const nkey = (x: number, y: number, z: number) => ((x + 32768) * 65536 + (z + 32768)) * 128 + y;

/** Shared per-frame path-finding allowance (expanded nodes), so many mobs can't stall one frame. */
export interface PathBudget {
  nodes: number;
  /** Optional wall-clock cut-off (performance.now() ms) for this frame's searching. */
  deadline?: number;
}

/**
 * A resumable A* search: `step(n)` expands at most n more nodes, so a long search can be spread
 * over several frames under a {@link PathBudget}. See {@link findPath} for the move rules.
 */
export class PathSearch {
  readonly maxNodes: number;
  /** Nodes expanded so far. */
  expanded = 0;
  /** True once finished (goal reached, open set exhausted or node cap hit). */
  done = false;
  /** True if the goal itself was reached. */
  reached = false;
  private readonly height: number;
  private readonly maxDrop: number;
  private readonly radius: number;
  private readonly sx: number;
  private readonly sy: number;
  private readonly sz: number;
  private readonly gx: number;
  private readonly gy: number;
  private readonly gz: number;
  private readonly came = new Map<number, PathNode | null>();
  private readonly cost = new Map<number, number>();
  private readonly heap: Array<{ n: PathNode; f: number }> = [];
  private best: PathNode;
  private bestH: number;

  /** Returns null if the start isn't on the ground. */
  static start(get: BlockGetter, from: Vec3, to: Vec3, opts: PathOptions = {}): PathSearch | null {
    const height = opts.height ?? 2;
    const sx = Math.floor(from.x), sz = Math.floor(from.z);
    const sy = ground(get, sx, Math.floor(from.y + 0.01), sz, height, 2);
    if (sy === null) return null;
    return new PathSearch(get, { x: sx, y: sy, z: sz }, to, opts);
  }

  private constructor(private readonly get: BlockGetter, start: PathNode, to: Vec3, opts: PathOptions) {
    this.height = opts.height ?? 2;
    this.maxDrop = opts.maxDrop ?? 3;
    this.radius = opts.radius ?? 24;
    this.maxNodes = opts.maxNodes ?? 3000;
    this.sx = start.x;
    this.sy = start.y;
    this.sz = start.z;
    this.gx = Math.floor(to.x);
    this.gz = Math.floor(to.z);
    this.gy = ground(get, this.gx, Math.floor(to.y + 0.01), this.gz, this.height, this.maxDrop) ?? Math.floor(to.y);
    const k = nkey(start.x, start.y, start.z);
    this.came.set(k, null);
    this.cost.set(k, 0);
    this.best = start;
    this.bestH = this.h(start.x, start.y, start.z);
    this.heap.push({ n: start, f: this.bestH });
  }

  private h(x: number, y: number, z: number): number {
    return Math.abs(x - this.gx) + Math.abs(z - this.gz) + Math.abs(y - this.gy);
  }

  /** Expands up to `limit` more nodes (stopping early at `deadline`, if given); returns how many. */
  step(limit: number, deadline?: number): number {
    const { get, height, maxDrop, radius, heap } = this;
    let used = 0;
    while (!this.done && used < limit) {
      if (deadline !== undefined && (used & 31) === 31 && performance.now() > deadline) break;
      if (heap.length === 0 || this.expanded >= this.maxNodes) {
        this.done = true;
        break;
      }
      const n = this.pop();
      this.expanded++;
      used++;
      const nh = this.h(n.x, n.y, n.z);
      if (nh < this.bestH) {
        this.best = n;
        this.bestH = nh;
      }
      if (n.x === this.gx && n.z === this.gz && Math.abs(n.y - this.gy) <= 1) {
        this.best = n;
        this.reached = true;
        this.done = true;
        break;
      }
      const g = this.cost.get(nkey(n.x, n.y, n.z))!;
      for (const [dx, dz] of STEPS) {
        const nx = n.x + dx, nz = n.z + dz;
        if (Math.abs(nx - this.sx) > radius || Math.abs(nz - this.sz) > radius) continue;
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
        const k = nkey(nx, ny, nz);
        const ng = g + (diagonal ? 1.414 : 1) + (ny > n.y ? 0.5 : 0);
        if (ng >= (this.cost.get(k) ?? Infinity)) continue;
        this.cost.set(k, ng);
        this.came.set(k, n);
        this.push({ x: nx, y: ny, z: nz }, ng + this.h(nx, ny, nz));
      }
    }
    return used;
  }

  /** The path found so far: to the goal if reached, else to the closest node seen (excluding the start). */
  result(): PathNode[] {
    const path: PathNode[] = [];
    for (let n: PathNode | null = this.best; n && !(n.x === this.sx && n.y === this.sy && n.z === this.sz); n = this.came.get(nkey(n.x, n.y, n.z)) ?? null) {
      path.push(n);
    }
    return path.reverse();
  }

  private push(n: PathNode, f: number): void {
    const heap = this.heap;
    heap.push({ n, f });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  }

  private pop(): PathNode {
    const heap = this.heap;
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
    return top.n;
  }
}

/**
 * Finds a walking path from `from` to `to` (feet positions), running the search to completion.
 * Returns the cell centres to visit (excluding the start), or null if the start isn't on the ground.
 */
export function findPath(get: BlockGetter, from: Vec3, to: Vec3, opts: PathOptions = {}): PathNode[] | null {
  const search = PathSearch.start(get, from, to, opts);
  if (!search) return null;
  while (!search.done) search.step(Infinity);
  return search.result();
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
