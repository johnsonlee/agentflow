import * as THREE from "three";
import {
  MOB_SPECS, PASSIVE_MOBS, PATHFINDING, SEA_LEVEL, onBlockChangedNear, WORLD_HEIGHT, blockId, bodyBox, boxCollides, burnInDaylight, canHostileSpawn, createMob, damageMob,
  raycastMob, squidBreathDamage, skyDarken, skyOf, blockLightOf, stackId, stepMob, mobSnapshot, restoreMobSnapshot,
  type MobStateData, type MobLootResolver,
  type Mob, type MobKind, type Vec3, type World,
} from "@craft/engine";

import { buildSquidModel, animateSquidModel } from "../rendering/squid-model";
import { isNaturalSquidSpawnEligible } from "./squid-habitat";

interface Part {
  size: [number, number, number];
  /** Centre position relative to the mob's feet, model facing -Z. */
  at: [number, number, number];
  color: string;
  /** Leg index for walk animation (pivot at the top of the part). */
  leg?: number;
  face?: "pig" | "sheep" | "chicken" | "npc" | "zombie" | "spider";
}

const MODELS: Record<Exclude<MobKind, "squid">, Part[]> = {
  // Original procedural model: a low dark body, eight independently animated legs and red eyes.
  // Ground walking only; native climbing, leaping and model/texture parity remain unimplemented.
  spider: [
    { size: [0.65, 0.48, 0.7], at: [0, 0.58, 0.3], color: "#302a30" },
    { size: [0.46, 0.35, 0.36], at: [0, 0.55, -0.2], color: "#383038" },
    { size: [0.5, 0.42, 0.42], at: [0, 0.55, -0.54], color: "#292329", face: "spider" },
    ...[-0.4, -0.13, 0.14, 0.41].flatMap((z, i): Part[] => [
      { size: [0.5, 0.13, 0.13], at: [-0.47, 0.35, z], color: "#3f353f", leg: i % 2 },
      { size: [0.5, 0.13, 0.13], at: [0.47, 0.35, z], color: "#3f353f", leg: (i + 1) % 2 },
    ]),
  ],
  pig: [
    { size: [0.62, 0.5, 0.9], at: [0, 0.6, 0.05], color: "#eda3a1" },
    { size: [0.5, 0.5, 0.5], at: [0, 0.75, -0.6], color: "#eda3a1", face: "pig" },
    { size: [0.26, 0.2, 0.08], at: [0, 0.68, -0.88], color: "#d98580" },
    ...legs(0.18, 0.35, 0.2, 0.32, "#e0918f"),
  ],
  sheep: [
    { size: [0.7, 0.62, 1.0], at: [0, 0.85, 0.05], color: "#ececec" },
    { size: [0.4, 0.42, 0.45], at: [0, 1.08, -0.62], color: "#c9b8a6", face: "sheep" },
    ...legs(0.2, 0.55, 0.22, 0.34, "#c9b8a6"),
  ],
  chicken: [
    { size: [0.3, 0.3, 0.4], at: [0, 0.38, 0.02], color: "#f4f4f4" },
    { size: [0.22, 0.3, 0.18], at: [0, 0.62, -0.2], color: "#f4f4f4", face: "chicken" },
    { size: [0.18, 0.08, 0.1], at: [0, 0.62, -0.33], color: "#f2a33a" },
    { size: [0.08, 0.1, 0.06], at: [0, 0.53, -0.31], color: "#d8312a" },
    { size: [0.06, 0.24, 0.06], at: [-0.08, 0.12, 0.02], color: "#f2a33a", leg: 0 },
    { size: [0.06, 0.24, 0.06], at: [0.08, 0.12, 0.02], color: "#f2a33a", leg: 1 },
  ],
  npc: [
    { size: [0.5, 0.72, 0.3], at: [0, 1.08, 0], color: "#4f7a3a" },
    { size: [0.5, 0.5, 0.5], at: [0, 1.69, 0], color: "#c49a7a", face: "npc" },
    { size: [0.58, 0.18, 0.2], at: [0, 1.2, -0.2], color: "#3f6630" },
    { size: [0.22, 0.72, 0.24], at: [-0.12, 0.36, 0], color: "#3b3b6b", leg: 0 },
    { size: [0.22, 0.72, 0.24], at: [0.12, 0.36, 0], color: "#3b3b6b", leg: 1 },
  ],
  // Original design in the classic zombie colours: green skin, teal shirt, blue trousers, arms forward.
  zombie: [
    { size: [0.5, 0.72, 0.28], at: [0, 1.08, 0], color: "#2b8c8a" },
    { size: [0.5, 0.5, 0.5], at: [0, 1.7, 0], color: "#5d9447", face: "zombie" },
    { size: [0.2, 0.2, 0.72], at: [-0.35, 1.34, -0.3], color: "#5d9447" },
    { size: [0.2, 0.2, 0.72], at: [0.35, 1.34, -0.3], color: "#5d9447" },
    { size: [0.23, 0.72, 0.25], at: [-0.12, 0.36, 0], color: "#3a3f9a", leg: 0 },
    { size: [0.23, 0.72, 0.25], at: [0.12, 0.36, 0], color: "#3a3f9a", leg: 1 },
  ],
};

