import type { FurnaceState } from "../crafting/smelting";
import type { ItemStack } from "./inventory";
import { cloneStack, hasCloneableBookMetadata, stackLimit } from "./stack";
import { inspectItemState } from "./item-state";
import { isKnownId } from "../catalog/items";

const busy = new WeakSet<FurnaceState>(), retired = new WeakSet<FurnaceState>();
export function furnaceMutationBusy(f: FurnaceState): boolean { return busy.has(f) || retired.has(f); }
export interface FurnaceContentsLease {
  readonly contents: readonly ItemStack[];
  valid(): boolean;
  retire(): boolean;
  cancel(): void;
}
/** Ephemeral ownership only: no saved fields or FurnaceState migration.
 * Supported tick/slot/UI mutations refuse while leased or retired. Direct raw POJO writes are outside this contract.
 */
export function reserveFurnaceContents(f: FurnaceState): FurnaceContentsLease | null {
  if (furnaceMutationBusy(f)) return null;
  try {
    const owned = [f.input, f.fuel, f.output].filter((x): x is ItemStack => x !== null);
    if (owned.some(s => inspectItemState(s).kind === "invalid" || !isKnownId(s.id) || !Number.isSafeInteger(s.count) || s.count < 1 || s.count > stackLimit(s)
      || !hasCloneableBookMetadata(s))) return null;
    const source = JSON.stringify(f);
    const contents = Object.freeze(owned.map(s => Object.freeze(cloneStack(s))));
    busy.add(f); let active = true;
    const cancel = () => { if (active) { active = false; busy.delete(f); } };
    const valid = () => { try { return active && busy.has(f) && !retired.has(f) && JSON.stringify(f) === source; } catch { return false; } };
    return Object.freeze({ contents, valid, cancel, retire: () => {
      if (!valid()) return false;
      f.input = f.fuel = f.output = null; f.burnLeft = f.burnTotal = f.progress = 0; delete f.progressInputId;
      retired.add(f); cancel(); return true;
    } });
  } catch { return null; }
}
/** Used before serializing exact state references, including inactive-world furnace owners. */
export function hasBusyFurnaceOwnership(raw: unknown): boolean {
  try {
    const own = (v: unknown, k: string): unknown => v && typeof v === "object" ? Object.getOwnPropertyDescriptor(v, k)?.value : undefined;
    const worlds = [raw, own(own(own(raw, "dimensions"), "inactive"), "overworld"), own(own(own(raw, "dimensions"), "inactive"), "nether")];
    return worlds.some(world => { const rows = own(world, "furnaces"); return Array.isArray(rows) && rows.some(row => {
      const f = own(row, "state"); return !!f && typeof f === "object" && furnaceMutationBusy(f as FurnaceState);
    }); });
  } catch { return true; }
}
