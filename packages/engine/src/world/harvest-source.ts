import {AIR,blockId,tryBlockById} from "../catalog/blocks";
import {doorPartner} from "../simulation/redstone";
import type {World,BlockEdit,BlockSourceLease} from "./world";

export interface HarvestSource extends BlockSourceLease {
  readonly id:number; readonly above:number;
  readonly partner:readonly[number,number,number]|null; readonly partnerId:number|null;
}
/** One physical removal plan for every ordinary harvest, including door/support/portal cells.
 * Fire uses its extinguish owner instead; callers must authorize breaking before reserving. */
export function reserveHarvestSource(world:World,x:number,y:number,z:number):HarvestSource|null {
  const id=world.getBlock(x,y,z);if(id===AIR||id===blockId("fire"))return null;
  const above=world.getBlock(x,y+1,z),partner=doorPartner(world,x,y,z);
  const edits:BlockEdit[]=[[x,y,z,AIR]];
  if(partner)edits.push([...partner,AIR]);
  if(tryBlockById(above)?.needsSupport)edits.push([x,y+1,z,AIR]);
  const lease=world.reserveBlockBatch(edits);if(!lease)return null;
  return Object.freeze({id,above,partner:partner?Object.freeze([...partner] as [number,number,number]):null,partnerId:partner?world.getBlock(...partner):null,valid:lease.valid,commit:lease.commit,release:lease.release});
}
