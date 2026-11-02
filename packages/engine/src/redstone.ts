/**
 * Redstone basics: dust carrying power 0-15 (minus 1 per dust step), levers, buttons, pressure
 * plates, redstone torches (inverted by a powered attached block), lamps, repeaters (1-4 tick
 * delay, one direction) and doors. Component states are block ids, so they save with the world;
 * pending ticks are saved separately. Work is bounded per tick, and the order is deterministic.
 */
import { FACING_VECTORS, blockId, isOpaque } from "./blocks";
import { WORLD_HEIGHT } from "./chunk";
import type { BlockEdit, World } from "./world";

/** Seconds per redstone tick (Minecraft: 0.1 s). */
export const REDSTONE_TICK = 0.1;
/** Most dirty cells examined per tick; the rest wait for the next tick. */
export const MAX_DIRTY_PER_TICK = 512;
/** Most dust cells in one network recomputation. */
export const MAX_NETWORK = 4096;
/** Most scheduled updates run per tick. */
export const MAX_SCHEDULED_PER_TICK = 1024;
/** Ticks a stone button stays pressed (Minecraft: 1 s). */
export const BUTTON_TICKS = 10;

type Info =
  | { kind: "dust"; level: number }
  | { kind: "lever" | "button" | "plate" | "torch" | "lamp"; on: boolean }
  | { kind: "repeater"; facing: number; delay: number; on: boolean }
  | { kind: "door"; material: "wooden" | "iron"; upper: boolean; facing: number; open: boolean };

const INFO = new Map<number, Info>();
const DUST: number[] = [];
for (let p = 0; p <= 15; p++) {
  DUST[p] = blockId(`redstone_wire_${p}`);
  INFO.set(DUST[p], { kind: "dust", level: p });
}
const PAIRS = [
  ["lever", "lever", "lever_on"],
  ["button", "stone_button", "stone_button_on"],
  ["plate", "stone_pressure_plate", "stone_pressure_plate_on"],
  ["torch", "redstone_torch_off", "redstone_torch"],
  ["lamp", "redstone_lamp", "redstone_lamp_on"],
] as const;
const OFF_ID = new Map<string, number>();
const ON_ID = new Map<string, number>();
for (const [kind, off, on] of PAIRS) {
  INFO.set(blockId(off), { kind, on: false });
  INFO.set(blockId(on), { kind, on: true });
  OFF_ID.set(kind, blockId(off));
  ON_ID.set(kind, blockId(on));
}
const REPEATER_ITEM = blockId("repeater");
const repeaterId = (facing: number, delay: number, on: boolean) => blockId(`repeater_${facing}_${delay}_${on ? 1 : 0}`);
for (let f = 0; f < 4; f++) for (let d = 1; d <= 4; d++) for (const on of [false, true]) INFO.set(repeaterId(f, d, on), { kind: "repeater", facing: f, delay: d, on });
const doorId = (material: string, upper: boolean, facing: number, open: boolean) =>
  blockId(`door_${material}_${upper ? "upper" : "lower"}_${facing}_${open ? 1 : 0}`);
for (const material of ["wooden", "iron"] as const) for (const upper of [false, true]) for (let f = 0; f < 4; f++) for (const open of [false, true]) {
  INFO.set(doorId(material, upper, f, open), { kind: "door", material, upper, facing: f, open });
}

export function redstoneInfo(id: number): Info | undefined {
  return INFO.get(id);
}

/** Dust power level at a block id (0 for anything that isn't dust). */
export function dustLevel(id: number): number {
  const i = INFO.get(id);
  return i?.kind === "dust" ? i.level : 0;
}

type Cell = readonly [number, number, number];
const SIDES: readonly Cell[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const add = (c: Cell, d: Cell): Cell => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const front = (c: Cell, facing: number): Cell => [c[0] + FACING_VECTORS[facing][0], c[1], c[2] + FACING_VECTORS[facing][1]];
/** Cells within Manhattan distance 2 (25 cells). */
function within2(c: Cell): Cell[] {
  const out: Cell[] = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 2) out.push([c[0] + dx, c[1] + dy, c[2] + dz]);
  }
  return out;
}
const back = (c: Cell, facing: number): Cell => [c[0] - FACING_VECTORS[facing][0], c[1], c[2] - FACING_VECTORS[facing][1]];

