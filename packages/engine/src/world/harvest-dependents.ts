import {CANE_PLANT_ID}from '../catalog/cane-profile';
import {tryBlockById}from '../catalog/blocks';
import {WORLD_HEIGHT}from './chunk';
import type{World}from './world';
export interface HarvestDependent{readonly x:number;readonly y:number;readonly z:number;readonly id:number}
/** Preserve old one-cell support behavior; a new Cane column is one bounded vertical dependency. */
export function dependentHarvestCells(world:World,x:number,y:number,z:number,above:number):readonly HarvestDependent[]{
 const cells:HarvestDependent[]=[];
 if(above===CANE_PLANT_ID){for(let by=y+1;by<WORLD_HEIGHT;by++){const id=world.getBlock(x,by,z);if(id!==CANE_PLANT_ID)break;cells.push(Object.freeze({x,y:by,z,id}));}}
 else if(tryBlockById(above)?.needsSupport)cells.push(Object.freeze({x,y:y+1,z,id:above}));
 return Object.freeze(cells);
}
