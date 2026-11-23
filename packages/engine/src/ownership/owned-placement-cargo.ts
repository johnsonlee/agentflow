import{Inventory,type ItemStack}from './inventory';
import{labInventorySnapshot,labCanonical}from './lab-inventory-snapshot';
import{harvestOwnerSnapshot}from './harvest-owner';
import type{AgentState}from '../automation/agent';
const data=(o:object,key:string)=>{const d=Object.getOwnPropertyDescriptor(o,key);if(!d?.enumerable||!('value'in d))throw Error('Unreadable placement source');return d.value;};
function exactAgentSnapshot(owner:AgentState,slots:(ItemStack|null)[]):string{
 if(data(owner,'slots')!==slots||slots.length!==27||!Number.isInteger(data(owner,'selected'))||owner.selected<0||owner.selected>=27)throw Error('Invalid Agent slab owner');
 for(const key of Reflect.ownKeys(owner)){if(typeof key!=='string'||!['x','y','z','facing','slots','selected'].includes(key))throw Error('Unexpected Agent owner');data(owner,key);}
 // Descriptor-only validation precedes structuredClone (which rejects Proxy owners).
 const seen=new Set<object>();const walk=(value:unknown,depth=0):void=>{if(value===null||['string','boolean','number'].includes(typeof value)){if(typeof value==='number'&&!Number.isFinite(value))throw Error('Nonfinite cargo');return;}if(!value||typeof value!=='object'||depth>32||seen.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Aliased or unreadable Agent cargo');seen.add(value);for(const k of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,k)!;if(typeof k!=='string'||!('value'in d)||!d.enumerable&&!(Array.isArray(value)&&k==='length'))throw Error('Unreadable Agent cargo');walk(d.value,depth+1);}};walk(owner);const copied=structuredClone(owner);if(!harvestOwnerSnapshot(copied.slots,copied.selected,27))throw Error('Invalid Agent cargo');if(![copied.x,copied.y,copied.z,copied.facing].every(Number.isSafeInteger)||copied.facing<0||copied.facing>3)throw Error('Invalid Agent pose');return labCanonical(copied);
}
/** Exact source proof shared by the new slab and Composter player/Agent placements. */
export function ownedCargoFingerprint(owner:Inventory|AgentState,slots:(ItemStack|null)[]):string{return owner instanceof Inventory?labInventorySnapshot(owner,slots).fingerprint:exactAgentSnapshot(owner,slots);}
