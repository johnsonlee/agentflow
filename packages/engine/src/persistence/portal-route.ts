import {serializeSave,type SaveData} from './save';
import {captureDimensionWorld,replaceDimensionWorld,type DimensionWorldState,type DimensionId} from './dimension-world';
import {readDimensionArchive,type DimensionsData,type DimensionPortalEndpoint} from './dimension-save';
import {createDimensionGeneratedBlockProbe} from '../world/dimension-probe';
import type {PortalRecord} from '../simulation/portals';
import {WORLD_BORDER,type Vec3} from '../core/math';
import {WORLD_HEIGHT} from '../world/chunk';
import {blockId} from '../catalog/blocks';
const fields=['axis','x','y','z','width','height'] as const;
const samePortal=(a:PortalRecord,b:PortalRecord)=>fields.every(k=>a[k]===b[k]);
const sameEndpoint=(a:DimensionPortalEndpoint,b:DimensionPortalEndpoint)=>a.dimension===b.dimension&&samePortal(a.portal,b.portal);
const sameJSON=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameJSON(v,b[i]));
 if(!a||!b||typeof a!=="object"||typeof b!=="object")return false;
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left).sort(),other=Object.keys(right).sort();
 return keys.length===other.length&&keys.every((k,i)=>k===other[i]&&sameJSON(left[k],right[k]));
};
const playerArrival=(p:Vec3)=>[p.x,p.y,p.z].every(Number.isFinite)&&Math.abs(p.x)<=WORLD_BORDER-.3&&Math.abs(p.z)<=WORLD_BORDER-.3&&p.y>=1&&p.y<=WORLD_HEIGHT-1.8;
const agentArrivalValid=(p:Vec3)=>[p.x,p.y,p.z].every(Number.isSafeInteger)&&p.x>=-WORLD_BORDER&&p.x<WORLD_BORDER&&p.z>=-WORLD_BORDER&&p.z<WORLD_BORDER&&p.y>=1&&p.y<=WORLD_HEIGHT-1;
/** Detached data transaction over already prepared, trusted world snapshots.
 * Does not find/build an exit, validate runtime collision/readiness, debit items,
 * move live actors, write storage or publish a Game writer. Caller must do those checks.
 */
export function createPortalRouteSave(source:SaveData,sourceDimension:DimensionId,sourcePortal:PortalRecord,target:DimensionWorldState,targetPortal:PortalRecord,arrival:Vec3,agentArrival:Vec3):SaveData|null{
 try{
  if((sourceDimension!=='overworld'&&sourceDimension!=='nether')||!playerArrival(arrival)||!agentArrivalValid(agentArrival)||source.playerState?.death||source.playerState&&source.playerState.health<1)return null;
  const probe=createDimensionGeneratedBlockProbe();serializeSave(source,probe);
  const initial:DimensionsData=source.dimensions??{version:1,active:'overworld',inactive:{},links:[]};
  const read=readDimensionArchive(initial,source,probe);if(read.kind!=='valid'||read.data.active!==sourceDimension)return null;
  const next=replaceDimensionWorld(source,target); // Validate/detach complete target envelope before reading any target owner.
  const current=captureDimensionWorld(source),targetDimension=sourceDimension==='overworld'?'nether':'overworld';
  if(!current.portals?.records.some(p=>samePortal(p,sourcePortal))||!target.portals?.records.some(p=>samePortal(p,targetPortal)))return null;
  const sourceEndpoint:DimensionPortalEndpoint={dimension:sourceDimension,portal:{...sourcePortal}},targetEndpoint:DimensionPortalEndpoint={dimension:targetDimension,portal:{...targetPortal}};
  const linked=read.data.links.find(link=>sameEndpoint(link.from,sourceEndpoint)||sameEndpoint(link.to,sourceEndpoint));
  if(linked){const other=sameEndpoint(linked.from,sourceEndpoint)?linked.to:linked.from;if(!sameEndpoint(other,targetEndpoint))return null;}
  else if(read.data.links.some(link=>sameEndpoint(link.from,targetEndpoint)||sameEndpoint(link.to,targetEndpoint)))return null;
  const previous=read.data.inactive[targetDimension];
  if(previous){
   const staticOwners=(w:DimensionWorldState)=>Object.fromEntries(Object.entries(w).filter(([k])=>k!=="edits"&&k!=="portals"&&k!=="player"));
   if(!sameJSON(staticOwners(captureDimensionWorld(previous as SaveData)),staticOwners(captureDimensionWorld(next))))return null;
   const edits=new Map(next.edits.map(e=>[`${e[0]},${e[1]},${e[2]}`,e[3]]));
   const before=new Map(previous.edits.map(e=>[`${e[0]},${e[1]},${e[2]}`,e[3]]));
   const cell=(map:Map<string,number>,x:number,y:number,z:number)=>map.get(`${x},${y},${z}`)??probe(targetDimension,previous.seed,previous.generatorVersion??1,x,y,z);
   const coldLava=(e:DimensionWorldState['edits'][number],id:number|undefined)=>e[3]===blockId('lava')&&id===blockId('obsidian')&&[[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([dx,dy,dz])=>cell(before,e[0]+dx,e[1]+dy,e[2]+dz)===blockId('water')&&cell(edits,e[0]+dx,e[1]+dy,e[2]+dz)===blockId('water'));
   // The existing static-source fluid rule can become observable during cold chunk loading.
   // Only that exact Lava→Obsidian transition with pre-existing retained Water is allowed.
   if(previous.edits.some(e=>{
    const key=`${e[0]},${e[1]},${e[2]}`;
    // World preparation exports sparse deltas. An omitted key is preserved only
    // when the exact target realm/seed/generator resolves to the prior material.
    // Unknown terrain and real material loss still refuse the whole route.
    if(!edits.has(key))return cell(edits,e[0],e[1],e[2])!==e[3];
    const id=edits.get(key);return e[3]!==0&&id!==e[3]&&!coldLava(e,id);
   }))return null;
   if(previous.portals?.records.some(p=>!next.portals?.records.some(q=>samePortal(p,q))))return null;
  }
  next.player={...source.player,position:{...arrival}};
  if(next.agent)next.agent={...next.agent,...agentArrival,slots:next.agent.slots};
  next.dimensions={version:1,active:targetDimension,inactive:{[sourceDimension]:current},links:linked?read.data.links:[...read.data.links,{from:sourceEndpoint,to:targetEndpoint}]};
  // Complete validation precedes any publication. A failure never returns partial owners.
  const result=readDimensionArchive(next.dimensions,next,probe);if(result.kind!=='valid')return null;
  next.dimensions=result.data;serializeSave(next,probe);return next;
 }catch{return null;}
}
