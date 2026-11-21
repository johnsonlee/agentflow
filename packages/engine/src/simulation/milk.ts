import type { Inventory } from "../ownership/inventory";
import { BUCKET_IDS, inspectBucketOwner, validBucketBag } from "../ownership/buckets";
import { clearPlayerStatus, sanitizePlayerStatus, type PlayerStatus } from "./status-effects";
/** Explicit application held-use duration; full hunger/finite Creative containers are caller policy. */
export const MILK_DRINK_SECONDS=1.6;
/** Completes the current supported status cure and container exchange in one synchronous commit.
 * No health/hunger inputs or RNG are accepted. Malformed status must be repaired through recovery,
 * never silently erased by a cure. Unknown future effects therefore refuse this current reducer. */
export function finishMilkDrink(inventory:Inventory,status:PlayerStatus):boolean {
 try {
  const index=inventory.selected;if(!validBucketBag(inventory.slots,index))return false;
  const source=inventory.slots[index];if(!source||source.id!==BUCKET_IDS.milk||inspectBucketOwner(source).kind==="invalid")return false;
  const proto=Object.getPrototypeOf(status);
  if((proto!==Object.prototype&&proto!==null)||Reflect.ownKeys(status).some(k=>k!=="poison")||Object.values(Object.getOwnPropertyDescriptors(status)).some(d=>!("value" in d)))return false;
  const clean=sanitizePlayerStatus(status);if(clean.invalid)return false;
  const poison=Object.getOwnPropertyDescriptor(status,"poison");
  if(poison){
   if(!poison.configurable)return false;
   const p=poison.value;
   if(Reflect.ownKeys(p).length!==2||Object.values(Object.getOwnPropertyDescriptors(p)).some(d=>!("value" in d)))return false;
  }
  if(Object.getOwnPropertyDescriptor(inventory.slots,String(index))?.writable!==true)return false;
  const beforeStatus=JSON.stringify(status);
  // Reading a selected getter cannot redirect or replace the originally validated unit.
  if(inventory.selected!==index||inventory.slots[index]!==source||source.id!==BUCKET_IDS.milk||source.count!==1
    ||inspectBucketOwner(source).kind==="invalid"||JSON.stringify(status)!==beforeStatus)return false;
  clearPlayerStatus(status);
  inventory.slots[index]={id:BUCKET_IDS.empty,count:1};
  return true;
 }catch{return false;}
}
