import { elementBlockId } from "../catalog/blocks";
import { NATIVE_MATERIAL_REDUCTIONS } from "./native-reductions";
/**
 * Education Edition chemistry: Element Constructor, Compound Creator, Material Reducer and Lab Table.
 * Every lookup goes through Maps built from the data tables (never `obj[userString]`).
 */
import { isDocumentedEducationIsotope, supportedIsotopeMasses } from "./education-isotopes";
import { COMPOUNDS, ELEMENTS, LAB_REACTIONS, MAX_Z, REDUCTIONS, elementItemName, isotopeItemName, type ElementData } from "./chemistry-data";
import type { ItemStack } from "../ownership/inventory";
import { ITEMS, isKnownId, itemById, isItem, maxStackOf, nameOf, stackId } from "../catalog/items";

// Bounded input still covers Oganesson-294 (118 protons + 176 neutrons).
export const MAX_PARTICLES = 256;

/** A stack count the stations accept: a whole number from 1 to 64 (never 0, negative or NaN). */
const validCount = (n: number) => Number.isInteger(n) && n >= 1 && n <= 64;

const elementsByZ = new Map(ELEMENTS.map((e) => [e.z, e]));
const elementsBySymbol = new Map(ELEMENTS.map((e) => [e.symbol, e]));

export function elementByZ(z: number): ElementData | undefined {
  return elementsByZ.get(z);
}

/**
 * Element Constructor: protons pick the element (1-118); a neutral atom needs electrons = protons.
 * Neutrons matching the reference isotope give the element; another supported isotope gives that
 * isotope; anything else is refused with the reason.
 */
export function constructElement(protons: number, neutrons: number, electrons: number): { id: number } | { error: string } {
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_PARTICLES;
  if (!ok(protons) || !ok(neutrons) || !ok(electrons)) return { error: `Particle counts must be whole numbers from 0 to ${MAX_PARTICLES}` };
  const e = elementsByZ.get(protons);
  if (!e) return { error: protons === 0 ? "An element needs at least one proton" : `Only elements 1-${MAX_Z} can be built here` };
  if (electrons !== protons) return { error: `A neutral ${e.name} atom needs ${protons} electron${protons === 1 ? "" : "s"}` };
  const mass = protons + neutrons;
  if (mass === e.a) return { id: stackId(elementItemName(e)) };
  const masses = supportedIsotopeMasses(protons);
  if (masses.includes(mass)) return { id: stackId(isotopeItemName(e, mass)) };
  const known = masses.map((m) => m - protons);
  return { error: `${e.name}-${mass} isn't in the supported isotope catalogue (neutrons: ${known.join(", ")})` };
}

export interface ElementParticles {
  protons: number; neutrons: number; electrons: number;
  z: number; symbol: string; mass: number;
  /** Listed by the pinned 2018 guide; false for retained legacy scientific-only entries. */
  documented: boolean;
}

/** Detached owned-item lookup data; never treats a non-atom or malformed ID as an element. */
export function elementParticlesOf(id: number | null | undefined): ElementParticles | null {
  if (typeof id !== "number" || !Number.isInteger(id) || !isKnownId(id) || !isItem(id)) return null;
  const chem = itemById(id).chem;
  if (chem?.kind !== "element" && chem?.kind !== "isotope") return null;
  const z = chem.z, mass = chem.mass;
  if (typeof z !== "number" || typeof mass !== "number" || !Number.isInteger(z) || !Number.isInteger(mass)) return null;
  const element = elementsByZ.get(z);
  if (!element || element.symbol !== chem.symbol || !supportedIsotopeMasses(z).includes(mass)) return null;
  return { protons: z, neutrons: mass - z, electrons: z, z, symbol: element.symbol, mass, documented: isDocumentedEducationIsotope(z, mass) };
}

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
    if (!validCount(s.count)) return { error: "Invalid stack" };
    // Journal page 12 explicitly permits different isotopes in the Compound Creator.
    const symbol = elementParticlesOf(s.id)?.symbol;
    if (!symbol) return { error: "Only elements can go into the Compound Creator" };
    counts.set(symbol, (counts.get(symbol) ?? 0) + s.count);
  }
  if (counts.size === 0) return { error: "Add some elements" };
  const c = compoundsByRecipe.get(multisetKey(counts));
  return c ? { id: stackId(c.name) } : { error: "Those elements don't make a known compound" };
}

const nativeReductions = new Map(NATIVE_MATERIAL_REDUCTIONS.map((row) => [row.input, row]));
const reductions = new Map(REDUCTIONS.map(([name, parts]) => [name, parts]));
const compoundParts = new Map(COMPOUNDS.map((c) => [c.name, c.recipe]));

/**
 * Material Reducer: native candidate material rows plus legacy compatibility fallbacks.
 * Compound formulas and isotope->base fallback remain unverified against native runtime.
 * Returns bounded ordered stacks, or null if unsupported; Unknown0 is a material, never air.
 */
export function reduceMaterial(id: number): ItemStack[] | null {
  if (!isKnownId(id)) return null;
  const name = nameOf(id);
  const native = nativeReductions.get(name);
  // An equal string is not semantic identity: never consume a chemical atom as a native material block.
  if (native && (native.inputKind === "block" ? isItem(id) : !isItem(id) || itemById(id).chem !== undefined)) return null;
  const parts = reductions.get(name) ?? compoundParts.get(name);
  if (!parts) {
    // An isotope reduces to its element.
    const chem = isItem(id) ? itemById(id).chem : undefined;
    if (chem?.kind === "isotope" && chem.z !== undefined) return [{ id: stackId(elementItemName(elementsByZ.get(chem.z)!)), count: 1 }];
    return null;
  }
  const output: ItemStack[] = [];
  for (const [symbol, count] of parts) {
    const id = symbol === "?" ? elementBlockId(0) : stackId(elementItemName(elementsBySymbol.get(symbol)!));
    const maximum = maxStackOf(id);
    // Preserve aggregate composition and source order without producing invalid oversized stacks.
    for (let left = count; left > 0; left -= maximum) output.push({ id, count: Math.min(left, maximum) });
  }
  return output;
}

const reactionsByIngredients = new Map(LAB_REACTIONS.map((r) => [multisetKey(r.ingredients), r]));

/** Lab Table: the items in the slots must exactly match a reaction's ingredients. */
export function labReaction(slots: readonly (ItemStack | null)[]): { id: number } | { error: string } {
  const counts = new Map<string, number>();
  for (const s of slots) {
    if (!s) continue;
    if (!isKnownId(s.id)) return { error: "Unknown ingredient" };
    if (!validCount(s.count)) return { error: "Invalid stack" };
    const name = nameOf(s.id);
    counts.set(name, (counts.get(name) ?? 0) + s.count);
  }
  if (counts.size === 0) return { error: "Add some ingredients" };
  const r = reactionsByIngredients.get(multisetKey(counts));
  return r ? { id: stackId(r.product) } : { error: "Nothing happens" };
}
