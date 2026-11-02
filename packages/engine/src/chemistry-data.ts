/**
 * Chemistry data for the Education Edition chemistry blocks. All tables are plain data and are only
 * ever read through Maps built from them (never indexed by user strings).
 */

export interface ElementData {
  /** Atomic number (protons). */
  z: number;
  symbol: string;
  name: string;
  /** Mass number of the most abundant (or, if none is stable, best-known) isotope. */
  a: number;
  /** Other real isotopes (mass numbers) the Element Constructor can make. */
  isotopes: readonly number[];
  /** Periodic-table group, for icon colours. */
  category: "nonmetal" | "noble" | "alkali" | "alkaline" | "metalloid" | "halogen" | "transition" | "post-transition";
}

/** Elements 1-36 (hydrogen to krypton) with their most abundant isotope and other well-known real isotopes. */
export const ELEMENTS: readonly ElementData[] = [
  { z: 1, symbol: "H", name: "Hydrogen", a: 1, isotopes: [2, 3], category: "nonmetal" },
  { z: 2, symbol: "He", name: "Helium", a: 4, isotopes: [3], category: "noble" },
  { z: 3, symbol: "Li", name: "Lithium", a: 7, isotopes: [6], category: "alkali" },
  { z: 4, symbol: "Be", name: "Beryllium", a: 9, isotopes: [10], category: "alkaline" },
  { z: 5, symbol: "B", name: "Boron", a: 11, isotopes: [10], category: "metalloid" },
  { z: 6, symbol: "C", name: "Carbon", a: 12, isotopes: [13, 14], category: "nonmetal" },
  { z: 7, symbol: "N", name: "Nitrogen", a: 14, isotopes: [15], category: "nonmetal" },
  { z: 8, symbol: "O", name: "Oxygen", a: 16, isotopes: [17, 18], category: "nonmetal" },
  { z: 9, symbol: "F", name: "Fluorine", a: 19, isotopes: [18], category: "halogen" },
  { z: 10, symbol: "Ne", name: "Neon", a: 20, isotopes: [21, 22], category: "noble" },
  { z: 11, symbol: "Na", name: "Sodium", a: 23, isotopes: [22, 24], category: "alkali" },
  { z: 12, symbol: "Mg", name: "Magnesium", a: 24, isotopes: [25, 26], category: "alkaline" },
  { z: 13, symbol: "Al", name: "Aluminium", a: 27, isotopes: [26], category: "post-transition" },
  { z: 14, symbol: "Si", name: "Silicon", a: 28, isotopes: [29, 30], category: "metalloid" },
  { z: 15, symbol: "P", name: "Phosphorus", a: 31, isotopes: [32], category: "nonmetal" },
  { z: 16, symbol: "S", name: "Sulfur", a: 32, isotopes: [33, 34, 36], category: "nonmetal" },
  { z: 17, symbol: "Cl", name: "Chlorine", a: 35, isotopes: [37], category: "halogen" },
  { z: 18, symbol: "Ar", name: "Argon", a: 40, isotopes: [36, 38], category: "noble" },
  { z: 19, symbol: "K", name: "Potassium", a: 39, isotopes: [40, 41], category: "alkali" },
  { z: 20, symbol: "Ca", name: "Calcium", a: 40, isotopes: [42, 43, 44, 46, 48], category: "alkaline" },
  { z: 21, symbol: "Sc", name: "Scandium", a: 45, isotopes: [46], category: "transition" },
  { z: 22, symbol: "Ti", name: "Titanium", a: 48, isotopes: [46, 47, 49, 50], category: "transition" },
  { z: 23, symbol: "V", name: "Vanadium", a: 51, isotopes: [50], category: "transition" },
  { z: 24, symbol: "Cr", name: "Chromium", a: 52, isotopes: [50, 53, 54], category: "transition" },
  { z: 25, symbol: "Mn", name: "Manganese", a: 55, isotopes: [54], category: "transition" },
  { z: 26, symbol: "Fe", name: "Iron", a: 56, isotopes: [54, 57, 58, 60], category: "transition" },
  { z: 27, symbol: "Co", name: "Cobalt", a: 59, isotopes: [60], category: "transition" },
  { z: 28, symbol: "Ni", name: "Nickel", a: 58, isotopes: [60, 61, 62, 64], category: "transition" },
  { z: 29, symbol: "Cu", name: "Copper", a: 63, isotopes: [65], category: "transition" },
  { z: 30, symbol: "Zn", name: "Zinc", a: 64, isotopes: [66, 67, 68, 70], category: "transition" },
  { z: 31, symbol: "Ga", name: "Gallium", a: 69, isotopes: [71], category: "post-transition" },
  { z: 32, symbol: "Ge", name: "Germanium", a: 74, isotopes: [70, 72, 73, 76], category: "metalloid" },
  { z: 33, symbol: "As", name: "Arsenic", a: 75, isotopes: [73], category: "metalloid" },
  { z: 34, symbol: "Se", name: "Selenium", a: 80, isotopes: [74, 76, 77, 78, 82], category: "nonmetal" },
  { z: 35, symbol: "Br", name: "Bromine", a: 79, isotopes: [81], category: "halogen" },
  { z: 36, symbol: "Kr", name: "Krypton", a: 84, isotopes: [78, 80, 82, 83, 86], category: "noble" },
];

