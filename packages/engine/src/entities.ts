import { blockId, isOpaque, isSolid } from "./blocks";
import { MAX_LIGHT, blockLightOf, skyOf } from "./light";
import type { Vec3 } from "./math";
import { GRAVITY, JUMP_VELOCITY, TERMINAL_VELOCITY, bodyBox, boxCollides, moveAxis, type BlockGetter } from "./physics";

export type MobKind = "pig" | "sheep" | "chicken" | "npc" | "zombie";

export interface MobSpec {
  kind: MobKind;
  displayName: string;
  width: number;
  height: number;
  maxHealth: number;
  /** Walking speed in blocks per second (0 = stationary). */
  speed: number;
  /** Dropped on death: [block or item name, count]. */
  drop?: [string, number];
  /** Attacks players (hostile mob). */
  hostile?: boolean;
}

export const MOB_SPECS: Record<MobKind, MobSpec> = {
  pig: { kind: "pig", displayName: "Pig", width: 0.9, height: 0.9, maxHealth: 10, speed: 1.2, drop: ["raw_porkchop", 2] },
  sheep: { kind: "sheep", displayName: "Sheep", width: 0.9, height: 1.3, maxHealth: 8, speed: 1.1, drop: ["white_wool", 1] },
  chicken: { kind: "chicken", displayName: "Chicken", width: 0.4, height: 0.7, maxHealth: 4, speed: 1.0, drop: ["raw_chicken", 1] },
  // Minecraft: Education Edition non-player character: stationary, invulnerable, talks to players.
  npc: { kind: "npc", displayName: "NPC", width: 0.6, height: 1.9, maxHealth: Infinity, speed: 0 },
  // Minecraft zombie: 20 HP, 3 damage (Normal difficulty), drops rotten flesh.
  zombie: { kind: "zombie", displayName: "Zombie", width: 0.6, height: 1.95, maxHealth: 20, speed: 2.3, drop: ["rotten_flesh", 1], hostile: true },
};

export const HOSTILE_MOBS: readonly MobKind[] = ["zombie"];

/** Zombie behaviour constants (Minecraft-like). */
export const ZOMBIE = {
  /** Blocks within which a zombie notices and chases the player. */
  followRange: 24,
  /** Horizontal distance at which it can hit. */
  reach: 1.4,
  damage: 3,
  /** Seconds between hits (Minecraft: 20 ticks). */
  attackCooldown: 1,
  /** Horizontal and vertical knockback given to the player. */
  knockback: 5,
  knockbackUp: 4,
  /** Damage per second while burning in daylight. */
  burnDamage: 1,
} as const;

export const PASSIVE_MOBS: readonly MobKind[] = ["pig", "sheep", "chicken"];

export interface Mob {
  id: number;
  kind: MobKind;
  position: Vec3;
  velocity: Vec3;
  /** Facing angle in radians (0 = -Z), same convention as the player. */
  yaw: number;
  health: number;
  onGround: boolean;
  /** Seconds until the next wander decision. */
  thinkTimer: number;
  walking: boolean;
  /** Seconds of red hurt tint / panic remaining. */
  hurtTimer: number;
  /** Seconds until a hostile mob can hit again. */
  attackTimer?: number;
  /** Burning in daylight (seconds accumulated towards the next fire damage). */
  burnTimer?: number;
  burning?: boolean;
  /** NPC display name and dialogue (Education Edition NPC). */
  name?: string;
  dialogue?: string;
}

export function createMob(id: number, kind: MobKind, position: Vec3, extra: Partial<Pick<Mob, "name" | "dialogue" | "yaw">> = {}): Mob {
  return {
    id,
    kind,
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: extra.yaw ?? 0,
    health: MOB_SPECS[kind].maxHealth,
    onGround: false,
    thinkTimer: 0,
    walking: false,
    hurtTimer: 0,
    name: kind === "npc" ? (extra.name ?? "NPC") : undefined,
    dialogue: kind === "npc" ? (extra.dialogue ?? "Hello! Welcome to this world.") : undefined,
  };
}

