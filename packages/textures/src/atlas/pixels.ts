export const TILE_SIZE = 16;

export type Rgb = readonly [number, number, number];

/** A 16x16 RGBA pixel canvas with a deterministic random source. */
export class Tile {
  readonly data = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
  private state: number;

  constructor(seedText: string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 0x01000193);
    this.state = h >>> 0;
  }

  /** Deterministic random number in [0, 1). */
  rand(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)];
  }

  set(x: number, y: number, c: Rgb, a = 255): void {
    if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
    const i = (y * TILE_SIZE + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  get(x: number, y: number): [number, number, number, number] {
    const i = (y * TILE_SIZE + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(fn: (x: number, y: number) => Rgb | null, alpha = 255): this {
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const c = fn(x, y);
        if (c) this.set(x, y, c, alpha);
        else this.set(x, y, [0, 0, 0], 0);
      }
    }
    return this;
  }

  /** Fills with randomly chosen palette entries (weighted towards the first). */
  noise(palette: readonly Rgb[], bias = 1.6): this {
    return this.fill(() => palette[Math.min(palette.length - 1, Math.floor(Math.pow(this.rand(), bias) * palette.length))]);
  }

  copyFrom(other: Tile): this {
    this.data.set(other.data);
    return this;
  }
}

export function hex(value: string): Rgb {
  const n = Number.parseInt(value.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(c: Rgb, factor: number): Rgb {
  return [Math.round(c[0] * factor), Math.round(c[1] * factor), Math.round(c[2] * factor)];
}
