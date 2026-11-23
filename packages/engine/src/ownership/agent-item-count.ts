import type {AgentState} from '../automation/agent';
import {readOriginalInventorySlots} from './inventory-lease';
import {ownedCargoFingerprint} from './owned-placement-cargo';
import {sanitizeStack} from '../persistence/savecheck';
import {labCanonical} from './lab-inventory-snapshot';

/** App policy: null means zero; unavailable/malformed/busy/stale means undefined, never zero.
 * No mutation lease, metadata reference, normalization or external callbacks escape this read. */
export function readOwnedAgentItemCount(agent:AgentState,slot:number,lifecycleValid:()=>boolean=()=>true):number|undefined{
 if(!Number.isInteger(slot)||slot<0||slot>=27)return undefined;
 try{
  const slots=readOriginalInventorySlots(agent);if(!slots)return undefined;
  const snapshot=()=>{
   if(slots.length!==27)return undefined;
   const fingerprint=ownedCargoFingerprint(agent,slots);
   const arrays=(value:unknown):void=>{if(!value||typeof value!=='object')return;
    if(Array.isArray(value)&&(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1))throw Error('Extra cargo array data');
    for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(!('value'in d))throw Error('Unreadable cargo');arrays(d.value);}
   };arrays(slots);
   for(const stack of slots)if(stack!==null&&labCanonical(sanitizeStack(stack))!==labCanonical(stack))return undefined;
   return fingerprint;
  },before=snapshot();if(before===undefined)return undefined;
  const stack=Object.getOwnPropertyDescriptor(slots,String(slot))!.value;
  const count=stack===null?0:stack.count;
  if(!lifecycleValid()||readOriginalInventorySlots(agent)!==slots||snapshot()!==before)return undefined;
  return count;
 }catch{return undefined;}
}
