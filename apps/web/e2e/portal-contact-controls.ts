import { bodyBox, type PortalRecord, type Vec3 } from '@craft/engine';

export function overlapsOwnedPortal(feet: Vec3, frame: PortalRecord): boolean {
  if (![feet.x, feet.y, feet.z, frame.x, frame.y, frame.z, frame.width, frame.height].every(Number.isFinite)) return false;
  const b = bodyBox(feet);
  return b.minX < frame.x + (frame.axis === 'x' ? frame.width : 1) && b.maxX > frame.x &&
    b.minY < frame.y + frame.height && b.maxY > frame.y &&
    b.minZ < frame.z + (frame.axis === 'z' ? frame.width : 1) && b.maxZ > frame.z;
}
/** Fixture approach is along -Z. Bounded pulses stop before crossing the centre of the source volume.
 * Geometry is checked again after input release; a crossed/unsafe stance fails instead of waiting outside. */
export function portalApproachPulse(feet: Vec3, frame: PortalRecord): number {
  if (frame.axis !== 'x' || ![feet.x, feet.y, feet.z].every(Number.isFinite) ||
    Math.abs(feet.y - frame.y) > .15 || feet.x < frame.x + .3 || feet.x > frame.x + frame.width - .3) throw Error('Unsafe controlled portal approach');
  if (overlapsOwnedPortal(feet, frame)) return 0;
  const distance = feet.z - (frame.z + .5);
  if (distance <= 0) throw Error('Passed source contact volume; no blind forward movement');
  return Math.max(8, Math.min(40, distance / 4.317 * 1000 * .25));
}
