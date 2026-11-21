import { expect } from "vitest";
import type { BlockDef } from "../../src/index";

const stations: Readonly<Record<number, string>> = { 44: "element_constructor", 45: "compound_creator", 46: "material_reducer", 47: "lab_table" };
/** Explicit eight-field exception for historical full-definition hashes. Assert the new literal
 * references first, then restore only these old texture names; IDs/physics/other fields stay exact.
 * The independent067 baseline test checks the entire308-definition delta separately.
 */
export function withLegacyStationFaces(defs: readonly BlockDef[]): BlockDef[] {
  return defs.map(def => {
    const name = stations[def.id];
    if (!name) return def;
    expect(def.name).toBe(name);
    expect(def.faces).toEqual({ top: `${name}_top`, side: `${name}_side`, bottom: `${name}_bottom` });
    return { ...def, faces: { ...def.faces, top: "chem_station_top", bottom: "chem_station_top" } };
  });
}
