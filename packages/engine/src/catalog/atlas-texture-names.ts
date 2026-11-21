import { ATLAS_TEXTURE_CATALOG } from "./atlas-texture-catalog";
import { textureNames } from "./blocks";
import { itemTextureNames } from "./items";

/** Canonical append-only atlas order, independent of block/item registry traversal. */
export function allAtlasTextureNames(): string[] {
  const known = new Set(ATLAS_TEXTURE_CATALOG);
  if (known.size !== ATLAS_TEXTURE_CATALOG.length || ATLAS_TEXTURE_CATALOG.some(key => !key)) throw new Error("Invalid atlas texture catalog");
  for (const key of [...textureNames(), ...itemTextureNames()]) {
    if (!known.has(key)) throw new Error(`Referenced texture missing from atlas catalog: ${key}`);
  }
  return [...ATLAS_TEXTURE_CATALOG];
}
