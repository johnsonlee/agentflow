import { SPARKLER_COLORS } from "../catalog/sparkler-colors";
import { maxStackOf } from "../catalog/items";
export interface SparklerState { state: "inactive" | "active" }
export type SparklerInspection = { kind: "none" | "legacy" | "inactive" | "active" } | { kind: "invalid"; reason: string };
export type SparklerActivationResult = { ok: true; kind: "activated"; color: string }
  | { ok: false; reason: "not-sparkler" | "already-active" | "invalid-state" | "needs-room" };
const byId = new Map(SPARKLER_COLORS.map(color => [color.itemId, color]));
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
export function isSparklerId(id: number): boolean { return byId.has(id); }
export function sparklerColor(id: number): string | null { return byId.get(id)?.color ?? null; }
/** Untimed application state only. Active ownership is always one unit, including bulk insert. */
export function inspectSparklerState(raw: unknown, bulk = false): SparklerInspection {
  try {
    if (!plain(raw)) return { kind: "invalid", reason: "non-plain stack" };
    const sparkler = typeof raw.id === "number" && isSparklerId(raw.id);
    if (sparkler && (own(raw, "book") || own(raw, "damage"))) return { kind: "invalid", reason: "unrelated sparkler metadata" };
    if (sparkler && own(raw, "glow")) return { kind: "invalid", reason: "glow on sparkler" };
    if (sparkler && (!own(raw, "count") || !Number.isSafeInteger(raw.count) || (raw.count as number) < 1
      || !bulk && (raw.count as number) > maxStackOf(raw.id as number))) return { kind: "invalid", reason: "invalid sparkler count" };
    if (!own(raw, "sparkler")) return { kind: sparkler ? "legacy" : "none" };
    if (!sparkler || own(raw, "glow")) return { kind: "invalid", reason: "cross-kind sparkler metadata" };
    const state = raw.sparkler;
    if (!plain(state) || Reflect.ownKeys(state).length !== 1 || !own(state, "state") || (state.state !== "active" && state.state !== "inactive"))
      return { kind: "invalid", reason: "invalid sparkler shape" };
    if (own(raw, "book") || own(raw, "damage")) return { kind: "invalid", reason: "unrelated metadata on stateful sparkler" };
    if (!Number.isSafeInteger(raw.count) || (raw.count as number) < 1 || (state.state === "active" ? raw.count !== 1 : !bulk && (raw.count as number) > maxStackOf(raw.id as number)))
      return { kind: "invalid", reason: "invalid sparkler count" };
    return { kind: state.state };
  } catch { return { kind: "invalid", reason: "unreadable sparkler state" }; }
}
