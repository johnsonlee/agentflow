/** Length of a full day/night cycle in seconds (Minecraft: 20 minutes). */
export const DAY_LENGTH = 1200;

export interface SkyState {
  /** Sky colour as RGB in 0..1. */
  sky: [number, number, number];
  /** Global light multiplier for terrain, 0.2..1. */
  light: number;
  /** Angle of the sun in radians; 0 = sunrise, PI/2 = noon. */
  sunAngle: number;
}

const DAY: [number, number, number] = [0.47, 0.65, 1.0];
const DUSK: [number, number, number] = [0.98, 0.55, 0.32];
const NIGHT: [number, number, number] = [0.02, 0.03, 0.08];

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Sky colour and light level for a time of day in [0, 1) where 0 = sunrise and 0.25 = noon. */
export function skyAt(timeOfDay: number): SkyState {
  const t = ((timeOfDay % 1) + 1) % 1;
  const sunAngle = t * Math.PI * 2;
  const elevation = Math.sin(sunAngle);
  const daylight = Math.min(1, Math.max(0, (elevation + 0.15) / 0.45));
  let sky = mix(NIGHT, DAY, daylight);
  const duskAmount = Math.max(0, 1 - Math.abs(elevation) / 0.25) * (daylight > 0 ? 1 : 0.4);
  sky = mix(sky, DUSK, duskAmount * 0.6);
  return { sky, light: 0.2 + 0.8 * daylight, sunAngle };
}
