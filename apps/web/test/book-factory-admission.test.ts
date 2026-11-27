import {it,expect,vi} from 'vitest';
import {Inventory,cloneStack,cloneStackWithBaseId,snapshotFactoryStack,itemId,blockId,AIR,WorldDrops,craftOnce,createAgent,serializeSave,parseSave,type ItemStack} from '@craft/engine';
import {beginBookEdit,commitBookEdit,bookSessionCurrent} from '../src/persistence/bookEdit';
import {exchangeBagCursor} from '../src/ui/inventory-transfers';
// Structural JPEG envelope only; these ownership tests do not decode images or establish native parity.
const photo=()=>({pages:['Image field record'],photoPages:{version:1 as const,entries:[{page:0,dataUrl:'data:image/jpeg;base64,/9j/2Q==',caption:'Retain 🧪',takenAt:'2026-01-01T00:00:00Z',sourcePhotoId:'owned-capture',width:480,height:360}]}});
const cases:readonly[string,()=>ItemStack][]=[
 ['blank',()=>({id:itemId('book_and_quill'),count:1})],
 ['text',()=>({id:itemId('book_and_quill'),count:1,book:{pages:['Original text 🐏']}})],
 ['photo',()=>({id:itemId('book_and_quill'),count:1,book:photo()})],
 ['signed photo',()=>({id:itemId('written_book'),count:1,book:{...photo(),title:'Signed field journal',author:'Learner'}})],
];
function world(inventory:Inventory){return{name:'Factory ownership regression',seed:1,generatorVersion:1 as const,mode:'survival' as const,timeOfDay:.2,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},inventory:inventory.toJSON(),inventoryPending:[],agent:createAgent(5,80,5,0),edits:[] as[number,number,number,number][]};}
for(const[label,make]of cases)for(const route of['setSlot','fromJSON','cold save']as const)it(`${route} preserves fresh original factory admission for ${label} Book`,()=>{
 const input=make(),before=JSON.stringify(input);let inventory=new Inventory();
 if(route==='setSlot')expect(inventory.setSlot(4,input)).toBe(true);
 else {const raw=new Inventory().toJSON();raw.slots[4]=input;inventory=Inventory.fromJSON(raw);if(route==='cold save')inventory=Inventory.fromJSON(parseSave(serializeSave(world(inventory))).inventory);}
 inventory.selected=4;const owned=inventory.slots[4]!;expect(owned).toEqual(input);expect(owned).not.toBe(input);expect(JSON.stringify(input)).toBe(before);expect(snapshotFactoryStack(owned)).toBeDefined();
 const session=beginBookEdit(inventory);expect(session).not.toBeNull();expect(session!.source).toBe(owned);expect(bookSessionCurrent(session!)).toBe(true);
 if(input.book){expect(owned.book).not.toBe(input.book);expect(owned.book!.pages).not.toBe(input.book.pages);owned.book!.pages[0]='Local owner only';expect(JSON.stringify(input)).toBe(before);}
});
it('an imported blank Book durably edits/signs, then cold reload admits the exact signed photo owner',()=>{
 const raw=new Inventory().toJSON();raw.slots[0]=cases[0][1]();const inventory=Inventory.fromJSON(raw),session=beginBookEdit(inventory)!;expect(session).not.toBeNull();let disk='original';
 expect(commitBookEdit(session,photo(),'Field journal',()=>true,replacement=>{const candidate=world(inventory);candidate.inventory.slots[0]=replacement;return serializeSave(candidate);},payload=>{disk=payload;}).ok).toBe(true);
 const live=inventory.slots[0]!;expect(live.id).toBe(itemId('written_book'));expect(live.book!.photoPages).toEqual(photo().photoPages);expect(snapshotFactoryStack(live)).toBeDefined();const cold=Inventory.fromJSON(parseSave(disk).inventory);expect(cold.slots[0]).toEqual(live);expect(beginBookEdit(cold)).not.toBeNull();
});
it('real crafting output enters the bag with factory admission and finite ingredient debit',()=>{
 const grid:(ItemStack|null)[]=[{id:itemId('book'),count:1},{id:itemId('ink_sac'),count:1},{id:itemId('feather'),count:1},null];const result=craftOnce(grid,2)!;expect(result).toEqual({id:itemId('book_and_quill'),count:1});expect(grid).toEqual([null,null,null,null]);const inventory=new Inventory();expect(inventory.addStack(result)).toBe(0);expect(snapshotFactoryStack(inventory.slots[0])).toBeDefined();expect(beginBookEdit(inventory)).not.toBeNull();
});
it('real physical drop receiver transfers a finite owned photo Book and preserves factory admission',()=>{
 const world={getLoadedBlock(_x:number,y:number,_z:number){return y===0?blockId('stone'):AIR;}};const drops=new WorldDrops(world),input=cases[2][1](),inventory=new Inventory();expect(drops.spawnBatch([input],{x:.5,y:1,z:.5})).toBe(true);drops.update(.6);const position={...drops.records[0].position};expect(drops.tryPickup(position,stack=>inventory.addStack(stack))).toBe(1);expect(drops.records).toHaveLength(0);expect(inventory.slots[0]).toEqual(input);expect(snapshotFactoryStack(inventory.slots[0])).toBeDefined();expect(beginBookEdit(inventory)).not.toBeNull();
});
it('canonical ID normalization retains count/detached legacy metadata on the final new root',()=>{
 const input={id:blockId('placed_underwater_torch'),count:3,book:{pages:['Legacy metadata retained']}},copy=cloneStackWithBaseId(input);expect(copy).toEqual({...input,id:itemId('underwater_torch')});expect(copy).not.toBe(input);expect(copy.book).not.toBe(input.book);expect(input.id).toBe(blockId('placed_underwater_torch'));expect(snapshotFactoryStack(copy)).toBeDefined();const inventory=new Inventory();expect(inventory.setSlot(0,input)).toBe(true);expect(inventory.slots[0]).toEqual(copy);expect(snapshotFactoryStack(inventory.slots[0])).toBeDefined();
});
it('unsupported accessor descriptor clones are never normalized, invoked or adopted',()=>{
 const id=vi.fn(()=>{throw Error('id getter');}),setId=vi.fn(),book=vi.fn(()=>{throw Error('book getter');});const input={count:1} as ItemStack;Object.defineProperties(input,{id:{enumerable:true,get:id,set:setId},book:{enumerable:true,get:book}});const copy=cloneStackWithBaseId(input);expect(copy===input).toBe(false);expect(snapshotFactoryStack(copy)).toBeUndefined();expect(id).not.toHaveBeenCalled();expect(setId).not.toHaveBeenCalled();expect(book).not.toHaveBeenCalled();
 const unsupported={id:itemId('book_and_quill'),count:1} as ItemStack;Object.defineProperty(unsupported,'book',{enumerable:true,get:book});const inventory=new Inventory();expect(inventory.setSlot(0,unsupported)).toBe(false);expect(inventory.slots[0]).toBeNull();expect(book).not.toHaveBeenCalled();
});
it('unsupported id/count accessor inputs remain untrusted without invocation even without book metadata',()=>{
 for(const name of ['id','count'] as const){const getter=vi.fn(()=>{throw Error('getter');}),setter=vi.fn(),input={id:itemId('book_and_quill'),count:1};Object.defineProperty(input,name,{enumerable:true,get:getter,set:setter});const copy=cloneStackWithBaseId(input);expect(snapshotFactoryStack(copy)).toBeUndefined();expect(getter).not.toHaveBeenCalled();expect(setter).not.toHaveBeenCalled();}
});
it('normalization never coerces invalid id objects through valueOf',()=>{
 const valueOf=vi.fn(()=>{throw Error('coercion');}),id={valueOf} as unknown as number;const copy=cloneStackWithBaseId({id,count:1});expect(snapshotFactoryStack(copy)).toBeUndefined();expect(valueOf).not.toHaveBeenCalled();
});
it('unknown/revoked roots and replaced nested Proxy identities still fail before any traps',()=>{
 const trap=vi.fn(()=>{throw Error('foreign reflection');}),foreign=new Proxy({}, {get:trap,ownKeys:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap});expect(snapshotFactoryStack(foreign)).toBeUndefined();expect(trap).not.toHaveBeenCalled();const revoked=Proxy.revocable({},{});revoked.revoke();expect(snapshotFactoryStack(revoked.proxy)).toBeUndefined();
 for(const replace of[(s:ItemStack)=>{s.book=foreign as ItemStack['book'];},(s:ItemStack)=>{s.book!.pages=foreign as string[];},(s:ItemStack)=>{s.book!.photoPages!.entries[0]=foreign as ReturnType<typeof photo>['photoPages']['entries'][number];}]){const owned=cloneStackWithBaseId(cases[2][1]());replace(owned);expect(snapshotFactoryStack(owned)).toBeUndefined();expect(trap).not.toHaveBeenCalled();}
 const plain=cases[0][1]();expect(snapshotFactoryStack(plain)).toBeUndefined();expect(snapshotFactoryStack(cloneStack(plain))).toBeDefined();
});

