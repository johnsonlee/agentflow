import { isKnownId, isItem, itemById, maxStackOf, stackId } from "../catalog/items";
import type { ItemStack } from "../ownership/inventory";
import { labReaction } from "./chemistry";

/** Journal p7 documents Combine and Garbage, not quantities/debit/destination/duration.
 * App policy: one output, consume the entire explicitly selected nine-cell batch,
 * deliver to the compatible cursor. Empty/malformed/unsupported owners are refused.
 * This is a detached plan only; the UI must revalidate its live session before commit. */
export type LabExperimentPlan =
  | { ok: false; reason: string }
  | { ok: true; kind: "product" | "garbage"; id: number; fingerprint: string; cursor: ItemStack; grid: (ItemStack | null)[] };

function ordinaryStack(raw: unknown): ItemStack | null {
  if (!raw || typeof raw !== "object" || Object.getPrototypeOf(raw) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || !keys.includes("id") || !keys.includes("count")) return null;
  const id = Object.getOwnPropertyDescriptor(raw, "id"), count = Object.getOwnPropertyDescriptor(raw, "count");
  if (!id?.enumerable || !("value" in id) || !count?.enumerable || !("value" in count)) return null;
  if (!Number.isSafeInteger(id.value) || !isKnownId(id.value) || !Number.isSafeInteger(count.value) || count.value < 1 || count.value > maxStackOf(id.value)) return null;
  return { id: id.value, count: count.value };
}

export function planLabExperiment(rawGrid: unknown, rawCursor: unknown): LabExperimentPlan {
  try {
    if (!Array.isArray(rawGrid) || Object.getPrototypeOf(rawGrid) !== Array.prototype || rawGrid.length !== 9 || Reflect.ownKeys(rawGrid).length !== 10)
      return { ok: false, reason: "Malformed experiment grid" };
    const grid: (ItemStack | null)[] = [];
    for (let i = 0; i < 9; i++) {
      const cell = Object.getOwnPropertyDescriptor(rawGrid, String(i));
      if (!cell?.enumerable || !("value" in cell) || !cell.writable) return { ok: false, reason: "Unreadable experiment cell" };
      if (cell.value === null) { grid.push(null); continue; }
      const stack = ordinaryStack(cell.value);
      if (!stack || !isItem(stack.id)) return { ok: false, reason: "Only ordinary chemistry ingredients can be combined" };
      const item = itemById(stack.id), kind = item.chem?.kind;
      // Preserve the existing Heat Block lookup's ordinary Charcoal ingredient.
      if (kind !== "element" && kind !== "isotope" && kind !== "compound" && item.name !== "charcoal")
        return { ok: false, reason: "Only elements, compounds and Charcoal can be combined" };
      grid.push(stack);
    }
    if (!grid.some(Boolean)) return { ok: false, reason: "Add some ingredients" };
    const cursor = rawCursor === null ? null : ordinaryStack(rawCursor);
    if (rawCursor !== null && !cursor) return { ok: false, reason: "Unsupported cursor metadata" };
    // Proxies (including nested owners) cannot be mistaken for ordinary real data.
    structuredClone(rawGrid); structuredClone(rawCursor);
    const recipe = labReaction(grid), kind = "id" in recipe ? "product" : "garbage";
    const id = "id" in recipe ? recipe.id : stackId("garbage");
    if (cursor && (cursor.id !== id || cursor.count >= maxStackOf(id))) return { ok: false, reason: "Make room on the cursor for the experiment output" };
    return { ok: true, kind, id, fingerprint: JSON.stringify([grid, cursor]), cursor: { id, count: (cursor?.count ?? 0) + 1 }, grid: new Array(9).fill(null) };
  } catch { return { ok: false, reason: "Unreadable experiment owners" }; }
}
