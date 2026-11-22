/** Ordinary metal fractions, distinct from chemistry Fe/Au atoms and element blocks.
 * Shapes/counts/18 supported recycling identities have retained Education1.26.33.0 declarations.
 * Stack64 and the existing ten-second Furnace/fuel model remain application policy.
 */
export const METAL_NUGGETS = Object.freeze([
  Object.freeze({ id: 856, name: "iron_nugget", displayName: "Iron Nugget", ingot: "iron_ingot", equipment: "iron", element: 26 }),
  Object.freeze({ id: 857, name: "gold_nugget", displayName: "Gold Nugget", ingot: "gold_ingot", equipment: "golden", element: 79 }),
]);

/** Exact existing five tool/four armor subset per metal; absent native gear is never aliased. */
export const METAL_RECYCLING_RECIPES: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  METAL_NUGGETS.flatMap(({ name, equipment }) => ["pickaxe", "axe", "shovel", "sword", "hoe", "helmet", "chestplate", "leggings", "boots"]
    .map(kind => [`${equipment}_${kind}`, name])),
));
