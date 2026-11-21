/** Bounded application Poison model. Bedrock's item snippet supplies duration5/chance1;
 * interval, phase, nonlethal floor and saturation are not calibrated Education runtime parity. */
export const POISON = Object.freeze({ duration: 5, interval: 1.25 });
export interface PlayerStatus { poison?: { remaining: number; elapsed: number } }
export function createPlayerStatus(): PlayerStatus { return {}; }
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const own = (v: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(v, k);
/** Absence is a legacy empty owner; present corruption is diagnosed, never repaired into valid poison. */
export function sanitizePlayerStatus(raw: unknown): { data: PlayerStatus; invalid: number; present: boolean } {
  const fail = () => ({ data: createPlayerStatus(), invalid: 1, present: true });
  try {
  if (raw === undefined) return { data: createPlayerStatus(), invalid: 0, present: false };
  if (!plain(raw) || Object.keys(raw).some(k => k !== "poison")) return fail();
  if (!own(raw, "poison")) return { data: createPlayerStatus(), invalid: 0, present: true };
  const p = raw.poison;
  if (!plain(p) || Object.keys(p).length !== 2 || !own(p, "remaining") || !own(p, "elapsed") || !finite(p.remaining) || p.remaining <= 0 || p.remaining > POISON.duration || !finite(p.elapsed) || p.elapsed < 0 || p.elapsed >= POISON.interval) return fail();
  return { data: { poison: { remaining: p.remaining, elapsed: p.elapsed } }, invalid: 0, present: true };
  } catch { return fail(); }
}
export function applyPoison(status: PlayerStatus): void {
  // Re-eating refreshes duration without postponing the next already-earned damage tick.
  status.poison = { remaining: POISON.duration, elapsed: status.poison?.elapsed ?? 0 };
}
export function clearPlayerStatus(status: PlayerStatus): void { delete status.poison; }
/** Caller gates active play/pause/death/recovery. Offline wall time is deliberately absent.
 * Returns a health delta; damage bypasses melee armor/iFrames and never reduces health below1.
 * Creative time advances with damageEnabled=false, without damaging the player. */
export function tickPlayerStatus(status: PlayerStatus, dt: number, health: number, damageEnabled = true): number {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(health) || sanitizePlayerStatus(status).invalid || !status.poison) return 0;
  const p = status.poison, duration = Math.min(dt, p.remaining), total = p.elapsed + duration;
  const ticks = Math.floor((total + 1e-10) / POISON.interval);
  const elapsed = Math.max(0, total - ticks * POISON.interval);
  const remaining = Math.max(0, p.remaining - duration);
  if (remaining <= 1e-10) delete status.poison;
  else status.poison = { remaining, elapsed };
  const damage = damageEnabled ? Math.min(ticks, Math.max(0, health - 1)) : 0;
  return damage > 0 ? -damage : 0;
}
