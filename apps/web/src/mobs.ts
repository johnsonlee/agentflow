import * as THREE from "three";
import {
  MOB_SPECS, PASSIVE_MOBS, SEA_LEVEL, blockId, bodyBox, boxCollides, createMob, damageMob, raycastMob, stackId, stepMob,
  type Mob, type MobKind, type Vec3, type World,
} from "@craft/engine";

interface Part {
  size: [number, number, number];
  /** Centre position relative to the mob's feet, model facing -Z. */
  at: [number, number, number];
  color: string;
  /** Leg index for walk animation (pivot at the top of the part). */
  leg?: number;
  face?: "pig" | "sheep" | "chicken" | "npc";
}

const MODELS: Record<MobKind, Part[]> = {
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
const DESPAWN_DISTANCE = 96;

/** Simulates and renders animals and NPCs. */
export class MobManager {
  readonly mobs: Mob[] = [];
  private readonly models = new Map<number, THREE.Group>();
  private nextId = 1;
  /** Minecraft's doMobSpawning game rule: natural animal spawning (summoning always works). */
  spawning = true;
  private spawnTimer = 0;
  private seed = 12345;
  private readonly rand = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);

  constructor(
    private readonly world: World,
    private readonly scene: THREE.Scene,
  ) {}

  spawn(kind: MobKind, position: Vec3, extra: { name?: string; dialogue?: string; yaw?: number } = {}): Mob {
    const mob = createMob(this.nextId++, kind, position, extra);
    this.mobs.push(mob);
    const model = buildModel(mob);
    this.models.set(mob.id, model);
    this.scene.add(model);
    return mob;
  }

  remove(mob: Mob): void {
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.mobs.splice(i, 1);
    const model = this.models.get(mob.id);
    if (model) {
      this.scene.remove(model);
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.models.delete(mob.id);
    }
  }

  /** Rebuilds an NPC's model after its name changes. */
  refresh(mob: Mob): void {
    const old = this.models.get(mob.id);
    if (old) this.scene.remove(old);
    const model = buildModel(mob);
    this.models.set(mob.id, model);
    this.scene.add(model);
  }

  update(dt: number, player: Vec3, light: number, time: number): void {
    const get = (x: number, y: number, z: number) => this.world.getBlock(x, y, z);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      if (this.spawning) this.spawnNear(player);
    }
    for (const mob of [...this.mobs]) {
      const dist = Math.hypot(mob.position.x - player.x, mob.position.z - player.z);
      if (mob.kind !== "npc" && dist > DESPAWN_DISTANCE) {
        this.remove(mob);
        continue;
      }
      if (mob.position.y < -10) {
        this.remove(mob);
        continue;
      }
      // Only simulate mobs in loaded terrain near the player.
      if (dist < 64) stepMob(get, mob, dt, this.rand);
      const model = this.models.get(mob.id)!;
      model.position.set(mob.position.x, mob.position.y, mob.position.z);
      model.rotation.y = mob.yaw;
      const speed = Math.hypot(mob.velocity.x, mob.velocity.z);
      const swing = Math.sin(time * 10 + mob.id) * Math.min(1, speed) * 0.7;
      const tint = mob.hurtTimer > 2.6 ? new THREE.Color(1, 0.4, 0.4) : new THREE.Color(light, light, light);
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (o.userData.leg !== undefined) o.rotation.x = o.userData.leg === 0 ? swing : -swing;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) (m as THREE.MeshBasicMaterial).color.copy(tint);
        }
      });
    }
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

  /** Hits a mob; returns the block id it drops if it died, else null. */
  attack(mob: Mob, damage: number, fromYaw: number): number | null | undefined {
    if (!damageMob(mob, damage, fromYaw)) return undefined;
    this.remove(mob);
    const drop = MOB_SPECS[mob.kind].drop;
    return drop ? stackId(drop[0]) : null;
  }

  animalCount(): number {
    return this.mobs.filter((m) => m.kind !== "npc").length;
  }

  exportNpcs(): SavedNpc[] {
    return this.mobs
      .filter((m) => m.kind === "npc")
      .map((m) => ({ x: m.position.x, y: m.position.y, z: m.position.z, yaw: m.yaw, name: m.name ?? "NPC", dialogue: m.dialogue ?? "" }));
  }

  private spawnNear(player: Vec3): void {
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
    for (let i = 0; i < herd && this.animalCount() < MAX_ANIMALS; i++) {
      const at = { x: x + 0.5 + i * 0.7, y: h + 1.05, z: z + 0.5 };
      // Only spawn where the whole body fits (wide animals can overlap neighbouring columns).
      if (boxCollides(get, bodyBox(at, spec.width, spec.height))) continue;
      this.spawn(kind, at, { yaw: this.rand() * Math.PI * 2 });
    }
  }
}
