import {ARMOR_SLOTS,armorOf,isKnownId} from '../catalog/items';
import {inspectItemState} from './item-state';
import {hasCloneableBookMetadata,stackLimit} from './stack';
import type {Inventory,ItemStack} from './inventory';
import {isSparklerId} from './sparkler-state';
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function copy(raw:unknown,seen=new Set<object>(),depth=0):unknown{
 if(raw===null||typeof raw==='string'||typeof raw==='boolean'||typeof raw==='number'&&Number.isFinite(raw))return raw;
 if(!raw||typeof raw!=='object'||depth>32||seen.has(raw)||!Array.isArray(raw)&&!plain(raw))throw Error('Malformed lab ownership');seen.add(raw);
 try{if(Array.isArray(raw)){const len=Object.getOwnPropertyDescriptor(raw,'length')?.value;if(Object.getPrototypeOf(raw)!==Array.prototype||Reflect.ownKeys(raw).length!==len+1)throw Error('Malformed inventory array');return Array.from({length:len},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!('value'in d))throw Error('Unreadable inventory cell');return copy(d.value,seen,depth+1);});}
 const out:Record<string,unknown>={};for(const key of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,key)!;if(typeof key!=='string'||!d.enumerable||!('value'in d))throw Error('Unreadable inventory field');Object.defineProperty(out,key,{value:copy(d.value,seen,depth+1),enumerable:true,writable:true,configurable:true});}return out;}finally{/* Keep every observed identity: aliased cargo is not an independent owner. */}
}
export const labCanonical=(raw:unknown):string=>JSON.stringify(sort(raw));
function sort(v:any):any{return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const descriptor=(o:object,k:string)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d?.enumerable||!('value'in d))throw Error('Unreadable inventory owner');return d;};
/** Exact structural cargo proof includes offhand/equipment without applying save normalization. */
export function labInventorySnapshot(inventory:Inventory,slots:(ItemStack|null)[]):{index:number;data:any;fingerprint:string}{
 const selected=descriptor(inventory,'selected').value;if(!Number.isInteger(selected)||selected<0||selected>8||descriptor(inventory,'slots').value!==slots)throw Error('Stale selected owner');
 const owned={slots,selected,offhand:descriptor(inventory,'offhand').value,equipment:descriptor(inventory,'equipment').value};
 const data=copy(owned) as any;
 // Structured clone rejects arbitrary Proxy owners without executing proxy field accessors.
 // Descriptor validation above runs first so ordinary getters are never invoked by cloning.
 structuredClone(owned);
 if(data.slots.length!==36)throw Error('Incomplete inventory');
 const validStack=(s:any)=>s===null||plain(s)&&isKnownId(s.id as number)&&Number.isSafeInteger(s.count)&&(s.count as number)>=1&&inspectItemState(s).kind!=='invalid'&&hasCloneableBookMetadata(s as unknown as ItemStack)&&(s.count as number)<=stackLimit(s as unknown as ItemStack);
 if(!data.slots.every(validStack)||!validStack(data.offhand)||data.offhand!==null&&!isSparklerId(data.offhand.id)||!plain(data.equipment)||Reflect.ownKeys(data.equipment).length!==4||!ARMOR_SLOTS.every(k=>Object.hasOwn(data.equipment,k)&&validStack(data.equipment[k])&&(data.equipment[k]===null||armorOf(data.equipment[k].id)?.slot===k)))throw Error('Malformed inventory cargo');
 return{index:selected,data,fingerprint:labCanonical(data)};
}
