import{woodSlabState}from'../catalog/wood-slabs';
export function inspectWoodSlabItemOwner(raw:unknown):{kind:'none'|'valid'}|{kind:'invalid';reason:string}{
 if(!raw||typeof raw!=='object')return{kind:'none'};
 try{const d=Object.getOwnPropertyDescriptor(raw,'id');if(!d||!('value'in d)||!woodSlabState(d.value))return{kind:'none'};const state=woodSlabState(d.value)!;
 if(state.id!==state.canonical)return{kind:'invalid',reason:'Hidden Slab physical state cannot own an inventory stack'};
 if(![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==2)return{kind:'invalid',reason:'Slab item needs exact plain id/count'};
 const count=Object.getOwnPropertyDescriptor(raw,'count');if(!d.enumerable||!count?.enumerable||!('value'in count)||!Number.isInteger(count.value)||count.value<1||count.value>64)return{kind:'invalid',reason:'Invalid finite Slab count'};
 return{kind:'valid'};}catch{return{kind:'invalid',reason:'Unreadable Slab item owner'};}
}
