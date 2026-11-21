import { ARMOR_SLOTS, armorOf, type ArmorSlot } from "../catalog/items";
import type { Inventory, ItemStack } from "../ownership/inventory";

export type DamageKind = "melee" | "fall" | "starvation" | "void";

/** A defensive read: corrupted or manually edited equipment cannot grant free protection. */
function usable(slot: ArmorSlot, stack: ItemStack | null): boolean {
  const armor = armorOf(stack?.id);
  const wear = stack?.damage ?? 0;
  return !!stack && stack.count === 1 && armor?.slot === slot && Number.isInteger(wear) && wear >= 0 && wear < armor.durability;
}

/** Ordinary armor points: each absorbs 4% of eligible damage, capped at 80%. */
export function armorPoints(inventory: Inventory): number {
  return Math.min(20, ARMOR_SLOTS.reduce((points, slot) => {
    const stack = inventory.equipment[slot];
    return points + (usable(slot, stack) ? armorOf(stack!.id)!.points : 0);
  }, 0));
}

/**
 * Resolves armor-eligible melee damage using Bedrock's fixed point reduction. Worn pieces protect
 * the current hit before breaking. Fall, starvation and void bypass both protection and wear.
 * Invalid damage is a no-op, so external/corrupted numbers cannot poison health or equipment.
 */
export function applyArmorDamage(inventory: Inventory, amount: number, kind: DamageKind = "melee"): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (kind !== "melee") return amount;
  const remaining = amount * (1 - armorPoints(inventory) * 0.04);
  const wear = Math.max(1, Math.floor(amount / 4));
  for (const slot of ARMOR_SLOTS) {
    const stack = inventory.equipment[slot];
    if (!usable(slot, stack)) continue;
    const armor = armorOf(stack!.id)!;
    const damage = (stack!.damage ?? 0) + wear;
    if (damage >= armor.durability) inventory.equipment[slot] = null;
    else stack!.damage = damage;
  }
  return remaining;
}
