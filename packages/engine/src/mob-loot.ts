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

interface PendingLoot { stacks: ItemStack[]; committed: boolean; transferring: boolean }

/** One roll per mob object. Failed reservations retain that roll; committed calls never respawn it. */
export class MobLootResolver {
  private readonly pending = new WeakMap<Mob, PendingLoot>();
  constructor(private readonly rand: () => number = Math.random) {}

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