const optionalCases:readonly[string,()=>ItemStack,'root'|'book','book'|'damage'|'title'|'author'][]=[
 ['root book',()=>({id:itemId('book_and_quill'),count:1,book:undefined}),'root','book'],
 ['root damage',()=>({id:itemId('book_and_quill'),count:1,damage:undefined}),'root','damage'],
 ['legacy title',()=>({id:itemId('book_and_quill'),count:1,book:{pages:['Retain legacy'],title:undefined}}),'book','title'],
 ['legacy author',()=>({id:itemId('book_and_quill'),count:1,book:{pages:['Retain legacy'],author:undefined}}),'book','author'],
];
for(const[label,make,where,field]of optionalCases)for(const route of['direct clone','canonical clone','setSlot','cursor transfer','cold save']as const)it(`${route} canonicalizes accepted optional undefined ${label} only on the new owner`,()=>{
 const input=make(),originalTarget=where==='root'?input:input.book!,before=Object.getOwnPropertyDescriptors(originalTarget);expect(Object.hasOwn(originalTarget,field)).toBe(true);let inventory=new Inventory();
 if(route==='direct clone')inventory.slots[0]=cloneStack(input);
 else if(route==='canonical clone')inventory.slots[0]=cloneStackWithBaseId(input);
 else if(route==='setSlot')expect(inventory.setSlot(0,input)).toBe(true);
 else if(route==='cursor transfer'){const transfer=exchangeBagCursor(inventory,0,input);expect(transfer.ok).toBe(true);expect(transfer.cursor).toBeNull();}
 else{const raw=world(inventory);raw.inventory.slots[0]=input;inventory=Inventory.fromJSON(parseSave(serializeSave(raw)).inventory);}
 const owned=inventory.slots[0]!;expect(owned===input).toBe(false);const target=where==='root'?owned:owned.book!;expect(Object.hasOwn(target,field)).toBe(false);expect(snapshotFactoryStack(owned)).toBeDefined();expect(beginBookEdit(inventory)).not.toBeNull();expect(Object.getOwnPropertyDescriptors(originalTarget)).toEqual(before);expect(Object.hasOwn(originalTarget,field)).toBe(true);
 if(input.book){expect(owned.book===input.book).toBe(false);expect(owned.book!.pages).toEqual(input.book.pages);expect(owned.book!.pages===input.book.pages).toBe(false);}
});
for(const field of['title','author']as const)it(`strict photo ${field} undefined is refused without cursor debit or repair`,()=>{
 const input:ItemStack={id:itemId('book_and_quill'),count:1,book:{...photo(),[field]:undefined}},inventory=new Inventory();expect(()=>cloneStack(input)).toThrow();expect(()=>cloneStackWithBaseId(input)).toThrow();expect(inventory.setSlot(0,input)).toBe(false);const transfer=exchangeBagCursor(inventory,0,input);expect(transfer.ok).toBe(false);expect(transfer.cursor===input).toBe(true);expect(inventory.slots[0]).toBeNull();expect(Object.hasOwn(input.book!,field)).toBe(true);
});
it('new photoPages undefined remains invalid rather than becoming a text-only book',()=>{
 const input:ItemStack={id:itemId('book_and_quill'),count:1,book:{pages:['Preserve marker'],photoPages:undefined}},inventory=new Inventory();expect(()=>cloneStack(input)).toThrow();expect(inventory.setSlot(0,input)).toBe(false);expect(exchangeBagCursor(inventory,0,input).ok).toBe(false);expect(Object.hasOwn(input.book!,'photoPages')).toBe(true);
});
it('zero wear and unknown fields survive optional canonicalization without becoming accepted factory metadata',()=>{
 const input={id:itemId('book_and_quill'),count:1,damage:0,book:{pages:['Retain'],title:undefined,author:undefined}},copy=cloneStack(input),inventory=new Inventory();expect(copy.damage).toBe(0);expect(Object.hasOwn(copy,'damage')).toBe(true);expect(inventory.setSlot(0,input)).toBe(true);expect(inventory.slots[0]!.damage).toBe(0);expect(beginBookEdit(inventory)).not.toBeNull();
 const unknownRoot={id:itemId('book_and_quill'),count:1,book:undefined,unknownRoot:undefined},rootCopy=cloneStack(unknownRoot);expect(Object.hasOwn(rootCopy,'unknownRoot')).toBe(true);expect(snapshotFactoryStack(rootCopy)).toBeUndefined();expect(Object.hasOwn(unknownRoot,'book')).toBe(true);
 const unknownBook={id:itemId('book_and_quill'),count:1,book:{pages:['Retain'],title:undefined,unknownBook:undefined}},bookCopy=cloneStack(unknownBook);expect(Object.hasOwn(bookCopy.book!,'unknownBook')).toBe(true);expect(snapshotFactoryStack(bookCopy)).toBeUndefined();expect(Object.hasOwn(unknownBook.book,'title')).toBe(true);
});
for(const field of['title','author']as const)it(`legacy ${field} accessors are refused without invocation rather than cleaned up`,()=>{
 const getter=vi.fn(()=>undefined),input:ItemStack={id:itemId('book_and_quill'),count:1,book:{pages:['Retain']}};Object.defineProperty(input.book!,field,{enumerable:true,get:getter});expect(()=>cloneStack(input)).toThrow();expect(getter).not.toHaveBeenCalled();expect(Object.getOwnPropertyDescriptor(input.book!,field)!.get).toBe(getter);
});
