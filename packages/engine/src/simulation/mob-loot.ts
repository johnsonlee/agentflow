import { MOB_SPECS, type Mob, type MobKind } from "./entities";
import type { ItemStack } from "../ownership/inventory";
import { stackId } from "../catalog/items";
import type { Vec3 } from "../core/math";
import { cloneStack } from "../ownership/stack";
import type { DropSink } from "../ownership/world-drops";

/** Source bounds: candidate Education1.26.33.0 pig/chicken/main-zombie/Spider loot tables.
 * Uniform inclusive integers are this application's sampling model, not measured native RNG.
 */
function countBetween(min: number, max: number, rand: () => number): number {
  const value = rand();
  if (!Number.isFinite(value)) throw new RangeError("Mob loot RNG must return a finite number");
  return Math.min(max, min + Math.floor(Math.max(0, Math.min(1, value)) * (max - min + 1)));
}

/** Agent is not classified as a native player predicate without runtime evidence. */
export type MobLootCause = "player" | "agent" | "environment";
export const isMobLootCause = (raw: unknown): raw is MobLootCause => raw === "player" || raw === "agent" || raw === "environment";

/** Unenchanted base loot plus the retained player-only Spider Eye pool; no fire/looting parity. */
export function mobDrops(kind: MobKind, rand: () => number = Math.random, cause: MobLootCause = "environment"): ItemStack[] {
  const spec = MOB_SPECS[kind];
  const stacks: ItemStack[] = [];
  for (const [index, entry] of [spec.drop, spec.extraDrop].entries()) {
    if (!entry) continue;
    const [name, fixed] = entry;
    const count = kind === "cow" ? countBetween(index === 0 ? 0 : 1, index === 0 ? 2 : 3, rand)
      : (kind === "pig" || kind === "squid") && index === 0 ? countBetween(1, 3, rand)
      : ((kind === "zombie" || kind === "spider") && index === 0 || kind === "chicken" && index === 1) ? countBetween(0, 2, rand)
      : fixed;
    if (count > 0) stacks.push({ id: stackId(name), count });
  }
  if (kind === "spider" && cause === "player") {
    const count = countBetween(0, 1, rand);
    if (count > 0) stacks.push({ id: stackId("spider_eye"), count });
  }
  return stacks;
}

const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** A cached roll must be an actual batch permitted by this mob kind, including a legitimate empty roll. */
export function sanitizePendingMobLoot(kind: MobKind, raw: unknown, cause?: MobLootCause): ItemStack[] | null {
  try {
    if (!Object.prototype.hasOwnProperty.call(MOB_SPECS, kind) || !Array.isArray(raw) || cause !== undefined && !isMobLootCause(cause)) return null;
    const minimum = mobDrops(kind, () => 0, cause), maximum = mobDrops(kind, () => 1, cause), result: ItemStack[] = [];
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

interface PendingLoot { cause?: MobLootCause; stacks: ItemStack[]; committed: boolean; transferring: boolean }

/** One roll per mob object. Failed reservations retain that roll; committed calls never respawn it. */
export class MobLootResolver {
  private readonly pending = new WeakMap<Mob, PendingLoot>();
  constructor(private readonly rand: () => number = Math.random) {}

  /** Undefined means never resolved/already delivered; [] is a pending zero-result roll. */
  exportPending(mob: Mob): ItemStack[] | undefined {
    const record = this.pending.get(mob);
    return record && !record.committed ? record.stacks.map((stack) => cloneStack(stack)) : undefined;
  }

  /** Absent for legacy cached batches, unresolved owners and already committed batches. */
  exportPendingCause(mob: Mob): MobLootCause | undefined {
    const record = this.pending.get(mob);
    return record && !record.committed ? record.cause : undefined;
  }

  /** Restores once onto a fresh live object, never overwriting another roll or a committed owner. */
  restorePending(mob: Mob, raw: unknown, cause?: MobLootCause): boolean {
    if (this.pending.has(mob)) return false;
    const stacks = sanitizePendingMobLoot(mob.kind, raw, cause);
    if (stacks === null) return false;
    this.pending.set(mob, { stacks, ...(cause === undefined ? {} : { cause }), committed: false, transferring: false });
    return true;
  }

  tryDrop(mob: Mob, sink: DropSink, position: Vec3, cause: MobLootCause = "environment"): boolean {
    if (!isMobLootCause(cause)) return false;
    let record = this.pending.get(mob);
    if (!record) {
      record = { stacks: mobDrops(mob.kind, this.rand, cause), cause, committed: false, transferring: false };
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
