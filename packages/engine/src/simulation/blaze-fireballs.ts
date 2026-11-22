import {blockCollisionBoxes, BLOCK_COLLISION_ORIGIN_BELOW} from "../catalog/block-geometry";
import {WORLD_HEIGHT} from "../world/chunk";
import {MAX_Y,MIN_Y,WORLD_BORDER,type Vec3} from "../core/math";
import type {World,WorldCellSnapshot} from "../world/world";
export interface BlazeBox {minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number}
export interface BlazeFireball {key:number;originMobId:number;position:Vec3;velocity:Vec3;ageSeconds:number}
export interface BlazeFireballsData {version:1;nextKey:number;records:BlazeFireball[]}
export interface BlazeFireballImpact {key:number;originMobId:number;position:Vec3;kind:"player"|"block";damage:number}
/** Application constants; official descriptions do not calibrate current Education numbers. */
export const BLAZE_FIREBALL={speed:8,radius:.12,lifetime:5,damage:3,capacity:64} as const;
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>obj(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d!==undefined&&d.enumerable&&"value"in d;});
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const positive=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>0&&(v as number)<Number.MAX_SAFE_INTEGER;
const vec=(v:unknown):v is Vec3=>exact(v,["x","y","z"])&&finite(v.x)&&finite(v.y)&&finite(v.z);
const position=(v:unknown):v is Vec3=>vec(v)&&Math.abs(v.x)<=WORLD_BORDER&&Math.abs(v.z)<=WORLD_BORDER&&v.y>=MIN_Y&&v.y<=MAX_Y;
const clone=(r:BlazeFireball):BlazeFireball=>({...r,position:{...r.position},velocity:{...r.velocity}});
const validBox=(b:unknown):b is BlazeBox=>exact(b,["minX","minY","minZ","maxX","maxY","maxZ"])&&Object.values(b).every(finite)&&["X","Y","Z"].every(a=>(b['min'+a] as number)<=(b['max'+a] as number)&&(b['max'+a] as number)-(b['min'+a] as number)<=8);
export function sanitizeBlazeFireballs(raw:unknown):{data:BlazeFireballsData;invalid:boolean;present:boolean}{
 const empty:BlazeFireballsData={version:1,nextKey:1,records:[]};if(raw===undefined)return {data:empty,invalid:false,present:false};
 try{
  if(!exact(raw,["version","nextKey","records"])||raw.version!==1||!positive(raw.nextKey)||!Array.isArray(raw.records)||Object.getPrototypeOf(raw.records)!==Array.prototype||raw.records.length>BLAZE_FIREBALL.capacity)throw Error();
  const rows=raw.records;
  const seen=new Set<number>(),records:BlazeFireball[]=[];
  for(let i=0;i<rows.length;i++){
   const d=Object.getOwnPropertyDescriptor(rows,String(i));if(!d||!("value"in d)||!d.enumerable)throw Error();const r=d.value;
   if(!exact(r,["key","originMobId","position","velocity","ageSeconds"])||!positive(r.key)||r.key>=raw.nextKey||seen.has(r.key)||!positive(r.originMobId)||!position(r.position)||!vec(r.velocity)||Math.abs(Math.hypot(r.velocity.x,r.velocity.y,r.velocity.z)-BLAZE_FIREBALL.speed)>1e-8||!finite(r.ageSeconds)||r.ageSeconds<0||r.ageSeconds>=BLAZE_FIREBALL.lifetime)throw Error();
   seen.add(r.key);records.push({key:r.key,originMobId:r.originMobId,position:{...r.position},velocity:{...r.velocity},ageSeconds:r.ageSeconds});
  }
  if(Reflect.ownKeys(rows).some(k=>k!=="length"&&(typeof k!=="string"||!/^\d+$/.test(k)||String(Number(k))!==k||Number(k)>=rows.length)))throw Error();
  return {data:{version:1,nextKey:raw.nextKey,records},invalid:false,present:true};
 }catch{return {data:empty,invalid:true,present:true};}
}
function contact(a:Vec3,b:Vec3,box:BlazeBox):number|null{
 let lo=0,hi=1;for(const [axis,min,max] of [["x","minX","maxX"],["y","minY","maxY"],["z","minZ","maxZ"]]as const){const delta=b[axis]-a[axis],lower=box[min]-BLAZE_FIREBALL.radius,upper=box[max]+BLAZE_FIREBALL.radius;if(Math.abs(delta)<1e-12){if(a[axis]<lower||a[axis]>upper)return null;continue;}const t0=(lower-a[axis])/delta,t1=(upper-a[axis])/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;}return lo<=1&&hi>=0?lo:null;
}
/** Independent world-owned projectiles. originMobId is historical attribution, not an actor reference. */
export class BlazeFireballs {
 private shots:BlazeFireball[]=[];private nextKey=1;private impacts:BlazeFireballImpact[]=[];private updating=false;private disposed=false;private restored=false;
 loadIssues=0;
 constructor(private readonly world:Pick<World,"captureCell"|"cellUnchanged"|"blockSourceLeaseBusy">,raw?:unknown){if(raw!==undefined)this.restore(raw);}
 get records():readonly BlazeFireball[]{return this.shots.map(clone);}
 get busy():boolean{return this.updating||this.world.blockSourceLeaseBusy||this.impacts.length>0;}
 restore(raw:unknown):boolean{
  if(this.disposed||this.busy||this.restored||this.shots.length||this.nextKey!==1)return false;
  this.updating=true;try{const s=sanitizeBlazeFireballs(raw);this.restored=true;this.loadIssues=s.invalid?1:0;if(s.invalid)return false;this.shots=s.data.records.map(clone);this.nextKey=s.data.nextKey;return true;}finally{this.updating=false;}
 }
 private sweep(a:Vec3,b:Vec3,target:BlazeBox|null):{unknown:boolean;at:number;kind:"player"|"block"|null}{
  // Terminal application world boundary, never an unavailable valid chunk.
  if(Math.min(a.x,b.x)-BLAZE_FIREBALL.radius< -WORLD_BORDER||Math.max(a.x,b.x)+BLAZE_FIREBALL.radius>WORLD_BORDER||Math.min(a.z,b.z)-BLAZE_FIREBALL.radius< -WORLD_BORDER||Math.max(a.z,b.z)+BLAZE_FIREBALL.radius>WORLD_BORDER)return {unknown:false,at:0,kind:"block"};
  const captures=new Map<string,WorldCellSnapshot>();let unknown=false,at=target?contact(a,b,target)??Infinity:Infinity,kind:"player"|"block"|null=at<Infinity?"player":null;
  const get=(x:number,y:number,z:number)=>{if(y<0||y>=WORLD_HEIGHT)return 0;const k=`${x},${y},${z}`;let s=captures.get(k);if(!s){s=this.world.captureCell(x,y,z);if(!s){unknown=true;return 0;}captures.set(k,s);}return s.id;};
  const r=BLAZE_FIREBALL.radius;
  for(let x=Math.floor(Math.min(a.x,b.x)-r);x<=Math.floor(Math.max(a.x,b.x)+r);x++)for(let y=Math.floor(Math.min(a.y,b.y)-r)-BLOCK_COLLISION_ORIGIN_BELOW;y<=Math.floor(Math.max(a.y,b.y)+r);y++)for(let z=Math.floor(Math.min(a.z,b.z)-r);z<=Math.floor(Math.max(a.z,b.z)+r);z++){
   const id=get(x,y,z);for(const q of blockCollisionBoxes(get,x,y,z,id)){const t=contact(a,b,{minX:x+q[0],minY:y+q[1],minZ:z+q[2],maxX:x+q[3],maxY:y+q[4],maxZ:z+q[5]});if(t!==null&&t<=at){at=t;kind="block";}}
  }
  if([...captures.values()].some(s=>!this.world.cellUnchanged(s)))unknown=true;return {unknown,at,kind};
 }
 trySpawn(originMobId:number,p:Vec3,direction:Vec3):boolean{
  if(this.disposed||this.busy||this.shots.length>=BLAZE_FIREBALL.capacity||this.nextKey>=Number.MAX_SAFE_INTEGER-1)return false;
  this.updating=true;
  try{if(!positive(originMobId)||!position(p)||!vec(direction))return false;const start={...p},d={...direction},len=Math.hypot(d.x,d.y,d.z);if(!Number.isFinite(len)||len<=1e-9)return false;const space=this.sweep(start,start,null);if(space.unknown||space.kind)return false;this.shots.push({key:this.nextKey++,originMobId,position:start,velocity:{x:d.x/len*8,y:d.y/len*8,z:d.z/len*8},ageSeconds:0});return true;}finally{this.updating=false;}
 }
 update(dt:number,playerBox:BlazeBox|null):void{
  if(this.disposed||this.busy||!finite(dt)||dt<=0||dt>1)return;
  this.updating=true;
  try{if(playerBox!==null&&!validBox(playerBox))return;const target=playerBox?{...playerBox}:null;const next:BlazeFireball[]=[];
   for(const original of this.shots){const shot=clone(original);let gone=false;const steps=Math.ceil(dt/(1/60)),h=dt/steps;
    for(let i=0;i<steps;i++){
     const duration=Math.min(h,BLAZE_FIREBALL.lifetime-shot.ageSeconds),a=shot.position,b={x:a.x+shot.velocity.x*duration,y:a.y+shot.velocity.y*duration,z:a.z+shot.velocity.z*duration};
     if(!position(b)){gone=true;break;}const hit=this.sweep(a,b,target);if(hit.unknown)break;
     if(hit.kind){this.impacts.push({key:shot.key,originMobId:shot.originMobId,position:{x:a.x+(b.x-a.x)*hit.at,y:a.y+(b.y-a.y)*hit.at,z:a.z+(b.z-a.z)*hit.at},kind:hit.kind,damage:hit.kind==="player"?BLAZE_FIREBALL.damage:0});gone=true;break;}
     shot.position=b;shot.ageSeconds+=duration;if(shot.ageSeconds>=BLAZE_FIREBALL.lifetime-1e-9){gone=true;break;}
    }if(!gone)next.push(shot);
   }this.shots=next;
  }finally{this.updating=false;}
 }
 drainImpacts():BlazeFireballImpact[]{if(this.updating||this.world.blockSourceLeaseBusy)return [];const out=this.impacts.map(i=>({...i,position:{...i.position}}));this.impacts=[];return out;}
 exportState():BlazeFireballsData{if(this.busy)throw Error("Blaze projectile ownership transfer is in progress");return {version:1,nextKey:this.nextKey,records:this.shots.map(clone)};}
 dispose():void{if(this.updating||this.world.blockSourceLeaseBusy)return;this.disposed=true;this.shots=[];this.impacts=[];}
}
