/**
 * Furnace smelting with Minecraft rules: one item every 10 s while fuel burns. A new piece of
 * fuel is consumed only when the previous one has burnt out and there is something to smelt.
 */
import type { ItemStack } from "./inventory";
import { maxStackOf, stackId } from "./items";

export const SMELT_SECONDS = 10;

/** Input -> output (block or item names). */
export const SMELTING_RECIPES: Readonly<Record<string, string>> = {
  iron_ore: "iron_ingot",
  gold_ore: "gold_ingot",
  sand: "glass",
  cobblestone: "stone",
  oak_log: "charcoal",
  birch_log: "charcoal",
  raw_porkchop: "cooked_porkchop",
  raw_chicken: "cooked_chicken",
};

/** Burn time in seconds (Minecraft: coal smelts 8 items, planks and logs 1.5, a stick 0.5). */
export const FUELS: Readonly<Record<string, number>> = {
  coal: 80,
  charcoal: 80,
  oak_planks: 15,
  oak_log: 15,
  birch_log: 15,
  stick: 5,
};

const recipeIds = new Map(Object.entries(SMELTING_RECIPES).map(([i, o]) => [stackId(i), stackId(o)]));
const fuelIds = new Map(Object.entries(FUELS).map(([n, s]) => [stackId(n), s]));

export function smeltResult(id: number): number | null {
  return recipeIds.get(id) ?? null;
}

export function fuelSeconds(id: number): number {
  return fuelIds.get(id) ?? 0;
}

export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  /** Seconds left on the burning fuel item. */
  burnLeft: number;
  /** Burn time of the current fuel item (for the flame gauge). */
  burnTotal: number;
  /** Smelting progress of the current item, 0..1. */
  progress: number;
}

export function createFurnace(): FurnaceState {
  return { input: null, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 };
}

function canSmelt(f: FurnaceState): boolean {
  if (!f.input) return false;
  const result = smeltResult(f.input.id);
  if (result === null) return false;
  return !f.output || (f.output.id === result && f.output.count < maxStackOf(result));
}

function take(stack: ItemStack | null): ItemStack | null {
  if (!stack) return null;
  stack.count--;
  return stack.count > 0 ? stack : null;
}

/** Advances a furnace by `dt` seconds (in steps, so long gaps catch up correctly). */
export function tickFurnace(f: FurnaceState, dt: number): void {
  let left = dt;
  while (left > 0) {
    const step = Math.min(left, 0.25);
    left -= step;
    if (f.burnLeft <= 0 && canSmelt(f) && f.fuel && fuelSeconds(f.fuel.id) > 0) {
      f.burnTotal = f.burnLeft = fuelSeconds(f.fuel.id);
      f.fuel = take(f.fuel);
    }
    if (f.burnLeft > 0) {
      f.burnLeft = Math.max(0, f.burnLeft - step);
      if (canSmelt(f)) {
        f.progress += step / SMELT_SECONDS;
        if (f.progress >= 1 - 1e-9) {
          const result = smeltResult(f.input!.id)!;
          f.output = f.output ? { ...f.output, count: f.output.count + 1 } : { id: result, count: 1 };
          f.input = take(f.input);
          f.progress = 0;
        }
      } else {
        f.progress = 0;
      }
    } else {
      // Minecraft: progress falls back when the fire goes out.
      f.progress = Math.max(0, f.progress - (2 * step) / SMELT_SECONDS);
    }
  }
}

/** Everything held in a furnace, e.g. to return to the player when it is broken. */
export function furnaceContents(f: FurnaceState): ItemStack[] {
  return [f.input, f.fuel, f.output].filter((s): s is ItemStack => s !== null);
}
