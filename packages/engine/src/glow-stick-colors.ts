/** Literal retained Education catalog colors; legacy data is reference metadata, never an app ID.
 * Output count, activation, lifetime, placement and native runtime binding remain unverified. */
const nativeColors = [
  [1, "red", "Red"], [2, "green", "Green"], [3, "brown", "Brown"], [4, "blue", "Blue"],
  [5, "purple", "Purple"], [6, "cyan", "Cyan"], [8, "gray", "Gray"], [9, "pink", "Pink"],
  [10, "lime", "Lime"], [11, "yellow", "Yellow"], [12, "light_blue", "Light Blue"],
  [13, "magenta", "Magenta"], [14, "orange", "Orange"], [15, "white", "White"],
] as const;

export const GLOW_STICK_COLORS = nativeColors.map(([legacyData, color, label]) => ({
  color, legacyData, itemName: color === "green" ? "glow_stick" : `${color}_glow_stick`,
  displayName: color === "green" ? "Glow Stick" : `${label} Glow Stick`,
  dye: `${color}_dye`, icon: color === "green" ? "item_product_glow_stick" : `item_product_${color}_glow_stick`,
})) as readonly { readonly color: typeof nativeColors[number][1]; readonly legacyData: number; readonly itemName: string; readonly displayName: string; readonly dye: string; readonly icon: string }[];
