/** Stable appended identity and explicit application durability; not a native numeric claim. */
export const IGNITION_TOOL_ID = 838;
export const IGNITION_DURABILITY = 64;
export const isIgnitionToolId = (id: unknown): boolean => id === IGNITION_TOOL_ID;
export type IgnitionInspection = { kind: "none" } | { kind: "invalid"; reason: string };

/** No getter or unrelated metadata is accepted at an ownership boundary. */
export function inspectIgnitionOwner(raw: unknown, _bulk = false): IgnitionInspection {
  try {
    if (typeof raw !== "object" || raw === null) return { kind: "none" };
    const id = Object.getOwnPropertyDescriptor(raw, "id");
    if (id?.value !== IGNITION_TOOL_ID) return { kind: "none" };
    const prototype = Object.getPrototypeOf(raw), count = Object.getOwnPropertyDescriptor(raw, "count"), damage = Object.getOwnPropertyDescriptor(raw, "damage");
    if (Array.isArray(raw) || prototype !== Object.prototype && prototype !== null ||
      Reflect.ownKeys(raw).some(k => k !== "id" && k !== "count" && k !== "damage") || count?.value !== 1 ||
      damage && (!("value" in damage) || !Number.isSafeInteger(damage.value) || damage.value < 0 || damage.value >= IGNITION_DURABILITY))
      return { kind: "invalid", reason: "invalid ignition tool count or wear" };
    return { kind: "none" };
  } catch { return { kind: "invalid", reason: "unreadable ignition tool owner" }; }
}
