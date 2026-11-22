import {WORLD_BORDER,type Vec3} from '../core/math';
import {WORLD_HEIGHT} from '../world/chunk';
import {bodyBox} from './physics';
import {isPortalBlock,type PortalRecord} from './portals';
import {blockId} from '../catalog/blocks';
import type {World,WorldCellSnapshot} from '../world/world';
/** Explicit application dwell; not current Education timing calibration. */
export const PORTAL_CONTACT_SECONDS=4;
export interface PortalContactTicket {readonly frame:Readonly<PortalRecord>;readonly unchanged:()=>boolean}
const overlaps=(a:ReturnType<typeof bodyBox>,b:ReturnType<typeof bodyBox>)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY&&a.minZ<b.maxZ&&a.maxZ>b.minZ;
/** Loaded source contact only. No source edits, generation, items or writer publication. */
export class PortalContact {
 private world:World|null=null;private current:PortalContactTicket|null=null;private seconds=0;private armed=true;
 update(world:World,feet:Vec3,dt:number,eligible=true):PortalContactTicket|null{
  if(!Number.isFinite(dt)||dt<=0||dt>1||![feet.x,feet.y,feet.z].every(Number.isFinite)||Math.abs(feet.x)>WORLD_BORDER-.3||Math.abs(feet.z)>WORLD_BORDER-.3||feet.y<0||feet.y>WORLD_HEIGHT-1.8)return null;
  if(this.world!==world){this.world=world;this.current=null;this.seconds=0;this.armed=true;}
  if(!eligible){this.current=null;this.seconds=0;return null;}
  if(world.blockSourceLeaseBusy)return null;
  const box=bodyBox(feet);let candidate:PortalContactTicket|null=null;
  for(const input of world.portals.exportState().records){
   const bounds={minX:input.x,maxX:input.x+(input.axis==='x'?input.width:1),minY:input.y,maxY:input.y+input.height,minZ:input.z,maxZ:input.z+(input.axis==='z'?input.width:1)};
   if(!overlaps(box,bounds))continue;
   const owner=world.portals.captureOwner(input);if(!owner)return null;
   const captures:WorldCellSnapshot[]=[];
   const check=(u:number,v:number,id:number)=>{const s=world.captureCell(input.x+(input.axis==='x'?u:0),input.y+v,input.z+(input.axis==='z'?u:0));if(!s||s.id!==id)return false;captures.push(s);return true;};
   const obsidian=blockId('obsidian');let coherent=true;
   for(let u=0;u<input.width;u++){if(!check(u,-1,obsidian)||!check(u,input.height,obsidian))coherent=false;for(let v=0;v<input.height;v++)if(!check(u,v,input.axis==='x'?192:193))coherent=false;}
   for(let v=0;v<input.height;v++)if(!check(-1,v,obsidian)||!check(input.width,v,obsidian))coherent=false;
   if(!coherent)return null;
   const frame=Object.freeze({...input}),unchanged=()=>!world.blockSourceLeaseBusy&&owner()&&captures.every(s=>world.cellUnchanged(s))&&owner();
   if(!unchanged())return null;candidate=Object.freeze({frame,unchanged});break;
  }
  if(!candidate){
   // Only an observed, loaded exit rearms. Unknown cells or orphan physical cells do not.
   for(let x=Math.floor(box.minX+1e-6);x<=Math.floor(box.maxX-1e-6);x++)for(let y=Math.floor(box.minY+1e-6);y<=Math.floor(box.maxY-1e-6);y++)for(let z=Math.floor(box.minZ+1e-6);z<=Math.floor(box.maxZ-1e-6);z++){const s=world.captureCell(x,y,z);if(!s||isPortalBlock(s.id))return null;}
   this.current=null;this.seconds=0;this.armed=true;return null;
  }
  if(!this.armed)return null;
  if(!this.current||!this.current.unchanged()||JSON.stringify(this.current.frame)!==JSON.stringify(candidate.frame)){this.current=candidate;this.seconds=0;}
  this.seconds=Math.min(PORTAL_CONTACT_SECONDS,this.seconds+dt);
  if(this.seconds+1e-9<PORTAL_CONTACT_SECONDS||!candidate.unchanged())return null;
  this.armed=false;this.current=candidate;return candidate;
 }
}
