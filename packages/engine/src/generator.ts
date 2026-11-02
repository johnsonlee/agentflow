import { blockId } from "./blocks";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from "./chunk";
import { SimplexNoise } from "./noise";
import { hash3 } from "./random";

export const SEA_LEVEL = 30;
const SNOW_LINE = 60;

const B = {
  grass: blockId("grass"),
  dirt: blockId("dirt"),
  stone: blockId("stone"),
  sand: blockId("sand"),
  gravel: blockId("gravel"),
  water: blockId("water"),
  bedrock: blockId("bedrock"),
  coal: blockId("coal_ore"),
  iron: blockId("iron_ore"),
  gold: blockId("gold_ore"),
  diamond: blockId("diamond_ore"),
  redstone: blockId("redstone_ore"),
  oakLog: blockId("oak_log"),
  oakLeaves: blockId("oak_leaves"),
  birchLog: blockId("birch_log"),
  birchLeaves: blockId("birch_leaves"),
  snowyGrass: blockId("snowy_grass"),
  dandelion: blockId("dandelion"),
  poppy: blockId("poppy"),
  tallGrass: blockId("tall_grass"),
};

export type Biome = "plains" | "forest" | "desert" | "snowy" | "ocean";

/** Deterministic terrain generator: same seed and coordinates always give the same blocks. */
export class TerrainGenerator {
  private readonly heightNoise: SimplexNoise;
  private readonly mountainNoise: SimplexNoise;
  private readonly climateNoise: SimplexNoise;
  private readonly forestNoise: SimplexNoise;

  constructor(readonly seed: number) {
    this.heightNoise = new SimplexNoise(seed);
    this.mountainNoise = new SimplexNoise(seed ^ 0x5bd1e995);
    this.climateNoise = new SimplexNoise(seed ^ 0x1b873593);
    this.forestNoise = new SimplexNoise(seed ^ 0x68e31da4);
  }

  /** Height of the topmost terrain block (excluding water and plants) at a column. */
  heightAt(x: number, z: number): number {
    const base = this.heightNoise.fbm2(x / 160, z / 160, 4);
    const ridge = Math.max(0, this.mountainNoise.fbm2(x / 320, z / 320, 3) - 0.1);
    const h = SEA_LEVEL + 2 + base * 12 + ridge * ridge * 70;
    return Math.max(4, Math.min(WORLD_HEIGHT - 16, Math.floor(h)));
  }

  biomeAt(x: number, z: number, height = this.heightAt(x, z)): Biome {
    if (height < SEA_LEVEL - 1) return "ocean";
    const temperature = this.climateNoise.fbm2(x / 400, z / 400, 2);
    if (temperature < -0.35 || height >= SNOW_LINE) return "snowy";
    if (temperature > 0.4) return "desert";
    return this.forestNoise.fbm2(x / 120, z / 120, 2) > 0.1 ? "forest" : "plains";
  }

  generate(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const h = this.heightAt(x, z);
        const biome = this.biomeAt(x, z, h);
        const beach = h <= SEA_LEVEL + 1 && biome !== "snowy";
        let top: number;
        let filler: number;
        if (biome === "ocean") {
          top = h < SEA_LEVEL - 6 ? B.gravel : B.sand;
          filler = top;
        } else if (biome === "desert" || beach) {
          top = B.sand;
          filler = B.sand;
        } else if (biome === "snowy") {
          top = B.snowyGrass;
          filler = B.dirt;
        } else {
          top = B.grass;
          filler = B.dirt;
        }

        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === 0 || (y <= 2 && hash3(this.seed, x, y, z) < 0.5)) id = B.bedrock;
          else if (y === h) id = top;
          else if (y >= h - 3) id = filler;
          else id = this.oreAt(x, y, z);
          chunk.set(lx, y, lz, id);
        }
        for (let y = h + 1; y <= SEA_LEVEL; y++) chunk.set(lx, y, lz, B.water);

        if (top === B.grass && h > SEA_LEVEL) {
          const r = hash3(this.seed, x, 1000, z);
          if (r < 0.08) chunk.set(lx, h + 1, lz, B.tallGrass);
          else if (r < 0.09) chunk.set(lx, h + 1, lz, B.dandelion);
          else if (r < 0.1) chunk.set(lx, h + 1, lz, B.poppy);
        }
      }
    }

    // Trees may overhang chunk borders, so consider trunks in a margin around this chunk.
    const margin = 2;
    for (let z = z0 - margin; z < z0 + CHUNK_SIZE + margin; z++) {
      for (let x = x0 - margin; x < x0 + CHUNK_SIZE + margin; x++) {
        this.maybeTree(chunk, x, z);
      }
    }
    return chunk;
  }

  private oreAt(x: number, y: number, z: number): number {
    const r = hash3(this.seed ^ 0x2f, x, y, z);
    if (y < 14 && r < 0.0015) return B.diamond;
    if (y < 28 && r < 0.004) return B.gold;
    if (y < 48 && r < 0.011) return B.iron;
    if (r < 0.022) return B.coal;
    // Redstone ore (deep, like Minecraft's); a separate hash, so the other ores are unchanged.
    if (y < 16 && hash3(this.seed ^ 0x3d, x, y, z) < 0.008) return B.redstone;
    return B.stone;
  }

  private maybeTree(chunk: Chunk, x: number, z: number): void {
    const h = this.heightAt(x, z);
    if (h <= SEA_LEVEL) return;
    const biome = this.biomeAt(x, z, h);
    const chance = biome === "forest" ? 0.04 : biome === "plains" ? 0.006 : biome === "snowy" ? 0.008 : 0;
    if (hash3(this.seed, x, 2000, z) >= chance) return;
    // Keep trees from touching each other.
    if (hash3(this.seed, x + 1, 2000, z) < chance || hash3(this.seed, x, 2000, z + 1) < chance) return;

    const birch = biome !== "snowy" && hash3(this.seed, x, 3000, z) < 0.3;
    const log = birch ? B.birchLog : B.oakLog;
    const leaves = birch ? B.birchLeaves : B.oakLeaves;
    const trunk = 4 + Math.floor(hash3(this.seed, x, 4000, z) * 3);
    const topY = h + trunk;

    const put = (bx: number, by: number, bz: number, id: number, replace: boolean) => {
      const lx = bx - chunk.cx * CHUNK_SIZE;
      const lz = bz - chunk.cz * CHUNK_SIZE;
      if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
      if (by < 0 || by >= WORLD_HEIGHT) return;
      const current = chunk.get(lx, by, lz);
      if (replace || current === 0 || current === B.tallGrass) chunk.set(lx, by, lz, id);
    };

    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy <= -1 ? 2 : 1;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (corner && (dy === 1 || hash3(this.seed, x + dx, topY + dy, z + dz) < 0.5)) continue;
          put(x + dx, topY + dy, z + dz, leaves, false);
        }
      }
    }
    put(x, h, z, B.dirt, true);
    for (let y = h + 1; y <= topY - 1; y++) put(x, y, z, log, true);
  }
}