export const MAX_Z = ELEMENTS.length;

/** Item name for an element ("oxygen") and an isotope ("carbon_14"). */
export const elementItemName = (e: ElementData) => e.name.toLowerCase();
export const isotopeItemName = (e: ElementData, mass: number) => `${e.name.toLowerCase()}_${mass}`;

export interface CompoundData {
  name: string;
  displayName: string;
  formula: string;
  /** Element symbol -> count (exactly these, in a Compound Creator). */
  recipe: ReadonlyArray<readonly [string, number]>;
  /** Added after the Lab Table products: its item is registered after them, so existing ids don't move. */
  appended?: boolean;
}

/** Education Edition compounds (item names avoid block names, e.g. the water block) whose elements are all within 1-36, with their correct formulas. */
export const COMPOUNDS: readonly CompoundData[] = [
  { name: "water_compound", displayName: "Water", formula: "H₂O", recipe: [["H", 2], ["O", 1]] },
  { name: "salt", displayName: "Salt", formula: "NaCl", recipe: [["Na", 1], ["Cl", 1]] },
  { name: "ammonia", displayName: "Ammonia", formula: "NH₃", recipe: [["N", 1], ["H", 3]] },
  { name: "hydrogen_peroxide", displayName: "Hydrogen Peroxide", formula: "H₂O₂", recipe: [["H", 2], ["O", 2]] },
  { name: "latex", displayName: "Latex", formula: "C₅H₈", recipe: [["C", 5], ["H", 8]] },
  { name: "glue", displayName: "Glue", formula: "C₅H₅NO₂", recipe: [["C", 5], ["H", 5], ["N", 1], ["O", 2]] },
  { name: "bleach", displayName: "Bleach", formula: "NaClO", recipe: [["Na", 1], ["Cl", 1], ["O", 1]] },
  { name: "sugar", displayName: "Sugar", formula: "C₆H₁₂O₆", recipe: [["C", 6], ["H", 12], ["O", 6]] },
  { name: "aluminium_oxide", displayName: "Aluminium Oxide", formula: "Al₂O₃", recipe: [["Al", 2], ["O", 3]] },
  { name: "benzene", displayName: "Benzene", formula: "C₆H₆", recipe: [["C", 6], ["H", 6]] },
  { name: "boron_trioxide", displayName: "Boron Trioxide", formula: "B₂O₃", recipe: [["B", 2], ["O", 3]] },
  { name: "calcium_bromide", displayName: "Calcium Bromide", formula: "CaBr₂", recipe: [["Ca", 1], ["Br", 2]] },
  { name: "calcium_chloride", displayName: "Calcium Chloride", formula: "CaCl₂", recipe: [["Ca", 1], ["Cl", 2]] },
  { name: "crude_oil", displayName: "Crude Oil", formula: "C₉H₂₀", recipe: [["C", 9], ["H", 20]] },
  { name: "iron_sulfide", displayName: "Iron Sulfide", formula: "FeS", recipe: [["Fe", 1], ["S", 1]] },
  { name: "lithium_hydride", displayName: "Lithium Hydride", formula: "LiH", recipe: [["Li", 1], ["H", 1]] },
  { name: "luminol", displayName: "Luminol", formula: "C₈H₇N₃O₂", recipe: [["C", 8], ["H", 7], ["N", 3], ["O", 2]] },
  { name: "magnesium_nitrate", displayName: "Magnesium Nitrate", formula: "Mg(NO₃)₂", recipe: [["Mg", 1], ["N", 2], ["O", 6]] },
  { name: "magnesium_oxide", displayName: "Magnesium Oxide", formula: "MgO", recipe: [["Mg", 1], ["O", 1]] },
  { name: "soap", displayName: "Soap", formula: "C₁₈H₃₅NaO₂", recipe: [["C", 18], ["H", 35], ["Na", 1], ["O", 2]] },
  { name: "sodium_acetate", displayName: "Sodium Acetate", formula: "C₂H₃NaO₂", recipe: [["C", 2], ["H", 3], ["Na", 1], ["O", 2]] },
  { name: "sodium_fluoride", displayName: "Sodium Fluoride", formula: "NaF", recipe: [["Na", 1], ["F", 1]] },
  { name: "sodium_hydride", displayName: "Sodium Hydride", formula: "NaH", recipe: [["Na", 1], ["H", 1]] },
  { name: "sodium_hydroxide", displayName: "Sodium Hydroxide", formula: "NaOH", recipe: [["Na", 1], ["O", 1], ["H", 1]] },
  { name: "sodium_oxide", displayName: "Sodium Oxide", formula: "Na₂O", recipe: [["Na", 2], ["O", 1]] },
  { name: "charcoal_compound", displayName: "Charcoal (C₇H₄O)", formula: "C₇H₄O", recipe: [["C", 7], ["H", 4], ["O", 1]] },
  // Increment 6b: the glow stick's crafting ingredient (Education Edition's polyethylene, (C₂H₄)₅).
  { name: "polyethylene", displayName: "Polyethylene", formula: "(C₂H₄)₅", recipe: [["C", 10], ["H", 20]], appended: true },
];

