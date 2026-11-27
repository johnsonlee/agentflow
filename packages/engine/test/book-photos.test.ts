import {it,expect,vi} from 'vitest';
import {readBookData,inspectBookOwner,BOOK_PHOTO_BYTES,cloneStack,snapshotFactoryStack,stacksCompatible,writeBook,signBook,itemId,Inventory} from '../src/index';
const jpeg='data:image/jpeg;base64,/9j/2Q==';
const photo=(page=0)=>({page,dataUrl:jpeg,caption:'Field notes 🧪',takenAt:'2026-01-01T00:00:00.000Z',sourcePhotoId:'capture-one',width:480,height:360});
const book=()=>({pages:['one','two'],photoPages:{version:1 as const,entries:[photo()]}});
it('detaches every mutable photo owner and preserves images through text edits/signing without Portfolio dependency',()=>{
 const original={id:itemId('book_and_quill'),count:1,book:book()},copy=cloneStack(original);copy.book!.photoPages!.entries[0].caption='copy';expect(original.book.photoPages.entries[0].caption).toBe('Field notes 🧪');
 expect(writeBook(copy,['new','next'])).toBe(true);expect(copy.book!.photoPages!.entries[0].dataUrl).toBe(jpeg);expect(signBook(copy,'Photos','Player')).toBe(true);const signed=JSON.stringify(copy);expect(writeBook(copy,['erase'])).toBe(false);expect(signBook(copy,'replace','x')).toBe(false);expect(JSON.stringify(copy)).toBe(signed);
 const inventory=new Inventory();expect(inventory.addStack(copy)).toBe(0);expect(inventory.toJSON().slots.find(Boolean)?.book?.photoPages?.entries[0].dataUrl).toBe(jpeg);
});
it('provenance rejects replacement photo trees before traversing counterfeit nodes',()=>{
 for(const replace of[(s:any)=>s.book.photoPages=new Proxy({},{get(){throw Error('read');}}),(s:any)=>s.book.photoPages.entries[0]=new Proxy({},{get(){throw Error('read');}})]){
  const s=cloneStack({id:itemId('book_and_quill'),count:1,book:book()});replace(s);expect(snapshotFactoryStack(s)).toBeUndefined();
 }
 const s=cloneStack({id:itemId('book_and_quill'),count:1,book:book()});const before=snapshotFactoryStack(s)!.values;s.book!.photoPages!.entries[0].caption='changed';expect(snapshotFactoryStack(s)!.values).not.toEqual(before);
});
it('full metadata equality distinguishes placement/caption/data and signed images never merge',()=>{
 const a=cloneStack({id:itemId('written_book'),count:1,book:book()}),b=cloneStack(a);expect(stacksCompatible(a,b)).toBe(true);b.book!.photoPages!.entries[0].page=1;expect(stacksCompatible(a,b)).toBe(false);
 b.book=book();b.book.photoPages!.entries[0].caption='different';expect(stacksCompatible(a,b)).toBe(false);
});
it('malformed/oversized/duplicate/foreign fields refuse without invoking ordinary accessors or clamping',()=>{
 const getter=vi.fn();const bad=book();Object.defineProperty(bad.photoPages.entries[0],'caption',{enumerable:true,get:getter});expect(()=>readBookData(bad)).toThrow();expect(getter).not.toHaveBeenCalled();
 for(const value of[{...book(),photoPages:{version:2,entries:[]}},{...book(),photoPages:{version:1,entries:[photo(),photo()]}},{...book(),photoPages:{version:1,entries:[{...photo(),page:2}]}},{...book(),photoPages:{version:1,entries:[{...photo(),takenAt:'invalid'}]}},{...book(),photoPages:{version:1,entries:[{...photo(),width:16777216,height:1}]}},{...book(),photoPages:{version:1,entries:[{...photo(),dataUrl:jpeg+'A'.repeat(BOOK_PHOTO_BYTES)}]}}])expect(()=>readBookData(value)).toThrow();
 expect(inspectBookOwner({id:itemId('book'),count:1,book:book()}).kind).toBe('invalid');
});
it('public edit and sign helpers validate existing metadata before spread/getter invocation',()=>{
 const getter=vi.fn(),stack={id:itemId('book_and_quill'),count:1,book:book()};Object.defineProperty(stack.book,'photoPages',{enumerable:true,get:getter});expect(writeBook(stack,['new'])).toBe(false);expect(signBook(stack,'No','Player')).toBe(false);expect(getter).not.toHaveBeenCalled();
});
it('presence of malformed photo extension never falls back to legacy metadata eligibility',()=>{
 for(const extension of [undefined,null,{version:9,entries:[]},{version:1,entries:null}]){
  const s={id:itemId('book_and_quill'),count:1,book:{pages:['retain'],photoPages:extension}};expect(inspectBookOwner(s).kind).toBe('invalid');
 }
});
