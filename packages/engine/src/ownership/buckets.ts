import { isKnownId } from "../catalog/items";
import { HOTBAR_SIZE, INVENTORY_SIZE, type ItemStack } from "./inventory";
import { cloneStack, hasCloneableBookMetadata, insertStackIntoSlots, stackLimit } from "./stack";
import { inspectItemState } from "./item-state";
/** Whole-container application IDs; 16 empty / 1 milk limits are not native calibration. */
export const BUCKET_IDS = Object.freeze({ empty: 832, milk: 833 });
export type MilkFillResult = {ok:true} | {ok:false;reason:"not-bucket"|"invalid-state"|"no-room"};
export type BucketInspection = {kind:"none"} | {kind:"invalid";reason:string};
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
export function bucketKind(id:number|null|undefined):"empty"|"milk"|null {return id===BUCKET_IDS.empty?"empty":id===BUCKET_IDS.milk?"milk":null;}
export function isBucketId(id:number):boolean {return bucketKind(id)!==null;}
export function inspectBucketOwner(raw:unknown,bulk=false):BucketInspection {
 try {
  if(typeof raw!=="object"||raw===null||!isBucketId((raw as ItemStack).id))return {kind:"none"};
  const p=Object.getPrototypeOf(raw),o=raw as Record<string,unknown>;
  if(Array.isArray(raw)||(p!==Object.prototype&&p!==null)||!own(raw,"id")||!own(raw,"count")||Reflect.ownKeys(raw).some(k=>k!=="id"&&k!=="count")
    ||Object.getOwnPropertyDescriptor(raw,"id")?.value!==o.id||Object.getOwnPropertyDescriptor(raw,"count")?.value!==o.count)
   return {kind:"invalid",reason:"unrelated or unreadable whole bucket metadata"};
  if(!Number.isSafeInteger(o.count)||(o.count as number)<1||!bulk&&(o.count as number)>(o.id===BUCKET_IDS.empty?16:1))return {kind:"invalid",reason:"invalid whole bucket count"};
  return {kind:"none"};
 }catch{return {kind:"invalid",reason:"unreadable bucket owner"};}
}
/** Complete source validation without repairing or cloning an unrelated invalid owner. */
export function validBucketBag(slots:readonly(ItemStack|null)[],selected:number):boolean {
 try {
  if(!Array.isArray(slots)||slots.length!==INVENTORY_SIZE||!Number.isInteger(selected)||selected<0||selected>=HOTBAR_SIZE)return false;
  for(let i=0;i<slots.length;i++){
   if(!own(slots,String(i)))return false;const s=slots[i];if(s===null)continue;
   if(!s||typeof s!=="object"||!isKnownId(s.id)||!Number.isSafeInteger(s.count)||s.count<1||inspectItemState(s).kind==="invalid"||!hasCloneableBookMetadata(s)||s.count>stackLimit(s))return false;
  }
  return true;
 }catch{return false;}
}
export type MilkFillPlan={ok:true;slots:(ItemStack|null)[];index:number;source:ItemStack;sourceCount:number}|Exclude<MilkFillResult,{ok:true}>;
/** Caller verifies the actual live adult Cow. This plan never consumes or changes the animal. */
export function planMilkFill(slots:readonly(ItemStack|null)[],selected:number):MilkFillPlan {
 try {
  if(!validBucketBag(slots,selected))return {ok:false,reason:"invalid-state"};
  const source=slots[selected];if(!source||bucketKind(source.id)!=="empty")return {ok:false,reason:"not-bucket"};
  const trial=slots.map(s=>s?cloneStack(s):null),filled:ItemStack={id:BUCKET_IDS.milk,count:1};
  if(source.count===1)trial[selected]=filled;
  else {if(insertStackIntoSlots(trial,filled,selected)!==0)return {ok:false,reason:"no-room"};trial[selected]={id:BUCKET_IDS.empty,count:source.count-1};}
  return {ok:true,slots:trial,index:selected,source,sourceCount:source.count};
 }catch{return {ok:false,reason:"invalid-state"};}
}
