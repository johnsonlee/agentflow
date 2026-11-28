import{readBookData,hasBookPhotos}from'./book-state';
import type {ItemStack} from './inventory';
import {cloneStack,stackLimit} from './stack';
import {inspectItemState} from './item-state';
import {blockById} from '../catalog/blocks';
import {baseStackId,durabilityOf,isKnownId,isItem} from '../catalog/items';
export const CHEST_SLOTS=27;
export interface ChestData {slots:(ItemStack|null)[]}
/** Descriptor-only finite plain clone; rejects hidden data, accessors, cycles and sparse arrays. */
export function copyChestData(raw:unknown,seen=new Set<object>(),depth=0):unknown{
 if(raw===null||typeof raw==='boolean'||typeof raw==='string'||typeof raw==='number'&&Number.isFinite(raw))return raw;
 if(!raw||typeof raw!=='object'||depth>32||seen.has(raw))throw Error('Unreadable Chest data');
 seen.add(raw);try{
  if(Array.isArray(raw)){
   const length=Object.getOwnPropertyDescriptor(raw,'length')?.value;if(Object.getPrototypeOf(raw)!==Array.prototype||!Number.isSafeInteger(length)||length>1000000||Reflect.ownKeys(raw).length!==length+1)throw Error('Malformed Chest array');
   return Array.from({length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!('value'in d))throw Error('Unreadable Chest array cell');return copyChestData(d.value,seen,depth+1);});
  }
  if(![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('Expected plain Chest data');
  const result:Record<string,unknown>={};for(const k of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,k)!;if(typeof k!=='string'||!d.enumerable||!('value'in d))throw Error('Unreadable Chest field');Object.defineProperty(result,k,{value:copyChestData(d.value,seen,depth+1),enumerable:true,writable:true,configurable:true});}return result;
 }finally{seen.delete(raw);}
}
/** Validates before sanitation; no hidden IDs, repaired wear, clamped books or excess fields. */
export function readChestStack(raw:unknown):ItemStack|null{
 if(raw===null)return null;
 const data=copyChestData(raw) as ItemStack;
 if(!data||Array.isArray(data)||!isKnownId(data.id)||data.id!==baseStackId(data.id)||!isItem(data.id)&&!blockById(data.id).creative||!Number.isSafeInteger(data.count)||data.count<1||inspectItemState(data).kind==='invalid'||data.count>stackLimit(data)||Reflect.ownKeys(data).some(k=>!['id','count','damage','book','glow','sparkler'].includes(String(k))))throw Error('Invalid Chest stack');
 if(data.damage!==undefined){const durability=durabilityOf(data.id);if(durability===null||!Number.isSafeInteger(data.damage)||data.damage<0||data.damage>=durability)throw Error('Invalid Chest wear');}
 if(data.id>=845&&data.id<=849&&Reflect.ownKeys(data).some(k=>k!=='id'&&k!=='count'))throw Error('Invalid Chest potion');
 if(data.book!==undefined){if(hasBookPhotos(data.book))data.book=readBookData(data.book);else {const b=data.book;if(!b||Array.isArray(b)||!Array.isArray(b.pages)||b.pages.length>50||b.pages.some(p=>typeof p!=='string'||p.length>256)||Reflect.ownKeys(b).some(k=>!['pages','title','author'].includes(String(k)))||b.title!==undefined&&(typeof b.title!=='string'||b.title.length>32)||b.author!==undefined&&(typeof b.author!=='string'||b.author.length>32))throw Error('Invalid Chest book');}}
 return cloneStack(data);
}
export function readChestData(raw:unknown):ChestData{
 const data=copyChestData(raw) as ChestData;if(!data||Array.isArray(data)||Reflect.ownKeys(data).length!==1||!Object.hasOwn(data,'slots')||!Array.isArray(data.slots)||data.slots.length!==CHEST_SLOTS)throw Error('Expected27 Chest slots');return{slots:data.slots.map(readChestStack)};
}
/** One world owner. Snapshots/returned stacks are detached; reservation blocks every mutation. */
export class SingleChest{
 private data:ChestData;private revision=0;private reserved=false;private retired=false;
 constructor(raw:unknown={slots:Array(CHEST_SLOTS).fill(null)}){this.data=readChestData(raw);}
 get busy():boolean{return this.reserved;}get removed():boolean{return this.retired;}
 snapshot():ChestData{return{slots:this.data.slots.map(s=>s?cloneStack(s):null)};}
 contents():ItemStack[]{return this.data.slots.filter((s):s is ItemStack=>s!==null).map(s=>cloneStack(s));}
 replace(index:number,incoming:ItemStack|null):{ok:true;returned:ItemStack|null}|{ok:false}{
  if(this.retired||this.reserved||!Number.isSafeInteger(index)||index<0||index>=CHEST_SLOTS)return{ok:false};let clean:ItemStack|null;try{clean=readChestStack(incoming);}catch{return{ok:false};}
  const old=this.data.slots[index];this.data.slots[index]=clean;this.revision++;return{ok:true,returned:old?cloneStack(old):null};
 }
 reserveContents():{stacks:ItemStack[];valid():boolean;retire():boolean;cancel():void}|null{
  if(this.reserved||this.retired)return null;this.reserved=true;const rev=this.revision;let live=true;const valid=()=>live&&this.reserved&&!this.retired&&this.revision===rev;
  return{stacks:this.contents(),valid,retire:()=>{if(!valid())return false;live=false;this.reserved=false;this.retired=true;this.data={slots:Array(CHEST_SLOTS).fill(null)};this.revision++;return true;},cancel:()=>{if(live){live=false;this.reserved=false;}}};
 }
}
