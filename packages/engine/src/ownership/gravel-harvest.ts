import { blockId } from "../catalog/blocks";
import { stackId } from "../catalog/items";
import { WORLD_BORDER } from "../core/math";
import { WORLD_HEIGHT } from "../world/chunk";
import type { ItemStack } from "./inventory";

/** Explicit application chance, not a calibrated Education native probability. */
export const GRAVEL_FLINT_CHANCE = .1;
export const MAX_PENDING_GRAVEL_HARVESTS = 4096;
export interface GravelHarvestData { version: 1; records: Array<{x:number;y:number;z:number;flint:boolean}> }
const empty=():GravelHarvestData=>({version:1,records:[]});
const coord=(x:number,y:number,z:number)=>Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&Number.isSafeInteger(z)&&Math.abs(x)<=WORLD_BORDER&&Math.abs(z)<=WORLD_BORDER&&y>=0&&y<WORLD_HEIGHT;
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const dataObject=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>{
 if(!v||typeof v!=="object"||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;
 const own=Reflect.ownKeys(v);return own.length===keys.length&&own.every(k=>typeof k==="string"&&keys.includes(k)&&"value" in Object.getOwnPropertyDescriptor(v,k)!);
};
/** Absent legacy state is empty; present malformed state is diagnosed before it can be discarded. */
export function sanitizeGravelHarvestState(raw:unknown):{data:GravelHarvestData;invalid:number;present:boolean}{
 if(raw===undefined)return {data:empty(),invalid:0,present:false};
 try{
  if(!dataObject(raw,["version","records"])||raw.version!==1||!Array.isArray(raw.records)||raw.records.length>MAX_PENDING_GRAVEL_HARVESTS)throw Error("invalid gravel decisions");
  const records:GravelHarvestData["records"]=[],seen=new Set<string>();
  for(let i=0;i<raw.records.length;i++){
   const descriptor=Object.getOwnPropertyDescriptor(raw.records,String(i));if(!descriptor||!("value" in descriptor))throw Error("sparse or accessor decision");
   const r=descriptor.value;if(!dataObject(r,["x","y","z","flint"])||!coord(r.x as number,r.y as number,r.z as number)||typeof r.flint!=="boolean")throw Error("invalid decision");
   const k=key(r.x as number,r.y as number,r.z as number);if(seen.has(k))throw Error("duplicate decision");seen.add(k);records.push({x:r.x as number,y:r.y as number,z:r.z as number,flint:r.flint});
  }
  if(Reflect.ownKeys(raw.records).length!==raw.records.length+1)throw Error("extra decision array metadata");
  return {data:{version:1,records},invalid:0,present:true};
 }catch{return {data:empty(),invalid:1,present:true};}
}
/** Pure one-alternative sampling. The only accepted random values are finite [0,1). */
export function gravelDrops(rand:()=>number=Math.random):ItemStack[]{
 const r=rand();if(!Number.isFinite(r)||r<0||r>=1)throw new RangeError("Gravel RNG must be finite in [0,1)");
 return [{id:r<GRAVEL_FLINT_CHANCE?stackId("flint"):blockId("gravel"),count:1}];
}
export interface GravelHarvestPlan { stack:ItemStack; valid:()=>boolean }
interface Decision {x:number;y:number;z:number;flint?:boolean}
/** Cache holds a decision attached to the unchanged physical source, never an extra owned item.
 * World invalidates on genuine writes and import; a probing entry also defeats RNG-callback ABA. */
export class GravelHarvestResolver{
 private readonly decisions=new Map<string,Decision>();
 constructor(private readonly world:{getBlock:(x:number,y:number,z:number)=>number}){}
 invalidate(x:number,y:number,z:number):void{this.decisions.delete(key(x,y,z));}
 clear():void{this.decisions.clear();}
 exportState():GravelHarvestData{return {version:1,records:[...this.decisions.values()].filter((r):r is Decision&{flint:boolean}=>typeof r.flint==="boolean").map(r=>({x:r.x,y:r.y,z:r.z,flint:r.flint}))};}
 restore(raw:unknown):{invalid:number;present:boolean}{
  this.clear();const clean=sanitizeGravelHarvestState(raw);let invalid=clean.invalid;
  for(const r of clean.data.records){if(this.world.getBlock(r.x,r.y,r.z)!==blockId("gravel")){invalid++;continue;}this.decisions.set(key(r.x,r.y,r.z),{...r});}
  return {invalid,present:clean.present};
 }
 plan(x:number,y:number,z:number,rand:()=>number=Math.random):GravelHarvestPlan|null{
  if(!coord(x,y,z)||this.world.getBlock(x,y,z)!==blockId("gravel"))return null;
  const k=key(x,y,z);let decision=this.decisions.get(k);
  if(decision&&decision.flint===undefined)return null; // Reentrant draw cannot reserve a second outcome.
  if(!decision){
   if(this.decisions.size>=MAX_PENDING_GRAVEL_HARVESTS)return null;
   decision={x,y,z};this.decisions.set(k,decision);
   try{
    const stack=gravelDrops(rand);
    if(this.decisions.get(k)!==decision||this.world.getBlock(x,y,z)!==blockId("gravel")){if(this.decisions.get(k)===decision)this.decisions.delete(k);return null;}
    decision.flint=stack[0].id===stackId("flint");
   }catch{if(this.decisions.get(k)===decision)this.decisions.delete(k);return null;}
  }
  const captured=decision;
  return {stack:{id:captured.flint?stackId("flint"):blockId("gravel"),count:1},valid:()=>this.decisions.get(k)===captured&&typeof captured.flint==="boolean"&&this.world.getBlock(x,y,z)===blockId("gravel")};
 }
}
/** Compatibility export for existing whole-container callers. */
export {harvestOwnerSnapshot as gravelOwnerSnapshot} from "./harvest-owner";
