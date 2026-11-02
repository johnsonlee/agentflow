import { blockById, blockId, isSolid } from "./blocks";
import type { Vec3 } from "./math";

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

export const WALK_SPEED = 4.317;
export const SPRINT_SPEED = 5.612;
export const SNEAK_SPEED = 1.3;
export const FLY_SPEED = 10.9;
export const GRAVITY = 32;
export const JUMP_VELOCITY = 8.9;
export const TERMINAL_VELOCITY = 78.4;
const SWIM_SPEED = 2.2;
const WATER = blockId("water");

export interface PlayerBody {
  /** Feet position (centre of the bottom of the bounding box). */
  position: Vec3;
  velocity: Vec3;
  /** Radians; 0 looks towards -Z. */
  yaw: number;
  pitch: number;
  onGround: boolean;
  flying: boolean;
  inWater: boolean;
}

export interface MoveInput {
  /** -1..1, positive = forward. */
  forward: number;
  /** -1..1, positive = right. */
  strafe: number;
  jump: boolean;
  /** Sneak on the ground, descend while flying. */
  descend: boolean;
  sprint: boolean;
  /** Bedrock-style auto jump up one-block ledges (used for touch controls). */
  autoJump?: boolean;
}

export type BlockGetter = (x: number, y: number, z: number) => number;

export function createPlayerBody(position: Vec3): PlayerBody {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: false,
    flying: false,
    inWater: false,
  };
}

interface Box {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export function playerBox(p: Vec3): Box {
  const h = PLAYER_WIDTH / 2;
  return { minX: p.x - h, minY: p.y, minZ: p.z - h, maxX: p.x + h, maxY: p.y + PLAYER_HEIGHT, maxZ: p.z + h };
}

/** True if any solid block intersects the box. */
export function boxCollides(getBlock: BlockGetter, b: Box): boolean {
  const eps = 1e-6;
  for (let y = Math.floor(b.minY + eps); y <= Math.floor(b.maxY - eps); y++) {
    for (let z = Math.floor(b.minZ + eps); z <= Math.floor(b.maxZ - eps); z++) {
      for (let x = Math.floor(b.minX + eps); x <= Math.floor(b.maxX - eps); x++) {
        if (isSolid(getBlock(x, y, z))) return true;
      }
    }
  }
  return false;
}

/** Whether the player's body overlaps the given block cell (used to forbid placing blocks inside yourself). */
export function bodyOverlapsBlock(p: Vec3, x: number, y: number, z: number): boolean {
  const b = playerBox(p);
  return b.maxX > x && b.minX < x + 1 && b.maxY > y && b.minY < y + 1 && b.maxZ > z && b.minZ < z + 1;
}

/** Moves along one axis, stopping at the first collision. Returns true if blocked. */
function moveAxis(getBlock: BlockGetter, p: Vec3, axis: "x" | "y" | "z", delta: number): boolean {
  if (delta === 0) return false;
  // Sub-step so fast movement never tunnels through a block.
  const steps = Math.ceil(Math.abs(delta) / 0.45);
  const step = delta / steps;
  for (let i = 0; i < steps; i++) {
    const before = p[axis];
    p[axis] = before + step;
    if (boxCollides(getBlock, playerBox(p))) {
      // Snap flush against the block face.
      if (step > 0) {
        const extent = axis === "y" ? PLAYER_HEIGHT : PLAYER_WIDTH / 2;
        const edge = before + extent + step;
        p[axis] = Math.floor(edge) - extent - 1e-4;
        if (p[axis] < before) p[axis] = before;
      } else {
        const extent = axis === "y" ? 0 : PLAYER_WIDTH / 2;
        const edge = before - extent + step;
        p[axis] = Math.floor(edge) + 1 + extent + 1e-4;
        if (p[axis] > before) p[axis] = before;
      }
      if (boxCollides(getBlock, playerBox(p))) p[axis] = before;
      return true;
    }
  }
  return false;
}

function isWaterAt(getBlock: BlockGetter, p: Vec3): boolean {
  return getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)) === WATER;
}

