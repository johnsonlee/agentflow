import { cloneStack, stackLimit, stacksCompatible, type Inventory, type ItemStack } from "@craft/engine";

/** The cursor is an owner, not an item-ID count. Refusal never debits it. */
export function canReceiveStack(cursor: ItemStack | null, incoming: ItemStack): boolean {
  const limit = stackLimit(incoming);
  return limit > 0 && Number.isSafeInteger(incoming.count) && incoming.count > 0 && incoming.count <= limit &&
    (!cursor || stacksCompatible(cursor, incoming) && cursor.count + incoming.count <= stackLimit(cursor));
}

export function addToCursor(cursor: ItemStack | null, incoming: ItemStack): ItemStack {
  return cursor ? cloneStack(cursor, cursor.count + incoming.count) : cloneStack(incoming);
}

/** Commit the bag change before changing the independent cursor owner. */
export function exchangeBagCursor(inventory: Inventory, index: number, cursor: ItemStack | null): { ok: boolean; cursor: ItemStack | null } {
  if (!Number.isInteger(index) || index < 0 || index >= inventory.slots.length) return { ok: false, cursor };
  const current = inventory.slots[index];
  if (cursor && (!Number.isSafeInteger(cursor.count) || cursor.count < 1 || cursor.count > stackLimit(cursor))) return { ok: false, cursor };
  if (cursor && current && stacksCompatible(current, cursor) && stackLimit(current) > 1) {
    const amount = Math.max(0, Math.min(stackLimit(current) - current.count, cursor.count));
    if (!amount || !inventory.setSlot(index, cloneStack(current, current.count + amount))) return { ok: false, cursor };
    return { ok: true, cursor: amount === cursor.count ? null : cloneStack(cursor, cursor.count - amount) };
  }
  const nextCursor = current ? cloneStack(current) : null;
  if (!inventory.setSlot(index, cursor)) return { ok: false, cursor };
  return { ok: true, cursor: nextCursor };
}

/** A work-area tap transfers one unit, preserving exactly which state owns it. */
export function exchangeOneWithCell(cursor: ItemStack | null, current: ItemStack | null): { ok: boolean; cursor: ItemStack | null; cell: ItemStack | null } {
  if (!cursor) return { ok: true, cursor: current ? cloneStack(current) : null, cell: null };
  if (!Number.isSafeInteger(cursor.count) || cursor.count < 1 || cursor.count > stackLimit(cursor) || current &&
      (!stacksCompatible(current, cursor) || current.count >= stackLimit(current))) return { ok: false, cursor, cell: current };
  return { ok: true, cursor: cursor.count === 1 ? null : cloneStack(cursor, cursor.count - 1), cell: cloneStack(current ?? cursor, (current?.count ?? 0) + 1) };
}
