import { AIR, BLOCKS, blockId, isOpaque } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./chunk";
import type { World } from "./world";

/** Texture rectangle in GL UV space: [u0, vBottom, u1, vTop]. */
export type UvRect = readonly [number, number, number, number];
export type UvLookup = (tile: string) => UvRect;

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMesh {
  /** Opaque and alpha-cutout geometry (stone, leaves, glass, plants). */
  solid: MeshData;
  /** Translucent geometry (water). */
  liquid: MeshData;
}

class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  vertexCount(): number {
    return this.positions.length / 3;
  }

  build(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    };
  }
}

interface FaceDef {
  dir: readonly [number, number, number];
  /** Corners in CCW order seen from outside: bottom-left, bottom-right, top-right, top-left. */
  corners: ReadonlyArray<readonly [number, number, number]>;
  shade: number;
  key: "top" | "bottom" | "side";
}

// Minecraft-style directional shading.
const FACES: readonly FaceDef[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.6, key: "side" },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.6, key: "side" },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, key: "top" },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, key: "bottom" },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8, key: "side" },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8, key: "side" },
];

const AO_LEVELS = [1, 0.78, 0.62, 0.5];
const WATER = blockId("water");
const LIQUID_TOP = 0.875;
const PAD = CHUNK_SIZE + 2;

/**
 * Builds render geometry for one chunk. Faces between opaque blocks are culled and
 * vertices receive ambient-occlusion and directional shading in their colours.
 * Positions are chunk-local (0..16).
 */
export function meshChunk(world: World, cx: number, cz: number, uv: UvLookup): ChunkMesh {
  // Copy the chunk plus a one-block border from its neighbours into a padded array for fast lookups.
  const padded = new Uint8Array(PAD * PAD * WORLD_HEIGHT);
  const pidx = (x: number, y: number, z: number) => (y * PAD + (z + 1)) * PAD + (x + 1);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const chunk = world.getChunk(cx + dx, cz + dz);
      const xs = dx === -1 ? CHUNK_SIZE - 1 : 0;
      const xe = dx === 1 ? 1 : CHUNK_SIZE;
      const zs = dz === -1 ? CHUNK_SIZE - 1 : 0;
      const ze = dz === 1 ? 1 : CHUNK_SIZE;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let lz = zs; lz < ze; lz++) {
          for (let lx = xs; lx < xe; lx++) {
            padded[pidx(lx + dx * CHUNK_SIZE, y, lz + dz * CHUNK_SIZE)] = chunk.get(lx, y, lz);
          }
        }
      }
    }
  }
  const get = (x: number, y: number, z: number) => (y < 0 || y >= WORLD_HEIGHT ? AIR : padded[pidx(x, y, z)]);
  const opaque = (x: number, y: number, z: number) => isOpaque(get(x, y, z));

  const solid = new MeshBuilder();
  const liquid = new MeshBuilder();

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = get(x, y, z);
        if (id === AIR) continue;
        const def = BLOCKS[id];
        if (def.shape === "cross") {
          addCross(solid, x, y, z, uv(def.faces.side));
          continue;
        }
        const isLiquid = def.shape === "liquid";
        const builder = isLiquid ? liquid : solid;
        const bright = def.emissive === true;
        for (const face of FACES) {
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          const n = get(nx, ny, nz);
          if (isOpaque(n)) continue;
          if (n === id && def.transparent && !def.name.endsWith("leaves")) continue;
          if (isLiquid && n === WATER) continue;
          if (ny < 0) continue;
          const lowerTop = isLiquid && get(x, y + 1, z) !== WATER;
          addFace(builder, face, x, y, z, uv(def.faces[face.key]), bright ? null : opaque, lowerTop);
        }
      }
    }
  }
  return { solid: solid.build(), liquid: liquid.build() };
}

function addFace(
  b: MeshBuilder,
  face: FaceDef,
  x: number,
  y: number,
  z: number,
  rect: UvRect,
  opaque: ((x: number, y: number, z: number) => boolean) | null,
  lowerTop: boolean,
): void {
  const [u0, v0, u1, v1] = rect;
  const uvCorners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const [dx, dy, dz] = face.dir;
  const base = b.vertexCount();
  const ao: number[] = [];
  for (let i = 0; i < 4; i++) {
    const c = face.corners[i];
    let cy = c[1];
    if (lowerTop && cy === 1) cy = LIQUID_TOP;
    b.positions.push(x + c[0], y + cy, z + c[2]);
    b.normals.push(dx, dy, dz);
    let uvY = uvCorners[i][1];
    if (lowerTop && face.key === "side" && c[1] === 1) uvY = v0 + (v1 - v0) * LIQUID_TOP;
    b.uvs.push(uvCorners[i][0], uvY);
    const level = opaque ? vertexAo(opaque, face, x, y, z, c) : 0;
    ao.push(level);
    const shade = (opaque ? face.shade : 1) * AO_LEVELS[level];
    b.colors.push(shade, shade, shade);
  }
  // Flip the quad diagonal so AO gradients interpolate without artefacts.
  if (ao[0] + ao[2] > ao[1] + ao[3]) {
    b.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  } else {
    b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function vertexAo(
  opaque: (x: number, y: number, z: number) => boolean,
  face: FaceDef,
  x: number,
  y: number,
  z: number,
  corner: readonly [number, number, number],
): number {
  const axis = face.dir[0] !== 0 ? 0 : face.dir[1] !== 0 ? 1 : 2;
  const t1 = (axis + 1) % 3;
  const t2 = (axis + 2) % 3;
  const base = [x + face.dir[0], y + face.dir[1], z + face.dir[2]];
  const o1 = [0, 0, 0];
  const o2 = [0, 0, 0];
  o1[t1] = corner[t1] * 2 - 1;
  o2[t2] = corner[t2] * 2 - 1;
  const side1 = opaque(base[0] + o1[0], base[1] + o1[1], base[2] + o1[2]);
  const side2 = opaque(base[0] + o2[0], base[1] + o2[1], base[2] + o2[2]);
  if (side1 && side2) return 3;
  const cornerBlock = opaque(base[0] + o1[0] + o2[0], base[1] + o1[1] + o2[1], base[2] + o1[2] + o2[2]);
  return (side1 ? 1 : 0) + (side2 ? 1 : 0) + (cornerBlock ? 1 : 0);
}

function addCross(b: MeshBuilder, x: number, y: number, z: number, rect: UvRect): void {
  const [u0, v0, u1, v1] = rect;
  const inset = 0.15;
  const quads: Array<[number, number, number, number]> = [
    [inset, inset, 1 - inset, 1 - inset],
    [1 - inset, inset, inset, 1 - inset],
  ];
  for (const [ax, az, bx, bz] of quads) {
    // Emit both windings so plants are visible from every side with back-face culling on.
    for (const flip of [false, true]) {
      const base = b.vertexCount();
      const pts: Array<[number, number, number, number, number]> = [
        [ax, 0, az, u0, v0],
        [bx, 0, bz, u1, v0],
        [bx, 1, bz, u1, v1],
        [ax, 1, az, u0, v1],
      ];
      const nx = -(bz - az) * (flip ? -1 : 1);
      const nz = (bx - ax) * (flip ? -1 : 1);
      for (const [px, py, pz, u, v] of pts) {
        b.positions.push(x + px, y + py, z + pz);
        b.normals.push(nx, 0, nz);
        b.uvs.push(u, v);
        b.colors.push(0.9, 0.9, 0.9);
      }
      if (flip) b.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
}
