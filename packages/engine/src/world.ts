import { AIR, BLOCKS, isOpaque } from "./blocks";
import { MAX_LIGHT, emission, relightBlock, spread, type LightAccess } from "./light";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT, chunkKey, toChunkCoord, toLocalCoord } from "./chunk";
import { TerrainGenerator } from "./generator";

export type BlockEdit = [x: number, y: number, z: number, id: number];
export type ChunkListener = (cx: number, cz: number) => void;
export type BlockListener = (x: number, y: number, z: number, id: number) => void;

/**
 * Infinite world made of lazily generated chunks. Player edits are tracked separately
 * so a world can be saved as (seed, edits) and regenerated deterministically.
 */
export class World {
  readonly generator: TerrainGenerator;
  private readonly chunks = new Map<string, Chunk>();
  private readonly edits = new Map<string, Map<number, number>>();
  private readonly listeners = new Set<ChunkListener>();
  private readonly blockListeners = new Set<BlockListener>();
  /** Chunks whose light changed during the current update (to re-mesh them). */
  private readonly lightTouched = new Set<string>();
  private lastPeek: Chunk | undefined;

  /** Light accessors over loaded chunks only (never generates terrain). */
  private readonly lightAccess: LightAccess = {
    get: (x, y, z) => {
      const c = this.peek(x, z);
      return c ? c.light[Chunk.index(toLocalCoord(x), y, toLocalCoord(z))] : -1;
    },
    set: (x, y, z, packed) => {
      const c = this.peek(x, z);
      if (!c) return;
      c.light[Chunk.index(toLocalCoord(x), y, toLocalCoord(z))] = packed;
      this.lightTouched.add(chunkKey(c.cx, c.cz));
    },
    block: (x, y, z) => this.peek(x, z)?.get(toLocalCoord(x), y, toLocalCoord(z)) ?? AIR,
  };

