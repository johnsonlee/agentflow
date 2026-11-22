import { METAL_RECYCLING_RECIPES } from "../catalog/metal-nuggets";
import { durabilityOf, stackId } from "../catalog/items";

const recyclableIds = new Set(Object.keys(METAL_RECYCLING_RECIPES).map(stackId));
/** No enchantment model is invented. An own payload on recyclable gear must remain with its owner.
 * Descriptors are inspected without invoking a potentially unsafe enchantments getter.
 */
export function hasUnsupportedRecyclingEnchantments(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  try {
    if (!Object.prototype.hasOwnProperty.call(raw, "enchantments")) return false;
    const id = Object.getOwnPropertyDescriptor(raw, "id");
    return !id || !("value" in id) || recyclableIds.has(id.value);
  } catch { return true; }
}

/** Strict only for the18 newly recyclable existing identities; other item policies are unchanged. */
export function inspectRecyclingEquipment(raw: unknown, bulk = false): {kind:"none"|"valid"}|{kind:"invalid";reason:string} {
  if (!raw || typeof raw !== "object") return {kind:"none"};
  try {
    if (hasUnsupportedRecyclingEnchantments(raw)) return {kind:"invalid",reason:"Unsupported recycling equipment enchantments"};
    const id = Object.getOwnPropertyDescriptor(raw, "id");
    if (!id || !("value" in id) || !recyclableIds.has(id.value)) return {kind:"none"};
    const count = Object.getOwnPropertyDescriptor(raw, "count");
    if (!count || !("value" in count) || !Number.isSafeInteger(count.value) || count.value < 1 || !bulk && count.value !== 1) return {kind:"invalid",reason:"Invalid recyclable equipment count"};
    const damage = Object.getOwnPropertyDescriptor(raw, "damage");
    if (damage && (!("value" in damage) || !Number.isSafeInteger(damage.value) || damage.value < 0 || damage.value >= durabilityOf(id.value)!)) return {kind:"invalid",reason:"Invalid recyclable equipment wear"};
    return {kind:"valid"};
  } catch { return {kind:"invalid",reason:"Unreadable recyclable equipment owner"}; }
}
