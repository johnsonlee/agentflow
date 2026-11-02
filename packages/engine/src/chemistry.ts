/**
 * Education Edition chemistry: Element Constructor, Compound Creator, Material Reducer and Lab Table.
 * Every lookup goes through Maps built from the data tables (never `obj[userString]`).
 */
import { COMPOUNDS, ELEMENTS, LAB_REACTIONS, MAX_Z, REDUCTIONS, elementItemName, isotopeItemName, type ElementData } from "./chemistry-data";
import type { ItemStack } from "./inventory";
import { ITEMS, isKnownId, itemById, isItem, nameOf, stackId } from "./items";

export const MAX_PARTICLES = 140;

const elementsByZ = new Map(ELEMENTS.map((e) => [e.z, e]));
const elementsBySymbol = new Map(ELEMENTS.map((e) => [e.symbol, e]));

export function elementByZ(z: number): ElementData | undefined {
  return elementsByZ.get(z);
}

/**
 * Element Constructor: protons pick the element (1-36); a neutral atom needs electrons = protons.
 * Neutrons equal to the most abundant isotope give the element; another real isotope gives that
 * isotope; anything else is refused with the reason.
 */
export function constructElement(protons: number, neutrons: number, electrons: number): { id: number } | { error: string } {
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_PARTICLES;
  if (!ok(protons) || !ok(neutrons) || !ok(electrons)) return { error: "Particle counts must be whole numbers from 0 to 140" };
  const e = elementsByZ.get(protons);
  if (!e) return { error: protons === 0 ? "An element needs at least one proton" : `Only elements 1-${MAX_Z} can be built here` };
  if (electrons !== protons) return { error: `A neutral ${e.name} atom needs ${protons} electron${protons === 1 ? "" : "s"}` };
  const mass = protons + neutrons;
  if (mass === e.a) return { id: stackId(elementItemName(e)) };
  if (e.isotopes.includes(mass)) return { id: stackId(isotopeItemName(e, mass)) };
  const known = [e.a, ...e.isotopes].sort((a, b) => a - b).map((m) => m - protons);
  return { error: `${e.name}-${mass} isn't a known isotope (neutrons: ${known.join(", ")})` };
}

/** Element symbol of an element item id (isotopes don't count as plain elements), else undefined. */
const elementSymbolById = new Map(ITEMS.filter((i) => i.chem?.kind === "element").map((i) => [i.id, i.chem!.symbol!]));

const multisetKey = (entries: Iterable<readonly [string, number]>) =>
  [...entries].filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `${k}${n}`).join(",");

const compoundsByRecipe = new Map(COMPOUNDS.map((c) => [multisetKey(c.recipe), c]));

/**
 * Compound Creator: the elements in the slots (with their counts) must exactly match one
 * compound's formula. Returns the compound, or why not.
 */
export function createCompound(slots: readonly (ItemStack | null)[]): { id: number } | { error: string } {
  const counts = new Map<string, number>();
  for (const s of slots) {
    if (!s) continue;
    const symbol = elementSymbolById.get(s.id);
    if (!symbol) return { error: "Only elements can go into the Compound Creator" };
    counts.set(symbol, (counts.get(symbol) ?? 0) + s.count);
  }
  if (counts.size === 0) return { error: "Add some elements" };
  const c = compoundsByRecipe.get(multisetKey(counts));
  return c ? { id: stackId(c.name) } : { error: "Those elements don't make a known compound" };
}

const reductions = new Map(REDUCTIONS.map(([name, parts]) => [name, parts]));
const compoundParts = new Map(COMPOUNDS.map((c) => [c.name, c.recipe]));

/**
 * Material Reducer: a block or item breaks into its elements (curated mappings; compounds reduce
 * to their formula). Returns element stacks, or null if it can't be reduced.
 */
export function reduceMaterial(id: number): ItemStack[] | null {
  if (!isKnownId(id)) return null;
  const name = nameOf(id);
  const parts = reductions.get(name) ?? compoundParts.get(name);
  if (!parts) {
    // An isotope reduces to its element.
    const chem = isItem(id) ? itemById(id).chem : undefined;
    if (chem?.kind === "isotope" && chem.z !== undefined) return [{ id: stackId(elementItemName(elementsByZ.get(chem.z)!)), count: 1 }];
    return null;
  }
  return parts.map(([symbol, count]) => ({ id: stackId(elementItemName(elementsBySymbol.get(symbol)!)), count }));
}

const reactionsByIngredients = new Map(LAB_REACTIONS.map((r) => [multisetKey(r.ingredients), r]));

/** Lab Table: the items in the slots must exactly match a reaction's ingredients. */
export function labReaction(slots: readonly (ItemStack | null)[]): { id: number } | { error: string } {
  const counts = new Map<string, number>();
  for (const s of slots) {
    if (!s) continue;
    if (!isKnownId(s.id)) return { error: "Unknown ingredient" };
    const name = nameOf(s.id);
    counts.set(name, (counts.get(name) ?? 0) + s.count);
  }
  if (counts.size === 0) return { error: "Add some ingredients" };
  const r = reactionsByIngredients.get(multisetKey(counts));
  return r ? { id: stackId(r.product) } : { error: "Nothing happens" };
}
