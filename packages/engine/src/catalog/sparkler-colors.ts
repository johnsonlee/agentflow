/** Journal-supported chloride/color pairs. Application IDs, RGB and one-item crafting output
 * are original app choices; native activation, lifetime, particles and light are not calibrated. */
export const SPARKLER_COLORS = Object.freeze([
  { color: "orange", compound: "calcium_chloride", colorHex: "#ff9c35" },
  { color: "blue", compound: "cerium_chloride", colorHex: "#559bff" },
  { color: "red", compound: "mercuric_chloride", colorHex: "#ff5964" },
  { color: "purple", compound: "potassium_chloride", colorHex: "#bc78ff" },
  { color: "green", compound: "tungsten_chloride", colorHex: "#65dc80" },
].map((entry, index) => Object.freeze({ ...entry, itemId: 824 + index, itemName: `${entry.color}_sparkler`,
  displayName: `${entry.color[0].toUpperCase()}${entry.color.slice(1)} Sparkler`,
  iconInactive: `item_${entry.color}_sparkler`, iconActive: `item_${entry.color}_sparkler_lit`,
}))) as readonly { readonly color: string; readonly compound: string; readonly colorHex: string; readonly itemId: number;
  readonly itemName: string; readonly displayName: string; readonly iconInactive: string; readonly iconActive: string }[];
