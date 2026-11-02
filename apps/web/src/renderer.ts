import * as THREE from "three";
import { CHUNK_SIZE, meshChunk, toChunkCoord, type MeshData, type SkyState, type UvLookup, type World } from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";

interface ChunkEntry {
  solid: THREE.Mesh | null;
  liquid: THREE.Mesh | null;
}

const CLOUD_HEIGHT = 110;

/** Three.js view of the world: chunk meshes, sky, sun/moon, clouds and block selection. */
export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
  renderDistance = 6;

  private readonly solidMaterial: THREE.MeshBasicMaterial;
  private readonly liquidMaterial: THREE.MeshBasicMaterial;
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly dirty = new Set<string>();
  /** Sky-light multiplier for the chunk shader (1 at noon, 0.2 at night). */
  private readonly daylight = { value: 1 };
  private readonly uv: UvLookup;
  private readonly selection: THREE.LineSegments;
  private readonly crack: THREE.Mesh;
  private readonly crackTextures: THREE.Texture[];
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly clouds: THREE.Mesh;
  private readonly fog: THREE.Fog;
  private readonly skyColor = new THREE.Color();
  private cloudOffset = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    atlas: TextureAtlas,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.rotation.order = "YXZ";

    const texture = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    this.uv = (name) => atlas.uv(name);

    this.solidMaterial = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, alphaTest: 0.5 });
    this.liquidMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Vertex colours carry (shade x AO, sky light, block light); combine them with the time of day.
    for (const m of [this.solidMaterial, this.liquidMaterial]) {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uDaylight = this.daylight;
        shader.fragmentShader = `uniform float uDaylight;\n${shader.fragmentShader}`.replace(
          "#include <color_fragment>",
          `#ifdef USE_COLOR
            float lightLevel = max(vColor.g * uDaylight, vColor.b);
            float dark = 1.0 - lightLevel;
            // Minecraft-like brightness curve, with a little ambient light so caves aren't pitch black.
            diffuseColor.rgb *= vColor.r * mix(0.05, 1.0, (1.0 - dark) / (dark * 3.0 + 1.0));
          #endif`,
        );
      };
    }

    this.fog = new THREE.Fog(0x88aaff, 20, 100);
    this.scene.fog = this.fog;

    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
    );
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.crackTextures = Array.from({ length: 10 }, (_, i) => crackTexture(i));
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: this.crackTextures[0], fog: false }),
    );
    this.crack.visible = false;
    this.scene.add(this.crack);

    this.sun = celestial(0xfff6c0, 60);
    this.moon = celestial(0xdfe6ff, 40);
    this.scene.add(this.sun, this.moon);

    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(1024, 1024),
      new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.scene.add(this.clouds);

    world.onChunkChanged((cx, cz) => {
      const key = `${cx},${cz}`;
      if (this.chunks.has(key)) this.dirty.add(key);
    });
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Loads/meshes chunks near the camera within a time budget and drops far ones. */
  updateChunks(budgetMs = 8): void {
    const pcx = toChunkCoord(this.camera.position.x);
    const pcz = toChunkCoord(this.camera.position.z);
    const r = this.renderDistance;
    const start = performance.now();

    // Edits first, so placing and breaking blocks feels instant.
    for (const key of this.dirty) {
      this.dirty.delete(key);
      const [cx, cz] = key.split(",").map(Number);
      this.buildChunk(cx, cz);
    }

    const wanted: Array<[number, number, number]> = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dz * dz;
        if (d > r * r + 1) continue;
        if (!this.chunks.has(`${pcx + dx},${pcz + dz}`)) wanted.push([pcx + dx, pcz + dz, d]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of wanted) {
      if (performance.now() - start > budgetMs) break;
      this.buildChunk(cx, cz);
    }

    const limit = (r + 2) * (r + 2) + 1;
    for (const [key, entry] of this.chunks) {
      const [cx, cz] = key.split(",").map(Number);
      const d = (cx - pcx) ** 2 + (cz - pcz) ** 2;
      if (d > limit) {
        this.disposeEntry(entry);
        this.chunks.delete(key);
      }
    }
    // Keep a margin of generated-but-unmeshed chunks (needed for face culling), unload beyond it.
    if (this.world.loadedChunkCount() > (2 * r + 7) ** 2) {
      for (let dz = -(r + 8); dz <= r + 8; dz++) {
        for (let dx = -(r + 8); dx <= r + 8; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) > r + 3) this.world.unloadChunk(pcx + dx, pcz + dz);
        }
      }
    }
  }

  meshedChunkCount(): number {
    return this.chunks.size;
  }

  /** True once every chunk within `radius` of the camera has been meshed. */
  isAreaReady(radius = 2): boolean {
    const pcx = toChunkCoord(this.camera.position.x);
    const pcz = toChunkCoord(this.camera.position.z);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) if (!this.chunks.has(`${pcx + dx},${pcz + dz}`)) return false;
    }
    return true;
  }

  setSelection(block: { x: number; y: number; z: number } | null, breakProgress = 0): void {
    this.selection.visible = block !== null;
    this.crack.visible = block !== null && breakProgress > 0;
    if (!block) return;
    this.selection.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    this.crack.position.copy(this.selection.position);
    if (breakProgress > 0) {
      const stage = Math.min(9, Math.floor(breakProgress * 10));
      (this.crack.material as THREE.MeshBasicMaterial).map = this.crackTextures[stage];
    }
  }

  render(sky: SkyState, underwater: boolean, dt: number): void {
    this.skyColor.setRGB(sky.sky[0], sky.sky[1], sky.sky[2], THREE.SRGBColorSpace);
    const far = this.renderDistance * CHUNK_SIZE;
    if (underwater) {
      this.fog.color.setRGB(0.05, 0.15, 0.45, THREE.SRGBColorSpace);
      this.fog.near = 1;
      this.fog.far = 24;
      this.scene.background = this.fog.color;
    } else {
      this.fog.color.copy(this.skyColor);
      this.fog.near = far * 0.55;
      this.fog.far = far * 0.95;
      this.scene.background = this.skyColor;
    }
    this.camera.far = far * 3;
    this.camera.updateProjectionMatrix();

    this.daylight.value = sky.light;

    const cam = this.camera.position;
    const dist = 400;
    const sx = Math.cos(sky.sunAngle);
    const sy = Math.sin(sky.sunAngle);
    this.sun.position.set(cam.x + sx * dist, cam.y + sy * dist, cam.z);
    this.moon.position.set(cam.x - sx * dist, cam.y - sy * dist, cam.z);
    this.sun.lookAt(cam);
    this.moon.lookAt(cam);

    this.cloudOffset = (this.cloudOffset + dt * 1.5) % 1024;
    this.clouds.position.set(Math.round(cam.x / 64) * 64 + this.cloudOffset - 512, CLOUD_HEIGHT, Math.round(cam.z / 64) * 64);
    (this.clouds.material as THREE.MeshBasicMaterial).color.setScalar(Math.max(0.3, sky.light));

    this.renderer.render(this.scene, this.camera);
  }

  private buildChunk(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const previous = this.chunks.get(key);
    if (previous) this.disposeEntry(previous);
    const mesh = meshChunk(this.world, cx, cz, this.uv);
    const entry: ChunkEntry = {
      solid: this.toMesh(mesh.solid, this.solidMaterial, cx, cz),
      liquid: this.toMesh(mesh.liquid, this.liquidMaterial, cx, cz),
    };
    if (entry.liquid) entry.liquid.renderOrder = 1;
    this.chunks.set(key, entry);
  }

  private toMesh(data: MeshData, material: THREE.Material, cx: number, cz: number): THREE.Mesh | null {
    if (data.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    return mesh;
  }

  private disposeEntry(entry: ChunkEntry): void {
    for (const mesh of [entry.solid, entry.liquid]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
  }
}

function celestial(color: number, size: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }),
  );
}

/** Blocky Minecraft-style cloud layer from thresholded random cells. */
function cloudTexture(): THREE.Texture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cells = new Float32Array(size * size).map(() => rand());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Blur neighbouring cells so clouds clump together.
      let sum = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) sum += cells[((y + oy + size) % size) * size + ((x + ox + size) % size)];
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = sum / 25 > 0.56 ? 230 : 0;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  return tex;
}

/** Block-breaking crack overlay for a given stage (0-9). */
function crackTexture(stage: number): THREE.Texture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  let seed = 99;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const lines = 2 + stage * 2;
  for (let l = 0; l < lines; l++) {
    let x = 8;
    let y = 8;
    const len = 3 + Math.floor(stage * 0.8);
    const angle = rand() * Math.PI * 2;
    for (let s = 0; s < len; s++) {
      x += Math.round(Math.cos(angle) + (rand() - 0.5));
      y += Math.round(Math.sin(angle) + (rand() - 0.5));
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      const i = (y * size + x) * 4;
      data[i + 3] = 200;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
