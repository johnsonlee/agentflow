import {sanitizeBlazeFireballs,type BlazeFireballsData} from '../simulation/blaze-fireballs';
import {sanitizeMobState} from './mob-save';
export interface BlazeOwnershipIssue {path:string;reason:string}
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const read=(v:object,k:string)=>Object.getOwnPropertyDescriptor(v,k)?.value;
/** New known owners use detached data descriptors before legacy Mob repair can discard them. */
function copyData(value:unknown,seen=new Set<object>(),depth=0):unknown{
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||depth>64||seen.has(value)||!Array.isArray(value)&&!plain(value))throw Error('Expected finite plain Blaze owner data');
 seen.add(value);try{
  if(Array.isArray(value)){
   if(Object.getPrototypeOf(value)!==Array.prototype||value.length>4096||Reflect.ownKeys(value).length!==value.length+1)throw Error('Malformed Blaze owner array');
   return Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value'in d))throw Error('Unreadable Blaze owner array');return copyData(d.value,seen,depth+1);});
  }
  const result:Record<string,unknown>={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!d.enumerable||!('value'in d))throw Error('Unreadable Blaze owner field');Object.defineProperty(result,key,{value:copyData(d.value,seen,depth+1),enumerable:true,writable:true,configurable:true});}return result;
 }finally{seen.delete(value);}
}
export function readBlazeOwners(raw:unknown):{fireballs:BlazeFireballsData;issues:BlazeOwnershipIssue[]}{
 const issues:BlazeOwnershipIssue[]=[],empty=sanitizeBlazeFireballs(undefined).data;
 if(!plain(raw))return {fireballs:empty,issues};
 const descriptor=Object.getOwnPropertyDescriptor(raw,'blazeFireballs'),projectiles=sanitizeBlazeFireballs(descriptor?.value);
 if(descriptor&&!('value'in descriptor)||projectiles.invalid)issues.push({path:'blazeFireballs',reason:'Malformed world-owned Blaze projectiles; refusing silent repair'});
 const mobs=read(raw,'mobs'),rows=plain(mobs)?read(mobs,'records'):undefined;
 const knownBlaze=Array.isArray(rows)&&Reflect.ownKeys(rows).some(k=>{if(k==='length')return false;const record=Object.getOwnPropertyDescriptor(rows,k)?.value;return plain(record)&&(read(record,'kind')==='blaze'||Object.hasOwn(record,'blazeState'));});
 if(knownBlaze||projectiles.data.records.length){
  try{
   const detached=copyData(mobs);if(!plain(detached)||Reflect.ownKeys(detached).length!==2||!Object.hasOwn(detached,"nextId")||!Object.hasOwn(detached,"records"))throw Error("Malformed Blaze creature envelope");
   const clean=sanitizeMobState(detached);
   if(!clean.present||clean.invalid)throw Error('Malformed known Blaze creature ownership');
   for(const [index,record] of projectiles.data.records.entries()){
    if(record.originMobId>=clean.data.nextId)issues.push({path:`blazeFireballs.records[${index}].originMobId`,reason:'Blaze projectile origin exceeds the realm creature allocation cursor'});
    const actor=clean.data.records.find(m=>m.id===record.originMobId);
    if(actor&&actor.kind!=='blaze')issues.push({path:`blazeFireballs.records[${index}].originMobId`,reason:'Blaze projectile origin conflicts with a living non-Blaze identity'});
   }
  }catch{issues.push({path:'mobs',reason:'Malformed known Blaze creature ownership; preserve the original before repair'});}
 }
 return {fireballs:projectiles.data,issues};
}
export const diagnoseRawBlazeOwnership=(raw:unknown):BlazeOwnershipIssue[]=>readBlazeOwners(raw).issues;
