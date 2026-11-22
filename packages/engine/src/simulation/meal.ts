import { HOTBAR_SIZE, type Inventory } from "../ownership/inventory";
import { cloneStack, stackLimit } from "../ownership/stack";
import { foodOf, stackId } from "../catalog/items";
import { eat, MAX_FOOD, type HungerState } from "./hunger";
import { applyPoison, sanitizePlayerStatus, type PlayerStatus } from "./status-effects";

/** Completed use is one synchronous inventory/hunger/status commit, after validating all owners.
 * A food source is a plain id/count owner; unrelated book/wear/activation metadata is refused. */
export function finishMeal(inventory: Inventory, hunger: HungerState, status: PlayerStatus, rand: () => number = Math.random): boolean {
  if (inventory.busy) return false;
  const index = inventory.selected, source = inventory.selectedStack();
  if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SIZE || !source || Object.getPrototypeOf(source) !== Object.prototype
    || Object.keys(source).some(k => k !== "id" && k !== "count") || !Object.prototype.hasOwnProperty.call(source, "id") || !Object.prototype.hasOwnProperty.call(source, "count")
    || !Number.isSafeInteger(source.count) || source.count < 1 || source.count > stackLimit(source) || !foodOf(source.id)) return false;
  if (!Number.isFinite(hunger.food) || hunger.food < 0 || hunger.food >= MAX_FOOD || !Number.isFinite(hunger.saturation) || hunger.saturation < 0 || hunger.saturation > hunger.food
    || !Number.isFinite(hunger.exhaustion) || hunger.exhaustion < 0 || hunger.exhaustion > 40 || !Number.isFinite(hunger.timer) || hunger.timer < 0) return false;
  const cleanStatus = sanitizePlayerStatus(status);
  if (cleanStatus.invalid) return false;
  const beforeHunger = JSON.stringify(hunger), beforeStatus = JSON.stringify(status), beforeSource = JSON.stringify(source);
  const nextHunger = { ...hunger }, nextStatus = cleanStatus.data;
  if (!eat(nextHunger, source.id, rand)) return false;
  if (source.id === stackId("spider_eye")) applyPoison(nextStatus);
  // A supplied RNG callback must not redirect or consume a different owner during the trial.
  if (inventory.selected !== index || inventory.slots[index] !== source || JSON.stringify(source) !== beforeSource || JSON.stringify(hunger) !== beforeHunger || JSON.stringify(status) !== beforeStatus) return false;
  const remainder = source.count === 1 ? null : { ...cloneStack(source), count: source.count - 1 };
  inventory.slots[index] = remainder;
  Object.assign(hunger, nextHunger);
  if (nextStatus.poison) status.poison = { ...nextStatus.poison }; else delete status.poison;
  return true;
}
