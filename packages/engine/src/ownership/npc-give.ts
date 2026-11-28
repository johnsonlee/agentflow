import {INVENTORY_SIZE,type Inventory} from './inventory';
import {readOriginalInventorySlots,reserveInventoryMutation} from './inventory-lease';
import {cloneStack,insertStackIntoSlots,snapshotFactoryStack} from './stack';
import {freshStack} from './glow-stick-state';
import {isKnownId} from '../catalog/items';
/** Finite, all-or-nothing NPC command allocation. No owner adoption or caller callback after final proof. */
export function giveNpcItemExact(inventory:Inventory,id:number,count:number,current:()=>boolean):boolean{
 let lease:ReturnType<typeof reserveInventoryMutation>=null;
 try{
  if(!isKnownId(id)||!Number.isSafeInteger(count)||count<1||count>2304||!current())return false;
  const slots=readOriginalInventorySlots(inventory);if(!slots)return false;
  if(Object.getPrototypeOf(slots)!==Array.prototype||Object.getOwnPropertyDescriptor(slots,'length')?.value!==INVENTORY_SIZE||Reflect.ownKeys(slots).length!==INVENTORY_SIZE+1)return false;
  const sources:(ReturnType<typeof snapshotFactoryStack>|null)[]=[],trial:(import('./inventory').ItemStack|null)[]=[];
  for(let i=0;i<INVENTORY_SIZE;i++){
   const field=Object.getOwnPropertyDescriptor(slots,String(i));if(!field||!('value'in field)||!field.enumerable||field.writable!==true)return false;
   const source=field.value===null?null:snapshotFactoryStack(field.value);if(field.value!==null&&!source)return false;
   sources.push(source);trial.push(source?cloneStack(source.data):null);
  }
  if(insertStackIntoSlots(trial,freshStack(id,count))!==0)return false;
  // All callbacks finish before source proof/reservation/publication. Original born nodes are non-invoking.
  if(!current()||readOriginalInventorySlots(inventory)!==slots)return false;
  for(let i=0;i<slots.length;i++){
   const before=sources[i],field=Object.getOwnPropertyDescriptor(slots,String(i));if(!field||!("value"in field)||!field.writable)return false;const now=field.value;if(before?(now!==before.root||JSON.stringify(snapshotFactoryStack(now)?.values)!==JSON.stringify(before.values)):now!==null)return false;
  }
  lease=reserveInventoryMutation(inventory);if(!lease)return false;
  const cells=[];
  for(let index=0;index<trial.length;index++){
   const replacement=trial[index],before=sources[index];
   if(JSON.stringify(replacement?snapshotFactoryStack(replacement)?.values:null)!==JSON.stringify(before?before.values:null))cells.push({index,replacement});
  }
  const publication=lease.prepareBatch(cells);
  return !!publication&&publication.valid()&&publication.commit();
 }catch{return false;}finally{lease?.cancel();}
}