/** Advances the player by dt seconds. */
export function stepPlayer(getBlock: BlockGetter, body: PlayerBody, input: MoveInput, dt: number): void {
  dt = Math.min(dt, 0.1);
  const p = body.position;
  const v = body.velocity;
  body.inWater = !body.flying && isWaterAt(getBlock, p);

  let speed = WALK_SPEED;
  if (body.flying) speed = input.sprint ? FLY_SPEED * 2 : FLY_SPEED;
  else if (body.inWater) speed = SWIM_SPEED;
  else if (input.descend) speed = SNEAK_SPEED;
  else if (input.sprint && input.forward > 0) speed = SPRINT_SPEED;

  // Horizontal wish direction in world space.
  let fx = input.forward;
  let sx = input.strafe;
  const mag = Math.hypot(fx, sx);
  if (mag > 1) {
    fx /= mag;
    sx /= mag;
  }
  const sin = Math.sin(body.yaw);
  const cos = Math.cos(body.yaw);
  const wishX = -sin * fx + cos * sx;
  const wishZ = -cos * fx - sin * sx;

  // Responsive acceleration: snappier on the ground, floatier in the air.
  const accel = body.onGround || body.flying ? 20 : body.inWater ? 8 : 6;
  const blend = 1 - Math.exp(-accel * dt);
  v.x += (wishX * speed - v.x) * blend;
  v.z += (wishZ * speed - v.z) * blend;

  if (body.flying) {
    const vertical = (input.jump ? 1 : 0) - (input.descend ? 1 : 0);
    v.y += (vertical * FLY_SPEED * 0.75 - v.y) * blend;
  } else if (body.inWater) {
    v.y -= GRAVITY * 0.25 * dt;
    if (input.jump) v.y = Math.min(v.y + 30 * dt, 3.5);
    v.y = Math.max(v.y, -4);
  } else {
    if (input.jump && body.onGround) v.y = JUMP_VELOCITY;
    v.y = Math.max(v.y - GRAVITY * dt, -TERMINAL_VELOCITY);
  }

  const wasOnGround = body.onGround;
  const sneakEdgeGuard = input.descend && wasOnGround && !body.flying;
  const prevX = p.x;
  const prevZ = p.z;

  const blockedX = moveAxis(getBlock, p, "x", v.x * dt);
  if (blockedX) v.x = 0;
  if (sneakEdgeGuard && !hasGroundBelow(getBlock, p)) p.x = prevX;
  const blockedZ = moveAxis(getBlock, p, "z", v.z * dt);
  if (blockedZ) v.z = 0;
  if (sneakEdgeGuard && !hasGroundBelow(getBlock, p)) p.z = prevZ;

  const vy = v.y;
  const blockedY = moveAxis(getBlock, p, "y", v.y * dt);
  body.onGround = blockedY && vy < 0;
  if (blockedY) v.y = 0;
  if (body.onGround && body.flying) body.flying = false;

  if (input.autoJump && wasOnGround && (blockedX || blockedZ) && !body.flying && mag > 0.2) {
    const probe = { x: p.x + wishX * 0.4, y: p.y + 1.05, z: p.z + wishZ * 0.4 };
    if (!boxCollides(getBlock, playerBox(probe))) v.y = JUMP_VELOCITY;
  }
}

function hasGroundBelow(getBlock: BlockGetter, p: Vec3): boolean {
  const b = playerBox(p);
  return boxCollides(getBlock, { ...b, minY: b.minY - 0.1, maxY: b.minY });
}

/** Name of the block at the player's eyes, for underwater tinting. */
export function blockAtEyes(getBlock: BlockGetter, body: PlayerBody): string {
  const p = body.position;
  return blockById(getBlock(Math.floor(p.x), Math.floor(p.y + EYE_HEIGHT), Math.floor(p.z))).name;
}
