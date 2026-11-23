import type {AgentState} from '../automation/agent';
import {sanitizeStack} from '../persistence/savecheck';
import {labCanonical} from './lab-inventory-snapshot';
import {ownedCargoFingerprint} from './owned-placement-cargo';
import {reserveInventoryMutation} from './inventory-lease';
import {cloneStack,stacksCompatible,stackLimit} from './stack';

/** Application policy: exact quantity, canonical metadata and unchanged refusal on any
 * capacity/owner/lifecycle problem. Same-slot is a validated unchanged no-op.
 * Native MakeCode edge behavior/return values are not asserted by this helper. */
export function transferOwnedAgentItems(agent:AgentState,quantity:number,sourceSlot:number,destinationSlot:number,lifecycleValid:()=>boolean=()=>true):boolean{
 if(!Number.isSafeInteger(quantity)||quantity<=0||!Number.isInteger(sourceSlot)||sourceSlot<0||sourceSlot>=27||!Number.isInteger(destinationSlot)||destinationSlot<0||destinationSlot>=27)return false;
 const lease=reserveInventoryMutation(agent);if(!lease)return false;
 try{
  const snapshot=()=>{
   if(lease.slots.length!==27||Object.isFrozen(agent))throw Error('Invalid original Agent owner');
   const fingerprint=ownedCargoFingerprint(agent,lease.slots);
   const arrays=(value:unknown):void=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)&&(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1))throw Error('Extra array ownership data');
    for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(!('value'in d))throw Error('Unreadable ownership');arrays(d.value);}
   };
   arrays(lease.slots);return fingerprint;
  },before=snapshot();
  // Refuse normalization/loss, including unrelated cargo; never silently repair metadata.
  for(const stack of lease.slots)if(stack!==null&&labCanonical(sanitizeStack(stack))!==labCanonical(stack))return false;
  const source=lease.slots[sourceSlot],destination=lease.slots[destinationSlot];
  if(!source||source.count<quantity)return false;
  if(sourceSlot===destinationSlot)return lifecycleValid()&&lease.valid()&&snapshot()===before;
  if(destination&&(!stacksCompatible(source,destination)||destination.count+quantity>stackLimit(destination)))return false;
  if(!destination&&quantity>stackLimit(source))return false;
  const nextSource=source.count===quantity?null:cloneStack(source,source.count-quantity);
  const nextDestination=destination?cloneStack(destination,destination.count+quantity):cloneStack(source,quantity);
  const batch=lease.prepareBatch([{index:sourceSlot,replacement:nextSource},{index:destinationSlot,replacement:nextDestination}]);
  if(!batch)return false;
  // A lifecycle hook may reenter/change state. Recheck the whole original owner AFTER it;
  // snapshot/cell validation then trusted batch writes invoke no external callback.
  if(!lifecycleValid()||!lease.valid()||snapshot()!==before||!batch.valid())return false;
  return batch.commit();
 }catch{return false;}finally{lease.cancel();}
}
