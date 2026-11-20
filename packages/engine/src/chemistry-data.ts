/**
 * Chemistry data for the Education Edition chemistry blocks. All tables are plain data and are only
 * ever read through Maps built from them (never indexed by user strings).
 */

export interface ElementData {
  /** Atomic number (protons). */
  z: number;
  symbol: string;
  name: string;
  /** Mass number of the most abundant isotope, or a selected NIST-listed reference isotope. */
  a: number;
  /** Other real isotopes (mass numbers) the Element Constructor can make. */
  isotopes: readonly number[];
  /** Periodic-table group, for icon colours. */
  category: "nonmetal" | "noble" | "alkali" | "alkaline" | "metalloid" | "halogen" | "transition" | "post-transition" | "lanthanide" | "actinide";
}

/** Elements 1-36 (hydrogen to krypton) with their most abundant isotope and other well-known real isotopes. */
export const LEGACY_ELEMENTS: readonly ElementData[] = [
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

/**
 * Elements 37-118. Symbols/names/groups: NIH PubChem periodic table; isotope mass numbers and
 * natural abundances: NIST Atomic Weights and Isotopic Compositions (retrieved 2026-11-20).
 * https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON
 * https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl?ele=&ascii=ascii2&isotype=all
 * Each radioactive default is a selected real reference isotope, not a claim of natural abundance.
 * Natural isotopes plus a small curated set of radioisotopes are included; this is not the full
 * Education Edition isotope list. Keep LEGACY_ELEMENTS unchanged: saved item ids depend on it.
 */
export const ADDITIONAL_ELEMENTS: readonly ElementData[] = [
  { z: 37, symbol: "Rb", name: "Rubidium", a: 85, isotopes: [87], category: "alkali" },
  { z: 38, symbol: "Sr", name: "Strontium", a: 88, isotopes: [84, 86, 87], category: "alkaline" },
  { z: 39, symbol: "Y", name: "Yttrium", a: 89, isotopes: [], category: "transition" },
  { z: 40, symbol: "Zr", name: "Zirconium", a: 90, isotopes: [91, 92, 94, 96], category: "transition" },
  { z: 41, symbol: "Nb", name: "Niobium", a: 93, isotopes: [], category: "transition" },
  { z: 42, symbol: "Mo", name: "Molybdenum", a: 98, isotopes: [92, 94, 95, 96, 97, 100], category: "transition" },
  { z: 43, symbol: "Tc", name: "Technetium", a: 98, isotopes: [97, 99], category: "transition" },
  { z: 44, symbol: "Ru", name: "Ruthenium", a: 102, isotopes: [96, 98, 99, 100, 101, 104], category: "transition" },
  { z: 45, symbol: "Rh", name: "Rhodium", a: 103, isotopes: [], category: "transition" },
  { z: 46, symbol: "Pd", name: "Palladium", a: 106, isotopes: [102, 104, 105, 108, 110], category: "transition" },
  { z: 47, symbol: "Ag", name: "Silver", a: 107, isotopes: [109], category: "transition" },
  { z: 48, symbol: "Cd", name: "Cadmium", a: 114, isotopes: [106, 108, 110, 111, 112, 113, 116], category: "transition" },
  { z: 49, symbol: "In", name: "Indium", a: 115, isotopes: [113], category: "post-transition" },
  { z: 50, symbol: "Sn", name: "Tin", a: 120, isotopes: [112, 114, 115, 116, 117, 118, 119, 122, 124], category: "post-transition" },
  { z: 51, symbol: "Sb", name: "Antimony", a: 121, isotopes: [123], category: "metalloid" },
  { z: 52, symbol: "Te", name: "Tellurium", a: 130, isotopes: [120, 122, 123, 124, 125, 126, 128], category: "metalloid" },
  { z: 53, symbol: "I", name: "Iodine", a: 127, isotopes: [], category: "halogen" },
  { z: 54, symbol: "Xe", name: "Xenon", a: 132, isotopes: [124, 126, 128, 129, 130, 131, 134, 136], category: "noble" },
  { z: 55, symbol: "Cs", name: "Caesium", a: 133, isotopes: [], category: "alkali" },
  { z: 56, symbol: "Ba", name: "Barium", a: 138, isotopes: [130, 132, 134, 135, 136, 137], category: "alkaline" },
  { z: 57, symbol: "La", name: "Lanthanum", a: 139, isotopes: [138], category: "lanthanide" },
  { z: 58, symbol: "Ce", name: "Cerium", a: 140, isotopes: [136, 138, 142], category: "lanthanide" },
  { z: 59, symbol: "Pr", name: "Praseodymium", a: 141, isotopes: [], category: "lanthanide" },
  { z: 60, symbol: "Nd", name: "Neodymium", a: 142, isotopes: [143, 144, 145, 146, 148, 150], category: "lanthanide" },
  { z: 61, symbol: "Pm", name: "Promethium", a: 145, isotopes: [147], category: "lanthanide" },
  { z: 62, symbol: "Sm", name: "Samarium", a: 152, isotopes: [144, 147, 148, 149, 150, 154], category: "lanthanide" },
  { z: 63, symbol: "Eu", name: "Europium", a: 153, isotopes: [151], category: "lanthanide" },
  { z: 64, symbol: "Gd", name: "Gadolinium", a: 158, isotopes: [152, 154, 155, 156, 157, 160], category: "lanthanide" },
  { z: 65, symbol: "Tb", name: "Terbium", a: 159, isotopes: [], category: "lanthanide" },
  { z: 66, symbol: "Dy", name: "Dysprosium", a: 164, isotopes: [156, 158, 160, 161, 162, 163], category: "lanthanide" },
  { z: 67, symbol: "Ho", name: "Holmium", a: 165, isotopes: [], category: "lanthanide" },
  { z: 68, symbol: "Er", name: "Erbium", a: 166, isotopes: [162, 164, 167, 168, 170], category: "lanthanide" },
  { z: 69, symbol: "Tm", name: "Thulium", a: 169, isotopes: [], category: "lanthanide" },
  { z: 70, symbol: "Yb", name: "Ytterbium", a: 174, isotopes: [168, 170, 171, 172, 173, 176], category: "lanthanide" },
  { z: 71, symbol: "Lu", name: "Lutetium", a: 175, isotopes: [176], category: "lanthanide" },
  { z: 72, symbol: "Hf", name: "Hafnium", a: 180, isotopes: [174, 176, 177, 178, 179], category: "transition" },
  { z: 73, symbol: "Ta", name: "Tantalum", a: 181, isotopes: [180], category: "transition" },
  { z: 74, symbol: "W", name: "Tungsten", a: 184, isotopes: [180, 182, 183, 186], category: "transition" },
  { z: 75, symbol: "Re", name: "Rhenium", a: 187, isotopes: [185], category: "transition" },
  { z: 76, symbol: "Os", name: "Osmium", a: 192, isotopes: [184, 186, 187, 188, 189, 190], category: "transition" },
  { z: 77, symbol: "Ir", name: "Iridium", a: 193, isotopes: [191], category: "transition" },
  { z: 78, symbol: "Pt", name: "Platinum", a: 195, isotopes: [190, 192, 194, 196, 198], category: "transition" },
  { z: 79, symbol: "Au", name: "Gold", a: 197, isotopes: [], category: "transition" },
  { z: 80, symbol: "Hg", name: "Mercury", a: 202, isotopes: [196, 198, 199, 200, 201, 204], category: "transition" },
  { z: 81, symbol: "Tl", name: "Thallium", a: 205, isotopes: [203], category: "post-transition" },
  { z: 82, symbol: "Pb", name: "Lead", a: 208, isotopes: [204, 206, 207], category: "post-transition" },
  { z: 83, symbol: "Bi", name: "Bismuth", a: 209, isotopes: [], category: "post-transition" },
  { z: 84, symbol: "Po", name: "Polonium", a: 209, isotopes: [210], category: "metalloid" },
  { z: 85, symbol: "At", name: "Astatine", a: 210, isotopes: [], category: "halogen" },
  { z: 86, symbol: "Rn", name: "Radon", a: 222, isotopes: [211, 220], category: "noble" },
  { z: 87, symbol: "Fr", name: "Francium", a: 223, isotopes: [], category: "alkali" },
  { z: 88, symbol: "Ra", name: "Radium", a: 226, isotopes: [], category: "alkaline" },
  { z: 89, symbol: "Ac", name: "Actinium", a: 227, isotopes: [], category: "actinide" },
  { z: 90, symbol: "Th", name: "Thorium", a: 232, isotopes: [], category: "actinide" },
  { z: 91, symbol: "Pa", name: "Protactinium", a: 231, isotopes: [], category: "actinide" },
  { z: 92, symbol: "U", name: "Uranium", a: 238, isotopes: [233, 234, 235, 236], category: "actinide" },
  { z: 93, symbol: "Np", name: "Neptunium", a: 237, isotopes: [], category: "actinide" },
  { z: 94, symbol: "Pu", name: "Plutonium", a: 244, isotopes: [239, 240, 241, 242], category: "actinide" },
  { z: 95, symbol: "Am", name: "Americium", a: 243, isotopes: [241], category: "actinide" },
  { z: 96, symbol: "Cm", name: "Curium", a: 247, isotopes: [244], category: "actinide" },
  { z: 97, symbol: "Bk", name: "Berkelium", a: 247, isotopes: [], category: "actinide" },
  { z: 98, symbol: "Cf", name: "Californium", a: 251, isotopes: [], category: "actinide" },
  { z: 99, symbol: "Es", name: "Einsteinium", a: 252, isotopes: [], category: "actinide" },
  { z: 100, symbol: "Fm", name: "Fermium", a: 257, isotopes: [], category: "actinide" },
  { z: 101, symbol: "Md", name: "Mendelevium", a: 258, isotopes: [], category: "actinide" },
  { z: 102, symbol: "No", name: "Nobelium", a: 259, isotopes: [], category: "actinide" },
  { z: 103, symbol: "Lr", name: "Lawrencium", a: 266, isotopes: [], category: "actinide" },
  { z: 104, symbol: "Rf", name: "Rutherfordium", a: 267, isotopes: [], category: "transition" },
  { z: 105, symbol: "Db", name: "Dubnium", a: 268, isotopes: [], category: "transition" },
  { z: 106, symbol: "Sg", name: "Seaborgium", a: 269, isotopes: [], category: "transition" },
  { z: 107, symbol: "Bh", name: "Bohrium", a: 270, isotopes: [], category: "transition" },
  { z: 108, symbol: "Hs", name: "Hassium", a: 269, isotopes: [], category: "transition" },
  { z: 109, symbol: "Mt", name: "Meitnerium", a: 278, isotopes: [], category: "transition" },
  { z: 110, symbol: "Ds", name: "Darmstadtium", a: 281, isotopes: [], category: "transition" },
  { z: 111, symbol: "Rg", name: "Roentgenium", a: 282, isotopes: [], category: "transition" },
  { z: 112, symbol: "Cn", name: "Copernicium", a: 285, isotopes: [], category: "transition" },
  { z: 113, symbol: "Nh", name: "Nihonium", a: 286, isotopes: [], category: "post-transition" },
  { z: 114, symbol: "Fl", name: "Flerovium", a: 289, isotopes: [], category: "post-transition" },
  { z: 115, symbol: "Mc", name: "Moscovium", a: 290, isotopes: [], category: "post-transition" },
  { z: 116, symbol: "Lv", name: "Livermorium", a: 293, isotopes: [], category: "post-transition" },
  { z: 117, symbol: "Ts", name: "Tennessine", a: 294, isotopes: [], category: "halogen" },
  { z: 118, symbol: "Og", name: "Oganesson", a: 294, isotopes: [], category: "noble" },
];

export const ELEMENTS: readonly ElementData[] = [...LEGACY_ELEMENTS, ...ADDITIONAL_ELEMENTS];

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
export const LEGACY_COMPOUNDS: readonly CompoundData[] = [
  { name: "water_compound", displayName: "Water", formula: "H₂O", recipe: [["H", 2], ["O", 1]] },
  { name: "salt", displayName: "Salt", formula: "NaCl", recipe: [["Na", 1], ["Cl", 1]] },
  { name: "ammonia", displayName: "Ammonia", formula: "NH₃", recipe: [["N", 1], ["H", 3]] },
  { name: "hydrogen_peroxide", displayName: "Hydrogen Peroxide", formula: "H₂O₂", recipe: [["H", 2], ["O", 2]] },
  { name: "latex", displayName: "Latex", formula: "C₅H₈", recipe: [["C", 5], ["H", 8]] },
  { name: "glue", displayName: "Glue", formula: "C₅H₅NO₂", recipe: [["C", 5], ["H", 5], ["N", 1], ["O", 2]] },
  { name: "sodium_hypochlorite", displayName: "Sodium Hypochlorite", formula: "NaClO", recipe: [["Na", 1], ["Cl", 1], ["O", 1]] },
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

/** Remaining Compound Creator formulas in the official Chemistry Lab Journal, printed pp. 4-6.
 * https://education.minecraft.net/content/dam/education-edition/learning-experiences/chemistry/Chemistry-Lab-Journal.pdf
 * Keep legacy registrations separate: appending these must not move existing saved item ids.
 */
export const ADDITIONAL_COMPOUNDS: readonly CompoundData[] = [
  { name: "ink_compound", displayName: "Ink (Iron Sulfate)", formula: "FeSO₄", recipe: [["Fe", 1], ["S", 1], ["O", 4]] },
  { name: "barium_sulfate", displayName: "Barium Sulfate", formula: "BaSO₄", recipe: [["Ba", 1], ["S", 1], ["O", 4]] },
  { name: "sulfate", displayName: "Sulfate", formula: "SO₄", recipe: [["S", 1], ["O", 4]] },
  { name: "potassium_iodide", displayName: "Potassium Iodide", formula: "KI", recipe: [["K", 1], ["I", 1]] },
  { name: "mercuric_chloride", displayName: "Mercuric Chloride", formula: "HgCl₂", recipe: [["Hg", 1], ["Cl", 2]] },
  { name: "potassium_chloride", displayName: "Potassium Chloride", formula: "KCl", recipe: [["K", 1], ["Cl", 1]] },
  { name: "cerium_chloride", displayName: "Cerium Chloride", formula: "CeCl₃", recipe: [["Ce", 1], ["Cl", 3]] },
  { name: "tungsten_chloride", displayName: "Tungsten Chloride", formula: "WCl₆", recipe: [["W", 1], ["Cl", 6]] },
];

export const COMPOUNDS: readonly CompoundData[] = [...LEGACY_COMPOUNDS, ...ADDITIONAL_COMPOUNDS];

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
  // Official Chemistry Lab Journal, printed p11 screenshot: C15, O64+6, N8, P7.
  // Historical guide composition, not a claim of current Education-client parity.
  ["grass", [["C", 15], ["O", 70], ["N", 8], ["P", 7]]],
];

/** Products of the chemistry stations (items, in registry order). */
export const LAB_PRODUCTS: ReadonlyArray<{ product: string; displayName: string }> = [
  { product: "heat_block", displayName: "Heat Block" },
  { product: "super_fertilizer", displayName: "Super Fertilizer" },
  { product: "ice_bomb", displayName: "Ice Bomb" },
  // Crafted at the crafting table; keep this legacy registration position for saved IDs.
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
  { product: "ice_bomb", ingredients: [["sodium_acetate", 4]] },
  { product: "bleach", ingredients: [["water_compound", 3], ["sodium_hypochlorite", 3]] },
];
