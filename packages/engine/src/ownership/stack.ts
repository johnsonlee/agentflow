import type { ItemStack } from "./inventory";
import { baseStackId, isKnownId, maxStackOf } from "../catalog/items";
import { glowStickColor, inspectGlowState, type GlowActivationResult } from "./glow-stick-state";

/** Detached ownership snapshot; never shares editable book pages or glow state with another owner. */
export function cloneStack(stack: ItemStack, count = stack.count): ItemStack {
  return { ...stack, count, ...(stack.book ? { book: { ...stack.book, pages: [...stack.book.pages] } } : {}), ...(stack.glow ? { glow: { ...stack.glow } } : {}) };
}

/** Structural guard for supported book metadata before detached ownership cloning.
 * This neither clamps pages nor changes valid ordinary book/tool behavior. It is not a raw-save
 * recovery policy; serializers and other public ownership boundaries still need integration. */
export function hasCloneableBookMetadata(stack: ItemStack): boolean {
  try {
    const book: unknown = stack.book;
    if (book === undefined) return true;
    if (typeof book !== "object" || book === null || Array.isArray(book)
      || (Object.getPrototypeOf(book) !== Object.prototype && Object.getPrototypeOf(book) !== null)) return false;
    const raw = book as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(raw, "pages") && Array.isArray(raw.pages)
      && Array.from(raw.pages).every(page => typeof page === "string")
      && (raw.title === undefined || typeof raw.title === "string")
      && (raw.author === undefined || typeof raw.author === "string");
  } catch { return false; }
}

/** Zero wear and absent wear are equivalent; every supported book field participates. */
export function stacksCompatible(a: ItemStack, b: ItemStack): boolean {
  if (!hasCloneableBookMetadata(a) || !hasCloneableBookMetadata(b)) return false;
  const aGlow = inspectGlowState(a, true), bGlow = inspectGlowState(b, true);
  if (aGlow.kind === "invalid" || bGlow.kind === "invalid" || aGlow.kind !== bGlow.kind) return false;
  return a.id === b.id && (a.damage ?? 0) === (b.damage ?? 0) &&
    (a.book === undefined && b.book === undefined || a.book !== undefined && b.book !== undefined &&
      a.book.title === b.book.title && a.book.author === b.book.author && JSON.stringify(a.book.pages) === JSON.stringify(b.book.pages));
}

/** Metadata-aware capacity; maxStackOf(id) remains the unchanged registry limit. */
export function stackLimit(stack: ItemStack): number {
  const glow = inspectGlowState(stack, true);
  return glow.kind === "invalid" ? 0 : glow.kind === "active" ? 1 : maxStackOf(stack.id);
}

/** Mutates only the supplied slots, using the same algorithm for bag insertion and trials.
 * Callers requiring all-or-nothing must pass detached trial slots and commit only on zero remainder. */
export function insertStackIntoSlots(slots: (ItemStack | null)[], incoming: ItemStack, excludedIndex = -1): number {
  if (!isKnownId(incoming.id) || !Number.isSafeInteger(incoming.count) || incoming.count <= 0
    || inspectGlowState(incoming, true).kind === "invalid" || !hasCloneableBookMetadata(incoming)) return incoming.count;
  const stack = { ...cloneStack(incoming), id: baseStackId(incoming.id) };
  const limit = stackLimit(stack);
  let left = stack.count;
  if (limit > 1) for (let index = 0; index < slots.length && left > 0; index++) {
    const current = slots[index];
    if (index === excludedIndex || !current || !stacksCompatible(current, stack)) continue;
    const amount = Math.max(0, Math.min(limit - current.count, left));
    current.count += amount; left -= amount;
  }
  for (let index = 0; index < slots.length && left > 0; index++) {
    if (index === excludedIndex || slots[index]) continue;
    const amount = Math.min(limit, left);
    slots[index] = cloneStack(stack, amount); left -= amount;
  }
  return left;
}

/** Capacity of a concrete incoming state, matching insertStackIntoSlots without mutation. */
export function spaceForStackInSlots(slots: readonly (ItemStack | null)[], incoming: ItemStack): number {
  if (!isKnownId(incoming.id) || !Number.isSafeInteger(incoming.count) || incoming.count <= 0
    || inspectGlowState(incoming, true).kind === "invalid" || !hasCloneableBookMetadata(incoming)) return 0;
  const stack = { ...cloneStack(incoming), id: baseStackId(incoming.id) }, limit = stackLimit(stack);
  return slots.reduce((total, current) => total + (!current ? limit
    : limit > 1 && stacksCompatible(current, stack) ? Math.max(0, limit - current.count) : 0), 0);
}

export type GlowActivationPlan = Exclude<GlowActivationResult, { ok: true }>
  | { ok: true; kind: "activated"; color: string; slots: (ItemStack | null)[] };

/** Pure reducer: input owners are never mutated; only a complete detached result may be committed. */
export function planGlowActivation(slots: readonly (ItemStack | null)[], selected: number): GlowActivationPlan {
  if (!Number.isInteger(selected) || selected < 0 || selected >= slots.length) return { ok: false, reason: "invalid-state" };
  const source = slots[selected];
  if (!source) return { ok: false, reason: "not-glow" };
  const state = inspectGlowState(source);
  if (state.kind === "invalid") return { ok: false, reason: "invalid-state" };
  const color = glowStickColor(source.id);
  if (color === null) return { ok: false, reason: "not-glow" };
  if (state.kind === "active") return { ok: false, reason: "already-active" };
  // Legacy metadata is preserved on load/transfer, never silently erased by activation.
  if (Object.prototype.hasOwnProperty.call(source, "book") || Object.prototype.hasOwnProperty.call(source, "damage"))
    return { ok: false, reason: "invalid-state" };
  // Do not silently repair unrelated malformed owners while cloning/committing the trial.
  for (const stack of slots) if (stack && (!isKnownId(stack.id) || !Number.isSafeInteger(stack.count)
    || stack.count < 1 || !hasCloneableBookMetadata(stack) || inspectGlowState(stack).kind === "invalid" || stack.count > stackLimit(stack)))
    return { ok: false, reason: "invalid-state" };
  const trial = slots.map(stack => stack ? cloneStack(stack) : null);
  trial[selected] = { ...cloneStack(source, 1), glow: { state: "active" } };
  if (source.count > 1 && insertStackIntoSlots(trial, cloneStack(source, source.count - 1), selected) !== 0)
    return { ok: false, reason: "needs-room" };
  return { ok: true, kind: "activated", color, slots: trial };
}
