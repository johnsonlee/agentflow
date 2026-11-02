import { blockId, isOpaque, isSolid } from "./blocks";
import { MAX_LIGHT, blockLightOf, skyOf } from "./light";
import type { Vec3 } from "./math";
import { GRAVITY, JUMP_VELOCITY, TERMINAL_VELOCITY, bodyBox, boxCollides, moveAxis, substeps, type BlockGetter } from "./physics";
import { PathSearch, type PathBudget, type PathNode } from "./pathfind";

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
  /** A second drop (Minecraft chickens also drop feathers). */
  extraDrop?: [string, number];
  /** Attacks players (hostile mob). */
  hostile?: boolean;
}

export const MOB_SPECS: Record<MobKind, MobSpec> = {
  pig: { kind: "pig", displayName: "Pig", width: 0.9, height: 0.9, maxHealth: 10, speed: 1.2, drop: ["raw_porkchop", 2] },
  sheep: { kind: "sheep", displayName: "Sheep", width: 0.9, height: 1.3, maxHealth: 8, speed: 1.1, drop: ["white_wool", 1] },
  chicken: { kind: "chicken", displayName: "Chicken", width: 0.4, height: 0.7, maxHealth: 4, speed: 1.0, drop: ["raw_chicken", 1], extraDrop: ["feather", 1] },
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
  /** Chase path (cell centres) and when to re-plan it. */
  path?: PathNode[];
  /** A path search in progress (spread over frames under the shared budget). */
  search?: PathSearch;
  /** Consecutive searches that didn't reach the player (drives back-off). */
  failCount?: number;
  pathTimer?: number;
  pathGoal?: Vec3;
  /** Steer-around fallback when no path helps: seconds left and direction (+1 / -1). */
  detourTimer?: number;
  detourSign?: number;
  stuckTimer?: number;
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
 * Path-finding cost model. Each search expands at most `maxNodes` grid cells (fewer after repeated
 * failures). All mobs share `budgetPerFrame` expanded cells per frame, and a search that doesn't fit
 * resumes on later frames. Successful paths are re-planned every `replanSeconds` (staggered per
 * mob); failed searches (unreachable player) back off exponentially up to `maxBackoffSeconds`,
 * unless the player moves more than `failMoveBlocks`.
 */
export const PATHFINDING = {
  maxNodes: 3000,
  budgetPerFrame: 400,
  /** Milliseconds of path searching per frame, shared by all mobs (only search time is charged). */
  budgetMs: 3,
  replanSeconds: 0.5,
  maxBackoffSeconds: 8,
  moveBlocks: 1.5,
  failMoveBlocks: 3,
} as const;

/** Deterministic per-mob jitter in [0, 1), so mobs spawned together don't search on the same frame. */
const jitter = (id: number) => (id * 0.6180339887) % 1;

/**
 * Advances a mob by dt seconds: wander AI (idle / walk in a random direction), panic-running after
 * being hurt, or (hostile mobs) chasing `target` along a path-found route; then physics in fixed
 * substeps (<= 1/60 s) so stepping up blocks works at any frame rate.
 */
export function stepMob(
  getBlock: BlockGetter,
  mob: Mob,
  dt: number,
  rand: () => number,
  target: Vec3 | null = null,
  budget?: PathBudget,
): void {
  const { n, h } = substeps(dt);
  const chasing = planChase(getBlock, mob, n * h, target, budget);
  for (let i = 0; i < n; i++) stepMobOnce(getBlock, mob, h, rand, chasing);
}

/**
 * Hostile chase planning: follows a bounded A* path to the target (re-planned every 0.5 s or when
 * the target moves), and falls back to steering around an obstacle when it makes no progress.
 * Returns true while chasing.
 */
function planChase(getBlock: BlockGetter, mob: Mob, dt: number, target: Vec3 | null, budget?: PathBudget): boolean {
  const spec = MOB_SPECS[mob.kind];
  const p = mob.position;
  if (!spec.hostile || !target || Math.hypot(target.x - p.x, target.z - p.z) > ZOMBIE.followRange) {
    mob.path = undefined;
    mob.search = undefined;
    return false;
  }
  // First plan is staggered by up to 0.25 s per mob.
  mob.pathTimer = (mob.pathTimer ?? jitter(mob.id) * 0.25) - dt;
  const moved = mob.pathGoal ? Math.hypot(target.x - mob.pathGoal.x, target.y - mob.pathGoal.y, target.z - mob.pathGoal.z) : Infinity;
  const failing = (mob.failCount ?? 0) > 0;
  const playerMoved = moved > (failing ? PATHFINDING.failMoveBlocks : PATHFINDING.moveBlocks);
  if (!mob.search && mob.onGround && (mob.pathTimer <= 0 || playerMoved || (!mob.path && !failing))) {
    // A new situation resets the back-off; repeated failures search with smaller caps.
    if (playerMoved) mob.failCount = 0;
    const cap = PATHFINDING.maxNodes >> Math.min(mob.failCount ?? 0, 2);
    mob.search = PathSearch.start(getBlock, p, target, { height: 2, radius: ZOMBIE.followRange, maxNodes: cap }) ?? undefined;
    mob.pathGoal = { ...target };
    if (!mob.search) {
      mob.path = [];
      mob.pathTimer = PATHFINDING.replanSeconds;
    }
  }
  if (mob.search) {
    const allowance = budget ? budget.nodes : Infinity;
    const outOfTime = budget?.ms !== undefined && budget.ms <= 0;
    if (allowance > 0 && !outOfTime) {
      const t0 = budget?.ms !== undefined ? performance.now() : 0;
      const used = mob.search.step(allowance, budget?.ms);
      if (budget) {
        budget.nodes -= used;
        if (budget.ms !== undefined) budget.ms -= performance.now() - t0;
      }
    }
    if (mob.search.done) {
      mob.path = mob.search.result();
      if (mob.search.reached) {
        mob.failCount = 0;
        mob.pathTimer = PATHFINDING.replanSeconds * (1 + 0.5 * jitter(mob.id));
      } else {
        mob.failCount = (mob.failCount ?? 0) + 1;
        const backoff = Math.min(PATHFINDING.maxBackoffSeconds, PATHFINDING.replanSeconds * 2 ** mob.failCount);
        mob.pathTimer = backoff * (1 + 0.25 * jitter(mob.id));
      }
      mob.search = undefined;
    }
  }
  const path = mob.path ?? [];
  while (path.length > 0 && Math.hypot(path[0].x + 0.5 - p.x, path[0].z + 0.5 - p.z) < 0.35 && Math.abs(path[0].y - p.y) < 1.2) path.shift();

  const toTarget = Math.hypot(target.x - p.x, target.z - p.z);
  let aimX = target.x;
  let aimZ = target.z;
  if (path.length > 0 && !(toTarget < 1.5 && Math.abs(target.y - p.y) < 1)) {
    aimX = path[0].x + 0.5;
    aimZ = path[0].z + 0.5;
  }
  let yaw = Math.atan2(-(aimX - p.x), -(aimZ - p.z));

  // Fallback steer-around: if it hasn't got closer for a second, sidestep for a moment.
  const stuck = Math.hypot(mob.velocity.x, mob.velocity.z) < 0.2 && toTarget > ZOMBIE.reach;
  mob.stuckTimer = stuck ? (mob.stuckTimer ?? 0) + dt : 0;
  if (mob.stuckTimer > 1) {
    mob.stuckTimer = 0;
    mob.detourTimer = 1;
    mob.detourSign = -(mob.detourSign ?? -1);
  }
  if ((mob.detourTimer ?? 0) > 0) {
    mob.detourTimer! -= dt;
    yaw += (Math.PI / 2) * (mob.detourSign ?? 1);
  }
  mob.yaw = yaw;
  mob.walking = toTarget > ZOMBIE.reach * 0.6;
  mob.thinkTimer = 0.5;
  return true;
}

function stepMobOnce(getBlock: BlockGetter, mob: Mob, dt: number, rand: () => number, chasing: boolean): void {
  const spec = MOB_SPECS[mob.kind];
  const p = mob.position;
  const v = mob.velocity;

  // Like Minecraft, push a mob that is stuck inside blocks (e.g. after terrain edits) up and out.
  for (let i = 0; i < 3 && boxCollides(getBlock, bodyBox(p, spec.width, spec.height)); i++) p.y = Math.floor(p.y) + 1;

  mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
  mob.thinkTimer -= dt;
  if (!chasing && spec.speed > 0 && mob.thinkTimer <= 0) {
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
  // Vertical displacement uses the average of old and new velocity (exact under constant gravity).
  const v0 = v.y;
  if (inWater) {
    // Bob on the surface like Minecraft animals.
    v.y = Math.min(v.y + 20 * dt, 2);
  } else {
    v.y = Math.max(v.y - GRAVITY * dt, mob.kind === "chicken" ? -3 : -TERMINAL_VELOCITY);
  }
  const vyMove = (v0 + v.y) / 2;

  const blockedX = moveAxis(getBlock, p, "x", v.x * dt, spec.width, spec.height);
  if (blockedX) v.x = 0;
  const blockedZ = moveAxis(getBlock, p, "z", v.z * dt, spec.width, spec.height);
  if (blockedZ) v.z = 0;
  const blockedY = moveAxis(getBlock, p, "y", vyMove * dt, spec.width, spec.height);
  mob.onGround = blockedY && vyMove < 0;
  if (blockedY) v.y = 0;

  if ((blockedX || blockedZ) && mob.onGround && mob.walking) {
    const ahead = { x: p.x - Math.sin(mob.yaw) * 0.5, y: p.y + 1.05, z: p.z - Math.cos(mob.yaw) * 0.5 };
    if (!boxCollides(getBlock, bodyBox(ahead, spec.width, spec.height))) v.y = JUMP_VELOCITY * 0.95;
    else if (!chasing) mob.thinkTimer = 0;
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

/**
 * A block changed at (x, y, z): any hostile mob whose path search had failed (and is backing off)
 * re-plans now if the change is within `radius` blocks of it or of the player, e.g. a shelter
 * being opened on the far side. Returns how many mobs were reset.
 */
export function onBlockChangedNear(mobs: readonly Mob[], x: number, y: number, z: number, player: Vec3 | null, radius = 4): number {
  const near = (p: Vec3) => Math.abs(p.x - (x + 0.5)) <= radius && Math.abs(p.y - y) <= radius && Math.abs(p.z - (z + 0.5)) <= radius;
  const nearPlayer = player !== null && near(player);
  let reset = 0;
  for (const mob of mobs) {
    if (!MOB_SPECS[mob.kind].hostile || !(mob.failCount ?? 0)) continue;
    if (!nearPlayer && !near(mob.position)) continue;
    mob.failCount = 0;
    mob.pathTimer = 0;
    mob.search = undefined;
    reset++;
  }
  return reset;
}
