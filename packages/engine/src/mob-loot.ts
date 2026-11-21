import { MOB_SPECS, type Mob, type MobKind } from "./entities";
import type { ItemStack } from "./inventory";
import { stackId } from "./items";
import type { Vec3 } from "./math";
import { cloneStack } from "./stack";
import type { DropSink } from "./world-drops";

/** Source bounds: candidate Education1.26.33.0 pig/chicken/main-zombie loot tables.
 * Uniform inclusive integers are this application's sampling model, not measured native RNG.
 */
function countBetween(min: number, max: number, rand: () => number): number {
  const value = rand();
  if (!Number.isFinite(value)) throw new RangeError("Mob loot RNG must return a finite number");
  return Math.min(max, min + Math.floor(Math.max(0, Math.min(1, value)) * (max - min + 1)));
}

/** Current unenchanted base loot only: no fire meat conversion, rare/equipment or sheep-state parity. */
export function mobDrops(kind: MobKind, rand: () => number = Math.random): ItemStack[] {
  const spec = MOB_SPECS[kind];
  const stacks: ItemStack[] = [];
  for (const [index, entry] of [spec.drop, spec.extraDrop].entries()) {
    if (!entry) continue;
    const [name, fixed] = entry;
    const count = kind === "pig" && index === 0 ? countBetween(1, 3, rand)
      : (kind === "zombie" && index === 0 || kind === "chicken" && index === 1) ? countBetween(0, 2, rand)
      : fixed;
    if (count > 0) stacks.push({ id: stackId(name), count });
  }
  return stacks;
}

const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** A cached roll must be an actual batch permitted by this mob kind, including a legitimate empty roll. */
export function sanitizePendingMobLoot(kind: MobKind, raw: unknown): ItemStack[] | null {
  try {
    if (!Object.prototype.hasOwnProperty.call(MOB_SPECS, kind) || !Array.isArray(raw)) return null;
    const minimum = mobDrops(kind, () => 0), maximum = mobDrops(kind, () => 1), result: ItemStack[] = [];
    let cursor = 0;
    for (const upper of maximum) {
      const lower = minimum.find((s) => s.id === upper.id)?.count ?? 0;
      const candidate = raw[cursor];
      if (plain(candidate) && Object.prototype.hasOwnProperty.call(candidate, "id") && candidate.id === upper.id) {
        const count = Object.prototype.hasOwnProperty.call(candidate, "count") ? candidate.count : undefined;
        if (!Number.isSafeInteger(count) || (count as number) < Math.max(1, lower) || (count as number) > upper.count || Object.keys(candidate).some((key) => key !== "id" && key !== "count")) return null;
        result.push({ id: upper.id, count: count as number }); cursor++;
      } else if (lower > 0) return null;
    }
    return cursor === raw.length ? result : null;
  } catch { return null; }
}

interface PendingLoot { stacks: ItemStack[]; committed: boolean; transferring: boolean }

/** One roll per mob object. Failed reservations retain that roll; committed calls never respawn it. */
export class MobLootResolver {
  private readonly pending = new WeakMap<Mob, PendingLoot>();
  constructor(private readonly rand: () => number = Math.random) {}

  /** Undefined means never resolved/already delivered; [] is a pending zero-result roll. */
  exportPending(mob: Mob): ItemStack[] | undefined {
    const record = this.pending.get(mob);
    return record && !record.committed ? record.stacks.map((stack) => cloneStack(stack)) : undefined;
  }

  /** Restores once onto a fresh live object, never overwriting another roll or a committed owner. */
  restorePending(mob: Mob, raw: unknown): boolean {
    if (this.pending.has(mob)) return false;
    const stacks = sanitizePendingMobLoot(mob.kind, raw);
    if (stacks === null) return false;
    this.pending.set(mob, { stacks, committed: false, transferring: false });
    return true;
  }

  tryDrop(mob: Mob, sink: DropSink, position: Vec3): boolean {
    let record = this.pending.get(mob);
    if (!record) {
      record = { stacks: mobDrops(mob.kind, this.rand), committed: false, transferring: false };
      this.pending.set(mob, record);
    }
    if (record.committed) return true;
    if (record.transferring) return false;
    record.transferring = true;
    try {
      // A receiver cannot mutate the cached owner while refusing a batch.
      const batch = sink(record.stacks.map((stack) => cloneStack(stack)), { ...position });
      if (!batch || !batch.commit()) return false;
      record.committed = true;
      return true;
    } finally {
      record.transferring = false;
    }
  }
}
