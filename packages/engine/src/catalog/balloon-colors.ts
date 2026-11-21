/** Application color identities and original art palette. Native auxiliary color mapping is unverified.
 * IDs append after published Lead807; never reorder this table. Stack64/output1 and canonical He4
 * crafting are application choices, not proven native runtime fields. No item-registry import. */
export const BALLOON_COLORS = Object.freeze([
  Object.freeze({ color: "white", name: "White", itemName: "white_balloon", displayName: "White Balloon", dye: "white_dye", icon: "item_white_balloon", colorhex: 0xebede8, itemId: 808 } as const),
  Object.freeze({ color: "orange", name: "Orange", itemName: "orange_balloon", displayName: "Orange Balloon", dye: "orange_dye", icon: "item_orange_balloon", colorhex: 0xe5842e, itemId: 809 } as const),
  Object.freeze({ color: "magenta", name: "Magenta", itemName: "magenta_balloon", displayName: "Magenta Balloon", dye: "magenta_dye", icon: "item_magenta_balloon", colorhex: 0xb74aaa, itemId: 810 } as const),
  Object.freeze({ color: "light_blue", name: "Light Blue", itemName: "light_blue_balloon", displayName: "Light Blue Balloon", dye: "light_blue_dye", icon: "item_light_blue_balloon", colorhex: 0x66b0d3, itemId: 811 } as const),
  Object.freeze({ color: "yellow", name: "Yellow", itemName: "yellow_balloon", displayName: "Yellow Balloon", dye: "yellow_dye", icon: "item_yellow_balloon", colorhex: 0xe7c438, itemId: 812 } as const),
  Object.freeze({ color: "lime", name: "Lime", itemName: "lime_balloon", displayName: "Lime Balloon", dye: "lime_dye", icon: "item_lime_balloon", colorhex: 0x8bbf3e, itemId: 813 } as const),
  Object.freeze({ color: "pink", name: "Pink", itemName: "pink_balloon", displayName: "Pink Balloon", dye: "pink_dye", icon: "item_pink_balloon", colorhex: 0xe095ac, itemId: 814 } as const),
  Object.freeze({ color: "gray", name: "Gray", itemName: "gray_balloon", displayName: "Gray Balloon", dye: "gray_dye", icon: "item_gray_balloon", colorhex: 0x4e5458, itemId: 815 } as const),
  Object.freeze({ color: "light_gray", name: "Light Gray", itemName: "light_gray_balloon", displayName: "Light Gray Balloon", dye: "light_gray_dye", icon: "item_light_gray_balloon", colorhex: 0x9da4a1, itemId: 816 } as const),
  Object.freeze({ color: "cyan", name: "Cyan", itemName: "cyan_balloon", displayName: "Cyan Balloon", dye: "cyan_dye", icon: "item_cyan_balloon", colorhex: 0x2f9197, itemId: 817 } as const),
  Object.freeze({ color: "purple", name: "Purple", itemName: "purple_balloon", displayName: "Purple Balloon", dye: "purple_dye", icon: "item_purple_balloon", colorhex: 0x7d4aae, itemId: 818 } as const),
  Object.freeze({ color: "blue", name: "Blue", itemName: "blue_balloon", displayName: "Blue Balloon", dye: "blue_dye", icon: "item_blue_balloon", colorhex: 0x4358aa, itemId: 819 } as const),
  Object.freeze({ color: "brown", name: "Brown", itemName: "brown_balloon", displayName: "Brown Balloon", dye: "brown_dye", icon: "item_brown_balloon", colorhex: 0x7e593b, itemId: 820 } as const),
  Object.freeze({ color: "green", name: "Green", itemName: "green_balloon", displayName: "Green Balloon", dye: "green_dye", icon: "item_green_balloon", colorhex: 0x597933, itemId: 821 } as const),
  Object.freeze({ color: "red", name: "Red", itemName: "red_balloon", displayName: "Red Balloon", dye: "red_dye", icon: "item_red_balloon", colorhex: 0xad3c37, itemId: 822 } as const),
  Object.freeze({ color: "black", name: "Black", itemName: "black_balloon", displayName: "Black Balloon", dye: "black_dye", icon: "item_black_balloon", colorhex: 0x24272b, itemId: 823 } as const),
 ] as const);

export type BalloonColor = typeof BALLOON_COLORS[number];

/** Flat stack identity lookup, independent of registry initialization. */
export function balloonColorOf(itemId: number): BalloonColor | undefined {
  return BALLOON_COLORS.find(color => color.itemId === itemId);
}
