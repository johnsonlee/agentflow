import {planLabProduct,type LabProductHit} from '../crafting/labeffects';
import type {World} from '../world/world';
import type {GameMode} from '../world/rules';
import type {Inventory,ItemStack} from './inventory';
import {reserveInventoryMutation} from './inventory-lease';
import {sanitizeStack} from '../persistence/savecheck';
import {nameOf} from '../catalog/items';
import {labCanonical,labInventorySnapshot} from './lab-inventory-snapshot';

/** One loaded effect and its original source debit publish before any world observer.
 * Disk persistence remains a separate Game checkpoint; failed checkpoints retain coherent RAM. */
export function useOwnedLabProduct(world:World,inventory:Inventory,mode:GameMode,hit:LabProductHit,rand:()=>number=Math.random,modeValid:()=>boolean=()=>true):number {
 if(mode!=="survival"&&mode!=="creative"||world.blockSourceLeaseBusy)return 0;
 const bag=reserveInventoryMutation(inventory);if(!bag)return 0;
 let committed=false,count=0;
 try{
  const before=labInventorySnapshot(inventory,bag.slots),cell=Object.getOwnPropertyDescriptor(bag.slots,String(before.index));
  if(!cell||!('value'in cell)||!cell.writable)return 0;
  const source=cell.value as ItemStack|null,stack=before.data.slots[before.index] as ItemStack|null;if(!source||!stack)return -1;
  const name=nameOf(stack.id);if(name!=="super_fertilizer"&&name!=="ice_bomb")return -1;
  const canonicalSource=sanitizeStack(stack);if(!canonicalSource||labCanonical(canonicalSource)!==labCanonical(stack))return 0;
  const replacement=mode==="survival"?(stack.count===1?null:{...stack,count:stack.count-1}):stack;
  const staged=bag.prepare(before.index,replacement);if(!staged)return 0;
  const plan=planLabProduct(world,stack.id,hit,rand);if(!plan.supported)return -1;if(!plan.edits.length)return 0;
  const valid=()=>{
   if(!modeValid()||!bag.valid()||!staged.valid())return false;
   const final=labInventorySnapshot(inventory,bag.slots),target=Object.getOwnPropertyDescriptor(bag.slots,String(before.index));
   return final.index===before.index&&final.fingerprint===before.fingerprint&&target?.value===source&&target.writable===true;
  };
  count=plan.edits.length;
  world.commitBlockBatch(plan.edits,()=>{
   // Final proof checked the constructor-original real Array writable own data cell.
   // No callbacks, getters, cloning, random draws or ambient selection reads remain here.
   if(mode==="survival")staged.commit();else bag.cancel();
   committed=true;
  },plan.expected,valid);
  return committed?count:0;
 }catch{return committed?count:0;}finally{bag.cancel();}
}
