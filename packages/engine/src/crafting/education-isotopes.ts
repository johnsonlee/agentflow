import { ELEMENTS } from "./chemistry-data";

/** Official 2018 Education input guide; neutral combinations, not proof of current client/NBT behavior. */
export const EDUCATION_ISOTOPE_GUIDE_SOURCE = {
  url: "https://education.minecraft.net/content/dam/education-edition/learning-experiences/chemistry/Minecraft_Elements.pdf",
  sha256: "2dffb34389fe7478507a1d3a0726ac2712f91bf59012c723f28a80472cd16cef",
  internalDate: "2018-02-20",
} as const;

/** Atomic number, source symbol, exact listed neutron counts. Gaps are intentional. */
export const EDUCATION_ISOTOPE_GUIDE: readonly (readonly [z: number, symbol: string, neutrons: readonly number[]])[] = [
  [1, "H", [0, 1, 2]],
  [2, "He", [1, 2]],
  [3, "Li", [3, 4]],
  [4, "Be", [5]],
  [5, "B", [5, 6]],
  [6, "C", [5, 6, 7, 8]],
  [7, "N", [7, 8]],
  [8, "O", [8, 9, 10]],
  [9, "F", [9, 10]],
  [10, "Ne", [10, 11, 12]],
  [11, "Na", [11, 12, 13]],
  [12, "Mg", [12, 13, 14]],
  [13, "Al", [14]],
  [14, "Si", [14, 15, 16]],
  [15, "P", [16, 17]],
  [16, "S", [16, 17, 18, 19, 20]],
  [17, "Cl", [18, 20]],
  [18, "Ar", [18, 20, 22]],
  [19, "K", [20, 21, 22, 23, 24]],
  [20, "Ca", [20, 22, 23, 24, 25, 26, 27, 28]],
  [21, "Sc", [24]],
  [22, "Ti", [24, 25, 26, 27, 28]],
  [23, "V", [27, 28]],
  [24, "Cr", [26, 27, 28, 29, 30]],
  [25, "Mn", [29, 30]],
  [26, "Fe", [26, 28, 29, 30, 31, 32, 33]],
  [27, "Co", [30, 31, 32, 33]],
  [28, "Ni", [30, 31, 32, 33, 34, 35, 36]],
  [29, "Cu", [34, 35, 36]],
  [30, "Zn", [34, 35, 36, 37, 38, 40]],
  [31, "Ga", [36, 37, 38, 39, 40]],
  [32, "Ge", [36, 38, 40, 41, 42, 44]],
  [33, "As", [42]],
  [34, "Se", [40, 41, 42, 43, 44, 45, 46, 48]],
  [35, "Br", [44, 45, 46]],
  [36, "Kr", [42, 44, 46, 47, 48, 50]],
  [37, "Rb", [48, 49, 50]],
  [38, "Sr", [46, 47, 48, 49, 50, 51, 52]],
  [39, "Y", [50]],
  [40, "Zr", [50, 51, 52, 54, 56]],
  [41, "Nb", [52]],
  [42, "Mo", [50, 52, 53, 54, 55, 56, 57, 58]],
  [43, "Tc", [54, 55, 56]],
  [44, "Ru", [52, 54, 55, 56, 57, 58, 60, 62]],
  [45, "Rh", [58]],
  [46, "Pd", [56, 58, 59, 60, 62, 64]],
  [47, "Ag", [60, 62]],
  [48, "Cd", [58, 60, 62, 63, 64, 65, 66, 68]],
  [49, "In", [62, 64, 66]],
  [50, "Sn", [62, 63, 64, 65, 66, 67, 68, 69, 70, 72, 74]],
  [51, "Sb", [70, 72]],
  [52, "Te", [68, 70, 71, 72, 73, 74, 76, 78]],
  [53, "I", [70, 72, 74, 76, 78]],
  [54, "Xe", [70, 72, 74, 75, 76, 77, 78, 80, 82]],
  [55, "Cs", [74, 78, 79, 81, 82]],
  [56, "Ba", [74, 76, 77, 78, 79, 80, 81, 82, 84]],
  [57, "La", [81, 82]],
  [58, "Ce", [78, 80, 82, 83, 84, 86]],
  [59, "Pr", [82]],
  [60, "Nd", [82, 83, 84, 85, 86, 88, 90]],
  [61, "Pm", [83, 84]],
  [62, "Sm", [82, 85, 86, 87, 88, 90, 92]],
  [63, "Eu", [88, 90]],
  [64, "Gd", [88, 90, 91, 92, 93, 94, 96]],
  [65, "Tb", [94]],
  [66, "Dy", [90, 92, 94, 95, 96, 97, 98]],
  [67, "Ho", [98]],
  [68, "Er", [94, 96, 98, 99, 100, 102]],
  [69, "Tm", [100]],
  [70, "Yb", [98, 99, 100, 101, 102, 103, 104, 106]],
  [71, "Lu", [104, 105]],
  [72, "Hf", [102, 104, 105, 106, 107, 108]],
  [73, "Ta", [107, 108]],
  [74, "W", [106, 108, 109, 110, 112]],
  [75, "Re", [110, 112]],
  [76, "Os", [108, 110, 111, 112, 113, 114, 116]],
  [77, "Ir", [114, 116]],
  [78, "Pt", [112, 114, 116, 117, 118, 120]],
  [79, "Au", [118, 119]],
  [80, "Hg", [116, 117, 118, 119, 120, 121, 122, 123, 124]],
  [81, "Tl", [120, 122, 124]],
  [82, "Pb", [122, 124, 125, 126, 128]],
  [83, "Bi", [124, 126]],
  [84, "Po", [125, 126]],
  [85, "At", [125, 126]],
  [86, "Rn", [125, 134, 136]],
  [87, "Fr", [136]],
  [88, "Ra", [135, 136, 138, 140]],
  [89, "Ac", [138]],
  [90, "Th", [138, 140, 142]],
  [91, "Pa", [140]],
  [92, "U", [141, 142, 143, 144, 146]],
  [93, "Np", [144, 146]],
  [94, "Pu", [144, 145, 146, 147, 148, 150]],
  [95, "Am", [146, 148]],
  [96, "Cm", [147, 148, 149, 150, 151, 152]],
  [97, "Bk", [150, 152]],
  [98, "Cf", [151, 152, 153, 154]],
  [99, "Es", [153]],
  [100, "Fm", [157]],
  [101, "Md", [155, 157]],
  [102, "No", [157]],
  [103, "Lr", [159]],
  [104, "Rf", [163]],
  [105, "Db", [163]],
  [106, "Sg", [163]],
  [107, "Bh", [162]],
  [108, "Hs", [161]],
  [109, "Mt", [169]],
  [110, "Ds", [171]],
  [111, "Rg", [171]],
  [112, "Cn", [173]],
  [113, "Nh", [173]],
  [114, "Fl", [175]],
  [115, "Mc", [175]],
  [116, "Lv", [177]],
  [117, "Ts", [177]],
  [118, "Og", [176]],
];

