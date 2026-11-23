import{AGENT_DIRECTIONS,agentStep,type AgentDirection,type AgentState}from '../automation/agent';
import type{World}from '../world/world';
import{WORLD_HEIGHT}from '../world/chunk';
import{WORLD_BORDER}from '../core/math';
import{reserveInventoryMutation}from './inventory-lease';
import{sanitizeStack}from '../persistence/savecheck';
import{labCanonical}from './lab-inventory-snapshot';
import{cloneStack,snapshotFactoryStack,type FactoryStackSnapshot}from './stack';
import{reserveWorldDropBatchReceipt,type WorldDrops,type PreparedWorldDropBatchReceipt}from './world-drops';
const descriptor=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,prototype=Object.getPrototypeOf;
const ordinaryPrototype=Object.prototype,arrayPrototype=Array.prototype;
interface CargoSnapshot{values:readonly number[];cargo:readonly(FactoryStackSnapshot|null)[]}
const equal=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
/** App policy: transfer all original canonical carried stacks into one original-world
 * physical batch or publish neither owner. Only trusted factory/sanitizer ingress is
 * admitted; debug-assigned unproven payloads never acquire trust by being inspected.
 * Native return/empty/error/offset/physics and Python spelling remain uncalibrated. */
export function dropAllOwnedAgentItems(world:Pick<World,'getLoadedBlock'>,agent:AgentState,dir:AgentDirection,receiver:WorldDrops,lifecycleValid:()=>boolean=()=>true):boolean{
 if(typeof dir!=='string'||!AGENT_DIRECTIONS.includes(dir))return false;
 // A successful registration/lease proves these root identities were originally real,
 // cloneable owner/Array objects; replacing either with a Proxy cannot retain the lease.
 const lease=reserveInventoryMutation(agent);if(!lease)return false;
 let receipt:PreparedWorldDropBatchReceipt|null=null;
 try{
  const snapshot=():CargoSnapshot=>{
   if(!lease.valid()||prototype(agent)!==ordinaryPrototype||Object.isFrozen(agent)||prototype(lease.slots)!==arrayPrototype||keys(lease.slots).length!==28)throw Error('Invalid original Agent');
   const names=keys(agent),fields:Record<string,PropertyDescriptor>=Object.create(null);if(names.length!==6)throw Error('Extra Agent data');
   for(const name of names){if(typeof name!=='string'||!['x','y','z','facing','slots','selected'].includes(name))throw Error('Unknown Agent field');const field=descriptor(agent,name);if(!field?.enumerable||!('value'in field))throw Error('Unreadable Agent field');fields[name]=field;}
   if(fields.slots.value!==lease.slots||descriptor(lease.slots,'length')?.value!==27)throw Error('Replaced slots');
   const values=['x','y','z','facing','selected'].map(name=>fields[name].value);if(!values.every(Number.isSafeInteger)||values[3]<0||values[3]>3||values[4]<0||values[4]>=27)throw Error('Invalid pose or selection');
   const cargo:(FactoryStackSnapshot|null)[]=[],roots=new Set<object>();
   for(let i=0;i<27;i++){const field=descriptor(lease.slots,String(i));if(!field?.enumerable||!('value'in field)||field.writable!==true)throw Error('Unreadable/readonly slot');if(field.value===null){cargo.push(null);continue;}const proof=snapshotFactoryStack(field.value);if(!proof)throw Error('Unproven carried data');if(roots.has(proof.root))throw Error('Aliased carried stack');roots.add(proof.root);cargo.push(proof);}
   return{values,cargo};
  },before=snapshot();
  // Generic canonical sanitation runs ONLY on our detached scalar-data snapshots before
  // the external hook, never on an unproven live graph or in the final joint-check tail.
  for(const stack of before.cargo)if(stack&&labCanonical(sanitizeStack(stack.data))!==labCanonical(stack.data))return false;
  const [dx,dy,dz]=agentStep(agent,dir),target={x:before.values[0]+dx,y:before.values[1]+dy,z:before.values[2]+dz};
  if(Math.abs(target.x)>WORLD_BORDER||Math.abs(target.z)>WORLD_BORDER||target.y<0||target.y>=WORLD_HEIGHT||world.getLoadedBlock(target.x,target.y,target.z)===undefined)return false;
  const cells=before.cargo.flatMap((stack,index)=>stack?[{index,replacement:null}]:[]),batch=cells.length?lease.prepareBatch(cells):null;if(cells.length&&!batch)return false;
  const staged=before.cargo.flatMap(stack=>stack?[cloneStack(stack.data)]:[]);
  receipt=reserveWorldDropBatchReceipt(receiver,world,target.x+.5,target.y+.25,target.z+.5,...staged);if(!receipt)return false;
  if(lifecycleValid()!==true||!lease.valid())return false;
  const after=snapshot();if(!equal(before.values,after.values))return false;
  for(let i=0;i<27;i++){const a=before.cargo[i],b=after.cargo[i];if(a===null||b===null){if(a!==b)return false;}else if(a.root!==b.root||!equal(a.values,b.values))return false;}
  // Every candidate receiver/source node is identity-gated before reflection. These
  // last checks and both genuine finalizers contain no caller traps/getters/hooks.
  if(!receipt.valid()||batch&&!batch.valid())return false;
  if(batch&&!batch.commit())return false;
  receipt.commit();return true;
 }catch{return false;}finally{receipt?.cancel();lease.cancel();}
}
