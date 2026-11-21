/** Stable application face bindings; native aux/facing correspondence remains unverified. */
export const LEGACY_STATION_FACE_KEY = "chem_station_top";
export const STATION_FACE_TEXTURES = Object.freeze({
  element_constructor: Object.freeze({ top: "element_constructor_top", bottom: "element_constructor_bottom" }),
  compound_creator: Object.freeze({ top: "compound_creator_top", bottom: "compound_creator_bottom" }),
  material_reducer: Object.freeze({ top: "material_reducer_top", bottom: "material_reducer_bottom" }),
  lab_table: Object.freeze({ top: "lab_table_top", bottom: "lab_table_bottom" }),
});
export const STATION_FACE_KEYS: readonly string[] = Object.freeze(Object.values(STATION_FACE_TEXTURES).flatMap(f => [f.top, f.bottom]));
/** Default artwork and v1 generic overrides preserve the legacy source identity, including RNG seed. */
export const STATION_FACE_FALLBACKS: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(STATION_FACE_KEYS.map(key => [key, LEGACY_STATION_FACE_KEY])));
