import {AIR,blockId} from '../catalog/blocks';
import {BONE_MEAL_ITEM_ID} from '../catalog/bone-meal-profile';
import {CANE_PLANT_ID,CANE_APP_PROFILE} from '../catalog/cane-profile';
import {WORLD_HEIGHT} from '../world/chunk';
import type {World,BlockEdit,WorldCellSnapshot} from '../world/world';
import type {GameMode} from '../world/rules';
import type {Inventory,ItemStack} from './inventory';
import {inspectBoneMealItemOwner} from './bone-meal-items';
import {labCanonical,labInventorySnapshot} from './lab-inventory-snapshot';
import {reserveInventoryMutation} from './inventory-lease';
import {farmlandMoisture,wheatAge,wheatId} from '../simulation/farming';
import {wheatBoneMealAge} from '../simulation/wheat-bone-meal';

export interface BoneMealTarget{x:number;y:number;z:number}
export interface BoneMealCanePlan{supported:boolean;edits:readonly BlockEdit[];expected:readonly WorldCellSnapshot[]}
/** Loaded crop/soil/permission witnesses, then one candidate-policy draw for an eligible crop.
 * Returning this plan never mutates a world, inventory or farming clock. */
export function planBoneMealWheat(world:World,target:BoneMealTarget,mode:GameMode='survival',rand:()=>number=Math.random):BoneMealCanePlan{
 const empty=(supported=true):BoneMealCanePlan=>({supported,edits:[],expected:[]});
 if(world.blockSourceLeaseBusy||mode!=='survival'&&mode!=='creative'||!target||typeof target!=='object')return empty();
 const coordinates=['x','y','z'].map(k=>Object.getOwnPropertyDescriptor(target,k));
 if(coordinates.some(d=>!d||!('value'in d)||!Number.isSafeInteger(d.value)))return empty();
 const[x,y,z]=coordinates.map(d=>d!.value as number);if(y<1||y>=WORLD_HEIGHT)return empty();
 const expected:WorldCellSnapshot[]=[];
 const take=(by:number)=>{const c=world.captureCell(x,by,z);if(c)expected.push(c);return c;};
 const crop=take(y);if(!crop)return empty();const age=wheatAge(crop.id);if(age===null)return empty(false);
 if(age===7)return empty();const soil=take(y-1);if(!soil||farmlandMoisture(soil.id)===null)return empty();
 if(mode==='survival')for(let py=y-1;py>=0;py--){const permit=take(py);if(!permit||permit.id===blockId('deny'))return empty();if(permit.id===blockId('allow'))break;}
 const next=wheatBoneMealAge(age,rand());if(next===null)return empty();
 return{supported:true,edits:[[x,y,z,wheatId(next)]],expected};
}
/** Loaded-only application model: one Meal fills available contiguous headroom to cap3.
 * Partial obstruction permits a shorter growth; no new cell means no debit. Not native calibration. */
export function planBoneMealCane(world:World,target:BoneMealTarget,mode:GameMode='survival'):BoneMealCanePlan{
 const empty=(supported=true):BoneMealCanePlan=>({supported,edits:[],expected:[]});
 if(world.blockSourceLeaseBusy||mode!=='survival'&&mode!=='creative')return empty();
 if(!target||typeof target!=='object')return empty();
 const coordinates=['x','y','z'].map(k=>Object.getOwnPropertyDescriptor(target,k));
 if(coordinates.some(d=>!d||!('value'in d)||!Number.isSafeInteger(d.value)))return empty();
 const[x,y,z]=coordinates.map(d=>d!.value as number);if(y<1||y>=WORLD_HEIGHT)return empty();
 const expected:WorldCellSnapshot[]=[],edits:BlockEdit[]=[];
 const take=(by:number,bx=x,bz=z)=>{const c=world.captureCell(bx,by,bz);if(c)expected.push(c);return c;};
 const hit=take(y);if(!hit)return empty();if(hit.id!==CANE_PLANT_ID)return empty(false);
 let root=y;
 while(root>0){const below=take(root-1);if(!below)return empty();if(below.id!==CANE_PLANT_ID)break;root--;}
 if(root<1)return empty();
 const soil=take(root-1);if(!soil||![blockId('sand'),blockId('dirt'),blockId('grass')].includes(soil.id))return empty();
 const neighbors=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>take(root-1,x+dx,z+dz));
 if(neighbors.some(n=>!n)||!neighbors.some(n=>n!.id===blockId('water')))return empty();
 let top=root;
 while(top<WORLD_HEIGHT){const c=take(top);if(!c)return empty();if(c.id!==CANE_PLANT_ID)break;top++;}
 if(top-root>=CANE_APP_PROFILE.maximumColumn)return{supported:true,edits,expected};
 for(let by=top;by<root+CANE_APP_PROFILE.maximumColumn&&by<WORLD_HEIGHT;by++){
  const cell=take(by);if(!cell)return empty();if(cell.id!==AIR)break;
  // Loaded nearest Allow/Deny witness for each added cell; no getBlock or unknown generation.
  if(mode==='survival')for(let py=by-1;py>=0;py--){const permit=take(py);if(!permit)return empty();if(permit.id===blockId('deny'))return empty();if(permit.id===blockId('allow'))break;}
  edits.push([x,by,z,CANE_PLANT_ID]);
 }
 return{supported:true,edits,expected};
}

/** Exact original finite source and all added cells publish together before World callbacks.
 * Caller lifecycle guard must exclude this operation's own inventory lease. */
export function useOwnedBoneMeal(world:World,inventory:Inventory,mode:GameMode,target:BoneMealTarget,lifecycleValid:()=>boolean=()=>true,rand:()=>number=Math.random):number{
 if(mode!=='survival'&&mode!=='creative'||world.blockSourceLeaseBusy)return 0;
 const bag=reserveInventoryMutation(inventory);if(!bag)return 0;
 let committed=false,count=0;
 try{
  const before=labInventorySnapshot(inventory,bag.slots),cell=Object.getOwnPropertyDescriptor(bag.slots,String(before.index));
  if(!cell||!('value'in cell)||!cell.writable)return 0;
  const source=cell.value as ItemStack|null,stack=before.data.slots[before.index] as ItemStack|null;if(!source||!stack||stack.id!==BONE_MEAL_ITEM_ID)return -1;
  if(inspectBoneMealItemOwner(stack).kind==='invalid')return 0;
  const staged=bag.prepare(before.index,mode==='survival'?(stack.count===1?null:{id:BONE_MEAL_ITEM_ID,count:stack.count-1}):stack);if(!staged)return 0;
  const wheat=planBoneMealWheat(world,target,mode,rand),plan=wheat.supported?wheat:planBoneMealCane(world,target,mode);if(!plan.supported)return -1;if(!plan.edits.length)return 0;count=plan.edits.length;
  const valid=()=>{if(!lifecycleValid()||!bag.valid()||!staged.valid())return false;const final=labInventorySnapshot(inventory,bag.slots),last=Object.getOwnPropertyDescriptor(bag.slots,String(before.index));return final.index===before.index&&final.fingerprint===before.fingerprint&&last?.value===source&&last.writable===true;};
  world.commitBlockBatch(plan.edits,()=>{if(mode==='survival')staged.commit();else bag.cancel();committed=true;},plan.expected,valid);
  return committed?count:0;
 }catch{return committed?count:0;}finally{bag.cancel();}
}
