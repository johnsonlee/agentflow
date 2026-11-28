import {ARMOR_SLOTS,armorOf,stackId} from '../catalog/items';
import {sanitizeStack} from '../persistence/savecheck';
import {sanitizePlayerStatus,reservePlayerStatus,PlayerStatusOwner,type PlayerStatusKind} from '../simulation/status-effects';
import type {Inventory,ItemStack} from './inventory';
import {reserveInventoryMutation} from './inventory-lease';
import {isSparklerId} from './sparkler-state';
/** Held use, container return, no-effect use and finite Creative are explicit application policies. */
export const MEDICINE_DRINK_SECONDS=1.6;
const cures=new Map<number,PlayerStatusKind>([[stackId('antidote'),'poison'],[stackId('elixir'),'weakness'],[stackId('eye_drops'),'blindness'],[stackId('tonic'),'nausea']]);
export function isMedicineId(id:number|undefined|null):boolean{return typeof id==='number'&&cures.has(id);}
export function isDrinkablePotionId(id:number|undefined|null):boolean{return id===stackId('awkward_potion')||isMedicineId(id);}
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function copy(raw:unknown,seen=new Set<object>(),depth=0):unknown{
 if(raw===null||typeof raw==='string'||typeof raw==='boolean'||typeof raw==='number'&&Number.isFinite(raw))return raw;
 if(!raw||typeof raw!=='object'||depth>32||seen.has(raw)||!Array.isArray(raw)&&!plain(raw))throw Error('Malformed medicine ownership');seen.add(raw);
 try{if(Array.isArray(raw)){const len=Object.getOwnPropertyDescriptor(raw,'length')?.value;if(Object.getPrototypeOf(raw)!==Array.prototype||len>4096||Reflect.ownKeys(raw).length!==len+1)throw Error('Malformed inventory array');return Array.from({length:len},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!('value'in d))throw Error('Unreadable inventory cell');return copy(d.value,seen,depth+1);});}
 const out:Record<string,unknown>={};for(const key of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,key)!;if(typeof key!=='string'||!d.enumerable||!('value'in d))throw Error('Unreadable inventory field');Object.defineProperty(out,key,{value:copy(d.value,seen,depth+1),enumerable:true,writable:true,configurable:true});}return out;}finally{seen.delete(raw);}
}
const canonical=(raw:unknown):string=>JSON.stringify(sort(raw));
function sort(v:any):any{return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const descriptor=(o:object,k:string)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d?.enumerable||!('value'in d))throw Error('Unreadable inventory owner');return d;};
/** A complete owner proof includes offhand/equipment, even though neither receives the empty bottle. */
function snapshot(inventory:Inventory,slots:(ItemStack|null)[]):{index:number;data:any;fingerprint:string}{
 const selected=descriptor(inventory,'selected').value;if(!Number.isInteger(selected)||selected<0||selected>8||descriptor(inventory,'slots').value!==slots)throw Error('Stale selected owner');
 const owned={slots,selected,offhand:descriptor(inventory,'offhand').value,equipment:descriptor(inventory,'equipment').value};
 const data=copy(owned) as any;
 // Structured clone rejects arbitrary Proxy owners without executing proxy field accessors.
 // Descriptor validation above runs first so ordinary getters are never invoked by cloning.
 structuredClone(owned);
 if(data.slots.length!==36)throw Error('Incomplete inventory');
 const validStack=(s:unknown)=>s===null||(()=>{const clean=sanitizeStack(s);return clean!==null&&canonical(clean)===canonical(s);})();
 if(!data.slots.every(validStack)||!validStack(data.offhand)||data.offhand!==null&&!isSparklerId(data.offhand.id)||!plain(data.equipment)||Reflect.ownKeys(data.equipment).length!==4||!ARMOR_SLOTS.every(k=>Object.hasOwn(data.equipment,k)&&validStack(data.equipment[k])&&(data.equipment[k]===null||armorOf(data.equipment[k].id)?.slot===k)))throw Error('Malformed inventory cargo');
 return{index:selected,data,fingerprint:canonical(data)};
}
export function finishMedicineDrink(inventory:Inventory,owner:PlayerStatusOwner):boolean{return finish(inventory,owner,false);}
export function finishOwnedMilkDrink(inventory:Inventory,owner:PlayerStatusOwner):boolean{return finish(inventory,owner,true);}
/** Reserve both owners before any caller-owned descriptor inspection. Final writes touch only
 * the constructor-original real Array data cell and branded private status pointer: no callbacks. */
function finish(inventory:Inventory,owner:PlayerStatusOwner,milk:boolean):boolean{
 const bag=reserveInventoryMutation(inventory);if(!bag)return false;
 const status=reservePlayerStatus(owner);if(!status){bag.cancel();return false;}
 try{
  const before=snapshot(inventory,bag.slots),source=descriptor(bag.slots,String(before.index));
  const stack=before.data.slots[before.index];
  if(!source.writable||!plain(stack)||Reflect.ownKeys(stack).length!==2||!Object.hasOwn(stack,'id')||!Object.hasOwn(stack,'count')||stack.count!==1||!(milk?stack.id===stackId('milk_bucket'):isDrinkablePotionId(stack.id as number)))return false;
  const next=sanitizePlayerStatus(status.current);if(next.invalid)return false;
  if(milk)for(const kind of ['poison','weakness','blindness','nausea'] as const)delete next.data[kind];else{const cure=cures.get(stack.id as number);if(cure)delete next.data[cure];}
  if(!status.stage(next.data)||!status.valid())return false;
  const final=snapshot(inventory,bag.slots),target=descriptor(bag.slots,String(before.index));
  if(!bag.valid()||final.index!==before.index||final.fingerprint!==before.fingerprint||target.value!==source.value||!target.writable||!status.valid())return false;
  // The final status proof may only inspect cloneable descriptor data; no foreign callbacks remain.
  const replacement={id:stackId(milk?'bucket':'glass_bottle'),count:1};
  status.commit();bag.commit(before.index,replacement);return true;
 }catch{return false;}finally{status.cancel();bag.cancel();}
}