export type ScheduledKind = "torch" | "repeater" | "button";
export interface ScheduledTick { x: number; y: number; z: number; due: number; kind: ScheduledKind }

/**
 * Block ids to place for a stack id at a cell, given the direction the placer looks (0-3, as
 * FACING_VECTORS): repeaters point away from the placer, doors face the placer and take two cells.
 * Returns null for ids that place nothing special (the caller places the block itself).
 */
export function orientedPlacement(id: number, x: number, y: number, z: number, look: number): Array<[number, number, number, number]> | null {
  const info = INFO.get(id);
  if (id === REPEATER_ITEM || info?.kind === "repeater") return [[x, y, z, repeaterId(look, 1, false)]];
  if (info?.kind === "door") {
    return [[x, y, z, doorId(info.material, false, look, false)], [x, y + 1, z, doorId(info.material, true, look, false)]];
  }
  return null;
}

/** The other half of a door at (x, y, z), if any. */
export function doorPartner(world: World, x: number, y: number, z: number): Cell | null {
  const info = INFO.get(world.getBlock(x, y, z));
  if (info?.kind !== "door") return null;
  const other: Cell = [x, info.upper ? y - 1 : y + 1, z];
  const o = INFO.get(world.getBlock(...other));
  return o?.kind === "door" && o.upper !== info.upper ? other : null;
}

export class Redstone {
  /** Redstone ticks run so far. */
  tick = 0;
  private readonly dirty = new Set<string>();
  private readonly scheduled = new Map<string, ScheduledTick>();
  private readonly activePlates = new Set<string>();
  /** Last power seen by each door (keyed by its lower half), to react only to changes. */
  private readonly doorPower = new Map<string, boolean>();
  private applying = false;
  private accumulator = 0;
  /** Cells examined by the last `step` (for tests of the work bound). */
  lastWork = 0;

  constructor(private readonly world: World) {
    world.onBlockChanged((x, y, z) => {
      if (this.applying) return;
      // A cell changed from outside (a door placed, broken or replaced) forgets any door power
      // recorded there, so a new door always starts as "first seen" (review e9a58dc4).
      this.doorPower.delete(key(x, y, z));
      this.markAround(x, y, z);
    });
  }

  private get(c: Cell): number {
    return this.world.getBlock(c[0], c[1], c[2]);
  }

  private set(c: Cell, id: number): void {
    this.applying = true;
    try {
      this.world.setBlock(c[0], c[1], c[2], id);
    } finally {
      this.applying = false;
    }
  }

  private markAround(x: number, y: number, z: number): void {
    this.dirty.add(key(x, y, z));
    for (const d of SIDES) this.dirty.add(key(x + d[0], y + d[1], z + d[2]));
  }

