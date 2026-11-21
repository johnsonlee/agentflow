import { blockId } from "./blocks";
import { MOB_SPECS, type Mob } from "./entities";
import { clampPosition, WORLD_BORDER, type Vec3 } from "./math";
import { bodyBox, boxCollides, GRAVITY, moveAxis, substeps, TERMINAL_VELOCITY, type BlockGetter } from "./physics";

/** HP10, breath15 and the selected .95 adult body are retained source facts.
 * Speeds, steering, drag, sampling points and dry damage1HP/s are application choices,
 * not native motion/cadence calibration or proof of the active Education pack.
 */
export const SQUID = { airSupply: 15, swimSpeed: 1.2, panicMultiplier: 2, decisionSeconds: 2, dryDamagePerSecond: 1 } as const;
export interface SquidState {
  airRemaining: number;
  /** Fractional dry seconds plus at most one undrained damage attempt. */
  damageAccumulator: number;
  swimDirection: Vec3;
  pitch: number;
  decisionTimer: number;
}
export function createSquidState(): SquidState {
  return { airRemaining: SQUID.airSupply, damageAccumulator: 0, swimDirection: { x: 0, y: 0, z: -1 }, pitch: 0, decisionTimer: 0 };
}
const WATER = blockId("water");
const force = (value: number) => Number.isFinite(value) ? Math.max(-64, Math.min(64, value)) : 0;

/** Callers supply a strictly loaded-only getter with -1 for unknown cells. No generation occurs here. */
function loadedBox(get: BlockGetter, p: Vec3, padding = 0): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) || Math.abs(p.x) > WORLD_BORDER || Math.abs(p.z) > WORLD_BORDER || Math.abs(p.y) > 1024) return false;
  const spec = MOB_SPECS.squid, b = bodyBox(p, spec.width, spec.height);
  const lo = [Math.floor(b.minX - padding + 1e-6), Math.floor(b.minY - padding + 1e-6) - 1, Math.floor(b.minZ - padding + 1e-6)];
  const hi = [Math.floor(b.maxX + padding - 1e-6), Math.floor(b.maxY + padding - 1e-6), Math.floor(b.maxZ + padding - 1e-6)];
  if (![...lo, ...hi].every(Number.isFinite) || hi.some((v, i) => v - lo[i] > 16)) return false;
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    const id = get(x, y, z);
    if (!Number.isInteger(id) || id < 0) return false;
  }
  return true;
}
export function squidBodyLoaded(get: BlockGetter, mob: Mob): boolean {
  return mob.kind === "squid" && loadedBox(get, mob.position);
}

/** Drains attempted environmental damage only. The MobManager owns health/death and cached loot.
 * An undrained attempt saturates below2; callers should drain after every step. Refused death
 * retries follow subsequent dry seconds, retaining the manager's single cached loot roll.
 */
export function squidBreathDamage(mob: Mob): number {
  if (mob.kind !== "squid" || !mob.squidState) return 0;
  const amount = Math.floor(mob.squidState.damageAccumulator);
  mob.squidState.damageAccumulator -= amount;
  return amount * SQUID.dryDamagePerSecond;
}

export function stepSquid(get: BlockGetter, mob: Mob, dt: number, rand: () => number, bias: Vec3, acceleration: Vec3): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  const { n, h } = substeps(dt), spec = MOB_SPECS.squid;
  for (let i = 0; i < n; i++) {
    const p = mob.position, v = mob.velocity;
    // Conservative swept envelope includes collision geometry one cell below the body. Unknown
    // space and terrain edits suspend without changing timers, air, direction, velocity or pose.
    const padding = (Math.max(10, Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) + 64 * h) * h;
    if (!loadedBox(get, p, padding) || boxCollides(get, bodyBox(p, spec.width, spec.height))) return false;
    const s = mob.squidState ?? (mob.squidState = createSquidState());
    const at = (fraction: number) => get(Math.floor(p.x), Math.floor(p.y + spec.height * fraction), Math.floor(p.z)) === WATER;
    const inWater = at(0.4), breathing = at(0.85);
    mob.hurtTimer = Math.max(0, mob.hurtTimer - h);
    s.decisionTimer = Math.max(0, s.decisionTimer - h);
    if (s.decisionTimer === 0 && inWater) {
      const sample = () => { const r = rand(); return Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0.5; };
      const yaw = sample() * Math.PI * 2, vertical = (sample() - 0.5) * 1.2;
      const horizontal = Math.sqrt(1 - vertical * vertical);
      s.swimDirection = { x: -Math.sin(yaw) * horizontal, y: vertical, z: -Math.cos(yaw) * horizontal };
      s.decisionTimer = mob.hurtTimer > 0 ? 0.5 : SQUID.decisionSeconds;
    }
    if (breathing) { s.airRemaining = SQUID.airSupply; s.damageAccumulator = 0; }
    else {
      const dry = Math.max(0, h - s.airRemaining);
      s.airRemaining = Math.max(0, s.airRemaining - h);
      s.damageAccumulator = Math.min(1.999999, s.damageAccumulator + dry);
    }
    const b = { x: force(bias.x), y: force(bias.y), z: force(bias.z) };
    const length = Math.hypot(b.x, b.y, b.z), scale = length > 6 ? 6 / length : 1;
    const speed = inWater ? SQUID.swimSpeed * (mob.hurtTimer > 0 ? SQUID.panicMultiplier : 1) : 0;
    const blend = 1 - Math.exp(-(inWater ? 3 : 2) * h);
    const previousY = v.y;
    for (const axis of ["x", "y", "z"] as const) {
      if (inWater || axis !== "y") v[axis] += (s.swimDirection[axis] * speed + b[axis] * scale - v[axis]) * blend;
      else v.y += b.y * scale * h;
      v[axis] += force(acceleration[axis]) * h;
      if (axis === "y" && !inWater) v.y -= GRAVITY * h;
      v[axis] = Math.max(-TERMINAL_VELOCITY, Math.min(TERMINAL_VELOCITY, v[axis]));
    }
    mob.onGround = false;
    for (const axis of ["x", "z", "y"] as const) {
      const velocity = axis === "y" && !inWater ? (previousY + v.y) / 2 : v[axis];
      if (moveAxis(get, p, axis, velocity * h, spec.width, spec.height)) {
        if (axis === "y" && velocity < 0) mob.onGround = true;
        v[axis] = 0;
        s.swimDirection[axis] = -s.swimDirection[axis];
        // Persist the reflected direction for a brief avoidance interval before a fresh decision.
        s.decisionTimer = 0.25;
      }
    }
    const horizontal = Math.hypot(v.x, v.z);
    if (horizontal > 1e-6) mob.yaw = Math.atan2(-v.x, -v.z);
    s.pitch = Math.atan2(v.y, horizontal);
    mob.walking = inWater && Math.hypot(v.x, v.y, v.z) > 0.05;
    clampPosition(p);
  }
  return true;
}
