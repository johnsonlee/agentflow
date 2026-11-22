/**
 * Furnace smelting uses the existing application model: one item every 10 s while fuel burns. A new piece of
 * fuel is consumed only when the previous one has burnt out and there is something to smelt.
 */
import type { ItemStack } from "../ownership/inventory";
import { isKnownId, stackId } from "../catalog/items";

import { cloneStack, hasCloneableBookMetadata, stackLimit, stacksCompatible } from "../ownership/stack";
import { freshStack } from "../ownership/glow-stick-state";
import { inspectItemState } from "../ownership/item-state";

export const SMELT_SECONDS = 10;

/** Input -> output (block or item names). */
export const SMELTING_RECIPES: Readonly<Record<string, string>> = {
  iron_ore: "iron_ingot",
  coal_ore: "coal",
  diamond_ore: "diamond",
  redstone_ore: "redstone",
  gold_ore: "gold_ingot",
  sand: "glass",
  cobblestone: "stone",
  oak_log: "charcoal",
  birch_log: "charcoal",
  raw_porkchop: "cooked_porkchop",
  raw_chicken: "cooked_chicken",
  raw_beef: "cooked_beef",
  netherrack: "nether_brick",
};

/** Burn time in seconds (Minecraft: coal smelts 8 items, planks and logs 1.5, a stick 0.5). */
export const FUELS: Readonly<Record<string, number>> = {
  coal: 80,
  charcoal: 80,
  oak_planks: 15,
  // Same bounded furnace policy as Oak; native burn-time calibration remains unverified.
  birch_planks: 15,
  oak_log: 15,
  birch_log: 15,
  stick: 5,
  wooden_hoe: 10,
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
  /** Input ID that earned nonzero progress; absent in legacy saves and idle furnaces. */
  progressInputId?: number;
}

export function createFurnace(): FurnaceState {
  return { input: null, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 };
}

function resetProgress(f: FurnaceState): void {
  f.progress = 0;
  delete f.progressInputId;
}

/** Transfers input ownership unchanged and returns the previous owner to the caller. */
export function setFurnaceInput(f: FurnaceState, incoming: ItemStack | null): ItemStack | null {
  // Returning an invalid incoming owner unchanged lets the cursor retain it transactionally.
  if (incoming && (!isKnownId(incoming.id) || !Number.isSafeInteger(incoming.count) || incoming.count < 1
    || inspectItemState(incoming).kind === "invalid" || !hasCloneableBookMetadata(incoming) || incoming.count > stackLimit(incoming))) return incoming;
  const previous = f.input;
  // Removing and reinserting between simulation frames must also forfeit partial work.
  if (previous?.id !== incoming?.id) resetProgress(f);
  f.input = incoming;
  return previous;
}

function canSmelt(f: FurnaceState): boolean {
  if (!f.input) return false;
  const result = smeltResult(f.input.id);
  if (result === null) return false;
  const produced = freshStack(result);
  return !f.output || (stacksCompatible(f.output, produced) && f.output.count < stackLimit(produced));
}

function take(stack: ItemStack | null): ItemStack | null {
  if (!stack) return null;
  stack.count--;
  return stack.count > 0 ? stack : null;
}

/** Advances a furnace by `dt` seconds (in steps, so long gaps catch up correctly). */
export function tickFurnace(f: FurnaceState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (f.progress > 0) {
    const id = f.input?.id;
    if (id === undefined || smeltResult(id) === null || (f.progressInputId !== undefined && f.progressInputId !== id)) resetProgress(f);
    else f.progressInputId = id; // Legacy unbound progress belongs to its current valid input.
  } else delete f.progressInputId;
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
        f.progressInputId = f.input!.id;
        f.progress += step / SMELT_SECONDS;
        if (f.progress >= 1 - 1e-9) {
          const result = smeltResult(f.input!.id)!;
          f.output = f.output ? cloneStack(f.output, f.output.count + 1) : freshStack(result);
          f.input = take(f.input);
          resetProgress(f);
        }
      } else {
        resetProgress(f);
      }
    } else {
      // The existing application model loses progress when the fire goes out.
      f.progress = Math.max(0, f.progress - (2 * step) / SMELT_SECONDS);
      if (f.progress === 0) delete f.progressInputId;
    }
  }
}

/** Everything held in a furnace, e.g. to return to the player when it is broken. */
export function furnaceContents(f: FurnaceState): ItemStack[] {
  return [f.input, f.fuel, f.output].filter((s): s is ItemStack => s !== null).map(stack => cloneStack(stack));
}