  /** Advances by `dt` seconds of game time, running whole redstone ticks. */
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.accumulator = Math.min(this.accumulator + dt, REDSTONE_TICK * 5);
    while (this.accumulator >= REDSTONE_TICK) {
      this.accumulator -= REDSTONE_TICK;
      this.step();
    }
  }

  /** One redstone tick: due scheduled updates, then (bounded) dirty-cell processing. */
  step(): void {
    this.tick++;
    const due = [...this.scheduled.values()].filter((s) => s.due <= this.tick).sort((a, b) => a.due - b.due).slice(0, MAX_SCHEDULED_PER_TICK);
    for (const s of due) {
      this.scheduled.delete(`${key(s.x, s.y, s.z)}|${s.kind}`);
      this.runScheduled(s);
    }
    this.processDirty();
  }

  /** Runs until nothing is pending (tests and initial settling); at most `maxTicks` ticks. */
  settle(maxTicks = 100): void {
    for (let i = 0; i < maxTicks && (this.dirty.size > 0 || this.scheduled.size > 0); i++) this.step();
  }

  /** One pending update per cell and kind (a button's release doesn't hide a torch's re-check). */
  private schedule(c: Cell, delay: number, kind: ScheduledKind): void {
    const k = `${key(...c)}|${kind}`;
    if (!this.scheduled.has(k)) this.scheduled.set(k, { x: c[0], y: c[1], z: c[2], due: this.tick + delay, kind });
  }

  private runScheduled(s: ScheduledTick): void {
    const c: Cell = [s.x, s.y, s.z];
    const info = INFO.get(this.get(c));
    if (s.kind === "button" && info?.kind === "button" && info.on) {
      this.world.setBlock(s.x, s.y, s.z, OFF_ID.get("button")!);
    } else if (s.kind === "torch" && info?.kind === "torch") {
      const on = !this.blockPowered([s.x, s.y - 1, s.z], c);
      if (on !== info.on) this.world.setBlock(s.x, s.y, s.z, on ? ON_ID.get("torch")! : OFF_ID.get("torch")!);
    } else if (s.kind === "repeater" && info?.kind === "repeater") {
      const on = this.repeaterInput(c, info.facing);
      if (on !== info.on) this.world.setBlock(s.x, s.y, s.z, repeaterId(info.facing, info.delay, on));
    }
  }

  private processDirty(): void {
    const cells: Cell[] = [];
    for (const k of this.dirty) {
      if (cells.length >= MAX_DIRTY_PER_TICK) break;
      this.dirty.delete(k);
      const [x, y, z] = k.split(",").map(Number);
      cells.push([x, y, z]);
    }
    this.lastWork = cells.length;
    // A change can power a block, which powers its neighbours: look one cell beyond each dirty cell.
    const dust = new Map<string, Cell>();
    const consumers = new Map<string, Cell>();
    const consider = (c: Cell) => {
      const info = INFO.get(this.get(c));
      if (info?.kind === "dust") dust.set(key(...c), c);
      else if (info) consumers.set(key(...c), c);
    };
    for (const c of cells) {
      consider(c);
      for (const d of SIDES) consider(add(c, d));
    }
    if (dust.size > 0) {
      for (const c of this.recomputeDust([...dust.values()])) {
        // Dust powers its neighbours and the blocks around it, which power theirs: re-check within 2 cells.
        for (const n of within2(c)) {
          const info = INFO.get(this.get(n));
          if (info && info.kind !== "dust") consumers.set(key(...n), n);
        }
      }
    }
    for (const c of consumers.values()) this.updateConsumer(c);
  }

  /** Dust cells connected to `c`: same level horizontally, and one step up or down. */
  private dustNeighbours(c: Cell): Cell[] {
    const out: Cell[] = [];
    for (const [dx, dz] of FACING_VECTORS) {
      for (const dy of [0, 1, -1]) {
        const n: Cell = [c[0] + dx, c[1] + dy, c[2] + dz];
        if (INFO.get(this.get(n))?.kind === "dust") out.push(n);
      }
    }
    return out;
  }

  /** Power a dust cell receives from non-dust neighbours: 15 or 0. */
  private dustInput(c: Cell): number {
    for (const d of SIDES) {
      const n = add(c, d);
      if (this.emitsInto(n, c)) return 15;
      if (isOpaque(this.get(n)) && this.blockStronglyPowered(n)) return 15;
    }
    return 0;
  }

  /** Recomputes the dust networks containing `seeds`; returns the cells whose level changed. */
  private recomputeDust(seeds: Cell[]): Cell[] {
    const network = new Map<string, Cell>();
    const queue: Cell[] = [];
    for (const s of seeds) if (!network.has(key(...s))) { network.set(key(...s), s); queue.push(s); }
    for (let i = 0; i < queue.length && network.size < MAX_NETWORK; i++) {
      for (const n of this.dustNeighbours(queue[i])) {
        const k = key(...n);
        if (!network.has(k) && network.size < MAX_NETWORK) { network.set(k, n); queue.push(n); }
      }
    }
    // Levels: each cell's input, then max-propagation losing 1 per step (buckets 15 -> 1).
    const level = new Map<string, number>();
    const buckets: Cell[][] = Array.from({ length: 16 }, () => []);
    for (const [k, c] of network) {
      const l = this.dustInput(c);
      level.set(k, l);
      if (l > 0) buckets[l].push(c);
    }
    for (let l = 15; l >= 2; l--) {
      for (const c of buckets[l]) {
        if (level.get(key(...c)) !== l) continue;
        for (const n of this.dustNeighbours(c)) {
          const k = key(...n);
          if (!network.has(k) || (level.get(k) ?? 0) >= l - 1) continue;
          level.set(k, l - 1);
          buckets[l - 1].push(n);
        }
      }
    }
    const changed: Cell[] = [];
    for (const [k, c] of network) {
      const l = level.get(k) ?? 0;
      if (dustLevel(this.get(c)) !== l) {
        this.set(c, DUST[l]);
        changed.push(c);
      }
    }
    return changed;
  }

  /** True if the component at `from` emits full power into the neighbouring cell `to`. */
  private emitsInto(from: Cell, to: Cell): boolean {
    const info = INFO.get(this.get(from));
    if (!info) return false;
    if (info.kind === "lever" || info.kind === "button" || info.kind === "plate") return info.on;
    // A torch doesn't power the block it stands on.
    if (info.kind === "torch") return info.on && !same(to, [from[0], from[1] - 1, from[2]]);
    if (info.kind === "repeater") return info.on && same(to, front(from, info.facing));
    return false;
  }

  /** A solid block strongly powered: by a switch beside it, a torch under it or a repeater facing it. */
  private blockStronglyPowered(b: Cell, except?: Cell): boolean {
    for (const d of SIDES) {
      const n = add(b, d);
      if (except && same(n, except)) continue;
      const info = INFO.get(this.get(n));
      if (!info) continue;
      if ((info.kind === "lever" || info.kind === "button" || info.kind === "plate") && info.on) return true;
      if (info.kind === "torch" && info.on && same(b, [n[0], n[1] + 1, n[2]])) return true;
      if (info.kind === "repeater" && info.on && same(b, front(n, info.facing))) return true;
    }
    return false;
  }

  /** A solid block powered strongly, or weakly by powered dust on top of it or beside it. */
  private blockPowered(b: Cell, except?: Cell): boolean {
    if (!isOpaque(this.get(b))) return false;
    if (this.blockStronglyPowered(b, except)) return true;
    for (const d of SIDES) {
      if (d[1] === -1) continue;
      const n = add(b, d);
      if (except && same(n, except)) continue;
      if (dustLevel(this.get(n)) > 0) return true;
    }
    return false;
  }

  /** Whether a component at `c` (lamp, door) receives power. */
  private powered(c: Cell): boolean {
    for (const d of SIDES) {
      const n = add(c, d);
      if (this.emitsInto(n, c)) return true;
      if (dustLevel(this.get(n)) > 0) return true;
      if (this.blockPowered(n, c)) return true;
    }
    return false;
  }

  private repeaterInput(c: Cell, facing: number): boolean {
    const b = back(c, facing);
    return this.emitsInto(b, c) || dustLevel(this.get(b)) > 0 || this.blockPowered(b, c);
  }

  private updateConsumer(c: Cell): void {
    const info = INFO.get(this.get(c));
    if (!info) return;
    if (info.kind === "lamp") {
      const on = this.powered(c);
      if (on !== info.on) this.set(c, on ? ON_ID.get("lamp")! : OFF_ID.get("lamp")!);
    } else if (info.kind === "torch") {
      if (!this.blockPowered([c[0], c[1] - 1, c[2]], c) !== info.on) this.schedule(c, 1, "torch");
    } else if (info.kind === "repeater") {
      if (this.repeaterInput(c, info.facing) !== info.on) this.schedule(c, info.delay, "repeater");
    } else if (info.kind === "door") {
      const lower: Cell = info.upper ? [c[0], c[1] - 1, c[2]] : c;
      const upper: Cell = [lower[0], lower[1] + 1, lower[2]];
      const now = this.powered(lower) || this.powered(upper);
      const k = key(...lower);
      // Doors react to changes of power, so a door opened by hand stays open. A door seen for the
      // first time (just placed, or after loading) only records its power: reloading a world never
      // closes a hand-opened door (review 193df6be).
      const before = this.doorPower.get(k) ?? now;
      this.doorPower.set(k, now);
      if (now !== before) this.setDoor(lower, now);
    }
  }

  private setDoor(lower: Cell, open: boolean): void {
    const l = INFO.get(this.get(lower));
    const u = INFO.get(this.get([lower[0], lower[1] + 1, lower[2]]));
    if (l?.kind !== "door" || u?.kind !== "door" || l.open === open) return;
    this.set(lower, doorId(l.material, false, l.facing, open));
    this.set([lower[0], lower[1] + 1, lower[2]], doorId(u.material, true, u.facing, open));
  }

  /**
   * Using a block by hand: toggles a lever or wooden door, presses a button, cycles a repeater's
   * delay. Returns true if the block reacted (so the use doesn't also place a block).
   */
  interact(x: number, y: number, z: number): boolean {
    const c: Cell = [x, y, z];
    const info = INFO.get(this.get(c));
    if (!info) return false;
    if (info.kind === "lever") {
      this.world.setBlock(x, y, z, info.on ? OFF_ID.get("lever")! : ON_ID.get("lever")!);
      return true;
    }
    if (info.kind === "button") {
      if (!info.on) {
        this.world.setBlock(x, y, z, ON_ID.get("button")!);
        this.schedule(c, BUTTON_TICKS, "button");
      }
      return true;
    }
    if (info.kind === "repeater") {
      this.world.setBlock(x, y, z, repeaterId(info.facing, (info.delay % 4) + 1, info.on));
      return true;
    }
    if (info.kind === "door") {
      // Iron doors only open with redstone, as in Minecraft.
      if (info.material === "iron") return true;
      const lower: Cell = info.upper ? [x, y - 1, z] : c;
      this.setDoor(lower, !info.open);
      return true;
    }
    return false;
  }

  /** Pressure plates: `occupied` holds the cells (keys "x,y,z") where a player or mob stands this tick. */
  updatePlates(occupied: ReadonlySet<string>): void {
    for (const k of occupied) {
      if (this.activePlates.has(k)) continue;
      const [x, y, z] = k.split(",").map(Number);
      const info = INFO.get(this.world.getBlock(x, y, z));
      if (info?.kind === "plate") {
        this.activePlates.add(k);
        if (!info.on) this.world.setBlock(x, y, z, ON_ID.get("plate")!);
      }
    }
    for (const k of [...this.activePlates]) {
      if (occupied.has(k)) continue;
      this.activePlates.delete(k);
      const [x, y, z] = k.split(",").map(Number);
      if (INFO.get(this.world.getBlock(x, y, z))?.kind === "plate") this.world.setBlock(x, y, z, OFF_ID.get("plate")!);
    }
  }

  /** Pending ticks, relative to now (for saving). */
  exportScheduled(): ScheduledTick[] {
    return [...this.scheduled.values()].map((s) => ({ ...s, due: Math.max(1, s.due - this.tick) }));
  }

  /**
   * Restores after loading: pending ticks (already sanitized), plates left pressed and buttons
   * left pressed without a pending release, from the saved edits.
   */
  restore(scheduled: readonly ScheduledTick[], edits: readonly BlockEdit[]): void {
    for (const s of scheduled) this.schedule([s.x, s.y, s.z], s.due, s.kind);
    for (const [x, y, z, id] of edits) {
      const info = INFO.get(id);
      if (info?.kind === "plate" && info.on) this.activePlates.add(key(x, y, z));
      if (info?.kind === "button" && info.on) this.schedule([x, y, z], BUTTON_TICKS, "button");
      if (info) this.markAround(x, y, z);
    }
  }

  /** Pending work (for tests and the debug screen). */
  pending(): { dirty: number; scheduled: number } {
    return { dirty: this.dirty.size, scheduled: this.scheduled.size };
  }
}

/** Sanitizes saved pending ticks: integer cells inside the world, known kinds, due 1-100. */
export function sanitizeScheduled(raw: unknown): ScheduledTick[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduledTick[] = [];
  for (const r of raw.slice(0, 4096)) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    const own = (k: string) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
    const [x, y, z, due, kind] = [own("x"), own("y"), own("z"), own("due"), own("kind")];
    const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
    if (!int(x, -30_000_000, 30_000_000) || !int(z, -30_000_000, 30_000_000) || !int(y, 0, WORLD_HEIGHT - 1) || !int(due, 1, 100)) continue;
    if (kind !== "torch" && kind !== "repeater" && kind !== "button") continue;
    out.push({ x: x as number, y: y as number, z: z as number, due: due as number, kind });
  }
  return out;
}

