import { isKnownId } from "../catalog/items";
import { HOTBAR_SIZE, INVENTORY_SIZE, type ItemStack } from "./inventory";
import { cloneStack, hasCloneableBookMetadata, insertStackIntoSlots, stackLimit } from "./stack";
import { inspectItemState } from "./item-state";

/** Append-only application IDs. Whole IDs carry empty/water content, with no metadata variant. */
export const BOTTLE_IDS = Object.freeze({ empty: 830, water: 831 });
export function bottleKind(id: number | null | undefined): "empty" | "water" | null {
  return id === BOTTLE_IDS.empty ? "empty" : id === BOTTLE_IDS.water ? "water" : null;
}
export function isBottleId(id: number): boolean { return bottleKind(id) !== null; }
export type BottleFillResult = { ok: true } | { ok: false; reason: "not-bottle" | "invalid-state" | "no-room" };
export type BottleInspection = { kind: "none" } | { kind: "invalid"; reason: string };
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o,k);
/** Owned bottles allow only id/count. Bulk insert may split a requested quantity into whole owners. */
export function inspectBottleOwner(raw: unknown, bulk = false): BottleInspection {
  try {
    if (typeof raw !== "object" || raw === null || !isBottleId((raw as ItemStack).id)) return { kind: "none" };
    if (!plain(raw) || !own(raw,"id") || !own(raw,"count") || Reflect.ownKeys(raw).some(k => k !== "id" && k !== "count"))
      return { kind: "invalid", reason: "unrelated or malformed bottle metadata" };
    if (!Number.isSafeInteger(raw.count) || (raw.count as number) < 1 || !bulk && (raw.count as number) > (raw.id === BOTTLE_IDS.empty ? 64 : 1))
      return { kind: "invalid", reason: "invalid whole bottle count" };
    return { kind: "none" };
  } catch { return { kind: "invalid", reason: "unreadable bottle owner" }; }
}

/** Pure complete plan: no world, cursor, offhand or overflow owner is changed or borrowed. */
export type BottleFillPlan = {ok:true;slots:(ItemStack|null)[]} | Exclude<BottleFillResult,{ok:true}>;
export function planBottleFill(slots: readonly (ItemStack | null)[], selected: number): BottleFillPlan {
  try {
  if (!Array.isArray(slots) || slots.length !== INVENTORY_SIZE || !Number.isInteger(selected) || selected < 0 || selected >= HOTBAR_SIZE)
    return { ok:false, reason:"invalid-state" };
  const source=slots[selected];
  if (source && inspectBottleOwner(source).kind === "invalid") return { ok:false,reason:"invalid-state" };
  if (!source || bottleKind(source.id) !== "empty") return { ok:false,reason:"not-bottle" };
  for (let index=0;index<slots.length;index++) {
    if (!own(slots,String(index))) return {ok:false,reason:"invalid-state"};
    const stack=slots[index];
    if (stack === null) continue;
    if (!stack || typeof stack !== "object" || !isKnownId(stack.id) || !Number.isSafeInteger(stack.count) || stack.count < 1
    || inspectItemState(stack).kind === "invalid" || !hasCloneableBookMetadata(stack) || stack.count > stackLimit(stack)) return { ok:false,reason:"invalid-state" };
  }
  const trial=slots.map(stack=>stack ? cloneStack(stack) : null);
  const filled:ItemStack={id:BOTTLE_IDS.water,count:1};
  if (source.count === 1) trial[selected]=filled;
  else {
    // A compatible empty-bottle stack is not capacity for one filled, nonstacking water bottle.
    if (insertStackIntoSlots(trial,filled,selected) !== 0) return {ok:false,reason:"no-room"};
    trial[selected]={id:BOTTLE_IDS.empty,count:source.count-1};
  }
  return {ok:true,slots:trial};
  } catch { return {ok:false,reason:"invalid-state"}; }
}
