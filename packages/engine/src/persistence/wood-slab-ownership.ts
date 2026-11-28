import{woodSlabState}from '../catalog/wood-slabs';
import {inspectWoodSlabItemOwner}from '../ownership/wood-slab-items';
export interface WoodSlabOwnershipIssue{path:string;reason:string}
/** Descriptor-only known-owner traversal, before item loaders can normalize/drop Slab. */
export function diagnoseRawWoodSlabOwnership(raw:unknown):WoodSlabOwnershipIssue[]{
 const issues:WoodSlabOwnershipIssue[]=[],add=(path:string,reason:string)=>issues.push({path,reason});
 const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const own=(v:unknown,key:string,path:string):unknown=>{if(!v||typeof v!=='object')return undefined;const d=Object.getOwnPropertyDescriptor(v,key);if(!d)return undefined;if(!d.enumerable||!('value'in d)){add(path,'Unreadable item owner field');return undefined;}return d.value;};
 const check=(v:unknown,path:string,supported=true)=>{if(!v||typeof v!=='object')return;const id=own(v,'id',path+'.id');if(typeof id!=='number'||!woodSlabState(id))return;const state=inspectWoodSlabItemOwner(v);if(!supported||state.kind==='invalid')add(path,!supported?'Unsupported Slab owner':state.kind==='invalid'?state.reason:'Invalid Slab owner');};
 const list=(v:unknown,path:string,limit:number,visit:(v:unknown,path:string,supported:boolean)=>void=check,supported=true)=>{
  if(v===undefined)return;if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype){add(path,'Unreadable owned item array');return;}
  for(const k of Reflect.ownKeys(v)){if(k==='length')continue;const index=typeof k==='string'&&/^(0|[1-9]\d*)$/.test(k)?Number(k):-1,d=Object.getOwnPropertyDescriptor(v,k)!;if(!d.enumerable||!('value'in d)){add(path+'.'+String(k),'Unreadable owned array field');continue;}visit(d.value,`${path}[${String(k)}]`,supported&&index>=0&&index<limit);}
 };
 const integer=(v:unknown,min=-1e7,max=1e7)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
 const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 try{
  if(!plain(raw))return issues;
  const inventory=own(raw,'inventory','inventory');if(inventory!==undefined&&!plain(inventory))add('inventory','Unreadable inventory owner');if(plain(inventory)){list(own(inventory,'slots','inventory.slots'),'inventory.slots',36);check(own(inventory,'offhand','inventory.offhand'),'inventory.offhand',false);const equipment=own(inventory,'equipment','inventory.equipment');if(plain(equipment))for(const k of Reflect.ownKeys(equipment))if(typeof k==='string')check(own(equipment,k,'inventory.equipment.'+k),'inventory.equipment.'+k,false);}
  list(own(raw,'inventoryPending','inventoryPending'),'inventoryPending',10);
  const agent=own(raw,'agent','agent');if(agent!==undefined&&!plain(agent))add('agent','Unreadable Agent owner');if(plain(agent)){const get=(k:string)=>own(agent,k,'agent.'+k),valid=integer(get('x'))&&integer(get('y'),0,1000)&&integer(get('z'))&&integer(get('facing'),0,3)&&integer(get('selected'),0,26);list(get('slots'),'agent.slots',27,check,valid);check(get('offhand'),'agent.offhand',false);}
  list(own(raw,'furnaces','furnaces'),'furnaces',Infinity,(v,path,supported)=>{if(!plain(v)){add(path,'Unreadable furnace owner');return;}const get=(k:string)=>own(v,k,path+'.'+k),state=get('state');if(!plain(state)){add(path+'.state','Unreadable furnace state');return;}const stateGet=(k:string)=>own(state,k,path+'.state.'+k),valid=supported&&integer(get('x'))&&integer(get('y'),0,1000)&&integer(get('z'))&&finite(stateGet('burnLeft'),0,1000)&&finite(stateGet('burnTotal'),0,1000)&&finite(stateGet('progress'),0,1);for(const k of['input','fuel','output'])check(stateGet(k),path+'.state.'+k,valid);});
  list(own(raw,'chests','chests'),'chests',4096,(v,path,supported)=>{if(!plain(v)){add(path,'Unreadable Chest owner');return;}const state=own(v,'state',path+'.state');if(!plain(state)){add(path+'.state','Unreadable Chest state');return;}list(own(state,'slots',path+'.state.slots'),path+'.state.slots',27,check,supported);});
  list(own(raw,'brewingStands','brewingStands'),'brewingStands',4096,(v,path)=>{if(!plain(v))return;const state=own(v,'state',path+'.state');if(!plain(state))return;for(const k of['ingredient','fuel'])check(own(state,k,path+'.state.'+k),path+'.state.'+k,false);list(own(state,'bottles',path+'.state.bottles'),path+'.state.bottles',3,check,false);});
  const drops=own(raw,'worldDrops','worldDrops');if(plain(drops))list(own(drops,'records','worldDrops.records'),'worldDrops.records',Infinity,(v,path,supported)=>{if(plain(v))check(own(v,'stack',path+'.stack'),path+'.stack',supported);else add(path,'Unreadable world item owner');});
  const mobs=own(raw,'mobs','mobs');if(plain(mobs))list(own(mobs,'records','mobs.records'),'mobs.records',Infinity,(v,path)=>{if(plain(v))list(own(v,'pendingLoot',path+'.pendingLoot'),path+'.pendingLoot',Infinity,check,false);});
 }catch{add('ownedItems','Unreadable Slab ownership');}
 return issues;
}
