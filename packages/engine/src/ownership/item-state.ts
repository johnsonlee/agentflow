import{inspectWoodSlabItemOwner}from './wood-slab-items';
import {inspectBoneMealItemOwner} from './bone-meal-items';
import {inspectRecyclingEquipment} from "./metal-recycling";
import {inspectCaneItemOwner} from './cane-items';
import { inspectIgnitionOwner } from "./ignition-tool";
import { inspectBucketOwner } from "./buckets";
import { inspectBottleOwner } from "./bottles";
import { inspectGlowState } from "./glow-stick-state";
import { inspectSparklerState } from "./sparkler-state";
/** Shared validation for every supported stateful stack owner; no state is repaired or defaulted. */
export function inspectItemState(raw: unknown, bulk = false) {
  const slab=inspectWoodSlabItemOwner(raw);if(slab.kind==='invalid')return slab;
  const bone=inspectBoneMealItemOwner(raw);if(bone.kind==="invalid")return bone;
  const recycling=inspectRecyclingEquipment(raw,bulk);if(recycling.kind==="invalid")return recycling;
  const cane=inspectCaneItemOwner(raw);if(cane.kind==="invalid")return cane;
  const ignition = inspectIgnitionOwner(raw, bulk);
  if (ignition.kind === "invalid") return ignition;
  const bucket = inspectBucketOwner(raw, bulk);
  if (bucket.kind === "invalid") return bucket;
  const bottle = inspectBottleOwner(raw, bulk);
  if (bottle.kind === "invalid") return bottle;
  const glow = inspectGlowState(raw, bulk), sparkler = inspectSparklerState(raw, bulk);
  return glow.kind === "invalid" ? glow : sparkler.kind === "invalid" ? sparkler : sparkler.kind !== "none" ? sparkler : glow;
}
