import {stackId} from '../catalog/items';
import type {GameMode} from '../world/rules';
import type {Inventory,InventoryData,ItemStack} from '../ownership/inventory';
import {reserveInventoryMutation} from '../ownership/inventory-lease';
import {labInventorySnapshot} from '../ownership/lab-inventory-snapshot';

export type HeldCameraMode='first-person'|'ground-closeup';
export type CameraUseDecision='ordinary'|'activate'|'place'|'first-person'|'ground-closeup'|'refuse-closeup';
/** Original app priority. Shift close-up never silently falls through to placement. */
export function cameraUseDecision(heldCamera:boolean,alternate:boolean,placedInFront:boolean,blockTarget:boolean,groundInFront:boolean):CameraUseDecision{
 if(alternate&&heldCamera)return groundInFront?'ground-closeup':'refuse-closeup';
 if(placedInFront)return'activate';
 if(!heldCamera)return'ordinary';
 return blockTarget?'place':'first-person';
}
export interface HeldCameraSource {
 afterInventory():InventoryData;
 valid():boolean;
 /** Invoke only after a durable photo receipt. False means quarantine, never retry. */
 finalize():boolean;
 /** Precommit cancellation only. A failed postcommit finalizer must retain its busy lease. */
 cancel():void;
}
/** Finite provisional app policy: one selected Camera per successful Survival photo; Creative retains.
 * Held-mode consumption is not native-calibrated. No source is published before durable receipt.
 */
export function reserveHeldCamera(inventory:Inventory,mode:GameMode,lifecycleValid:()=>boolean=()=>true):HeldCameraSource|null{
 if(mode!=='survival'&&mode!=='creative')return null;
 const lease=reserveInventoryMutation(inventory);if(!lease)return null;
 try{
  const before=labInventorySnapshot(inventory,lease.slots),stack=before.data.slots[before.index] as ItemStack|null;
  if(!stack||stack.id!==stackId('camera')||Reflect.ownKeys(stack).length!==2||!Object.hasOwn(stack,'id')||!Object.hasOwn(stack,'count')){lease.cancel();return null;}
  const original=lease.slots[before.index]!,replacement=mode==='creative'?original:stack.count===1?null:{id:stack.id,count:stack.count-1};
  const mutation=lease.prepare(before.index,replacement);if(!mutation){lease.cancel();return null;}
  const after:InventoryData={slots:structuredClone(before.data.slots),selected:before.index,...(before.data.offhand?{offhand:structuredClone(before.data.offhand)}:{}),equipment:structuredClone(before.data.equipment)};
  after.slots[before.index]=replacement?structuredClone(replacement):null;
  let finished=false;
  const valid=()=>{
   try{return !finished&&lifecycleValid()&&lease.valid()&&mutation.valid()&&labInventorySnapshot(inventory,lease.slots).fingerprint===before.fingerprint&&lease.valid()&&mutation.valid();}catch{return false;}
  };
  return Object.freeze({afterInventory:()=>structuredClone(after),valid,finalize:()=>{
   if(!valid())return false;
   try{mutation.commit();finished=true;return true;}catch{return false;}
  },cancel:()=>{if(!finished){finished=true;lease.cancel();}}});
 }catch{lease.cancel();return null;}
}
