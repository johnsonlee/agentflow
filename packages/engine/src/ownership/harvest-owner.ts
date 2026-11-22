import {isKnownId,toolOf} from "../catalog/items";
import type {ItemStack} from "./inventory";
import {inspectItemState} from "./item-state";
import {hasCloneableBookMetadata,stackLimit} from "./stack";

/** Stable writable source-bag witness shared by harvest and whole-container actions. */
export function harvestOwnerSnapshot(slots:readonly(ItemStack|null)[],selected:number,size:number,wearTool=false):(()=>boolean)|null{
 try{
  if(!Array.isArray(slots)||slots.length!==size||!Number.isInteger(selected)||selected<0||selected>=size)return null;
  for(let i=0;i<size;i++){
   const d=Object.getOwnPropertyDescriptor(slots,String(i));if(!d||!("value" in d)||d.writable!==true)return null;
   const s=d.value;if(s===null)continue;
   if(!s||typeof s!=="object"||!isKnownId(s.id)||!Number.isSafeInteger(s.count)||s.count<1||s.count>stackLimit(s)||inspectItemState(s).kind==="invalid"||!hasCloneableBookMetadata(s))return null;
   if(Reflect.ownKeys(s).some(k=>!("value" in Object.getOwnPropertyDescriptor(s,k)!)))return null;
   // Receivers merge by writing count even when the array cell itself remains unchanged.
   if(Object.getOwnPropertyDescriptor(s,"count")?.writable!==true)return null;
   const tool=toolOf(s.id);if(tool&&s.damage!==undefined&&(!Number.isSafeInteger(s.damage)||s.damage<0||s.damage>=tool.durability))return null;
  }
  const source=slots[selected],serialized=JSON.stringify(slots),tool=toolOf(source?.id);
  if(wearTool&&source&&tool){const d=Object.getOwnPropertyDescriptor(source,"damage");if(d?!("value" in d)||d.writable!==true:!Object.isExtensible(source))return null;}
  return ()=>{try{
   for(let i=0;i<size;i++){
    const d=Object.getOwnPropertyDescriptor(slots,String(i));if(!d||!("value" in d)||d.writable!==true)return false;
    if(d.value&&Reflect.ownKeys(d.value).some(k=>!("value" in Object.getOwnPropertyDescriptor(d.value,k)!)))return false;
    if(d.value&&Object.getOwnPropertyDescriptor(d.value,"count")?.writable!==true)return false;
   }
   if(wearTool&&source&&tool){const d=Object.getOwnPropertyDescriptor(source,"damage");if(d?!("value" in d)||d.writable!==true:!Object.isExtensible(source))return false;}
   return slots[selected]===source&&JSON.stringify(slots)===serialized;
  }catch{return false;}};
 }catch{return null;}
}
