import { AIR } from "./blocks";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT, chunkKey, toChunkCoord, toLocalCoord } from "./chunk";
import { TerrainGenerator } from "./generator";

export type BlockEdit = [x: number, y: number, z: number, id: number];
export type ChunkListener = (cx: number, cz: number) => void;

/**
 * Infinite world made of lazily generated chunks. Player edits are tracked separately
 * so a world can be saved as (seed, edits) and regenerated deterministically.
 */
export class World {
  readonly generator: TerrainGenerator;
  private readonly chunks = new Map<string, Chunk>();
  private readonly edits = new Map<string, Map<number, number>>();
  private readonly listeners = new Set<ChunkListener>();

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
    }
    return chunk;
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

    this.emit(cx, cz);
    if (lx === 0) this.emit(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.emit(cx + 1, cz);
    if (lz === 0) this.emit(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.emit(cx, cz + 1);
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
