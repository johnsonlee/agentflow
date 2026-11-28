import {readChestData,type ChestData} from '../ownership/single-chest';
import {WORLD_BORDER} from '../core/math';
import {WORLD_HEIGHT} from '../world/chunk';
import {isKnownBlockId} from '../catalog/blocks';
export interface SavedChest {x:number;y:number;z:number;state:ChestData}
export interface ChestOwnershipIssue {path:string;reason:string}
// Stable persistence profile; do not resolve a possibly not-yet-registered block at import time.
const CHEST=203;
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const value=(v:object,k:PropertyKey)=>Object.getOwnPropertyDescriptor(v,k)?.value;
const coords=(x:unknown,y:unknown,z:unknown)=>Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&Number.isSafeInteger(z)&&Math.abs(x as number)<=WORLD_BORDER&&Math.abs(z as number)<=WORLD_BORDER&&(y as number)>=0&&(y as number)<WORLD_HEIGHT;
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
/** Copy only finite plain data; descriptor inspection never evaluates accessors. */
function copy(raw:unknown,seen=new Set<object>(),depth=0,arrayLimit=4096):unknown {
 if(raw===null||typeof raw==='boolean'||typeof raw==='string'||typeof raw==='number'&&Number.isFinite(raw))return raw;
 if(!raw||typeof raw!=='object'||depth>32||seen.has(raw)||!Array.isArray(raw)&&!plain(raw))throw Error('Expected finite plain Chest data');
 seen.add(raw);try{
  if(Array.isArray(raw)){
   const length=value(raw,'length');if(Object.getPrototypeOf(raw)!==Array.prototype||!Number.isSafeInteger(length)||length>arrayLimit||Reflect.ownKeys(raw).length!==length+1)throw Error('Malformed Chest array');
   return Array.from({length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!('value'in d))throw Error('Sparse or unreadable Chest array');return copy(d.value,seen,depth+1);});
  }
  const result:Record<string,unknown>={};for(const k of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,k)!;if(typeof k!=='string'||!d.enumerable||!('value'in d))throw Error('Unreadable Chest field');Object.defineProperty(result,k,{value:copy(d.value,seen,depth+1),enumerable:true,writable:true,configurable:true});}return result;
 }finally{seen.delete(raw);}
}
/** Strict Chest ownership only. Legacy unrelated edits remain the general save reader's responsibility.
 * Generated probes must be pure, and are used once per unedited owned cell only. */
export function readChestOwners(raw:unknown,generatedBlock?:(x:number,y:number,z:number)=>number|undefined):{stations:SavedChest[];issues:ChestOwnershipIssue[];present:boolean}{
 const issues:ChestOwnershipIssue[]=[],stations:SavedChest[]=[];let present=false;
 const add=(path:string,reason:string)=>issues.push({path,reason});
 try{
  if(!plain(raw))return{stations,issues,present};
  const field=Object.getOwnPropertyDescriptor(raw,'chests');present=!!field;
  const editsField=Object.getOwnPropertyDescriptor(raw,'edits'),rawEdits=editsField?.value;
  // Detection is descriptor-only, even for legacy arrays that the generic reader may repair.
  const physical=Array.isArray(rawEdits)&&Reflect.ownKeys(rawEdits).some(k=>k!=='length'&&Array.isArray(value(rawEdits,k))&&value(value(rawEdits,k),'3')===CHEST);
  if(!present&&!physical)return{stations,issues,present};
  const cells=new Map<string,number>();
  try{
   if(!editsField?.enumerable||!('value'in editsField))throw Error('Unreadable physical edits');
   const edits=copy(rawEdits,new Set(),0,Infinity);if(!Array.isArray(edits))throw Error('Expected physical edit array');
   for(const [i,e] of edits.entries()){
    if(!Array.isArray(e)||e.length!==4||!coords(e[0],e[1],e[2])||!(e[3]===CHEST||isKnownBlockId(e[3]))) {add(`edits[${i}]`,'Malformed physical edit for Chest ownership');continue;}
    const k=key(e[0],e[1],e[2]);if(cells.has(k))add(`edits[${i}]`,'Duplicate physical cell');else cells.set(k,e[3]);
   }
  }catch{add('edits','Unreadable physical edits for Chest ownership');}
  let rows:unknown;
  try{if(!field?.enumerable||!('value'in field))throw Error('Missing or unreadable Chest owners');rows=copy(field.value);if(!Array.isArray(rows))throw Error('Expected Chest owner array');}
  catch{add('chests','Missing or malformed Chest Chest owner array');}
  const owned=new Set<string>(),probes=new Map<string,number|undefined>();
  if(Array.isArray(rows))for(const [i,row] of rows.entries()){
   const path=`chests[${i}]`;
   if(!plain(row)||Reflect.ownKeys(row).length!==4||!['x','y','z','state'].every(k=>Object.hasOwn(row,k))||!coords(row.x,row.y,row.z)){add(path,'Expected exact Chest coordinates and state');continue;}
   const x=row.x as number,y=row.y as number,z=row.z as number,k=key(x,y,z);
   if(owned.has(k)){add(path,'Duplicate Chest Chest owner');continue;}owned.add(k);
   let clean:ChestData;try{clean=readChestData(row.state);}catch{add(`${path}.state`,'Malformed Chest slots; refusing repair');continue;}
   let block=cells.get(k);
   if(!cells.has(k)){
    try{if(!probes.has(k))probes.set(k,generatedBlock?.(x,y,z));block=probes.get(k);}catch{add(path,'Generated Chest support is unknown');continue;}
   }
   if(block!==CHEST){add(path,'Chest owner lacks a physical Chest cell');continue;}
   stations.push({x,y,z,state:clean});
  }
  for(const [k,id]of cells)if(id===CHEST&&!owned.has(k))add('chests',`Physical Chest ${k} has no owner`);
 }catch{add('chests','Unreadable Chest ownership');}
 return{stations:issues.length?[]:stations,issues,present};
}
