import {stackId} from '../catalog/items';
import type {ItemStack} from '../ownership/inventory';
/** Only fuel20 is backed by an official general Minecraft statement. Duration,
 * start-debit, cancellation and mixed-bottle policy are explicit app choices,
 * not measured Education1.26.33 behavior. */
export const BREWING_PROFILE=Object.freeze({seconds:20,fuelUses:20,maxDt:1});
export type BrewingSlot='ingredient'|'fuel'|0|1|2;
export interface BrewingContentsLease {readonly contents:readonly ItemStack[];valid():boolean;retire():boolean;cancel():void}
export interface BrewingData {version:1;bottles:[ItemStack|null,ItemStack|null,ItemStack|null];ingredient:ItemStack|null;fuel:ItemStack|null;fuelUses:number;progressSeconds:number;batch:string|null}
const products=['water_bottle','awkward_potion','antidote','elixir','eye_drops','tonic'] as const;
const bottleIds=new Set(products.map(stackId)),fuelId=stackId('blaze_powder');
const ingredientIds=new Set(['nether_wart','silver','cobalt','calcium','bismuth'].map(stackId));
const conversions=new Map<number,[number,number]>([
 [stackId('nether_wart'),[stackId('water_bottle'),stackId('awkward_potion')]],
 [stackId('silver'),[stackId('awkward_potion'),stackId('antidote')]],
 [stackId('cobalt'),[stackId('awkward_potion'),stackId('elixir')]],
 [stackId('calcium'),[stackId('awkward_potion'),stackId('eye_drops')]],
 [stackId('bismuth'),[stackId('awkward_potion'),stackId('tonic')]],
]);
const empty=():BrewingData=>({version:1,bottles:[null,null,null],ingredient:null,fuel:null,fuelUses:0,progressSeconds:0,batch:null});
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{return plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return !!d&&d.enumerable&&'value'in d;});}
function owner(value:unknown,slot:BrewingSlot):value is ItemStack|null {
 if(value===null)return true;
 if(!exact(value,['id','count'])||!Number.isSafeInteger(value.id)||!Number.isSafeInteger(value.count))return false;
 const max=typeof slot==='number'?1:64;
 return (value.count as number)>0&&(value.count as number)<=max&&(slot==='fuel'?value.id===fuelId:slot==='ingredient'?ingredientIds.has(value.id as number):bottleIds.has(value.id as number));
}
const signature=(s:BrewingData)=>`${s.ingredient?.id}:${s.ingredient?.count}|${s.bottles.map(b=>b?.id??0).join(',')}`;
function recipe(s:BrewingData):[number,number]|null {const r=s.ingredient&&conversions.get(s.ingredient.id);return r&&s.bottles.some(b=>b?.id===r[0])?r:null;}
export function sanitizeBrewingState(raw:unknown):{data:BrewingData;invalid:number;present:boolean}{
 const bad={data:empty(),invalid:1,present:true};if(raw===undefined)return{data:empty(),invalid:0,present:false};
 try{
  if(!exact(raw,['version','bottles','ingredient','fuel','fuelUses','progressSeconds','batch'])||raw.version!==1)return bad;
  const bottles=raw.bottles;
  if(!Array.isArray(bottles)||Object.getPrototypeOf(bottles)!==Array.prototype||Reflect.ownKeys(bottles).length!==4||bottles.length!==3)return bad;
  for(let i=0;i<3;i++){const d=Object.getOwnPropertyDescriptor(bottles,String(i));if(!d||!('value'in d)||!d.enumerable||!owner(d.value,i as 0|1|2))return bad;}
  if(!owner(raw.ingredient,'ingredient')||!owner(raw.fuel,'fuel')||!Number.isInteger(raw.fuelUses)||(raw.fuelUses as number)<0||(raw.fuelUses as number)>=BREWING_PROFILE.fuelUses||typeof raw.progressSeconds!=='number'||!Number.isFinite(raw.progressSeconds)||raw.progressSeconds<0||raw.progressSeconds>=BREWING_PROFILE.seconds)return bad;
  const data=structuredClone(raw) as unknown as BrewingData;
  if(data.progressSeconds===0?data.batch!==null:!recipe(data)||data.batch!==signature(data))return bad;
  return{data,invalid:0,present:true};
 }catch{return bad;}
}
/** One station owns its three bottle slots and reserved fuel receipt. All views
 * receive detached copies. Replacing a batch input cancels its work without
 * refunding an already spent fuel use; no stack moves through a UI callback. */
