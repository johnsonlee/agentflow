import type {Inventory,ItemStack} from './inventory';
const owners=new WeakMap<object,{slots:(ItemStack|null)[];busy:boolean}>();
const registering=new WeakSet<object>();
/** Constructor registration is once-only; Proxy identities/arrays cannot mint a commit capability. */
export function registerInventoryOwner(owner:object,slots:(ItemStack|null)[]):void{
 if(owners.has(owner)||registering.has(owner))return;registering.add(owner);
 try{
  if(!Array.isArray(slots)||Object.getPrototypeOf(slots)!==Array.prototype||Object.getOwnPropertyDescriptor(owner,'slots')?.value!==slots)return;
  const seen=new Set<object>();
  const data=(value:unknown,root=false,depth=0):boolean=>{
    if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return true;
    if(!value||typeof value!=='object'||seen.has(value)||depth>32)return false;
    if(!root&&!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
    seen.add(value);try{return Reflect.ownKeys(value).every(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return typeof key==='string'&&'value'in d&&(d.enumerable||Array.isArray(value)&&key==='length')&&data(d.value,false,depth+1);});}finally{seen.delete(value);}
  };
  if(!data(owner,true))return;
  structuredClone(owner);structuredClone(slots);
  if(owners.has(owner))return;owners.set(owner,{slots,busy:false});
 }catch{/* Unsupported owner remains unregistered and every lease refuses. */}
 finally{registering.delete(owner);}
}
export function isInventoryBusy(owner:object):boolean{return owners.get(owner)?.busy??false;}
export interface PreparedInventoryMutation{valid():boolean;commit():void}
export interface InventoryMutationLease{readonly slots:(ItemStack|null)[];valid():boolean;prepare(index:number,replacement:ItemStack|null):PreparedInventoryMutation|null;commit(index:number,replacement:ItemStack|null):void;cancel():void}
/** Only constructor-original real Arrays may receive a trusted synchronous publication. */
export function reserveInventoryMutation(owner:Inventory):InventoryMutationLease|null{
 const state=owners.get(owner);if(!state||state.busy)return null;state.busy=true;let active=true;
 const cancel=()=>{if(active){active=false;state.busy=false;}};
 try{
  const d=Object.getOwnPropertyDescriptor(owner,'slots');if(!d||!('value'in d)||d.value!==state.slots){cancel();return null;}
  const valid=()=>active&&owners.get(owner)===state&&Object.getOwnPropertyDescriptor(owner,'slots')?.value===state.slots;
  const prepare=(index:number,replacement:ItemStack|null):PreparedInventoryMutation|null=>{
   // null is an explicit final-unit debit, never an omitted/undefined replacement.
   if(!valid()||!Number.isInteger(index)||index<0||index>=state.slots.length||replacement!==null&&(!replacement||typeof replacement!=='object'))return null;
   const cell=Object.getOwnPropertyDescriptor(state.slots,String(index));if(!cell||!('value'in cell)||!cell.writable)return null;
   let published=false;
   const ready=()=>!published&&valid()&&(()=>{const now=Object.getOwnPropertyDescriptor(state.slots,String(index));return !!now&&'value'in now&&now.writable===true&&now.value===cell.value;})();
   // Trusted caller validates replacement content and calls valid immediately before its atomic
   // world publication. No callbacks/validation remain between world writes and this real-array write.
   return Object.freeze({valid:ready,commit:()=>{if(!active||published)return;published=true;state.slots[index]=replacement;cancel();}});
  };
  return Object.freeze({slots:state.slots,valid,prepare,commit:(index:number,replacement:ItemStack|null)=>{const staged=prepare(index,replacement);if(staged?.valid())staged.commit();},cancel});
 }catch{cancel();return null;}
}
