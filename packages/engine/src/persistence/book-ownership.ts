import{inspectBookOwner,bookUtf8Bytes,WORLD_BOOK_PHOTO_BYTES}from'../ownership/book-state';
import type{BookData}from'../ownership/book-state';
import{stackId}from'../catalog/items';
import{WORLD_BORDER}from'../core/math';
import{WORLD_HEIGHT}from'../world/chunk';
import{WORLD_DROP_PROFILE}from'../ownership/world-drops';
export interface BookOwnershipIssue{path:string;reason:string}
export interface BookPhotoOwnerSnapshot{location:string;itemId:number;book:BookData;canonicalBook:string}
export interface BookPhotoOwnershipRead{issues:BookOwnershipIssue[];owners:BookPhotoOwnerSnapshot[]}
type Part=string|number|symbol;
const photoTag=(v:unknown):boolean=>!!v&&(typeof v==='object'||typeof v==='function')&&Object.getOwnPropertyDescriptor(v,'photoPages')!==undefined;
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const data=(v:unknown,k:PropertyKey):unknown=>{if(!v||typeof v!=='object')return undefined;const d=Object.getOwnPropertyDescriptor(v,k);return d&&'value'in d?d.value:undefined;};
const integer=(v:unknown,min=-1e7,max=1e7):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
/** Display only. Authorization never parses this printable representation. */
function display(parts:readonly Part[]):string{return parts.map((p,i)=>typeof p==='number'?`[${p}]`:typeof p==='symbol'?`[${String(p)}]`:/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p)?(i?'.':'')+p:`[${JSON.stringify(p)}]`).join('');}
function arrayIndex(parent:unknown,key:PropertyKey):number|undefined{
 if(!Array.isArray(parent)||typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key))return undefined;
 const n=Number(key),length=Object.getOwnPropertyDescriptor(parent,'length')?.value;return Number.isSafeInteger(n)&&String(n)===key&&n>=0&&n<length?n:undefined;
}
function completeArray(value:unknown,length?:number,maximum=Infinity):value is unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return false;const size=Object.getOwnPropertyDescriptor(value,'length')?.value;
 if(!integer(size,0,0xffffffff)||length!==undefined&&size!==length||size>maximum||Reflect.ownKeys(value).length!==size+1)return false;
 for(let i=0;i<size;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value'in d))return false;}return true;
}
/** Follow actual enumerable data containers; numbers denote real canonical Array cells. */
function follows(world:object,parts:readonly Part[],value:unknown):boolean{
 let at:unknown=world;
 for(const part of parts){if(!at||typeof at!=='object')return false;
  if(Array.isArray(at)){if(!completeArray(at)||typeof part!=='number'||arrayIndex(at,String(part))!==part)return false;}
  else if(!plain(at)||typeof part!=='string')return false;
  const d=Object.getOwnPropertyDescriptor(at,String(part));if(!d?.enumerable||!('value'in d))return false;at=d.value;
 }return at===value;
}
/** JSON.stringify resolves inherited methods/accessors too; inspect descriptors, never call them. */
function serializationHook(value:object):boolean{
 const seen=new Set<object>();let at:object|null=value;
 while(at){if(seen.has(at))return true;seen.add(at);const d=Object.getOwnPropertyDescriptor(at,'toJSON');if(d)return !('value'in d)||typeof d.value==='function';at=Object.getPrototypeOf(at)as object|null;}return false;
}
function serializationTreeSafe(value:unknown,seen=new Set<object>(),depth=0):boolean{
 if(!value||typeof value!=='object')return true;if(depth>128||seen.has(value))return false;seen.add(value);
 try{if(serializationHook(value))return false;for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if('value'in d&&!serializationTreeSafe(d.value,seen,depth+1))return false;}return true;}finally{seen.delete(value);}
}
function supported(parts:readonly Part[],world:Record<string,unknown>,archived:boolean,value:unknown):boolean{
 if(!follows(world,parts,value))return false;
 const [head,a,b,c,d]=parts,inventory=data(world,'inventory'),agent=data(world,'agent');
 if(!archived&&head==='inventory'&&a==='slots'&&typeof b==='number'&&parts.length===3)return completeArray(data(inventory,'slots'),36)&&b<36;
 if(!archived&&head==='inventoryPending'&&typeof a==='number'&&parts.length===2)return completeArray(data(world,'inventoryPending'),undefined,10)&&a<10;
 if(!archived&&head==='agent'&&a==='slots'&&typeof b==='number'&&parts.length===3)return completeArray(data(agent,'slots'),27)&&b<27&&plain(agent)&&integer(data(agent,'x'))&&integer(data(agent,'y'),0,1000)&&integer(data(agent,'z'))&&integer(data(agent,'facing'),0,3)&&integer(data(agent,'selected'),0,26);
 if(head==='chests'&&typeof a==='number'&&b==='state'&&c==='slots'&&typeof d==='number'&&parts.length===5){const list=data(world,'chests'),row=data(list,a),state=data(row,'state');return completeArray(list,undefined,4096)&&completeArray(data(state,'slots'),27)&&d<27&&plain(row)&&integer(data(row,'x'),-WORLD_BORDER,WORLD_BORDER)&&integer(data(row,'y'),0,WORLD_HEIGHT-1)&&integer(data(row,'z'),-WORLD_BORDER,WORLD_BORDER);}
 if(head==='furnaces'&&typeof a==='number'&&b==='state'&&typeof c==='string'&&['input','fuel','output'].includes(c)&&parts.length===4){const list=data(world,'furnaces'),row=data(list,a),state=data(row,'state');return completeArray(list)&&plain(row)&&plain(state)&&integer(data(row,'x'))&&integer(data(row,'y'),0,1000)&&integer(data(row,'z'))&&finite(data(state,'burnLeft'),0,1000)&&finite(data(state,'burnTotal'),0,1000)&&finite(data(state,'progress'),0,1);}
 if(head==='worldDrops'&&a==='records'&&typeof b==='number'&&c==='stack'&&parts.length===4){const drops=data(world,'worldDrops'),list=data(drops,'records'),row=data(list,b),p=data(row,'position'),v=data(row,'velocity');if(!completeArray(list))return false;const keys=list.map(r=>data(r,'key')),next=data(drops,'nextKey');return plain(row)&&keys.every(k=>integer(k,1,Number.MAX_SAFE_INTEGER-1))&&new Set(keys).size===keys.length&&integer(next,1,Number.MAX_SAFE_INTEGER)&&keys.every(k=>Number(k)<next)&&plain(p)&&plain(v)&&finite(data(p,'x'),-WORLD_BORDER,WORLD_BORDER)&&finite(data(p,'y'),-1024,1024)&&finite(data(p,'z'),-WORLD_BORDER,WORLD_BORDER)&&['x','y','z'].every(k=>finite(data(v,k),-256,256))&&finite(data(row,'ageSeconds'),0,WORLD_DROP_PROFILE.lifetime)&&finite(data(row,'pickupDelaySeconds'),0,WORLD_DROP_PROFILE.lifetime);}
 return false;
}
/** Raw DTO boundary, not a live-owner provenance proof. Arbitrary Proxy reflection may run traps. */
export function readRawBookPhotoOwnership(raw:unknown,archiveOverride?:unknown):BookPhotoOwnershipRead{
 const issues:BookOwnershipIssue[]=[],owners:BookPhotoOwnerSnapshot[]=[],add=(p:readonly Part[]|string,r:string)=>issues.push({path:typeof p==='string'?p:display(p),reason:r}),ancestors=new Set<object>(),bookObjects=new Set<object>();
 const hooks:Part[][]=[],opaque:Part[][]=[];let bytes=0,nodes=0,photoSeen=false;
 const remember=(v:unknown,path:readonly Part[],active=new Set<object>())=>{if(!v||typeof v!=='object')return;if(active.has(v)||bookObjects.has(v)){add(path,'Aliased or cyclic Book photo metadata');return;}bookObjects.add(v);active.add(v);try{for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k)!;if(!('value'in d)||typeof k!=='string'||k!=='length'&&!d.enumerable){add(path,'Unreadable Book photo metadata');continue;}remember(d.value,[...path,k],active);}}finally{active.delete(v);}};
 type Context={world:Record<string,unknown>;prefix:Part[];archived:boolean;realm:string;valid:boolean;parents:object[]};
 const scan=(value:unknown,parts:Part[],context:Context,valid:boolean,parents:object[],depth=0):void=>{
  if(!value||typeof value!=='object'&&typeof value!=='function')return;if(++nodes>250000||depth>128){opaque.push([...context.prefix,...parts]);return;}if(ancestors.has(value)){opaque.push([...context.prefix,...parts]);return;}
  const path=[...context.prefix,...parts];ancestors.add(value);try{
   const chain=[...parents,value];if(typeof value==='function')opaque.push(path);if(serializationHook(value))hooks.push(path);
   const book=Object.getOwnPropertyDescriptor(value,'book');
   if(book&&(!('value'in book)||photoTag(book.value))){photoSeen=true;
    const locationOK=plain(value)&&context.valid&&valid&&supported(parts,context.world,context.archived,value);if(!locationOK)add(path,'Unsupported structural Book photo owner/container/index');
    const safe=chain.every(v=>!serializationHook(v))&&(!('value'in book)||serializationTreeSafe(book.value));if(!safe){add(path,'Book photo or ancestor has serialization hook');return;}
    const id=Object.getOwnPropertyDescriptor(value,'id'),count=Object.getOwnPropertyDescriptor(value,'count');
    if(!id?.enumerable||!('value'in id)||![stackId('book_and_quill'),stackId('written_book')].includes(id.value)||!count?.enumerable||!('value'in count)||count.value!==1)add(path,'Photo Book requires exact singleton book item');
    if(Reflect.ownKeys(value).some(k=>typeof k!=='string'||!['id','count','book'].includes(k)||!Object.getOwnPropertyDescriptor(value,k)?.enumerable))add(path,'Unsupported photo Book item metadata');
    const inspected=inspectBookOwner(value);if(inspected.kind!=='valid')add(path,inspected.kind==='invalid'?inspected.reason:'Unsupported photo Book metadata');
    if(inspected.kind==='valid'){remember(value,path);if(inspected.book.photoPages)bytes+=bookUtf8Bytes(JSON.stringify(inspected.book.photoPages));const ownerRealm=!context.archived&&['inventory','inventoryPending','agent'].includes(String(parts[0]))?'global':context.realm;if(locationOK&&typeof id?.value==='number')owners.push({location:JSON.stringify([ownerRealm,...path]),itemId:id.value,book:inspected.book,canonicalBook:JSON.stringify(inspected.book)});}
    return;
   }
   if(photoTag(value)){photoSeen=true;add(path,'Misplaced photoPages extension outside a supported Book owner');}
   const array=Array.isArray(value),containerOK=array?completeArray(value):plain(value);
   for(const key of Reflect.ownKeys(value)){
    if(array&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key)!;const index=array?arrayIndex(value,key):undefined,part=index===undefined?key:index,child=[...parts,part];
    if(!('value'in descriptor)){opaque.push([...context.prefix,...child]);for(const [kind,fn]of[['get',descriptor.get],['set',descriptor.set]]as const)if(fn)scan(fn,[...child,kind],context,false,chain,depth+1);continue;}
    scan(descriptor.value,child,context,valid&&containerOK&&typeof key==='string'&&descriptor.enumerable===true&&(!array||index!==undefined),chain,depth+1);
   }
  }catch{add(path,'Unreadable raw Book photo owner');}finally{ancestors.delete(value);}
 };
 const world=(value:unknown,prefix:Part[],archived:boolean,realm:string,valid:boolean,parents:object[])=>{if(!value||typeof value!=='object'&&typeof value!=='function')return;const context:Context={world:value as Record<string,unknown>,prefix,archived,realm,valid:valid&&plain(value),parents};
  if(serializationHook(value))hooks.push(prefix);
  if(photoTag(value)){photoSeen=true;add(prefix,'Misplaced world-root photoPages extension outside a supported Book owner');}
  for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(!('value'in d)){opaque.push([...prefix,key]);for(const [kind,fn]of[['get',d.get],['set',d.set]]as const)if(fn)scan(fn,[key,kind],context,false,[...parents,value]);continue;}if(!archived&&key==='dimensions')continue;scan(d.value,[key],context,d.enumerable===true&&typeof key==='string',[...parents,value]);}
 };
 try{
  if(!raw||typeof raw!=='object'&&typeof raw!=='function')return{issues,owners};const dimensions=archiveOverride===undefined?data(raw,'dimensions'):archiveOverride,active=data(dimensions,'active'),activeRealm=active==='nether'?'nether':'overworld';world(raw,[],false,activeRealm,true,[]);
  if(dimensions&&(typeof dimensions==='object'||typeof dimensions==='function')){
   const invalidContext:Context={world:raw as Record<string,unknown>,prefix:[],archived:false,realm:activeRealm,valid:false,parents:[]};
   if(photoTag(dimensions)){photoSeen=true;add(['dimensions'],'Misplaced photoPages extension on dimension container');}
   if(typeof dimensions==='function')scan(dimensions,['dimensions'],invalidContext,false,[raw]);
   if(serializationHook(dimensions))hooks.push(['dimensions']);
   const inactive=data(dimensions,'inactive'),dimensionDescriptor=Object.getOwnPropertyDescriptor(raw,'dimensions'),dimensionOK=archiveOverride!==undefined||!!dimensionDescriptor?.enumerable&&'value'in dimensionDescriptor;
   const inactiveDescriptor=Object.getOwnPropertyDescriptor(dimensions,'inactive');
   if(inactiveDescriptor&&!('value'in inactiveDescriptor)){opaque.push(['dimensions','inactive']);for(const [kind,fn]of[['get',inactiveDescriptor.get],['set',inactiveDescriptor.set]]as const)if(fn)scan(fn,['dimensions','inactive',kind],invalidContext,false,[raw,dimensions]);}
   if(inactive&&typeof inactive==='function')scan(inactive,['dimensions','inactive'],invalidContext,false,[raw,dimensions]);
   if(inactive&&typeof inactive==='object'&&photoTag(inactive)){photoSeen=true;add(['dimensions','inactive'],'Misplaced photoPages extension on inactive realm container');}
   if(inactive&&typeof inactive==='object'&&serializationHook(inactive))hooks.push(['dimensions','inactive']);
   if(inactive&&typeof inactive==='object')for(const key of Reflect.ownKeys(inactive)){const d=Object.getOwnPropertyDescriptor(inactive,key)!,validRealm=typeof key==='string'&&['overworld','nether'].includes(key)&&key!==active;const prefix:Part[]=['dimensions','inactive',key];if(!('value'in d)){opaque.push(prefix);for(const [kind,fn]of[['get',d.get],['set',d.set]]as const)if(fn)scan(fn,[...prefix,kind],invalidContext,false,[raw,dimensions,inactive]);continue;}world(d.value,prefix,true,String(key),dimensionOK&&!!inactiveDescriptor?.enumerable&&'value'in inactiveDescriptor&&d.enumerable===true&&validRealm,[raw,dimensions,inactive]);}
   // Foreign archive fields cannot hide an extra photo owner.
   for(const key of Reflect.ownKeys(dimensions)){if(key==='inactive')continue;const d=Object.getOwnPropertyDescriptor(dimensions,key)!;if('value'in d)scan(d.value,['dimensions',key],invalidContext,false,[raw,dimensions]);else{opaque.push(['dimensions',key]);for(const [kind,fn]of[['get',d.get],['set',d.set]]as const)if(fn)scan(fn,['dimensions',key,kind],invalidContext,false,[raw,dimensions]);}}
  }
 }catch{add('ownedBooks','Unreadable raw Book photo ownership');}
 if(photoSeen){for(const p of hooks)add(p,'Serialization hook alongside embedded Book photos');for(const p of opaque)add(p,'Unreadable owner alongside embedded Book photos');}
 if(bytes>WORLD_BOOK_PHOTO_BYTES)add('ownedBooks','Embedded Book photo UTF-8 budget exceeded across active and archived owners');
 owners.sort((a,b)=>a.location.localeCompare(b.location));return{issues,owners};
}
export function diagnoseRawBookOwnership(raw:unknown,archiveOverride?:unknown):BookOwnershipIssue[]{return readRawBookPhotoOwnership(raw,archiveOverride).issues;}
export function sameBookPhotoOwners(a:readonly BookPhotoOwnerSnapshot[],b:readonly BookPhotoOwnerSnapshot[]):boolean{return a.length===b.length&&a.every((owner,i)=>owner.location===b[i].location&&owner.itemId===b[i].itemId&&owner.canonicalBook===b[i].canonicalBook);}
