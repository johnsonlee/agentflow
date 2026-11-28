import { blockId, bodyBox, boxCollides, EYE_HEIGHT, raycast, tryBlockById, type Vec3 } from '@craft/engine';

export type HarvestCell = { x: number; y: number; z: number };
export type ReadHarvestBlock = (x: number, y: number, z: number) => number | undefined;
export interface HarvestCells { min: HarvestCell; max: HarvestCell; blocks: Array<number | null> }
export const SINGLE_SOURCE_LIMITS = Object.freeze({ sources: 96, columns: 48, aims: 15, reach: 5, marginReach: 4.75, radius: 9 });
const same = (a: HarvestCell, b: HarvestCell) => a.x === b.x && a.y === b.y && a.z === b.z;
const key = (p: HarvestCell) => `${p.x},${p.y},${p.z}`;

export function readHarvestCells(cells: HarvestCells): ReadHarvestBlock {
  const width = cells.max.x - cells.min.x + 1, depth = cells.max.z - cells.min.z + 1;
  return (x, y, z) => {
    if (x < cells.min.x || x > cells.max.x || y < cells.min.y || y > cells.max.y || z < cells.min.z || z > cells.max.z) return undefined;
    return cells.blocks[((y - cells.min.y) * depth + z - cells.min.z) * width + x - cells.min.x] ?? undefined;
  };
}

/** Same nearest Allow/Deny policy as canBuildAt; unknown permission cells refuse admission. */
function permission(read: ReadHarvestBlock, source: HarvestCell, portalCanChange: boolean) {
  if (!portalCanChange) return false;
  for (let y = source.y - 1; y >= 0; y--) {
    const id = read(source.x, y, source.z);
    if (id === undefined) return false;
    if (id === blockId('allow')) return true;
    if (id === blockId('deny')) return false;
  }
  return true;
}

/** Pure actual-engine geometry query: only the hypothetical getter omits the source.
 * It never mutates terrain, actors, input owners, loot, RNG or the application clock. */
export function admitSingleSource(read: ReadHarvestBlock, source: HarvestCell, feet: Vec3, aim: Vec3, portalCanChange: boolean, actualDirection?: Vec3) {
  let unknown = false;
  const visited = new Map<string, number>();
  const get = (x: number, y: number, z: number): number => {
    const id = read(x, y, z);
    if (id === undefined || !tryBlockById(id)) { unknown = true; return blockId('bedrock'); }
    visited.set(`${x},${y},${z}`, id); return id;
  };
  const reject = (reason: string) => ({ ok: false as const, reason, visited: [...visited] });
  if (![...Object.values(source), ...Object.values(feet), ...Object.values(aim), ...Object.values(actualDirection ?? {})].every(Number.isFinite) || !Object.values(source).every(Number.isSafeInteger)) return reject('nonfinite-or-noninteger-source');
  if (!permission(read, source, portalCanChange)) return reject('source-permission-refused');
  if (get(source.x, source.y, source.z) !== blockId('gravel')) return reject('not-current-gravel');
  for (const x of [feet.x - .299999, feet.x + .299999]) for (const z of [feet.z - .299999, feet.z + .299999]) {
    const def = tryBlockById(get(Math.floor(x), Math.floor(feet.y - .01), Math.floor(z)));
    if (!def?.solid || def.shape !== 'cube') return reject('unsupported-full-body');
  }
  const body = bodyBox(feet);
  if (boxCollides(get, body)) return reject('body-collision');
  for (let x = Math.floor(body.minX + 1e-6); x <= Math.floor(body.maxX - 1e-6); x++) for (let y = Math.floor(body.minY + 1e-6); y <= Math.floor(body.maxY - 1e-6); y++) for (let z = Math.floor(body.minZ + 1e-6); z <= Math.floor(body.maxZ - 1e-6); z++) {
    const id = get(x, y, z); if (id !== 0 && id !== blockId('water')) return reject('body-not-air-or-water');
  }
  const eye = { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
  const aimedDirection = { x: aim.x - eye.x, y: aim.y - eye.y, z: aim.z - eye.z };
  if (Math.hypot(aimedDirection.x, aimedDirection.y, aimedDirection.z) > SINGLE_SOURCE_LIMITS.marginReach) return reject('insufficient-reach-margin');
  const direction = actualDirection ?? aimedDirection;
  const targetable = (id: number) => id !== 0 && tryBlockById(id)?.shape !== 'liquid';
  const first = raycast(get, eye, direction, SINGLE_SOURCE_LIMITS.reach, targetable);
  if (!first || !same(first, source) || first.id !== blockId('gravel')) return reject('first-hit-not-source');
  const omitted = (x: number, y: number, z: number) => same({ x, y, z }, source) ? 0 : get(x, y, z);
  const after = raycast(omitted, eye, direction, SINGLE_SOURCE_LIMITS.reach, targetable);
  if (after && Number.isFinite(tryBlockById(after.id)?.hardness)) return reject('another-finite-hardness-target');
  if (unknown) return reject('unloaded-or-unknown-cell');
  return { ok: true as const, source, feet, aim, eye, direction, first, after, visited: [...visited] };
}

export function findSingleSourcePose(read: ReadHarvestBlock, source: HarvestCell, portalCanChange: boolean) {
  const offsets: Array<{ x: number; z: number }> = [];
  for (let radius = 1; radius <= 4; radius++) for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) if (Math.max(Math.abs(x), Math.abs(z)) === radius) offsets.push({ x, z });
  offsets.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
  let queries = 0; const reasons: Record<string, number> = {};
  for (const offset of offsets.slice(0, SINGLE_SOURCE_LIMITS.columns)) {
    const x = source.x + offset.x, z = source.z + offset.z;
    // Re-read the current natural column, including changes from preceding real harvests.
    let y = Math.min(95, source.y + 8);
    while (y > 0 && [0, blockId('water')].includes(read(x, y, z) ?? -1)) y--;
    const feet = { x: x + .5, y: y + 1, z: z + .5 };
    for (const height of [.25, .5, .85]) for (const [dx, dz] of [[0, 0], [-.35, 0], [.35, 0], [0, -.35], [0, .35]]) {
      const aim = { x: source.x + .5 + dx, y: source.y + height, z: source.z + .5 + dz };
      queries++; const result = admitSingleSource(read, source, feet, aim, portalCanChange);
      if (result.ok) return { proof: result, queries, reasons };
      reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
    }
  }
  return { proof: null, queries, reasons };
}

/** All cells are retained, including ordinary liquid changes. A separate list identifies
 * positive-hardness physical removals; an extra Gravel/Dirt removal cannot hide in totals. */
export function harvestCellChanges(before: HarvestCells, after: HarvestCells) {
  const a = readHarvestCells(before), b = readHarvestCells(after);
  const changes: Array<HarvestCell & { before: number | null; after: number | null }> = [];
  for (let y = before.min.y; y <= before.max.y; y++) for (let z = before.min.z; z <= before.max.z; z++) for (let x = before.min.x; x <= before.max.x; x++) {
    const previous = a(x, y, z), current = b(x, y, z);
    if (previous !== current) changes.push({ x, y, z, before: previous ?? null, after: current ?? null });
  }
  const positiveHardnessRemovals = changes.filter(c => c.before !== null && !!tryBlockById(c.before)?.solid && Number.isFinite(tryBlockById(c.before)?.hardness) && tryBlockById(c.before)!.hardness > 0);
  return { changes, positiveHardnessRemovals, becameUnknown: changes.filter(c => c.before !== null && c.after === null), keys: positiveHardnessRemovals.map(key) };
}