  constructor(readonly seed: number) {
    this.generator = new TerrainGenerator(seed);
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generator.generate(cx, cz);
      const chunkEdits = this.edits.get(key);
      if (chunkEdits) for (const [index, id] of chunkEdits) chunk.blocks[index] = id;
      this.chunks.set(key, chunk);
      this.lightChunk(chunk);
    }
    return chunk;
  }

  /** Loaded chunk containing world column (x, z), without generating it. */
  private peek(x: number, z: number): Chunk | undefined {
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const last = this.lastPeek;
    if (last && last.cx === cx && last.cz === cz) return last;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) this.lastPeek = c;
    return c;
  }

  /**
   * Packed light at a block: sky light (0-15) in the high nibble, block light in the low nibble.
   * Above the world (or in unloaded chunks) it is full sky light.
   */
  getLight(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return MAX_LIGHT << 4;
    if (y < 0) return 0;
    const c = this.peek(Math.floor(x), Math.floor(z));
    if (!c) return MAX_LIGHT << 4;
    return c.light[Chunk.index(toLocalCoord(x), Math.floor(y), toLocalCoord(z))];
  }

  /** Initial light for a freshly generated chunk: sky columns, emitters, then flood fill (incl. into loaded neighbours). */
  private lightChunk(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const sky: number[] = [];
    const block: number[] = [];
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let y = WORLD_HEIGHT - 1;
        for (; y >= 0; y--) {
          if (isOpaque(chunk.blocks[Chunk.index(lx, y, lz)])) break;
          chunk.light[Chunk.index(lx, y, lz)] = MAX_LIGHT << 4;
        }
        heights[lz * CHUNK_SIZE + lx] = y + 1;
      }
    }
    for (let i = 0; i < chunk.blocks.length; i++) {
      const e = emission(chunk.blocks[i]);
      if (e === 0) continue;
      chunk.light[i] = (chunk.light[i] & 0xf0) | e;
      const lx = i % CHUNK_SIZE;
      const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
      block.push(x0 + lx, Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE)), z0 + lz);
    }
    // Sky-lit cells next to a shaded column spread sideways (under overhangs, into caves).
    const h = (lx: number, lz: number) =>
      lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE ? -1 : heights[lz * CHUNK_SIZE + lx];
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const own = h(lx, lz);
        const top = Math.max(h(lx + 1, lz), h(lx - 1, lz), h(lx, lz + 1), h(lx, lz - 1));
        for (let y = own; y < top; y++) sky.push(x0 + lx, y, z0 + lz);
      }
    }
    // Pull light in from loaded neighbours' border cells.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = this.chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz));
      if (!n) continue;
      const lx = dx === 1 ? 0 : dx === -1 ? CHUNK_SIZE - 1 : -1;
      const lz = dz === 1 ? 0 : dz === -1 ? CHUNK_SIZE - 1 : -1;
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const nx = lx >= 0 ? lx : i;
        const nz = lz >= 0 ? lz : i;
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const p = n.light[Chunk.index(nx, y, nz)];
          if (p === 0) continue;
          const wx = n.cx * CHUNK_SIZE + nx;
          const wz = n.cz * CHUNK_SIZE + nz;
          if (p >> 4 > 1) sky.push(wx, y, wz);
          if ((p & 15) > 1) block.push(wx, y, wz);
        }
      }
    }
    this.lightTouched.clear();
    spread(this.lightAccess, sky, "sky");
    spread(this.lightAccess, block, "block");
    const own = chunkKey(chunk.cx, chunk.cz);
    for (const key of this.lightTouched) {
      if (key === own) continue;
      const [cx, cz] = key.split(",").map(Number);
      this.emit(cx, cz);
    }
    this.lightTouched.clear();
  }

  /** Drops a chunk from memory; edits are kept and re-applied when it is regenerated. */
  unloadChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
  }

  loadedChunkCount(): number {
    return this.chunks.size;
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const chunk = this.getChunk(toChunkCoord(x), toChunkCoord(z));
    return chunk.get(toLocalCoord(x), Math.floor(y), toLocalCoord(z));
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const lx = toLocalCoord(x);
    const lz = toLocalCoord(z);
    const chunk = this.getChunk(cx, cz);
    if (chunk.get(lx, y, lz) === id) return;
    chunk.set(lx, y, lz, id);

    const key = chunkKey(cx, cz);
    let chunkEdits = this.edits.get(key);
    if (!chunkEdits) this.edits.set(key, (chunkEdits = new Map()));
    chunkEdits.set(Chunk.index(lx, y, lz), id);

    this.lightTouched.clear();
    relightBlock(this.lightAccess, x, y, z);
    for (const touched of this.lightTouched) {
      if (touched === key) continue;
      const [tx, tz] = touched.split(",").map(Number);
      this.emit(tx, tz);
    }
    this.lightTouched.clear();
    for (const l of this.blockListeners) l(x, y, z, id);

    this.emit(cx, cz);
    if (lx === 0) this.emit(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.emit(cx + 1, cz);
    if (lz === 0) this.emit(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.emit(cx, cz + 1);
  }

  /** Subscribes to individual block changes (after light is updated). */
  onBlockChanged(listener: BlockListener): () => void {
    this.blockListeners.add(listener);
    return () => this.blockListeners.delete(listener);
  }

  /** Subscribes to chunk changes (including neighbours whose faces may change). */
  onChunkChanged(listener: ChunkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** All player edits as world coordinates. */
  exportEdits(): BlockEdit[] {
    const out: BlockEdit[] = [];
    for (const [key, chunkEdits] of this.edits) {
      const [cx, cz] = key.split(",").map(Number);
      for (const [index, id] of chunkEdits) {
        const lx = index % CHUNK_SIZE;
        const lz = Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
        const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        out.push([cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz, id]);
      }
    }
    return out;
  }

  importEdits(edits: readonly BlockEdit[]): void {
    for (const [x, y, z, id] of edits) this.setBlock(x, y, z, id);
  }

  /** Y of the highest solid, non-plant block in a column, or -1. */
  surfaceY(x: number, z: number, isGround: (id: number) => boolean): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (isGround(this.getBlock(x, y, z))) return y;
    }
    return -1;
  }

  private emit(cx: number, cz: number): void {
    for (const l of this.listeners) l(cx, cz);
  }
}
