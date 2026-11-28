/** Three ordinary storage blocks, distinct from chemistry element blocks and items.
 * Recipe shapes/counts have retained Education 1.26.33.0 declaration evidence.
 * Hardness and Player harvest tiers are explicit application policy, not native calibration.
 * Agent destroy retains the existing tool-free authorized Agent ownership model.
 */
export const METAL_STORAGE_BLOCKS = Object.freeze([
  Object.freeze({ id: 205, name: "iron_block", displayName: "Block of Iron", material: "iron_ingot", hardness: 5, harvestTier: 2 }),
  Object.freeze({ id: 206, name: "gold_block", displayName: "Block of Gold", material: "gold_ingot", hardness: 3, harvestTier: 3 }),
  Object.freeze({ id: 207, name: "diamond_block", displayName: "Block of Diamond", material: "diamond", hardness: 5, harvestTier: 3 }),
]);
