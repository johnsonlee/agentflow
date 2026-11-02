/**
 * Minecraft hunger: a food level (0-20, shown as 10 drumsticks), hidden saturation and exhaustion.
 * Activity adds exhaustion; every 4 points spend saturation first, then food. A well-fed player
 * (food >= 18) slowly heals; an empty bar starves (Normal difficulty: down to half a heart).
 */
import { foodOf } from "./items";

export const MAX_FOOD = 20;
/** Seconds of holding "use" to finish eating (Minecraft: 32 ticks). */
export const EAT_SECONDS = 1.6;
const REGEN_INTERVAL = 4;
const STARVE_INTERVAL = 4;

/** Exhaustion costs (Minecraft). */
export const EXHAUSTION = {
  sprintPerBlock: 0.1,
  swimPerBlock: 0.01,
  jump: 0.05,
  sprintJump: 0.2,
  attack: 0.1,
  breakBlock: 0.005,
  heal: 6,
} as const;

export interface HungerState {
  food: number;
  saturation: number;
  exhaustion: number;
  /** Seconds accumulated towards the next regen or starvation tick. */
  timer: number;
}

export function createHunger(): HungerState {
  return { food: MAX_FOOD, saturation: 5, exhaustion: 0, timer: 0 };
}

export function addExhaustion(h: HungerState, amount: number): void {
  h.exhaustion = Math.min(40, h.exhaustion + amount);
  while (h.exhaustion >= 4) {
    h.exhaustion -= 4;
    if (h.saturation > 0) h.saturation = Math.max(0, h.saturation - 1);
    else h.food = Math.max(0, h.food - 1);
  }
}

/**
 * Advances hunger by `dt` seconds. Returns the health change: +1 for natural regeneration,
 * -1 for starvation, 0 otherwise.
 */
export function tickHunger(h: HungerState, dt: number, health: number, maxHealth: number): number {
  const regen = h.food >= 18 && health < maxHealth;
  const starve = h.food === 0 && health > 1;
  if (!regen && !starve) {
    h.timer = 0;
    return 0;
  }
  h.timer += dt;
  if (h.timer < (regen ? REGEN_INTERVAL : STARVE_INTERVAL)) return 0;
  h.timer = 0;
  if (regen) {
    addExhaustion(h, EXHAUSTION.heal);
    return 1;
  }
  return -1;
}

export function canEat(h: HungerState, id: number | null | undefined): boolean {
  return foodOf(id) !== null && h.food < MAX_FOOD;
}

/** Applies a finished meal. Returns false if `id` is not food or the player is full. */
export function eat(h: HungerState, id: number): boolean {
  const food = foodOf(id);
  if (!food || h.food >= MAX_FOOD) return false;
  h.food = Math.min(MAX_FOOD, h.food + food.hunger);
  h.saturation = Math.min(h.food, h.saturation + food.saturation);
  return true;
}
