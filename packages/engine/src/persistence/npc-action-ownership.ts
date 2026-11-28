import {diagnoseRawNpcActions,readNpcActionField} from '../education/npc-actions';
import {sanitizeMobState} from './mob-save';
import {sanitizeNpcs} from './savecheck';
const desc=Object.getOwnPropertyDescriptor;
function field(o:object,k:string):unknown{const d=desc(o,k);if(d&&(!('value'in d)||!d.enumerable))throw Error('Unreadable NPC source');return d?.value;}
function object(v:unknown):v is object{return !!v&&(typeof v==='object'||typeof v==='function');}
function dataTree(root:unknown):boolean{
 const todo=[root],seen=new Set<object>();while(todo.length){const n=todo.pop();if(!object(n))continue;if(typeof n==='function')return false;if(seen.has(n))return false;seen.add(n);
  if(!Array.isArray(n)&&![Object.prototype,null].includes(Object.getPrototypeOf(n)))return false;
  for(const key of Reflect.ownKeys(n)){const d=desc(n,key)!;if(typeof key!=='string'||!('value'in d)||!d.enumerable&&!(Array.isArray(n)&&key==='length'))return false;todo.push(d.value);}
 }return true;
}
export interface NpcActionOwnership{invalid:boolean;owners:string[]}
/** Raw DTO ownership uses real containers, not printed path strings. Reflection may invoke Proxy traps;
 * no arbitrary-Proxy guarantee is made. It never evaluates ordinary getters or serialization hooks. */
export function readRawNpcActionOwnership(save:unknown):NpcActionOwnership{
 const owners:string[]=[],allowed=new Map<object,Map<string,object>>();
 try{
  if(!object(save))return{invalid:false,owners};
  const worlds:{world:object;key:string}[]=[{world:save,key:'active'}];
  const dim=desc(save,'dimensions');
  if(dim&&'value'in dim&&object(dim.value)){
   const inactive=desc(dim.value,'inactive');if(inactive&&'value'in inactive&&object(inactive.value))for(const key of Reflect.ownKeys(inactive.value)){
    const d=desc(inactive.value,key)!;if(typeof key==='string'&&'value'in d&&object(d.value))worlds.push({world:d.value,key:'inactive/'+key});
   }
  }
  for(const {world,key}of worlds){
   if(diagnoseRawNpcActions(world))return{invalid:true,owners};
   const mobs=field(world,'mobs'),legacy=field(world,'npcs'),modern=mobs!==undefined;
   const records=object(mobs)?field(mobs,'records'):undefined;
   const ids=new Map<number,number>();
   if(Array.isArray(records))for(let i=0;i<records.length;i++){const d=desc(records,String(i));if(d&&'value'in d&&object(d.value)){const id=desc(d.value,'id');if(id&&'value'in id&&typeof id.value==='number')ids.set(id.value,(ids.get(id.value)??0)+1);}}
   for(const [container,isModern]of [[legacy,false],[records,true]]as const){
    if(!Array.isArray(container))continue;
    for(let i=0;i<container.length;i++){
     const d=desc(container,String(i));if(!d||!('value'in d)||!object(d.value))continue;const actor=d.value,actions=readNpcActionField(actor);
     if(actions.kind!=='valid')continue;let positions=allowed.get(container);if(!positions){positions=new Map();allowed.set(container,positions);}positions.set(String(i),actor);
     if(!dataTree(actor))return{invalid:true,owners};
     if(isModern){
      const id=field(actor,'id');if(typeof id!=='number'||ids.get(id)!==1)return{invalid:true,owners};
      const parsed=sanitizeMobState({nextId:id+1,records:[actor]});
      if(parsed.invalid||parsed.data.records.length!==1||JSON.stringify(parsed.data.records[0].npcActions)!==JSON.stringify(actions.data))return{invalid:true,owners};
      owners.push(JSON.stringify([key,'mob',id,actions.data]));
     }else if(!modern){
      const parsed=sanitizeNpcs([actor]);if(parsed.length!==1||JSON.stringify(parsed[0].npcActions)!==JSON.stringify(actions.data))return{invalid:true,owners};
      owners.push(JSON.stringify([key,'legacy',field(actor,'x'),field(actor,'y'),field(actor,'z'),field(actor,'yaw'),actions.data]));
     }
    }
   }
  }
  // Reserved action markers outside the actual supported actor containers may never be discarded.
  // Track ancestry to refuse toJSON callbacks that could strip a real action owner.
  const todo:{node:unknown;ancestors:object[];parent?:object;key?:PropertyKey}[]=[{node:save,ancestors:[]}],seen=new Set<object>();
  while(todo.length){const {node,ancestors,parent,key}=todo.pop()!;if(!object(node))continue;
   if(desc(node,'npcActions')){
    if(!parent||typeof key!=='string'||allowed.get(parent)?.get(key)!==node)return{invalid:true,owners};
    for(const ancestor of [...ancestors,node]){
     for(const name of Reflect.ownKeys(ancestor)){const source=desc(ancestor,name)!;if(!('value'in source))return{invalid:true,owners};}
     for(let p:object|null=ancestor;p;p=Object.getPrototypeOf(p)){
     const hook=desc(p,'toJSON');if(hook&&(!('value'in hook)||typeof hook.value==='function'))return{invalid:true,owners};
    }}
   }
   if(seen.has(node))continue;seen.add(node);
   for(const k of Reflect.ownKeys(node)){const d=desc(node,k)!;if('value'in d)todo.push({node:d.value,ancestors:[...ancestors,node],parent:node,key:k});else{if(d.get)todo.push({node:d.get,ancestors:[...ancestors,node],parent:node,key:k});if(d.set)todo.push({node:d.set,ancestors:[...ancestors,node],parent:node,key:k});}}
  }
  owners.sort();return{invalid:false,owners};
 }catch{return{invalid:true,owners};}
}
export function diagnoseRawNpcActionOwnership(save:unknown):boolean{return readRawNpcActionOwnership(save).invalid;}
export function sameNpcActionOwners(a:NpcActionOwnership,b:NpcActionOwnership):boolean{return !a.invalid&&!b.invalid&&JSON.stringify(a.owners)===JSON.stringify(b.owners);}
