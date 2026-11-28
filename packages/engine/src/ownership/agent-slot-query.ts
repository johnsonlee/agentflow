import type {AgentState} from '../automation/agent';
import {MAX_STACK} from '../catalog/items';
import {stackLimit} from './stack';
import {readOriginalInventorySlots} from './inventory-lease';
import {ownedCargoFingerprint} from './owned-placement-cargo';
import {sanitizeStack} from '../persistence/savecheck';
import {labCanonical} from './lab-inventory-snapshot';

/** Internal scalar queries only: no caller projection receives editable cargo metadata. */
export function readOwnedAgentSlotNumber(agent:AgentState,slot:number,kind:'count'|'space',lifecycleValid:()=>boolean):number|undefined{
 if(!Number.isInteger(slot)||slot<0||slot>=27||(kind!=='count'&&kind!=='space'))return undefined;
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
  const value=kind==='count'?(stack===null?0:stack.count):(stack===null?MAX_STACK:stackLimit(stack)-stack.count);
  if(kind==='space'&&(!Number.isSafeInteger(value)||value<0))return undefined;
  const current=lifecycleValid();
  if((kind==='space'?current!==true:!current)||readOriginalInventorySlots(agent)!==slots||snapshot()!==before)return undefined;
  return value;
 }catch{return undefined;}
}