/** Material Reducer: block/item name -> elements it breaks down into (curated, simplified formulas). */
export const REDUCTIONS: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, number]>]> = [
  ["sand", [["Si", 1], ["O", 2]]],
  ["glass", [["Si", 1], ["O", 2]]],
  ["gravel", [["Si", 1], ["O", 2]]],
  ["stone", [["Si", 1], ["O", 2]]],
  ["cobblestone", [["Si", 1], ["O", 2]]],
  ["dirt", [["Si", 1], ["Al", 1], ["O", 3]]],
  ["oak_log", [["C", 6], ["H", 10], ["O", 5]]],
  ["birch_log", [["C", 6], ["H", 10], ["O", 5]]],
  ["oak_planks", [["C", 6], ["H", 10], ["O", 5]]],
  ["snow", [["H", 2], ["O", 1]]],
  ["coal", [["C", 1]]],
  ["charcoal", [["C", 1]]],
  ["diamond", [["C", 1]]],
  ["iron_ingot", [["Fe", 1]]],
  ["iron_ore", [["Fe", 2], ["O", 3]]],
  ["coal_ore", [["C", 1], ["Si", 1], ["O", 2]]],
];

/** Products of the chemistry stations (items, in registry order). */
export const LAB_PRODUCTS: ReadonlyArray<{ product: string; displayName: string }> = [
  { product: "heat_block", displayName: "Heat Block" },
  { product: "super_fertilizer", displayName: "Super Fertilizer" },
  { product: "ice_bomb", displayName: "Ice Bomb" },
  { product: "underwater_torch", displayName: "Underwater Torch" },
  // Crafted at the crafting table (see crafting.ts), as in Education Edition.
  { product: "glow_stick", displayName: "Glow Stick" },
];

/** Lab Table: exact ingredient multisets (item names and counts) -> a product. */
export interface LabReaction {
  product: string;
  ingredients: ReadonlyArray<readonly [string, number]>;
}

/** Education Edition Lab Table recipes. */
export const LAB_REACTIONS: readonly LabReaction[] = [
  { product: "heat_block", ingredients: [["iron", 1], ["water_compound", 1], ["salt", 1], ["charcoal", 1]] },
  { product: "super_fertilizer", ingredients: [["ammonia", 1], ["phosphorus", 1]] },
  { product: "ice_bomb", ingredients: [["sodium_acetate", 1], ["snow", 1]] },
  { product: "underwater_torch", ingredients: [["magnesium", 1], ["torch", 1]] },
];