const WATER = blockId("water");

/**
 * Advances a mob by dt seconds: simple wander AI (idle / walk in a random direction),
 * panic-running after being hurt, hopping up one-block steps, gravity and collisions.
 */
export function stepMob(getBlock: BlockGetter, mob: Mob, dt: number, rand: () => number, target: Vec3 | null = null): void {
  dt = Math.min(dt, 0.1);
  const spec = MOB_SPECS[mob.kind];
  const p = mob.position;
  const v = mob.velocity;

  // Like Minecraft, push a mob that is stuck inside blocks (e.g. after terrain edits) up and out.
  for (let i = 0; i < 3 && boxCollides(getBlock, bodyBox(p, spec.width, spec.height)); i++) p.y = Math.floor(p.y) + 1;

  mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
  mob.thinkTimer -= dt;
  const chasing = spec.hostile === true && target !== null && Math.hypot(target.x - p.x, target.z - p.z) <= ZOMBIE.followRange;
  if (chasing) {
    // Hostile mobs head straight for the player (no path-finding), stopping when close enough to hit.
    mob.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
    mob.walking = Math.hypot(target.x - p.x, target.z - p.z) > ZOMBIE.reach * 0.6;
    mob.thinkTimer = 0.5;
  } else if (spec.speed > 0 && mob.thinkTimer <= 0) {
    mob.walking = mob.hurtTimer > 0 || rand() < 0.55;
    if (mob.walking) mob.yaw = rand() * Math.PI * 2;
    mob.thinkTimer = mob.hurtTimer > 0 ? 0.6 : 1.5 + rand() * 3;
  }

  // Passive mobs panic-run when hurt; hostile ones keep their pace.
  const speed = mob.walking ? spec.speed * (mob.hurtTimer > 0 && !spec.hostile ? 2.2 : 1) : 0;
  const wishX = -Math.sin(mob.yaw) * speed;
  const wishZ = -Math.cos(mob.yaw) * speed;
  const blend = 1 - Math.exp(-(mob.onGround ? 12 : 3) * dt);
  v.x += (wishX - v.x) * blend;
  v.z += (wishZ - v.z) * blend;

  const inWater = getBlock(Math.floor(p.x), Math.floor(p.y + spec.height * 0.4), Math.floor(p.z)) === WATER;
  if (inWater) {
    // Bob on the surface like Minecraft animals.
    v.y = Math.min(v.y + 20 * dt, 2);
  } else {
    v.y = Math.max(v.y - GRAVITY * dt, mob.kind === "chicken" ? -3 : -TERMINAL_VELOCITY);
  }

  const blockedX = moveAxis(getBlock, p, "x", v.x * dt, spec.width, spec.height);
  if (blockedX) v.x = 0;
  const blockedZ = moveAxis(getBlock, p, "z", v.z * dt, spec.width, spec.height);
  if (blockedZ) v.z = 0;
  const vy = v.y;
  const blockedY = moveAxis(getBlock, p, "y", v.y * dt, spec.width, spec.height);
  mob.onGround = blockedY && vy < 0;
  if (blockedY) v.y = 0;

  if ((blockedX || blockedZ) && mob.onGround && mob.walking) {
    const ahead = { x: p.x - Math.sin(mob.yaw) * 0.5, y: p.y + 1.05, z: p.z - Math.cos(mob.yaw) * 0.5 };
    if (!boxCollides(getBlock, bodyBox(ahead, spec.width, spec.height))) v.y = JUMP_VELOCITY * 0.95;
    else mob.thinkTimer = 0;
  }
}