function legs(w: number, h: number, dx: number, dz: number, color: string): Part[] {
  return [
    { size: [w, h, w], at: [-dx, h / 2, -dz], color, leg: 0 },
    { size: [w, h, w], at: [dx, h / 2, -dz], color, leg: 1 },
    { size: [w, h, w], at: [-dx, h / 2, dz], color, leg: 1 },
    { size: [w, h, w], at: [dx, h / 2, dz], color, leg: 0 },
  ];
}

/** Small pixel texture: base colour with Minecraft-like noise, plus a face for heads. */
function partTexture(color: string, face?: Part["face"]): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 8);
  let seed = color.length * 977 + (face ? 13 : 0);
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)";
    ctx.fillRect(Math.floor(rand() * 8), Math.floor(rand() * 8), 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function faceTexture(color: string, face: NonNullable<Part["face"]>): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 8);
  const px = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  if (face === "npc") {
    ctx.fillStyle = "#5a3b22";
    ctx.fillRect(0, 0, 8, 2);
    px(2, 3, "#fff"); px(3, 3, "#2b5f2b"); px(5, 3, "#fff"); px(4, 3, "#2b5f2b");
    ctx.fillStyle = "#a8775a";
    ctx.fillRect(3, 4, 2, 2);
    ctx.fillStyle = "#7a4a33";
    ctx.fillRect(2, 6, 4, 1);
  } else if (face === "spider") {
    for (const [x, y] of [[1, 2], [3, 2], [5, 2], [6, 2], [2, 4], [5, 4], [1, 5], [6, 5]]) px(x, y, "#eb3042");
  } else if (face === "zombie") {
    ctx.fillStyle = "#1d2e17";
    ctx.fillRect(1, 3, 2, 1);
    ctx.fillRect(5, 3, 2, 1);
    ctx.fillStyle = "#3f6a30";
    ctx.fillRect(3, 5, 2, 1);
    ctx.fillRect(2, 6, 4, 1);
  } else {
    px(1, 3, "#1b1b1b"); px(6, 3, "#1b1b1b");
    if (face === "pig") { px(1, 2, "#fff"); px(6, 2, "#fff"); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildModel(mob: Mob): THREE.Group {
  if (mob.kind === "squid") return buildSquidModel();
  const group = new THREE.Group();
  for (const part of MODELS[mob.kind]) {
    const side = new THREE.MeshBasicMaterial({ map: partTexture(part.color) });
    // BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z; models face -Z, so the face goes last.
    const materials = part.face
      ? [side, side, side, side, side, new THREE.MeshBasicMaterial({ map: faceTexture(part.color, part.face) })]
      : side;
    const geo = new THREE.BoxGeometry(...part.size);
    const mesh = new THREE.Mesh(geo, materials);
    if (part.leg !== undefined) {
      // Pivot legs at the hip so they swing.
      geo.translate(0, -part.size[1] / 2, 0);
      mesh.position.set(part.at[0], part.at[1] + part.size[1] / 2, part.at[2]);
      mesh.userData.leg = part.leg;
    } else {
      mesh.position.set(...part.at);
    }
    group.add(mesh);
  }
  if (mob.kind === "npc") group.add(nameTag(mob.name ?? "NPC"));
  return group;
}

function nameTag(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = "28px monospace";
  c.width = Math.ceil(ctx.measureText(text).width) + 20;
  c.height = 40;
  ctx.font = "28px monospace";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 10, 21);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(c.width / 100, c.height / 100, 1);
  sprite.position.set(0, 2.25, 0);
  sprite.userData.nameTag = true;
  return sprite;
}

export interface SavedNpc {
  x: number;
  y: number;
  z: number;
  yaw: number;
  name: string;
  dialogue: string;
}

const MAX_ANIMALS = 12;
const MAX_HOSTILES = 8;
/** Application ocean population cap; native population scheduling is uncalibrated. */
const MAX_SQUID = 4;
const DESPAWN_DISTANCE = 96;

/** Simulates and renders animals and NPCs. */
export type MobDeathCause = "player" | "agent" | "sunlight" | "void" | "suffocation";

export class MobManager {
  private readonly unsubscribeBlock: () => void;
  readonly mobs: Mob[] = [];
  private readonly models = new Map<number, THREE.Group>();
  private nextId = 1;
  private readonly deathOwners = new Set<number>();
  /** Minecraft's doMobSpawning game rule: natural animal spawning (summoning always works). */
  spawning = true;
  private spawnTimer = 0;
  /** Path-finding allowance shared by all mobs each frame (see PATHFINDING). */
  private readonly pathBudget: { nodes: number; ms?: number } = { nodes: 0 };
  /** Rotates which mob updates (and searches) first each frame, so none is starved of the budget. */
  private rotation = 0;
  private lastPlayer: Vec3 | null = null;
  private seed = 12345;
  private readonly rand = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);
  /** Separate application stream: aquatic attempts/steering never consume land-mob randomness. */
  private aquaticSeed = 8675309;
  private readonly aquaticRand = () => ((this.aquaticSeed = (this.aquaticSeed * 16807) % 2147483647) / 2147483647);

  private currentBodyLoaded(mob: Mob): boolean {
    const spec = MOB_SPECS[mob.kind], box = bodyBox(mob.position, spec.width, spec.height);
    for (let x = Math.floor(box.minX) - 1; x <= Math.floor(box.maxX) + 1; x++)
      for (let y = Math.floor(box.minY) - 1; y <= Math.floor(box.maxY) + 1; y++)
        for (let z = Math.floor(box.minZ) - 1; z <= Math.floor(box.maxZ) + 1; z++)
          if (this.world.getLoadedBlock(x, y, z) === undefined) return false;
    return true;
  }

  constructor(
    private readonly world: World,
    private readonly scene: THREE.Scene,
    private readonly onDeath: (mob: Mob, cause: MobDeathCause) => boolean = () => true,
    private readonly hasPendingLoot: (mob: Mob) => boolean = () => false,
    private readonly protectsOwnedMob: (mob: Mob) => boolean = () => false,
    private readonly ownershipBusy: () => boolean = () => false,
    private readonly movementBias: (mob: Mob) => Vec3 = () => ({ x: 0, y: 0, z: 0 }),
    private readonly externalAcceleration: (mob: Mob) => Vec3 = () => ({ x: 0, y: 0, z: 0 }),
    private readonly loadedOnlyPhysics: (mob: Mob) => boolean = () => false,
  ) {
    // Opening (or closing) a shelter near the player or a zombie ends that zombie's path back-off.
    this.unsubscribeBlock = world.onBlockChanged((x, y, z) => onBlockChangedNear(this.mobs, x, y, z, this.lastPlayer));
  }

  get idsExhausted(): boolean { return this.nextId >= Number.MAX_SAFE_INTEGER; }

  spawn(kind: MobKind, position: Vec3, extra: { name?: string; dialogue?: string; yaw?: number } = {}): Mob {
    if (this.ownershipBusy()) throw new Error("Creature ownership transfer is in progress");
    if (this.nextId >= Number.MAX_SAFE_INTEGER) throw new Error("Creature IDs are exhausted; no creature was summoned");
    const mob = createMob(this.nextId++, kind, position, extra);
    this.register(mob);
    return mob;
  }

  /** Restore stable IDs before registering their models; the new section owns all kinds. */
  restore(data: MobStateData, loot: MobLootResolver): void {
    this.nextId = data.nextId;
    for (const snapshot of data.records) {
      const mob = restoreMobSnapshot(snapshot);
      if (snapshot.pendingLoot !== undefined && !loot.restorePending(mob, snapshot.pendingLoot, snapshot.pendingLootCause)) throw new Error("Invalid pending creature loot");
      this.register(mob);
    }
  }

  exportState(loot: MobLootResolver): MobStateData {
    return { nextId: this.nextId, records: this.mobs.map(mob => mobSnapshot(mob, loot.exportPending(mob), loot.exportPendingCause(mob))) };
  }

  private register(mob: Mob): void {
    this.mobs.push(mob);
    const model = buildModel(mob);
    this.models.set(mob.id, model);
    model.position.set(mob.position.x, mob.position.y, mob.position.z);
    model.rotation.y = mob.yaw;
    this.scene.add(model);
  }

  remove(mob: Mob): void {
    // Receiver callbacks cannot recursively remove the actor whose transfer is still in progress.
    if (this.ownershipBusy() || this.deathOwners.has(mob.id)) return;
    this.removeView(mob);
  }

  private removeView(mob: Mob): void {
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.mobs.splice(i, 1);
    const model = this.models.get(mob.id);
    if (model) {
      this.scene.remove(model);
      disposeModel(model);
      this.models.delete(mob.id);
    }
  }

  /** Rebuilds an NPC's model after its name changes. */
  refresh(mob: Mob): void {
    const old = this.models.get(mob.id);
    if (old) { this.scene.remove(old); disposeModel(old); }
    const model = buildModel(mob);
    this.models.set(mob.id, model);
    this.scene.add(model);
  }

  /**
   * Simulates mobs. `target` is the player hostile mobs chase (null in creative, where they ignore
   * the player). `daylight` is 0 (night) .. 1 (day).
   */
  update(dt: number, player: Vec3, light: number, time: number, target: Vec3 | null = player, daylight = light): void {
    if (this.ownershipBusy()) return;
    const get = (x: number, y: number, z: number) => this.world.getBlock(x, y, z);
    const darken = skyDarken(daylight);
    this.pathBudget.nodes = PATHFINDING.budgetPerFrame;
    this.pathBudget.ms = PATHFINDING.budgetMs;
    this.lastPlayer = target;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      if (this.spawning) {
        this.spawnNear(player);
        this.spawnHostileNear(player, darken);
        this.spawnSquidNear(player);
      }
    }
    const order = this.mobs.length > 0 ? [...this.mobs.slice(this.rotation % this.mobs.length), ...this.mobs.slice(0, this.rotation % this.mobs.length)] : [];
    this.rotation++;
    for (const mob of order) {
      // A receiver can reenter update while this actor owns a fatal transfer. Do not mutate
      // its health, exposure, pose or cached state before the outer transaction finishes.
      if (this.deathOwners.has(mob.id)) continue;
      const dist = Math.hypot(mob.position.x - player.x, mob.position.z - player.z);
      // A refused fatal transfer still owns its cached loot, even outside the simulation radius.
      if (mob.kind !== "npc" && dist > DESPAWN_DISTANCE) {
        if (!this.hasPendingLoot(mob) && !this.protectsOwnedMob(mob)) this.remove(mob);
        continue;
      }
      if (mob.position.y < -10) {
        this.die(mob, "void");
        continue;
      }
      const loadedOnly = mob.kind === "squid" || this.loadedOnlyPhysics(mob);
      if (loadedOnly && !this.currentBodyLoaded(mob)) continue;
      // Balloon-owned actors never generate cells to satisfy a suspended tether. Unknown cells
      // remain a conservative collision boundary; ordinary unowned actor behavior stays unchanged.
      const physicsGet = loadedOnly
        ? (x: number, y: number, z: number) => this.world.getLoadedBlock(x, y, z) ?? (mob.kind === "squid" ? -1 : blockId("stone"))
        : get;
      const stepped = dist < 64 ? stepMob(physicsGet, mob, dt, mob.kind === "squid" ? this.aquaticRand : this.rand, target, this.pathBudget, mob.kind === "squid" ? 0 : this.effectiveLight(mob, daylight), this.movementBias(mob), this.externalAcceleration(mob)) : false;
      if (mob.kind === "squid" && stepped === false) continue;
      if (mob.kind === "squid") {
        const exposureDamage = squidBreathDamage(mob);
        if (exposureDamage > 0) {
          mob.health = Math.max(0, mob.health - exposureDamage);
          if (mob.health <= 0) { this.die(mob, "suffocation"); continue; }
        }
      }
      // Squid never generates light cells; the old land-mob light path is unchanged.
      const head = mob.kind === "squid" ? 0 : this.world.getLight(Math.floor(mob.position.x), Math.floor(mob.position.y + 1.6), Math.floor(mob.position.z));
      if (burnInDaylight(mob, skyOf(head), darken, dt)) {
        this.die(mob, "sunlight");
        continue;
      }
      const model = this.models.get(mob.id)!;
      model.position.set(mob.position.x, mob.position.y, mob.position.z);
      model.rotation.y = mob.yaw;
      if (mob.kind === "squid") animateSquidModel(model, mob, time);
      const speed = Math.hypot(mob.velocity.x, mob.velocity.z);
      const swing = Math.sin(time * 10 + mob.id) * Math.min(1, speed) * 0.7;
      const tint =
        mob.hurtTimer > 2.6
          ? new THREE.Color(1, 0.4, 0.4)
          : mob.burning
            ? new THREE.Color(1, 0.55 + 0.2 * Math.sin(time * 20), 0.2)
            : new THREE.Color(light, light, light);
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (o.userData.leg !== undefined) o.rotation.x = o.userData.leg === 0 ? swing : -swing;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            const material = m as THREE.MeshBasicMaterial;
            material.color.copy(tint);
            if (material.userData.baseColor) material.color.multiply(material.userData.baseColor);
          }
        }
      });
    }
  }

  /** Application mapping of packed block/sky light to the Spider brightness threshold.
   * Both chase planning and player damage use this same sample; native light calibration is open. */
  effectiveLight(mob: Mob, daylight: number): number {
    const p = mob.position;
    const packed = this.world.getLight(Math.floor(p.x), Math.floor(p.y + MOB_SPECS[mob.kind].height * .8), Math.floor(p.z));
    return Math.max(0, Math.min(15, Math.max(blockLightOf(packed), skyOf(packed) - skyDarken(daylight))));
  }

  /** Nearest mob hit by a ray within maxDistance. */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): { mob: Mob; distance: number } | null {
    let best: { mob: Mob; distance: number } | null = null;
    for (const mob of this.mobs) {
      const d = raycastMob(origin, dir, mob, maxDistance);
      if (d !== null && (!best || d < best.distance)) best = { mob, distance: d };
    }
    return best;
  }

  /** Exactly one world-owned loot batch per actual death; despawn/removal stays loot-free. */
  private die(mob: Mob, cause: MobDeathCause): boolean {
    if (!this.mobs.includes(mob) || this.ownershipBusy() || this.deathOwners.has(mob.id)) return false;
    this.deathOwners.add(mob.id);
    try {
      if (!this.onDeath(mob, cause)) { mob.health = 1; return false; }
      this.removeView(mob); return true;
    } finally { this.deathOwners.delete(mob.id); }
  }

  attack(mob: Mob, damage: number, fromYaw: number, cause: "player" | "agent" = "player"): boolean {
    // This must be before damageMob: a resolver/sink guard alone is too late to protect health.
    if (!this.mobs.includes(mob) || this.ownershipBusy() || this.deathOwners.has(mob.id)) return false;
    if (!damageMob(mob, damage, fromYaw)) return false;
    return this.die(mob, cause);
  }

  dispose(): void {
    this.unsubscribeBlock();
    for (const mob of [...this.mobs]) this.remove(mob);
  }

  animalCount(): number {
    return this.mobs.filter((m) => m.kind !== "npc" && m.kind !== "squid" && !MOB_SPECS[m.kind].hostile).length;
  }

  hostileCount(): number {
    return this.mobs.filter((m) => MOB_SPECS[m.kind].hostile).length;
  }

  squidCount(): number { return this.mobs.filter(m => m.kind === "squid").length; }

  /** Separate bounded loaded-ocean attempts; never places water or spends the land quota. */
  private spawnSquidNear(player: Vec3): void {
    for (let attempt = 0; attempt < 4 && this.squidCount() < MAX_SQUID && !this.idsExhausted; attempt++) {
      const angle = this.aquaticRand() * Math.PI * 2;
      const radius = 14 + this.aquaticRand() * 22;
      const x = Math.floor(player.x + Math.cos(angle) * radius);
      const z = Math.floor(player.z + Math.sin(angle) * radius);
      for (let y = SEA_LEVEL - 2; y >= SEA_LEVEL - 8; y--) {
        const at = { x: x + .5, y: y + .2, z: z + .5 };
        if (!isNaturalSquidSpawnEligible(this.world, at)) continue;
        // Avoid overlapping actors while keeping the existing single ID allocator.
        if (this.mobs.some(m => Math.hypot(m.position.x - at.x, m.position.y - at.y, m.position.z - at.z) < 1.5)) continue;
        this.spawn("squid", at, { yaw: this.aquaticRand() * Math.PI * 2 });
        break;
      }
    }
  }

  /** Natural hostile spawning: a few tries per tick on the surface and in caves (see canHostileSpawn). */
  private spawnHostileNear(player: Vec3, darken: number): void {
    if (this.nextId >= Number.MAX_SAFE_INTEGER) return;
    const get = (x: number, y: number, z: number) => this.world.getBlock(x, y, z);
    const light = (x: number, y: number, z: number) => this.world.getLight(x, y, z);
    for (let attempt = 0; attempt < 4 && this.hostileCount() < MAX_HOSTILES && this.nextId < Number.MAX_SAFE_INTEGER; attempt++) {
      const angle = this.rand() * Math.PI * 2;
      // Minecraft: no closer than 24 blocks to the player.
      const r = 24 + this.rand() * 20;
      const x = Math.floor(player.x + Math.cos(angle) * r);
      const z = Math.floor(player.z + Math.sin(angle) * r);
      if (!this.world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
      // Surface, or a random height below it (caves).
      const top = this.world.generator.heightAt(x, z) + 1;
      const y = this.rand() < 0.5 ? top : 2 + Math.floor(this.rand() * Math.max(1, Math.min(top, WORLD_HEIGHT - 3) - 2));
      if (!canHostileSpawn(get, light, x, y, z, darken, this.rand())) continue;
      const at = { x: x + 0.5, y: y + 0.01, z: z + 0.5 };
      if (boxCollides(get, bodyBox(at, MOB_SPECS.zombie.width, MOB_SPECS.zombie.height))) continue;
      this.spawn("zombie", at, { yaw: this.rand() * Math.PI * 2 });
    }
  }

  exportNpcs(): SavedNpc[] {
    return this.mobs
      .filter((m) => m.kind === "npc")
      .map((m) => ({ x: m.position.x, y: m.position.y, z: m.position.z, yaw: m.yaw, name: m.name ?? "NPC", dialogue: m.dialogue ?? "" }));
  }

  private spawnNear(player: Vec3): void {
    if (this.nextId >= Number.MAX_SAFE_INTEGER) return;
    if (this.animalCount() >= MAX_ANIMALS) return;
    const grass = blockId("grass");
    const angle = this.rand() * Math.PI * 2;
    const r = 14 + this.rand() * 22;
    const x = Math.floor(player.x + Math.cos(angle) * r);
    const z = Math.floor(player.z + Math.sin(angle) * r);
    const h = this.world.generator.heightAt(x, z);
    if (h <= SEA_LEVEL || this.world.getBlock(x, h, z) !== grass) return;
    if (this.world.getBlock(x, h + 1, z) !== 0 && this.world.getBlock(x, h + 1, z) !== blockId("tall_grass")) return;
    const kind = PASSIVE_MOBS[Math.floor(this.rand() * PASSIVE_MOBS.length)];
    const herd = 2 + Math.floor(this.rand() * 2);
    const spec = MOB_SPECS[kind];
    const get = (bx: number, by: number, bz: number) => this.world.getBlock(bx, by, bz);
    for (let i = 0; i < herd && this.animalCount() < MAX_ANIMALS && this.nextId < Number.MAX_SAFE_INTEGER; i++) {
      const at = { x: x + 0.5 + i * 0.7, y: h + 1.05, z: z + 0.5 };
      // Only spawn where the whole body fits (wide animals can overlap neighbouring columns).
      if (boxCollides(get, bodyBox(at, spec.width, spec.height))) continue;
      this.spawn(kind, at, { yaw: this.rand() * Math.PI * 2 });
    }
  }
}

/** Models own their generated textures/materials; repeated material-array references dispose once. */
function disposeModel(model: THREE.Object3D): void {
  const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        const map = (material as THREE.MeshBasicMaterial).map; if (map) textures.add(map);
      }
    }
  });
  for (const texture of textures) texture.dispose(); for (const material of materials) material.dispose();
}