const guideNeutrons = new Map(EDUCATION_ISOTOPE_GUIDE.map(([z, , neutrons]) => [z, new Set(neutrons)]));

export function isDocumentedEducationIsotope(z: number, mass: number): boolean {
  return Number.isInteger(z) && Number.isInteger(mass) && (guideNeutrons.get(z)?.has(mass - z) ?? false);
}

/** Missing guide entries append separately: never change the positional legacy isotope arrays. */
export const ADDITIONAL_GUIDE_ISOTOPES = EDUCATION_ISOTOPE_GUIDE.flatMap(([z, symbol, neutrons]) => {
  const element = ELEMENTS.find((e) => e.z === z)!;
  const oldMasses = new Set([element.a, ...element.isotopes]);
  return neutrons.map((n) => z + n).filter((mass) => !oldMasses.has(mass)).map((mass) => ({ z, symbol, mass }));
});

/** Compatibility union: the 411 documented combinations plus eight retained scientific entries. */
export function supportedIsotopeMasses(z: number): number[] {
  const element = ELEMENTS.find((e) => e.z === z);
  if (!element) return [];
  const documented = [...(guideNeutrons.get(z) ?? [])].map((n) => z + n);
  return [...new Set([element.a, ...element.isotopes, ...documented])].sort((a, b) => a - b);
}
