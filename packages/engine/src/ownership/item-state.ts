import { inspectBottleOwner } from "./bottles";
import { inspectGlowState } from "./glow-stick-state";
import { inspectSparklerState } from "./sparkler-state";
/** Shared validation for every supported stateful stack owner; no state is repaired or defaulted. */
export function inspectItemState(raw: unknown, bulk = false) {
  const bottle = inspectBottleOwner(raw, bulk);
  if (bottle.kind === "invalid") return bottle;
  const glow = inspectGlowState(raw, bulk), sparkler = inspectSparklerState(raw, bulk);
  return glow.kind === "invalid" ? glow : sparkler.kind === "invalid" ? sparkler : sparkler.kind !== "none" ? sparkler : glow;
}
