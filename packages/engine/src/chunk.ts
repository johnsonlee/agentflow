import { AIR } from "./blocks";

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;

/** A vertical column of CHUNK_SIZE x WORLD_HEIGHT x CHUNK_SIZE blocks. */
export class Chunk {
  readonly blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  /** Packed light per block: sky light in the high nibble, block light in the low nibble. */
  readonly light = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {}

  static index(x: number, y: number, z: number): number {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    return this.blocks[Chunk.index(x, y, z)];
  }

  set(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[Chunk.index(x, y, z)] = id;
  }
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function toChunkCoord(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

export function toLocalCoord(v: number): number {
  return ((Math.floor(v) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}