export class BrewingStand {
 readonly loadIssues:number;private state:BrewingData;private replacing=false;private reservation:symbol|null=null;private retired=false;
 get busy():boolean{return this.replacing||this.reservation!==null;}
 get removed():boolean{return this.retired;}
 constructor(raw?:unknown){const read=sanitizeBrewingState(raw);this.state=read.data;this.loadIssues=read.invalid;}
 snapshot():BrewingData {if(this.loadIssues)throw Error('Damaged brewing ownership');return structuredClone(this.state);}
 replace(slot:BrewingSlot,incoming:ItemStack|null):{ok:boolean;returned:ItemStack|null}{
  if(this.loadIssues||this.retired||this.busy)return{ok:false,returned:incoming};
  this.replacing=true;
  try{
    if(!(slot==='ingredient'||slot==='fuel'||slot===0||slot===1||slot===2)||!owner(incoming,slot))return{ok:false,returned:incoming};
    const next=structuredClone(incoming),old=typeof slot==='number'?this.state.bottles[slot]:this.state[slot];
    if(typeof slot==='number')this.state.bottles[slot]=next;else this.state[slot]=next;
    if(slot!=='fuel'){this.state.progressSeconds=0;this.state.batch=null;}
    return{ok:true,returned:structuredClone(old)};
  }catch{return{ok:false,returned:incoming};}
  finally{this.replacing=false;}
 }
 update(dt:number):void {
  if(this.loadIssues||this.retired||this.busy||!Number.isFinite(dt)||dt<=0)return;
  const s=this.state,r=recipe(s);if(!r){s.progressSeconds=0;s.batch=null;return;}
  if(s.progressSeconds===0){
   if(s.fuelUses===0){if(!s.fuel)return;s.fuel.count--;if(s.fuel.count===0)s.fuel=null;s.fuelUses=BREWING_PROFILE.fuelUses;}
   s.fuelUses--;s.batch=signature(s);
  }
  s.progressSeconds+=Math.min(dt,BREWING_PROFILE.maxDt);
  if(s.progressSeconds+1e-9<BREWING_PROFILE.seconds)return;
  s.bottles=s.bottles.map(b=>b?.id===r[0]?{id:r[1],count:1}:b) as BrewingData['bottles'];
  s.ingredient!.count--;if(s.ingredient!.count===0)s.ingredient=null;s.progressSeconds=0;s.batch=null;
 }
 reserveContents():BrewingContentsLease|null {
  if(this.loadIssues||this.retired||this.busy)return null;
  const token=Symbol('brewing contents');this.reservation=token;
  const source=JSON.stringify(this.state),contents=Object.freeze(this.contents().map(s=>Object.freeze(s)));let active=true;
  const valid=()=>active&&this.reservation===token&&!this.retired&&JSON.stringify(this.state)===source;
  const cancel=()=>{if(active&&this.reservation===token)this.reservation=null;active=false;};
  return Object.freeze({contents,valid,retire:()=>{if(!valid())return false;this.state=empty();this.retired=true;cancel();return true;},cancel});
 }
 contents():ItemStack[]{if(this.loadIssues)throw Error("Damaged brewing ownership");return [this.state.ingredient,this.state.fuel,...this.state.bottles].filter((s):s is ItemStack=>s!==null).map(s=>({...s}));}
}
