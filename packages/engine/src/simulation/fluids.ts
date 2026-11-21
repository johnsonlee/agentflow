import { AIR, blockById, blockId } from "../catalog/blocks";
import { WORLD_BORDER } from "../core/math";
import { BUCKET_IDS, bucketKind, planFluidFill, validBucketBag } from "../ownership/buckets";
import { gravelOwnerSnapshot } from "../ownership/gravel-harvest";
import { cloneStack } from "../ownership/stack";
import { INVENTORY_SIZE, type Inventory } from "../ownership/inventory";
import { WORLD_HEIGHT } from "../world/chunk";
import { canBuildAt, type GameMode } from "../world/rules";
import type { BlockEdit, World } from "../world/world";

export interface FluidBox { minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number }
export interface FluidData { version:1;contactSeconds:number }
export interface FluidHit { x:number;y:number;z:number;normal:{x:number;y:number;z:number} }
export type FluidBucketResult = {ok:true;action:"collect"|"place";fluid:"water"|"lava"} | {ok:false;reason:"not-bucket"|"invalid-state"|"no-room"|"invalid-target"|"restricted"|"source-changed"};
/** Static source-only application model; no flow levels or native damage calibration. */
export const LAVA_DAMAGE_PER_SECOND=1;
const busy=new WeakSet<World>();
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const validCell=(x:number,y:number,z:number)=>[x,y,z].every(Number.isSafeInteger)&&Math.abs(x)<=WORLD_BORDER&&Math.abs(z)<=WORLD_BORDER&&y>=0&&y<WORLD_HEIGHT;
export const isWaterBlock=(id:number)=>id===blockId("water");
export const isLavaBlock=(id:number)=>id===blockId("lava");
export const isFluidBlock=(id:number)=>isWaterBlock(id)||isLavaBlock(id);
export function isFluidActionBusy(world:World):boolean{return busy.has(world);}

export function sanitizeFluidState(raw:unknown):{data:FluidData;invalid:boolean;present:boolean}{
 const empty=():FluidData=>({version:1,contactSeconds:0});if(raw===undefined)return {data:empty(),invalid:false,present:false};
 try{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error("invalid fluids");
  const keys=Reflect.ownKeys(raw),o=raw as Record<string,unknown>;
  if(keys.length!==2||keys.some(k=>k!=="version"&&k!=="contactSeconds"||!("value"in Object.getOwnPropertyDescriptor(raw,k)!))||o.version!==1||!Number.isFinite(o.contactSeconds)||(o.contactSeconds as number)<0||(o.contactSeconds as number)>=1)throw Error("invalid fluid contact");
  return {data:{version:1,contactSeconds:o.contactSeconds as number},invalid:false,present:true};
 }catch{return {data:empty(),invalid:true,present:true};}
}

