import { blockCollisionBoxes } from "../catalog/block-geometry";
import { hayAxisOf } from "../catalog/hay-block";
import { WORLD_BORDER, type Vec3 } from "../core/math";
import { bodyBox, PLAYER_WIDTH, type BlockGetter } from "./physics";

/** Hay contact applies 20% of the existing application fall damage.
 * https://www.minecraft.net/en-us/article/hay-bale supports the material factor;
 * contact tolerance and the existing distance/rounding model are not Education calibration.
 * Only a positive-area overlap with an actual supporting top face counts.
 */
export function hayFallDamageMultiplierAt(get: BlockGetter, feet: Vec3, width = PLAYER_WIDTH): number {
  if (![feet.x, feet.y, feet.z, width].every(Number.isFinite) || width <= 0 || width > 8 ||
      Math.abs(feet.x) > WORLD_BORDER + 64 || Math.abs(feet.z) > WORLD_BORDER + 64) return 1;
  const box = bodyBox(feet, width), base = Math.floor(feet.y - .01);
  for (let x = Math.floor(box.minX + 1e-6); x <= Math.floor(box.maxX - 1e-6); x++) {
    for (let z = Math.floor(box.minZ + 1e-6); z <= Math.floor(box.maxZ - 1e-6); z++) {
      for (const y of [base - 1, base]) {
        const id = get(x, y, z);
        if (hayAxisOf(id) === null) continue;
        if (blockCollisionBoxes(get, x, y, z, id).some(b =>
          Math.abs(feet.y - (y + b[4])) <= .03 &&
          box.maxX > x + b[0] + 1e-6 && box.minX < x + b[3] - 1e-6 &&
          box.maxZ > z + b[2] + 1e-6 && box.minZ < z + b[5] - 1e-6)) return .2;
      }
    }
  }
  return 1;
}
