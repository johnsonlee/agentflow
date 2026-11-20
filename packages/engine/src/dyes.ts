/** Canonical color names; RGB values are original UI/art references, not Education texture samples. */
export const DYE_COLORS = [
  { name: "white", displayName: "White", rgb: [235, 237, 232] },
  { name: "orange", displayName: "Orange", rgb: [229, 132, 46] },
  { name: "magenta", displayName: "Magenta", rgb: [183, 74, 170] },
  { name: "light_blue", displayName: "Light Blue", rgb: [102, 176, 211] },
  { name: "yellow", displayName: "Yellow", rgb: [231, 196, 56] },
  { name: "lime", displayName: "Lime", rgb: [139, 191, 62] },
  { name: "pink", displayName: "Pink", rgb: [224, 149, 172] },
  { name: "gray", displayName: "Gray", rgb: [78, 84, 88] },
  { name: "light_gray", displayName: "Light Gray", rgb: [157, 164, 161] },
  { name: "cyan", displayName: "Cyan", rgb: [47, 145, 151] },
  { name: "purple", displayName: "Purple", rgb: [125, 74, 174] },
  { name: "blue", displayName: "Blue", rgb: [67, 88, 170] },
  { name: "brown", displayName: "Brown", rgb: [126, 89, 59] },
  { name: "green", displayName: "Green", rgb: [89, 121, 51] },
  { name: "red", displayName: "Red", rgb: [173, 60, 55] },
  { name: "black", displayName: "Black", rgb: [36, 39, 43] },
] as const;

export type DyeColor = typeof DYE_COLORS[number]["name"];
