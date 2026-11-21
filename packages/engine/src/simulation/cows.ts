import type { Mob } from "./entities";
/** Adult ordinary-Cow reference dimensions/HP; speed remains this application's walking model. */
export const COW = Object.freeze({ health: 10, width: .9, height: 1.3, speed: 1.1 });
export interface CowState { lifeStage: "adult" }
export function createCowState(): CowState { return { lifeStage: "adult" }; }
export function isCowState(raw: unknown): raw is CowState {
  try {
    return typeof raw === "object" && raw !== null && !Array.isArray(raw)
      && (Object.getPrototypeOf(raw) === Object.prototype || Object.getPrototypeOf(raw) === null)
      && Reflect.ownKeys(raw).length === 1 && Object.getOwnPropertyDescriptor(raw,"lifeStage")?.value === "adult";
  } catch { return false; }
}
/** A state predicate only: caller still validates live membership, health, reach and pending death. */
export function isAdultCow(mob: Mob): boolean { return mob.kind === "cow" && isCowState(mob.cowState); }
