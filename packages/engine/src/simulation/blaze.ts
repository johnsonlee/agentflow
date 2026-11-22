import {bodyBox,boxCollides,moveAxis,type BlockGetter} from "./physics";
import {clampPosition,type Vec3} from "../core/math";
import type {Mob} from "./entities";
/** Bounded original application model. No native Education numeric calibration. */
export const BLAZE={health:20,width:.6,height:1.8,speed:2.5,followRange:24,attackSeconds:2,maxNatural:4} as const;
export interface BlazeState {attackSeconds:number;hoverSeconds:number}
export const createBlazeState=():BlazeState=>({attackSeconds:BLAZE.attackSeconds,hoverSeconds:0});
export function isBlazeState(v:unknown):v is BlazeState{
 if(typeof v!=="object"||v===null||Array.isArray(v)||(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null))return false;
 const ds=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(ds).length===2&&["attackSeconds","hoverSeconds"].every(k=>ds[k]?.enumerable&&"value"in ds[k]&&typeof ds[k].value==="number"&&Number.isFinite(ds[k].value))&&ds.attackSeconds.value>=0&&ds.attackSeconds.value<=2&&ds.hoverSeconds.value>=0&&ds.hoverSeconds.value<Math.PI*2;
}
export function stepBlaze(get:BlockGetter,mob:Mob,dt:number,target:Vec3|null):boolean{
 if(!Number.isFinite(dt)||dt<=0||dt>1||!isBlazeState(mob.blazeState))return false;
 const s=mob.blazeState,p=mob.position,v=mob.velocity,steps=Math.ceil(dt/(1/60)),h=dt/steps;
 for(let i=0;i<steps;i++){
  s.attackSeconds=Math.max(0,s.attackSeconds-h);if(s.attackSeconds<1e-9)s.attackSeconds=0;s.hoverSeconds=(s.hoverSeconds+h)%(Math.PI*2);mob.hurtTimer=Math.max(0,mob.hurtTimer-h);
  const d=target?Math.hypot(target.x-p.x,target.y-p.y,target.z-p.z):Infinity,active=target!==null&&d<=BLAZE.followRange,dx=active?target.x-p.x:0,dz=active?target.z-p.z:0,len=Math.hypot(dx,dz);
  const speed=active&&len>6?BLAZE.speed:0,alpha=Math.min(1,h*4);
  v.x+=(len?dx/len*speed-v.x:-v.x)*alpha;v.z+=(len?dz/len*speed-v.z:-v.z)*alpha;
  const vy=active?Math.max(-1.4,Math.min(1.4,(target.y+1.2-p.y)*1.5)):Math.sin(s.hoverSeconds)*.25;v.y+=(vy-v.y)*alpha;
  if(moveAxis(get,p,"x",v.x*h,BLAZE.width,BLAZE.height))v.x=0;if(moveAxis(get,p,"z",v.z*h,BLAZE.width,BLAZE.height))v.z=0;if(moveAxis(get,p,"y",v.y*h,BLAZE.width,BLAZE.height))v.y=0;
  if(active&&len>0)mob.yaw=Math.atan2(-dx,-dz);mob.walking=active&&speed>0;mob.onGround=false;
 }clampPosition(p);return true;
}
/** Visibility uses actual collision geometry; unknown cells must be supplied as solid by caller. */
export function blazeCanShoot(get:BlockGetter,mob:Mob,target:Vec3):boolean{
 const a={x:mob.position.x,y:mob.position.y+.9,z:mob.position.z},b={x:target.x,y:target.y+.9,z:target.z},distance=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(distance>BLAZE.followRange||distance<.01)return false;
 const steps=Math.ceil(distance/.2);for(let i=1;i<steps;i++){const t=i/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};if(boxCollides(get,bodyBox(p,.02,.02)))return false;}return true;
}