/** Applies damage; returns true if the mob died. NPCs are invulnerable. */
export function damageMob(mob: Mob, amount: number, fromYaw: number): boolean {
  if (!Number.isFinite(MOB_SPECS[mob.kind].maxHealth)) return false;
  mob.health -= amount;
  mob.hurtTimer = 3;
  mob.thinkTimer = 0;
  // Knock back away from the attacker.
  mob.velocity.x += -Math.sin(fromYaw) * 4;
  mob.velocity.z += -Math.cos(fromYaw) * 4;
  mob.velocity.y = 4;
  return mob.health <= 0;
}

/** Ray vs mob bounding box (slab test). Returns the hit distance or null. */
export function raycastMob(origin: Vec3, direction: Vec3, mob: Mob, maxDistance: number): number | null {
  const spec = MOB_SPECS[mob.kind];
  const b = bodyBox(mob.position, spec.width, spec.height);
  let tMin = 0;
  let tMax = maxDistance;
  const axes: Array<["x" | "y" | "z", number, number]> = [["x", b.minX, b.maxX], ["y", b.minY, b.maxY], ["z", b.minZ, b.maxZ]];
  for (const [axis, lo, hi] of axes) {
    const o = origin[axis];
    const d = direction[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/**
 * Melee: advances the mob's attack cooldown and returns the damage dealt to a player at `player`
 * (feet position) this step, or 0. Only hostile mobs attack.
 */
export function mobAttack(mob: Mob, player: Vec3, dt: number): number {
  if (!MOB_SPECS[mob.kind].hostile) return 0;
  mob.attackTimer = Math.max(0, (mob.attackTimer ?? 0) - dt);
  const horizontal = Math.hypot(player.x - mob.position.x, player.z - mob.position.z);
  const vertical = Math.abs(player.y - mob.position.y);
  if (mob.attackTimer > 0 || horizontal > ZOMBIE.reach || vertical > 1.5) return 0;
  mob.attackTimer = ZOMBIE.attackCooldown;
  return ZOMBIE.damage;
}

/** Knockback velocity for a player hit by `mob` (away from it, slightly upwards). */
export function knockbackFrom(mob: Mob, player: Vec3): Vec3 {
  const dx = player.x - mob.position.x;
  const dz = player.z - mob.position.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: (dx / len) * ZOMBIE.knockback, y: ZOMBIE.knockbackUp, z: (dz / len) * ZOMBIE.knockback };
}

/**
 * Minecraft's sky darkening: 0 by day, 11 at midnight. Effective sky light is sky light minus this.
 * `daylight` is 0 (night) .. 1 (day).
 */
export function skyDarken(daylight: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, daylight))) * 11);
}

/**
 * Hostile spawn rule (Minecraft 1.18+): solid opaque floor, two free cells for the body,
 * block light 0 ("light level 0"), and effective sky light (sky - darkening) no higher than a
 * random 0-7 roll. So mobs spawn in caves any time and on the surface only at night.
 */
export function canHostileSpawn(
  getBlock: BlockGetter,
  getLight: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  darken: number,
  roll: number,
): boolean {
  if (!isOpaque(getBlock(x, y - 1, z))) return false;
  if (isSolid(getBlock(x, y, z)) || isSolid(getBlock(x, y + 1, z))) return false;
  if (getBlock(x, y, z) === WATER) return false;
  const light = getLight(x, y, z);
  if (blockLightOf(light) > 0) return false;
  return skyOf(light) - darken <= Math.floor(roll * 8);
}

/**
 * Daylight burning: an undead mob under open sky (sky light 15) while the sun is up takes fire
 * damage every second. Returns true if it died.
 */
export function burnInDaylight(mob: Mob, skyLight: number, darken: number, dt: number): boolean {
  if (mob.kind !== "zombie") return false;
  mob.burning = skyLight === MAX_LIGHT && darken <= 3;
  if (!mob.burning) {
    mob.burnTimer = 0;
    return false;
  }
  mob.burnTimer = (mob.burnTimer ?? 0) + dt;
  while (mob.burnTimer >= 1) {
    mob.burnTimer -= 1;
    mob.health -= ZOMBIE.burnDamage;
  }
  return mob.health <= 0;
}
