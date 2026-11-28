import {CANE_PLANT_ID,SUGAR_CANE_ITEM_ID,PAPER_ITEM_ID}from '../catalog/cane-profile';
/** New plain ingredient identities; no metadata or hidden physical plant can own an item. */
export function inspectCaneItemOwner(raw:unknown):{kind:'none'}|{kind:'invalid';reason:string}{
 try{
  if(!raw||typeof raw!=='object')return{kind:'none'};const id=Object.getOwnPropertyDescriptor(raw,'id')?.value;
  if(id===CANE_PLANT_ID)return{kind:'invalid',reason:'Physical Cane is not an owned item'};
  if(id!==SUGAR_CANE_ITEM_ID&&id!==PAPER_ITEM_ID)return{kind:'none'};
  const p=Object.getPrototypeOf(raw),count=Object.getOwnPropertyDescriptor(raw,'count');
  if(Array.isArray(raw)||p!==Object.prototype&&p!==null||Reflect.ownKeys(raw).length!==2||!count||!('value'in count)||!Number.isSafeInteger(count.value)||count.value<1||count.value>64||Reflect.ownKeys(raw).some(k=>{const d=Object.getOwnPropertyDescriptor(raw,k)!;return(k!=='id'&&k!=='count')||!d.enumerable||!('value'in d);}))return{kind:'invalid',reason:'Invalid plain Cane/Paper owner'};
  return{kind:'none'};
 }catch{return{kind:'invalid',reason:'Unreadable Cane/Paper owner'};}
}
