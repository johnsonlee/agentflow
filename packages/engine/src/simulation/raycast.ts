import{woodSlabState}from '../catalog/wood-slabs';
import { tryBlockById } from "../catalog/blocks";
import { blockSelectionBoxes, type LocalBox } from "../catalog/block-geometry";
import type { Vec3 } from "../core/math";

export interface RaycastHit {
  /** The block that was hit. */
  x: number;
  y: number;
  z: number;
  id: number;
  /** Outward face normal of the hit face; the placement position is block + normal. */
  normal: Vec3;
  distance: number;
}

/** Exact slab hit for multipart fence/stand; legacy block targeting stays voxel-based. */
function geometrySlab(origin: Vec3, direction: Vec3, x: number, y: number, z: number, bounds: LocalBox): { distance: number; normal: Vec3 } | null {
  let enter = 0, exit = Infinity;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (const [axis, low, high, offset] of [["x", bounds[0], bounds[3], x], ["y", bounds[1], bounds[4], y], ["z", bounds[2], bounds[5], z]] as const) {
    const d = direction[axis], p = origin[axis];
    if (Math.abs(d) < 1e-12) { if (p < offset + low || p > offset + high) return null; continue; }
    const a = (offset + low - p) / d, b = (offset + high - p) / d;
    const near = Math.min(a, b), far = Math.max(a, b);
    if (near > enter) { enter = near; normal = { x: 0, y: 0, z: 0 }; normal[axis] = d > 0 ? -1 : 1; }
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  return exit >= 0 ? { distance: enter, normal } : null;
}

/**
 * Voxel traversal (Amanatides & Woo). `isTarget` decides which block ids stop the ray.
 */
export function raycast(
  getBlock: (x: number, y: number, z: number) => number,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  isTarget: (id: number) => boolean,
): RaycastHit | null {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(len) || len === 0 || ![origin.x, origin.y, origin.z, maxDistance].every(Number.isFinite) || maxDistance < 0) return null;
  const dx = direction.x / len;
  const dy = direction.y / len;
  const dz = direction.z / len;

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
  const frac = (v: number, step: number) => (step > 0 ? Math.floor(v) + 1 - v : v - Math.floor(v));
  let tMaxX = stepX !== 0 ? frac(origin.x, stepX) * tDeltaX : Infinity;
  let tMaxY = stepY !== 0 ? frac(origin.y, stepY) * tDeltaY : Infinity;
  let tMaxZ = stepZ !== 0 ? frac(origin.z, stepZ) * tDeltaZ : Infinity;

  const normal: Vec3 = { x: 0, y: 0, z: 0 };
  let t = 0;
  while (t <= maxDistance) {
    const id = getBlock(x, y, z);
    if (isTarget(id)) {
      const shape=tryBlockById(id)?.shape;
      if (shape !== "fence" && shape !== "brewing_stand" && !woodSlabState(id)) return { x, y, z, id, normal: { ...normal }, distance: t };
      let nearest: { distance: number; normal: Vec3 } | null = null;
      for (const box of blockSelectionBoxes(getBlock, x, y, z, id)) {
        const hit = geometrySlab(origin, { x: dx, y: dy, z: dz }, x, y, z, box);
        if (hit && hit.distance >= t - 1e-9 && hit.distance <= maxDistance && (!nearest || hit.distance < nearest.distance)) nearest = hit;
      }
      if (nearest) return { x, y, z, id, ...nearest };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      normal.x = -stepX; normal.y = 0; normal.z = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      normal.x = 0; normal.y = -stepY; normal.z = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      normal.x = 0; normal.y = 0; normal.z = -stepZ;
    }
  }
  return null;
}
