export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/** Unit view direction for a yaw (radians, 0 = -Z, increasing to the left) and pitch (radians, + = up). */
export function lookDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/**
 * World border (Minecraft's): x and z are limited to +-30,000,000 blocks. Beyond about 9e15,
 * x++ no longer changes x in floating point, so unbounded coordinates could hang block loops.
 */
export const WORLD_BORDER = 30_000_000;
/** Vertical limits for positions (the world is 0-95; a little room below for falling out). */
export const MIN_Y = -64;
export const MAX_Y = 512;

/** Clamps a horizontal coordinate into the world border (NaN becomes 0). */
export function clampToBorder(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(-WORLD_BORDER, Math.min(WORLD_BORDER, v));
}

/** Clamps a position into the world (border horizontally, MIN_Y..MAX_Y vertically). Mutates and returns it. */
export function clampPosition(p: Vec3): Vec3 {
  p.x = clampToBorder(p.x);
  p.z = clampToBorder(p.z);
  p.y = Number.isNaN(p.y) ? MAX_Y : Math.max(MIN_Y, Math.min(MAX_Y, p.y));
  return p;
}
