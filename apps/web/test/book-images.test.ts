import {it,expect,vi,afterEach} from 'vitest';
import {validateWorldBookImages} from '../src/persistence/bookImages';
import {prepareBookPhoto} from '../src/ui/bookPhotoPicker';
const p=()=>({page:0,dataUrl:'data:image/jpeg;base64,/9j/2Q==',caption:'Copy',takenAt:'2026-01-01T00:00:00Z',sourcePhotoId:'one',width:480,height:360});
function host(fail=false,width=480,height=360){vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:(()=>void)|null=null;naturalWidth=width;naturalHeight=height;set src(v:string){if(v)queueMicrotask(()=>fail?this.onerror?.():this.onload?.());}});}
afterEach(()=>vi.unstubAllGlobals());
it('codec preflight covers active and archived item images, refusing corrupt decoded bytes before world activation',async()=>{
 host();const active={inventory:{slots:[{book:{pages:['one'],photoPages:{version:1,entries:[p()]}}}]}};
 await expect(validateWorldBookImages(active,()=>true)).resolves.toBeUndefined();
 host(true);const stack={book:{pages:['one'],photoPages:{version:1,entries:[p()]}}};
 const archived={dimensions:{inactive:{nether:{worldDrops:{records:[{stack}]}}}}};
 await expect(validateWorldBookImages(archived,()=>true)).rejects.toThrow('decoded');
});
it('decoded dimensions cannot masquerade as smaller trusted metadata',async()=>{host(false,400,300);await expect(validateWorldBookImages({book:{pages:['one'],photoPages:{version:1,entries:[p()]}}},()=>true)).rejects.toThrow('size');});
it('selection snapshots caption and bytes before async decode and remains independent of source edits',async()=>{host();const source={id:'one',dataUrl:p().dataUrl,caption:'Original',takenAt:p().takenAt};const pending=prepareBookPhoto(source,0,()=>true);source.caption='Changed';expect((await pending).caption).toBe('Original');});
it('selection cancels when writer changes during asynchronous codec work',async()=>{host();let current=true;const pending=prepareBookPhoto({id:'one',dataUrl:p().dataUrl,caption:'Original',takenAt:p().takenAt},0,()=>current);current=false;await expect(pending).rejects.toThrow('cancelled');});
it('actual Portfolio deletion, 24-entry eviction and quota eviction cannot destroy an embedded signed photo',async()=>{
 host();const values=new Map<string,string>();let quota=false;vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(quota)throw Error('quota');values.set(k,v);}});
 const {Portfolio}=await import('../src/ui/screens');const {cloneStack,signBook,itemId}=await import('@craft/engine');
 const portfolio=new Portfolio();const source=portfolio.add(p().dataUrl);portfolio.setCaption(source.id,'Original');
 const image=await prepareBookPhoto(source,0,()=>true);const signed=cloneStack({id:itemId('book_and_quill'),count:1,book:{pages:['saved'],photoPages:{version:1,entries:[image]}}});expect(signBook(signed,'Retained','Player')).toBe(true);const exact=JSON.stringify(signed);
 portfolio.setCaption(source.id,'Changed later');portfolio.remove(source.id);for(let i=0;i<25;i++)portfolio.add(p().dataUrl);expect(portfolio.photos).toHaveLength(24);quota=true;portfolio.add(p().dataUrl);expect(portfolio.photos.length).toBeLessThan(24);expect(JSON.stringify(signed)).toBe(exact);expect(signed.book!.photoPages!.entries[0].caption).toBe('Original');
});
