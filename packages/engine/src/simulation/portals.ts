import type { World, BlockEdit, WorldCellSnapshot } from "../world/world";
import type { Inventory } from "../ownership/inventory";
import { canBuildAt, type GameMode } from "../world/rules";
import { selectedIgnition, type IgnitionHit } from "./fire";
import { capturePortalFrame, inspectPortalFrame, type PortalFrame, type PortalCell } from "../world/portal-frame";
import { AIR, blockId } from "../catalog/blocks";
import { WORLD_BORDER } from "../core/math";
import { WORLD_HEIGHT } from "../world/chunk";
export interface PortalRecord extends PortalFrame {}
export interface PortalData { version: 1; records: PortalRecord[] }
export type PortalIgnitionResult = {ok:true;frame:PortalRecord}|{ok:false;reason:"not-frame"|"unloaded"|"denied"|"busy"|"invalid-state"|"source-changed"|"capacity"};
/** Bounded application choices; no dimension, native size or animation equivalence. */
export const PORTAL_MAX_RECORDS=64;
const busy=new WeakSet<World>();
export const isPortalActionBusy=(world:World):boolean=>busy.has(world)||world.blockSourceLeaseBusy;
export const isPortalBlock=(id:unknown):boolean=>id===192||id===193;
const key=(p:PortalCell)=>`${p.x},${p.y},${p.z}`;
const recordKey=(p:PortalRecord)=>`${p.axis}:${key(p)}`;
const portalId=(r:PortalRecord)=>r.axis==="x"?192:193;
const fields=["axis","x","y","z","width","height"];
function dataOnly(v:unknown,keys:string[]):v is Record<string,unknown>{
 return typeof v==="object"&&v!==null&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==="string"&&keys.includes(k)&&"value"in Object.getOwnPropertyDescriptor(v,k)!);
}
function validFrame(r:PortalRecord):boolean{return (r.axis==="x"||r.axis==="z")&&[r.x,r.y,r.z,r.width,r.height].every(Number.isSafeInteger)&&r.width>=2&&r.width<=21&&r.height>=3&&r.height<=21&&r.y>=1&&r.y+r.height<WORLD_HEIGHT&&Math.abs(r.x)<=WORLD_BORDER&&Math.abs(r.z)<=WORLD_BORDER&&(r.axis==="x"?r.x-1>=-WORLD_BORDER&&r.x+r.width<=WORLD_BORDER:r.z-1>=-WORLD_BORDER&&r.z+r.width<=WORLD_BORDER);}
function cells(r:PortalRecord):{interior:PortalCell[];boundary:PortalCell[]}{
 const p=(u:number,v:number):PortalCell=>({x:r.x+(r.axis==="x"?u:0),y:r.y+v,z:r.z+(r.axis==="z"?u:0)}),interior:PortalCell[]=[],boundary:PortalCell[]=[];
 for(let v=0;v<r.height;v++)for(let u=0;u<r.width;u++)interior.push(p(u,v));
 for(let u=0;u<r.width;u++)boundary.push(p(u,-1),p(u,r.height));
 for(let v=0;v<r.height;v++)boundary.push(p(-1,v),p(r.width,v));
 return {interior,boundary};
}
export function sanitizePortalState(raw:unknown):{data:PortalData;invalid:boolean;present:boolean}{
 const empty=():PortalData=>({version:1,records:[]});if(raw===undefined)return {data:empty(),invalid:false,present:false};
 try{
  if(!dataOnly(raw,["version","records"])||raw.version!==1||!Array.isArray(raw.records)||raw.records.length>PORTAL_MAX_RECORDS||Reflect.ownKeys(raw.records).length!==raw.records.length+1)throw Error("invalid portal section");
  const records:PortalRecord[]=[],occupied=new Set<string>(),owners=new Set<string>();
  for(let i=0;i<raw.records.length;i++){
   const d=Object.getOwnPropertyDescriptor(raw.records,String(i));if(!d||!("value"in d)||!dataOnly(d.value,fields))throw Error("invalid portal record");
   const r={...d.value}as unknown as PortalRecord;if(!validFrame(r)||owners.has(recordKey(r)))throw Error("invalid portal bounds or duplicate owner");owners.add(recordKey(r));
   for(const p of cells(r).interior){if(occupied.has(key(p)))throw Error("overlapping portals");occupied.add(key(p));}records.push(r);
  }
  return {data:{version:1,records},invalid:false,present:true};
 }catch{return {data:empty(),invalid:true,present:true};}
}
/** Compare raw edits before loaders repair or discard hidden physical cells. */
export function validatePortalEdits(raw:unknown,edits:unknown):boolean{
 const state=sanitizePortalState(raw);if(state.invalid)return false;if(!Array.isArray(edits))return edits===undefined&&!state.present;
 try{
  if(!state.present&&!edits.some(e=>Array.isArray(e)&&isPortalBlock(e[3])))return true;
  const physical=new Map<string,number>();
  for(const e of edits){if(!Array.isArray(e)||e.length!==4)return false;const k=`${e[0]},${e[1]},${e[2]}`;if(physical.has(k))return false;physical.set(k,e[3]);}
  const owned=new Set<string>();
  for(const r of state.data.records){const c=cells(r);for(const p of c.interior){if(physical.get(key(p))!==portalId(r))return false;owned.add(key(p));}for(const p of c.boundary)if(physical.get(key(p))!==blockId("obsidian"))return false;}
  return [...physical].every(([k,id])=>!isPortalBlock(id)||owned.has(k));
 }catch{return false;}
}
export class PortalSystem {
 private readonly records=new Map<string,PortalRecord>();
 constructor(private readonly world:World){}
 clear():void{if(isPortalActionBusy(this.world))return;this.records.clear();}
 exportState():PortalData{return {version:1,records:[...this.records.values()].map(r=>({...r}))};}
 /** Read-only guard for the actual owner instance. Clear/restore or replacement
  * cannot revive a prior guard, even when every physical cell still matches. */
 captureOwner(input:PortalRecord):(()=>boolean)|null{
  const state=sanitizePortalState({version:1,records:[input]});if(state.invalid||isPortalActionBusy(this.world))return null;
  const frame=state.data.records[0],owner=this.records.get(recordKey(frame));
  const matches=()=>!!owner&&fields.every(k=>owner[k as keyof PortalRecord]===frame[k as keyof PortalRecord]);
  if(!matches())return null;
  return ()=>!isPortalActionBusy(this.world)&&this.records.get(recordKey(frame))===owner&&matches();
 }
 /** Refuse unloaded invalidation before gameplay reserves any receiver. */
 canChange(x:number,y:number,z:number):boolean {return this.planChanges([[x,y,z,AIR]])!==null;}
 hasDependency(x:number,y:number,z:number):boolean{return [...this.records.values()].some(r=>{const c=cells(r);return [...c.interior,...c.boundary].some(p=>p.x===x&&p.y===y&&p.z===z);});}
 hasCapacity():boolean{return this.records.size<PORTAL_MAX_RECORDS;}
 /** Trusted synchronous finalizer; no callbacks. */
 commit(r:PortalRecord):void{this.records.set(recordKey(r),{...r});}
 restore(raw:unknown,edits:readonly BlockEdit[]=this.world.exportEdits()):{invalid:boolean;present:boolean}{
  if(isPortalActionBusy(this.world))return {invalid:true,present:raw!==undefined};
  this.clear();const s=sanitizePortalState(raw);let invalid=s.invalid||!validatePortalEdits(raw,edits);
  if(!invalid)for(const r of s.data.records){const c=cells(r);if(c.interior.some(p=>this.world.getBlock(p.x,p.y,p.z)!==portalId(r))||c.boundary.some(p=>this.world.getBlock(p.x,p.y,p.z)!==blockId("obsidian"))){invalid=true;break;}}
  if(!invalid)for(const r of s.data.records)this.commit(r);return {invalid,present:s.present};
 }
 /** Expand source invalidation inside World's physical staging, never in an observer. */
 planChanges(edits:readonly BlockEdit[]):{edits:BlockEdit[];expected:WorldCellSnapshot[];valid:()=>boolean;commit:()=>void}|null{
  const staged=new Map(edits.map(e=>[`${e[0]},${e[1]},${e[2]}`,e])),removed:PortalRecord[]=[],extra:BlockEdit[]=[],expected:WorldCellSnapshot[]=[];
  for(const r of this.records.values()){
   const c=cells(r),all=[...c.interior,...c.boundary];
   if(!all.some(p=>{const e=staged.get(key(p));return e&&this.world.getLoadedBlock(p.x,p.y,p.z)!==e[3];}))continue;
   // Unknown cells cannot be interpreted as missing or removed behind an unloaded chunk.
   for(const p of all){const s=this.world.captureCell(p.x,p.y,p.z);if(!s)return null;expected.push(s);}
   removed.push(r);
   for(const p of c.interior){
    const replacement=staged.get(key(p));
    // Explicit ordinary replacements survive collapse; hidden portal cells cannot
    // remain physical after their only owning frame has been invalidated.
    if(replacement&&!isPortalBlock(replacement[3]))continue;
    if(this.world.getLoadedBlock(p.x,p.y,p.z)===portalId(r))extra.push([p.x,p.y,p.z,AIR]);
   }
  }
  return {edits:extra,expected,valid:()=>removed.every(r=>this.records.get(recordKey(r))===r)&&expected.every(s=>this.world.cellUnchanged(s)),commit:()=>{for(const r of removed)this.records.delete(recordKey(r));}};
 }
}
/** Browser supplies ordinary reach/target selection. No generating read during discovery. */
export function tryUsePortalIgnition(world:World,inventory:Inventory,mode:GameMode,hit:IgnitionHit):PortalIgnitionResult{
 const refuse=(reason:Extract<PortalIgnitionResult,{ok:false}>["reason"]):PortalIgnitionResult=>({ok:false,reason});
 if(isPortalActionBusy(world))return refuse("busy");busy.add(world);let committed=false,activated:PortalRecord|undefined;
 try{
  const owner=selectedIgnition(inventory);if(!owner)return refuse("invalid-state");
  const {x,y,z,normal}=hit;if(![x,y,z,normal.x,normal.y,normal.z].every(Number.isSafeInteger)||Math.abs(normal.x)+Math.abs(normal.y)+Math.abs(normal.z)!==1)return refuse("not-frame");
  const source=world.captureCell(x,y,z);if(!source)return refuse("unloaded");
  const point={x:x+normal.x,y:y+normal.y,z:z+normal.z};
  const plans=(["x","z"]as const).map(axis=>capturePortalFrame(world,point,axis));
  const plan=plans.find(p=>p.status==="valid");if(!plan||plan.status!=="valid")return refuse(plans.some(p=>p.status==="unknown")?"unloaded":"not-frame");
  if(!world.portals.hasCapacity())return refuse("capacity");
  const permission:WorldCellSnapshot[]=[],columns=new Set<string>();
  for(const p of plan.interior){const k=`${p.x},${p.z}`;if(columns.has(k))continue;columns.add(k);for(let by=0;by<p.y+plan.frame.height;by++){const s=world.captureCell(p.x,by,p.z);if(!s)return refuse("unloaded");permission.push(s);}}
  const valid=()=>owner.valid()&&plan.unchanged()&&world.cellUnchanged(source)&&permission.every(s=>world.cellUnchanged(s))&&world.portals.hasCapacity();
  if(!valid())return refuse("source-changed");
  for(const p of plan.interior){const allowed=canBuildAt(world,mode,p.x,p.y,p.z);if(!valid())return refuse("source-changed");if(!allowed)return refuse("denied");}
  const selected=inventory.selected,frame={...plan.frame};
  committed=world.commitBlockBatch(plan.interior.map(p=>[p.x,p.y,p.z,portalId(frame)]),()=>{world.portals.commit(frame);if(mode==="survival")inventory.slots[selected]=owner.next;activated=frame;},[source,...plan.expected,...permission],valid);
  return committed?{ok:true,frame:{...frame}}:refuse("source-changed");
 }catch{return committed&&activated?{ok:true,frame:{...activated}}:refuse("invalid-state");}finally{busy.delete(world);}
}