/** Pure finite cooling expansion. Water above or beside a Lava source cools that source once. */
export function planFluidChanges(world:World,edits:readonly BlockEdit[]){
 const reads=new Map<string,ReturnType<World["captureCell"]>>(),missing=new Map<string,[number,number,number]>();
 const projected=new Map<string,BlockEdit>(),candidates=new Map<string,[number,number,number]>();
 for(const e of edits){projected.set(key(e[0],e[1],e[2]),[...e]);for(const[dX,dY,dZ]of[[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const p:[number,number,number]=[e[0]+dX,e[1]+dY,e[2]+dZ];if(validCell(...p))candidates.set(key(...p),p);}}
 const at=(x:number,y:number,z:number)=>{const k=key(x,y,z);if(!reads.has(k)&&!missing.has(k)){const s=world.captureCell(x,y,z);if(s)reads.set(k,s);else missing.set(k,[x,y,z]);}return projected.get(k)?.[3]??reads.get(k)?.id;};
 for(const[x,y,z]of candidates.values())if(isLavaBlock(at(x,y,z)??AIR)&&[[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([dx,dy,dz])=>isWaterBlock(at(x+dx,y+dy,z+dz)??AIR)))projected.set(key(x,y,z),[x,y,z,blockId("obsidian")]);
 return {edits:[...projected.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]),snapshots:[...reads.values()].filter((s):s is NonNullable<typeof s>=>s!==undefined),valid:()=>[...reads.values()].every(s=>!!s&&world.cellUnchanged(s))&&[...missing.values()].every(p=>world.captureCell(...p)===undefined)};
}

export function resolveFluidChanges(world:World,edits:readonly BlockEdit[]):BlockEdit[]{return planFluidChanges(world,edits).edits;}

export class FluidSystem{
 private contactSeconds=0;
 constructor(private readonly world:World){}
 clear():void{this.contactSeconds=0;}
 exportState():FluidData{return {version:1,contactSeconds:this.contactSeconds};}
 restore(raw:unknown):{invalid:boolean;present:boolean}{const r=sanitizeFluidState(raw);this.contactSeconds=r.data.contactSeconds;return {invalid:r.invalid,present:r.present};}
 update(dt:number,box:FluidBox|null):number{
  if(!Number.isFinite(dt)||dt<=0)return 0;
  if(!box||![box.minX,box.minY,box.minZ,box.maxX,box.maxY,box.maxZ].every(Number.isFinite)||box.maxX<=box.minX||box.maxY<=box.minY||box.maxZ<=box.minZ||box.maxX-box.minX>8||box.maxY-box.minY>8||box.maxZ-box.minZ>8){this.contactSeconds=0;return 0;}
  let touching=false,unknown=false;
  for(let x=Math.floor(box.minX);x<Math.ceil(box.maxX)&&!touching;x++)for(let y=Math.floor(box.minY);y<Math.ceil(box.maxY)&&!touching;y++)for(let z=Math.floor(box.minZ);z<Math.ceil(box.maxZ);z++){const id=this.world.getLoadedBlock(x,y,z);if(id===undefined)unknown=true;else if(isLavaBlock(id)){touching=true;break;}}
  if(!touching){if(!unknown)this.contactSeconds=0;return 0;}
  this.contactSeconds+=Math.min(dt,.25);const whole=Math.floor(this.contactSeconds+1e-10);this.contactSeconds=Math.max(0,this.contactSeconds-whole);return whole*LAVA_DAMAGE_PER_SECOND;
 }
}

/** One guarded action owns all reads, capacity checks, world mutation and whole-vessel finalization. */
export function tryUseFluidBucket(world:World,inventory:Inventory,mode:GameMode,hit:FluidHit):FluidBucketResult{
 if(busy.has(world))return {ok:false,reason:"invalid-state"};busy.add(world);
 try{
  if(mode!=="survival"&&mode!=="creative")return {ok:false,reason:"invalid-state"};
  const slotsDescriptor=Object.getOwnPropertyDescriptor(inventory,"slots"),selectedDescriptor=Object.getOwnPropertyDescriptor(inventory,"selected");
  if(!slotsDescriptor||!("value"in slotsDescriptor)||!selectedDescriptor||!("value"in selectedDescriptor)||!validBucketBag(slotsDescriptor.value,selectedDescriptor.value))return {ok:false,reason:"invalid-state"};
  const slots=inventory.slots,index=inventory.selected,stable=gravelOwnerSnapshot(slots,index,INVENTORY_SIZE);if(!stable)return {ok:false,reason:"invalid-state"};
  const ownerValid=()=>inventory.slots===slots&&inventory.selected===index&&stable();
  const held=slots[index],kind=bucketKind(held?.id);if(kind!=="empty"&&kind!=="water"&&kind!=="lava")return {ok:false,reason:"not-bucket"};
  if(!hit||!validCell(hit.x,hit.y,hit.z))return {ok:false,reason:"invalid-target"};
  const source=world.captureCell(hit.x,hit.y,hit.z);if(!source)return {ok:false,reason:"invalid-target"};
  let fluid:"water"|"lava",action:"collect"|"place",edits:BlockEdit[],trial=slots.map(s=>s?cloneStack(s):null);
  if(kind==="empty"){
   if(!isFluidBlock(source.id))return {ok:false,reason:"invalid-target"};fluid=isWaterBlock(source.id)?"water":"lava";action="collect";
   const plan=planFluidFill(slots,index,fluid);if(!plan.ok)return plan;trial=plan.slots;edits=[[hit.x,hit.y,hit.z,AIR]];
  }else{
   const n=hit.normal;if(!n||![n.x,n.y,n.z].every(Number.isInteger)||Math.abs(n.x)+Math.abs(n.y)+Math.abs(n.z)!==1||!blockById(source.id).solid||isFluidBlock(source.id))return {ok:false,reason:"invalid-target"};
   const x=hit.x+n.x,y=hit.y+n.y,z=hit.z+n.z;if(!validCell(x,y,z)||world.getLoadedBlock(x,y,z)!==AIR)return {ok:false,reason:"invalid-target"};
   fluid=kind;action="place";edits=[[x,y,z,blockId(fluid)]];if(mode==="survival")trial[index]={id:BUCKET_IDS.empty,count:1};
  }
  const resolution=planFluidChanges(world,edits),changes=resolution.edits,snapshots=[source,...resolution.snapshots];
  for(const[x,y,z]of changes){const s=world.captureCell(x,y,z);if(!s)return {ok:false,reason:"invalid-target"};snapshots.push(s);if(!canBuildAt(world,mode,x,y,z))return {ok:false,reason:"restricted"};}
  if(!ownerValid()||!resolution.valid()||snapshots.some(s=>!world.cellUnchanged(s)))return {ok:false,reason:"source-changed"};
  let committed=false;
  const ok=world.commitBlockBatch(changes,()=>{for(let i=0;i<slots.length;i++)slots[i]=trial[i];committed=true;},snapshots,()=>ownerValid()&&resolution.valid());
  return ok||committed?{ok:true,action,fluid}:{ok:false,reason:"source-changed"};
 }catch{return {ok:false,reason:"invalid-state"};}finally{busy.delete(world);}
}
