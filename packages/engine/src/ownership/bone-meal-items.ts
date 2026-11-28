import {BONE_ITEM_ID,BONE_MEAL_ITEM_ID} from '../catalog/bone-meal-profile';
/** Plain finite ingredients only; never let malformed metadata normalize into a usable source. */
export function inspectBoneMealItemOwner(raw:unknown):{kind:'none'}|{kind:'invalid';reason:string}{
 try{
  if(!raw||typeof raw!=='object')return{kind:'none'};
  const id=Object.getOwnPropertyDescriptor(raw,'id')?.value;if(id!==BONE_ITEM_ID&&id!==BONE_MEAL_ITEM_ID)return{kind:'none'};
  const count=Object.getOwnPropertyDescriptor(raw,'count'),proto=Object.getPrototypeOf(raw);
  if(Array.isArray(raw)||proto!==Object.prototype&&proto!==null||Reflect.ownKeys(raw).length!==2||!count||!('value'in count)||!Number.isSafeInteger(count.value)||count.value<1||count.value>64||Reflect.ownKeys(raw).some(k=>{const d=Object.getOwnPropertyDescriptor(raw,k)!;return(k!=='id'&&k!=='count')||!d.enumerable||!('value'in d);}))return{kind:'invalid',reason:'Invalid plain Bone/Bone Meal owner'};
  return{kind:'none'};
 }catch{return{kind:'invalid',reason:'Unreadable Bone/Bone Meal owner'};}
}
