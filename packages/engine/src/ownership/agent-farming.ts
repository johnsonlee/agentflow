import{AIR,blockId}from'../catalog/blocks';
import{stackId}from'../catalog/items';
import{farmlandId,farmlandMoisture,wheatId}from'../simulation/farming';
import type{World,BlockEdit,WorldCellSnapshot}from'../world/world';
import{WORLD_HEIGHT}from'../world/chunk';
import{writablePlacementCell}from'../world/placement-bounds';
import{Inventory,type ItemStack}from'./inventory';
import type{AgentState}from'../automation/agent';
import type{GameMode}from'../world/rules';
import{ownedCargoFingerprint}from'./owned-placement-cargo';
import{reserveInventoryMutation}from'./inventory-lease';
import{cloneStack}from'./stack';
export interface AgentFarmPlan{readonly edits:readonly BlockEdit[];readonly expected:readonly WorldCellSnapshot[]}
const own=(o:object,k:string)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d?.enumerable||!('value'in d))throw Error('Unreadable farming owner');return d.value;};
function permission(world:World,mode:GameMode,x:number,y:number,z:number,expected:WorldCellSnapshot[]):boolean{
 if(mode==='creative')return true;if(mode!=='survival')return false;
 for(let by=y-1;by>=0;by--){const cell=world.captureCell(x,by,z);if(!cell)return false;expected.push(cell);if(cell.id===blockId('deny'))return false;if(cell.id===blockId('allow'))return true;}return true;
}
/** Existing application planting coordinates: exact target Air above any Farmland moisture.
 * Pure loaded cells only; no growth/RNG/time/world/item mutation. */
export function planWheatPlant(world:World,x:number,y:number,z:number,mode:GameMode='survival'):AgentFarmPlan|null{
 if(world.blockSourceLeaseBusy||!writablePlacementCell(x,y,z)||y<1)return null;const target=world.captureCell(x,y,z),soil=world.captureCell(x,y-1,z);if(!target||target.id!==AIR||!soil||farmlandMoisture(soil.id)===null)return null;const expected=[target,soil];if(!permission(world,mode,x,y,z,expected))return null;return{edits:[[x,y,z,wheatId(0)]],expected};
}
/** Direction-only application till policy: Grass/Dirt + loaded Air above -> Farmland0.
 * No implicit Hoe/material debit/wear; native hidden inventory requirements remain unproved. */
export function planAgentTill(world:World,x:number,y:number,z:number):AgentFarmPlan|null{
 if(world.blockSourceLeaseBusy||!writablePlacementCell(x,y,z)||y>=WORLD_HEIGHT-1)return null;const soil=world.captureCell(x,y,z),above=world.captureCell(x,y+1,z);if(!soil||![blockId('grass'),blockId('dirt')].includes(soil.id)||!above||above.id!==AIR)return null;const expected=[soil,above];if(!permission(world,'survival',x,y,z,expected))return null;return{edits:[[x,y,z,farmlandId(0)]],expected};
}
/** Original constructor-branded bag and full structural cargo/Agent pose proof. Nullable
 * captured debit publishes before external World observers, never ambient selection afterward. */
export function plantOwnedWheat(world:World,owner:Inventory|AgentState,mode:GameMode,x:number,y:number,z:number,lifecycleValid:()=>boolean=()=>true):boolean{
 if(world.blockSourceLeaseBusy||mode!=='survival'&&mode!=='creative')return false;const lease=reserveInventoryMutation(owner);if(!lease)return false;let committed=false;
 try{const snapshot=()=>ownedCargoFingerprint(owner,lease.slots),before=snapshot(),selected=own(owner,'selected'),cell=Object.getOwnPropertyDescriptor(lease.slots,String(selected));if(!cell||!('value'in cell)||!cell.writable)return false;const source=cell.value as ItemStack|null;if(!source||own(source,'id')!==stackId('wheat_seeds'))return false;const replacement=mode==='survival'?(source.count===1?null:cloneStack(source,source.count-1)):source,staged=lease.prepare(selected,replacement);if(!staged)return false;const plan=planWheatPlant(world,x,y,z,mode);if(!plan)return false;
 const valid=()=>lifecycleValid()&&lease.valid()&&staged.valid()&&snapshot()===before&&Object.getOwnPropertyDescriptor(lease.slots,String(selected))?.value===source;
 world.commitBlockBatch(plan.edits,()=>{if(mode==='survival')staged.commit();else lease.cancel();committed=true;},plan.expected,valid);return committed;
 }catch{return committed;}finally{lease.cancel();}
}
/** A guarded Agent action, with no inventory write. Reserving the original Agent prevents
 * reentrant commands while its position/cargo defines a pending World operation. */
export function tillOwnedAgentSoil(world:World,agent:AgentState,x:number,y:number,z:number,lifecycleValid:()=>boolean=()=>true):boolean{
 if(world.blockSourceLeaseBusy||agent instanceof Inventory)return false;const lease=reserveInventoryMutation(agent);if(!lease)return false;let committed=false;
 try{const snapshot=()=>ownedCargoFingerprint(agent,lease.slots),before=snapshot(),plan=planAgentTill(world,x,y,z);if(!plan)return false;world.commitBlockBatch(plan.edits,()=>{lease.cancel();committed=true;},plan.expected,()=>lifecycleValid()&&lease.valid()&&snapshot()===before);return committed;
 }catch{return committed;}finally{lease.cancel();}
}
