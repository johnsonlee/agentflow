import{AGENT_DIRECTIONS,agentStep,type AgentDirection,type AgentState}from '../automation/agent';
import type{World}from '../world/world';
import{WORLD_HEIGHT}from '../world/chunk';
import{WORLD_BORDER}from '../core/math';
import{reserveInventoryMutation}from './inventory-lease';
import{ownedCargoFingerprint}from './owned-placement-cargo';
import{sanitizeStack}from '../persistence/savecheck';
import{labCanonical}from './lab-inventory-snapshot';
import{cloneStack}from './stack';
import{reserveWorldDropBatchReceipt,type WorldDrops,type PreparedWorldDropBatchReceipt}from './world-drops';

/** App policy: all canonical carried stacks enter one original current-world physical drop
 * batch, or both owners remain unchanged. Empty inventory is a validated no-op. Native
 * return/empty/error/offset/physics behavior and Python alias are not calibrated. */
export function dropAllOwnedAgentItems(world:Pick<World,'getLoadedBlock'>,agent:AgentState,dir:AgentDirection,receiver:WorldDrops,lifecycleValid:()=>boolean=()=>true):boolean{
 if(!AGENT_DIRECTIONS.includes(dir))return false;
 const lease=reserveInventoryMutation(agent);if(!lease)return false;
 let receipt:PreparedWorldDropBatchReceipt|null=null;
 try{
  const snapshot=()=>{
   if(lease.slots.length!==27||Object.isFrozen(agent)||Object.getPrototypeOf(lease.slots)!==Array.prototype||Reflect.ownKeys(lease.slots).length!==28)throw Error('Invalid original Agent cargo');
   const fingerprint=ownedCargoFingerprint(agent,lease.slots);
   const arrays=(value:unknown):void=>{if(!value||typeof value!=='object')return;
    if(Array.isArray(value)&&(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1))throw Error('Extra cargo array fields');
    for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(!('value'in d))throw Error('Unreadable cargo');arrays(d.value);}
   };arrays(lease.slots);
   for(let index=0;index<27;index++)if(Object.getOwnPropertyDescriptor(lease.slots,String(index))?.writable!==true)throw Error('Readonly cargo cell');
   for(const stack of lease.slots)if(stack!==null&&labCanonical(sanitizeStack(stack))!==labCanonical(stack))throw Error('Noncanonical cargo');
   return fingerprint;
  },before=snapshot();
  const [dx,dy,dz]=agentStep(agent,dir),target={x:agent.x+dx,y:agent.y+dy,z:agent.z+dz};
  if(Math.abs(target.x)>WORLD_BORDER||Math.abs(target.z)>WORLD_BORDER||target.y<0||target.y>=WORLD_HEIGHT||world.getLoadedBlock(target.x,target.y,target.z)===undefined)return false;
  const cells=lease.slots.flatMap((stack,index)=>stack===null?[]:[{index,replacement:null}]);
  const batch=cells.length?lease.prepareBatch(cells):null;if(cells.length&&!batch)return false;
  receipt=reserveWorldDropBatchReceipt(receiver,world,lease.slots.filter(stack=>stack!==null).map(stack=>cloneStack(stack!)),{x:target.x+.5,y:target.y+.25,z:target.z+.5});if(!receipt)return false;
  // External lifecycle work precedes every final owner validation. Genuine source batch and
  // branded receiver finalizers below contain no user callbacks, getters or proxy writes.
  if(lifecycleValid()!==true||!lease.valid()||snapshot()!==before||!receipt.valid()||batch&&!batch.valid())return false;
  if(batch&&!batch.commit())return false;
  receipt.commit();return true;
 }catch{return false;}finally{receipt?.cancel();lease.cancel();}
}
