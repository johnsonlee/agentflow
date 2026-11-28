/** Existing bounded Poison application model; original timing/phase/nonlethal damage is preserved. */
export const POISON=Object.freeze({duration:5,interval:1.25});
/** General /effect default30s/amp0; caps/formula are explicit application safety/balance choices. */
export const TIMED_STATUS=Object.freeze({defaultSeconds:30,maximumSeconds:1_000_000,maximumAmplifier:255,weaknessReductionPerLevel:2});
export type TimedStatusKind='weakness'|'blindness'|'nausea';
export type PlayerStatusKind='poison'|TimedStatusKind;
export interface TimedStatus{remaining:number;amplifier:number}
export interface PlayerStatus{poison?:{remaining:number;elapsed:number};weakness?:TimedStatus;blindness?:TimedStatus;nausea?:TimedStatus}
const kinds:readonly PlayerStatusKind[]=['poison','weakness','blindness','nausea'];
const timed:readonly TimedStatusKind[]=['weakness','blindness','nausea'];
const locked=new WeakSet<object>();
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
/** Safe detached data before schema checks. Does not evaluate field accessors. */
function copy(raw:unknown,seen=new Set<object>(),depth=0):unknown{
 if(raw===null||typeof raw==='string'||typeof raw==='boolean'||typeof raw==='number'&&Number.isFinite(raw))return raw;
 if(!raw||typeof raw!=='object'||depth>32||seen.has(raw)||!Array.isArray(raw)&&!plain(raw))throw Error('Unreadable status data');seen.add(raw);
 try{if(Array.isArray(raw)){const len=Object.getOwnPropertyDescriptor(raw,'length')?.value;if(Object.getPrototypeOf(raw)!==Array.prototype||len>4096||Reflect.ownKeys(raw).length!==len+1)throw Error('Malformed status array');return Array.from({length:len},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!('value'in d))throw Error('Unreadable status cell');return copy(d.value,seen,depth+1);});}
 const out:Record<string,unknown>={};for(const key of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,key)!;if(typeof key!=='string'||!d.enumerable||!('value'in d))throw Error('Unreadable status field');Object.defineProperty(out,key,{value:copy(d.value,seen,depth+1),enumerable:true,writable:true,configurable:true});}return out;}finally{seen.delete(raw);}
}
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function createPlayerStatus():PlayerStatus{return{};}
export function sanitizePlayerStatus(raw:unknown):{data:PlayerStatus;invalid:number;present:boolean}{
 const bad={data:createPlayerStatus(),invalid:1,present:true};if(raw===undefined)return{data:createPlayerStatus(),invalid:0,present:false};
 try{const v=copy(raw);if(!plain(v)||Object.keys(v).some(k=>!kinds.includes(k as PlayerStatusKind)))return bad;
 for(const [key,value]of Object.entries(v)){
  if(!plain(value))return bad;
  if(key==='poison'){if(!exact(value,['remaining','elapsed'])||typeof value.remaining!=='number'||value.remaining<=0||value.remaining>POISON.duration||typeof value.elapsed!=='number'||value.elapsed<0||value.elapsed>=POISON.interval)return bad;}
  else if(!exact(value,['remaining','amplifier'])||typeof value.remaining!=='number'||value.remaining<=0||value.remaining>TIMED_STATUS.maximumSeconds||!Number.isInteger(value.amplifier)||(value.amplifier as number)<0||(value.amplifier as number)>TIMED_STATUS.maximumAmplifier)return bad;
 }
 return{data:v as PlayerStatus,invalid:0,present:true};}catch{return bad;}
}
export function hasPlayerStatus(status:PlayerStatus):boolean{return kinds.some(k=>Object.hasOwn(status,k));}
/** Refuse frozen/accessor/Proxy state before the first mutation; no partial timer retirement. */
function publishStatus(status:PlayerStatus,next:PlayerStatus):boolean{
 try{if(locked.has(status)||sanitizePlayerStatus(status).invalid)return false;structuredClone(status);
 const keys=new Set([...Object.keys(status),...Object.keys(next)]);
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(status,key);if(Object.hasOwn(next,key)){if(d?!('value'in d)||!d.writable:!Object.isExtensible(status))return false;}else if(d&&!d.configurable)return false;}
 for(const key of keys){if(Object.hasOwn(next,key)){const d=Object.getOwnPropertyDescriptor(status,key);Object.defineProperty(status,key,d?{value:next[key as PlayerStatusKind]}:{value:next[key as PlayerStatusKind],writable:true,enumerable:true,configurable:true});}else delete status[key as PlayerStatusKind];}return true;
 }catch{return false;}
}
export function applyPoison(status:PlayerStatus):void{if(locked.has(status))return;const read=sanitizePlayerStatus(status);if(read.invalid)return;read.data.poison={remaining:POISON.duration,elapsed:read.data.poison?.elapsed??0};publishStatus(status,read.data);}
export function applyTimedStatus(status:PlayerStatus,kind:TimedStatusKind,seconds:number=TIMED_STATUS.defaultSeconds,amplifier:number=0):boolean{
 if(locked.has(status)||!timed.includes(kind)||!Number.isFinite(seconds)||seconds<=0||seconds>TIMED_STATUS.maximumSeconds||!Number.isInteger(amplifier)||amplifier<0||amplifier>TIMED_STATUS.maximumAmplifier)return false;
 const read=sanitizePlayerStatus(status);if(read.invalid)return false;read.data[kind]={remaining:seconds,amplifier};return publishStatus(status,read.data);
}
export function clearPlayerStatus(status:PlayerStatus,kind?:PlayerStatusKind):void{if(locked.has(status))return;const read=sanitizePlayerStatus(status);if(read.invalid)return;for(const key of kinds)if(kind===undefined||key===kind)delete read.data[key];publishStatus(status,read.data);}
/** Caller gates pause/death/recovery. Creative advances time with damageEnabled=false. */
export function tickPlayerStatus(status:PlayerStatus,dt:number,health:number,damageEnabled=true):number{
 if(locked.has(status)||!Number.isFinite(dt)||dt<=0||!Number.isFinite(health))return 0;
 const read=sanitizePlayerStatus(status);if(read.invalid)return 0;const next=read.data;
 for(const kind of timed){const effect=next[kind];if(effect){const remaining=Math.max(0,effect.remaining-dt);if(remaining<=1e-10)delete next[kind];else next[kind]={remaining,amplifier:effect.amplifier};}}
 let damage=0;
 if(next.poison){const p=next.poison,duration=Math.min(dt,p.remaining),total=p.elapsed+duration;
 const ticks=Math.floor((total+1e-10)/POISON.interval),elapsed=Math.max(0,total-ticks*POISON.interval),remaining=Math.max(0,p.remaining-duration);
 if(remaining<=1e-10)delete next.poison;else next.poison={remaining,elapsed};
 damage=damageEnabled?Math.min(ticks,Math.max(0,health-1)):0;}
 if(!publishStatus(status,next))return 0;return damage>0?-damage:0;
}
export function outgoingMeleeDamage(status:PlayerStatus,base:number):number{
 const read=sanitizePlayerStatus(status);if(!Number.isFinite(base)||base<0||read.invalid)return 0;
 const weakness=read.data.weakness;
 return Math.max(0,base-(weakness?(weakness.amplifier+1)*TIMED_STATUS.weaknessReductionPerLevel:0));
}
interface OwnerState{current:PlayerStatus;busy:boolean}
const owners=new WeakMap<object,OwnerState>();
/** Branded private publication; arbitrary status Proxy keys are never deleted during a cure. */
export class PlayerStatusOwner{
 constructor(raw:unknown={}){owners.set(this,{current:{},busy:false});if(!this.replace(raw))throw Error('Unreadable player status owner');}
 get current():PlayerStatus{return owners.get(this)!.current;}
 get busy():boolean{return owners.get(this)?.busy??false;}
 /** Retains detached finite plain malformed schema for recovery diagnosis; never repairs it. */
 replace(raw:unknown):boolean{const state=owners.get(this);if(!state||state.busy)return false;state.busy=true;const old=state.current;locked.add(old);try{const next=copy(raw);if(!plain(next))return false;structuredClone(raw);state.current=next as PlayerStatus;return true;}catch{return false;}finally{state.busy=false;locked.delete(old);}}
}
export interface PlayerStatusLease{readonly current:PlayerStatus;valid():boolean;stage(next:PlayerStatus):boolean;commit():void;cancel():void}
export function reservePlayerStatus(owner:PlayerStatusOwner):PlayerStatusLease|null{
 const state=owners.get(owner);if(!state||state.busy)return null;state.busy=true;const current=state.current;locked.add(current);let active=true,next:PlayerStatus|null=null;
 const cancel=()=>{if(active){active=false;state.busy=false;locked.delete(current);}};
 try{const clean=sanitizePlayerStatus(current);if(clean.invalid){cancel();return null;}structuredClone(current);const snapshot=JSON.stringify(clean.data);
 return Object.freeze({current,valid:()=>{try{const read=sanitizePlayerStatus(current);structuredClone(current);return active&&state.current===current&&!read.invalid&&JSON.stringify(read.data)===snapshot;}catch{return false;}},stage:(value:PlayerStatus)=>{const read=sanitizePlayerStatus(value);if(!active||read.invalid)return false;next=read.data;return true;},commit:()=>{if(active&&next){state.current=next;cancel();}},cancel});
 }catch{cancel();return null;}
}
