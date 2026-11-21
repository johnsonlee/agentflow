import { isSparklerId } from "./sparkler-state";
import { GLOW_STICK_COLORS } from "../catalog/glow-stick-colors";
import { maxStackOf, stackId } from "../catalog/items";
import type { ItemStack } from "./inventory";

/** Application-owned activation only. No native NBT, expiry, durability or light semantics. */
export interface GlowStickState { state: "inactive" | "active" }
export type GlowInspection =
  | { kind: "none" | "legacy" | "inactive" | "active" }
  | { kind: "invalid"; reason: string };
export type GlowActivationFailure = "not-glow" | "already-active" | "invalid-state" | "needs-room";
export type GlowActivationResult = { ok: true; kind: "activated"; color: string } | { ok: false; reason: GlowActivationFailure };

const colorsById = new Map(GLOW_STICK_COLORS.map(color => [stackId(color.itemName), color.color]));
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function isGlowStickId(id: number): boolean { return colorsById.has(id); }
export function glowStickColor(id: number): string | null { return colorsById.get(id) ?? null; }

/** Bulk insertion may contain >64 inactive units, which are split into valid ordinary stacks.
 * Active bulk is ALWAYS invalid: one activation never creates multiple active units. Missing
 * metadata is legacy and remains absent; a present invalid property is never defaulted. */
export function inspectGlowState(raw: unknown, bulk = false): GlowInspection {
  try {
    if (!plain(raw)) return { kind: "invalid", reason: "non-plain stack" };
    if (own(raw, "glow") && own(raw, "sparkler")) return { kind: "invalid", reason: "both activation fields" };
    const glowId = typeof raw.id === "number" && isGlowStickId(raw.id);
    if (!own(raw, "glow")) return { kind: glowId ? "legacy" : "none" };
    if (!glowId) return { kind: "invalid", reason: "glow on another item" };
    const glow = raw.glow;
    if (!plain(glow) || Reflect.ownKeys(glow).length !== 1 || !own(glow, "state")
      || (glow.state !== "inactive" && glow.state !== "active")) return { kind: "invalid", reason: "invalid glow shape" };
    if (own(raw, "damage") || own(raw, "book")) return { kind: "invalid", reason: "unrelated metadata on stateful glow" };
    const count = raw.count;
    if (!Number.isSafeInteger(count) || (count as number) < 1 || (glow.state === "active" ? count !== 1
      : !bulk && (count as number) > maxStackOf(raw.id as number))) return { kind: "invalid", reason: "invalid glow count" };
    return { kind: glow.state };
  } catch { return { kind: "invalid", reason: "unreadable glow state" }; }
}

/** Creation boundary only. Loaders/transfers must use cloneStack and preserve absence/state. */
export function freshStack(id: number, count = 1): ItemStack {
  return { id, count, ...(isGlowStickId(id) ? { glow: { state: "inactive" as const } } : {}), ...(isSparklerId(id) ? { sparkler: { state: "inactive" as const } } : {}) };
}
