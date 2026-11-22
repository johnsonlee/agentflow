import {AIR,blockId}from '../catalog/blocks';
import {CANE_APP_PROFILE,CANE_PLANT_ID,SUGAR_CANE_ITEM_ID}from '../catalog/cane-profile';
import {harvestOwnerSnapshot}from '../ownership/harvest-owner';
import type{ItemStack}from '../ownership/inventory';
import type{World,WorldCellSnapshot}from './world';
import {WORLD_HEIGHT}from './chunk';
/** Placement-only support profile; existing plants do not grow or silently collapse on water edits. */
export function canePlacementSupport(world:World,x:number,y:number,z:number):WorldCellSnapshot[]|null{
 if(![x,y,z].every(Number.isSafeInteger)||y<1||y>=WORLD_HEIGHT)return null;
 const expected:WorldCellSnapshot[]=[],take=(by:number,bx=x,bz=z)=>{const cell=world.captureCell(bx,by,bz);if(cell)expected.push(cell);return cell;};
 const target=take(y);if(!target||target.id!==AIR)return null;let root=y,segments=0,soil=take(root-1);
 while(soil?.id===CANE_PLANT_ID){if(++segments>=CANE_APP_PROFILE.maximumColumn)return null;root--;soil=take(root-1);}
 if(!soil||![blockId('sand'),blockId('dirt'),blockId('grass')].includes(soil.id))return null;
 const neighbors=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>take(root-1,x+dx,z+dz));
 if(neighbors.some(c=>!c)||!neighbors.some(c=>c!.id===blockId('water')))return null;
 return expected;
}
/** Player and Agent share the exact source bag/cell transaction. Permissions are caller-owned. */
export function plantSugarCaneOwned(world:World,owner:{slots:(ItemStack|null)[];selected:number},mode:'survival'|'creative',x:number,y:number,z:number,size:number,selectable:number,allowed:()=>boolean):boolean{
 if(world.blockSourceLeaseBusy||(mode!=='survival'&&mode!=='creative'))return false;const slots=owner.slots,index=owner.selected;if(index<0||index>=selectable)return false;
 const stable=harvestOwnerSnapshot(slots,index,size),stack=slots[index];if(!stable||!stack||stack.id!==SUGAR_CANE_ITEM_ID||Reflect.ownKeys(stack).some(k=>k!=='id'&&k!=='count'))return false;
 const expected=canePlacementSupport(world,x,y,z);if(!expected||!allowed())return false;
 return world.commitBlockBatch([[x,y,z,CANE_PLANT_ID]],()=>{if(mode==='survival'){stack.count--;if(stack.count===0)slots[index]=null;}},expected,()=>owner.slots===slots&&owner.selected===index&&stable());
}
