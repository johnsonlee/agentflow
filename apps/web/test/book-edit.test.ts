import {it,expect,vi} from 'vitest';
import {Inventory,cloneStack,itemId,snapshotFactoryStack} from '@craft/engine';
import {beginBookEdit,commitBookEdit,bookSessionCurrent} from '../src/persistence/bookEdit';
const draft=()=>({pages:['saved'],photoPages:{version:1 as const,entries:[{page:0,dataUrl:'data:image/jpeg;base64,/9j/2Q==',caption:'photo',takenAt:'2026-01-01T00:00:00Z',sourcePhotoId:'source',width:480,height:360}]}});
function setup(){const inventory=new Inventory();inventory.slots[0]=cloneStack({id:itemId('book_and_quill'),count:1,book:{pages:['original']}});return{inventory,session:beginBookEdit(inventory)!};}
it('durable checkpoint precedes live replacement and publishes a newly registered photo tree exactly once',()=>{
 const {inventory,session}=setup();let disk='previous',order:string[]=[];const result=commitBookEdit(session,draft(),'Signed',()=>true,replacement=>{expect(inventory.slots[0]).toBe(session.source);return JSON.stringify(replacement);},payload=>{order.push('persist');expect(inventory.busy).toBe(true);expect(inventory.slots[0]).toBe(session.source);disk=payload;});expect(result).toEqual({ok:true});expect(order).toEqual(['persist']);expect(JSON.stringify(inventory.slots[0])).toBe(disk);expect(inventory.slots[0]).not.toBe(session.source);expect(snapshotFactoryStack(inventory.slots[0])).toBeDefined();expect(inventory.busy).toBe(false);
 const write=vi.fn();expect(commitBookEdit(session,draft(),undefined,()=>true,JSON.stringify,write).ok).toBe(false);expect(write).not.toHaveBeenCalled();
});
for(const fault of ['quota','serialization','stale','slot','mutated','over-size'] as const)it(`refuses ${fault} with original owner/storage and releases lease`,()=>{
 const {inventory,session}=setup(),original=JSON.stringify(inventory.slots[0]);let disk='original-world';const write=vi.fn((payload:string)=>{if(fault==='quota')throw Error('quota');disk=payload;});let current=true;
 const result=commitBookEdit(session,draft(),undefined,()=>current,replacement=>{if(fault==='serialization')throw Error('malformed archived owner');if(fault==='stale')current=false;if(fault==='slot')inventory.selected=1;if(fault==='mutated')session.source.book!.pages[0]='concurrent';return fault==='over-size'?'x'.repeat(8*1024*1024+1):JSON.stringify(replacement);},write);
 expect(result.ok).toBe(false);expect(disk).toBe('original-world');expect(inventory.slots[0]).toBe(session.source);if(fault!=='mutated')expect(JSON.stringify(inventory.slots[0])).toBe(original);expect(inventory.busy).toBe(false);if(fault!=='quota')expect(write).not.toHaveBeenCalled();
});
it('owner reservation contention and changed original cell refuse without storage changes',()=>{const {inventory,session}=setup();inventory.slots[0]=cloneStack(session.source);expect(bookSessionCurrent(session)).toBe(false);const write=vi.fn();expect(commitBookEdit(session,draft(),undefined,()=>true,JSON.stringify,write).ok).toBe(false);expect(write).not.toHaveBeenCalled();});
it('final prepared-cell proof runs after reentrant current checks, refusing frozen-cell publication before persistence',()=>{
 const {inventory,session}=setup();let calls=0;const write=vi.fn();const current=()=>{if(++calls===3)Object.defineProperty(inventory.slots,'0',{writable:false});return true;};
 expect(commitBookEdit(session,draft(),undefined,current,JSON.stringify,write).ok).toBe(false);expect(write).not.toHaveBeenCalled();expect(inventory.slots[0]).toBe(session.source);expect(inventory.busy).toBe(false);
});
