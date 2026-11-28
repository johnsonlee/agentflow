import { itemId } from "../catalog/items";
/** Application book limits; these are not claimed to be native Education limits. */
export const BOOK_MAX_PAGES = 50, BOOK_PAGE_CHARS = 256, BOOK_TITLE_CHARS = 32;
export const BOOK_MAX_PHOTOS = 8, BOOK_PHOTO_BYTES = 256 * 1024, BOOK_BYTES = 1024 * 1024;
export const WORLD_BOOK_PHOTO_BYTES = 2 * 1024 * 1024;
export interface BookPhotoPage { page:number; dataUrl:string; caption:string; takenAt:string; sourcePhotoId:string; width:number; height:number }
export interface BookData { pages:string[]; title?:string; author?:string; photoPages?:{version:1;entries:BookPhotoPage[]} }
const desc=Object.getOwnPropertyDescriptor;
function record(value:unknown,allowed:readonly string[],required:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Expected plain book data');
 const out:Record<string,unknown>=Object.create(null);
 for(const key of Reflect.ownKeys(value)){const d=desc(value,key);if(typeof key!=='string'||!allowed.includes(key)||!d?.enumerable||!('value'in d))throw Error('Unreadable book field');out[key]=d.value;}
 if(required.some(k=>!Object.hasOwn(out,k)))throw Error('Missing book field');return out;
}
function array(value:unknown,max:number):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('Expected book array');
 const n=desc(value,'length')?.value;if(!Number.isSafeInteger(n)||n<0||n>max||Reflect.ownKeys(value).length!==n+1)throw Error('Malformed book array');
 return Array.from({length:n},(_,i)=>{const d=desc(value,String(i));if(!d?.enumerable||!('value'in d))throw Error('Unreadable book array');return d.value;});
}
function text(value:unknown,max:number):string{if(typeof value!=='string'||value.length>max)throw Error('Book text exceeds limit');return value;}
export function bookUtf8Bytes(value:string):number{return new TextEncoder().encode(value).length;}
/** Descriptor-only validation followed by a fully detached copy. No truncation or repair. */
export function readBookData(value:unknown):BookData{
 const b=record(value,['pages','title','author','photoPages'],['pages']);
 const book:BookData={pages:array(b.pages,BOOK_MAX_PAGES).map(p=>text(p,BOOK_PAGE_CHARS))};
 for(const k of ['title','author'] as const)if(Object.hasOwn(b,k))book[k]=text(b[k],BOOK_TITLE_CHARS);
 if(Object.hasOwn(b,'photoPages')){
  const pp=record(b.photoPages,['version','entries'],['version','entries']);if(pp.version!==1)throw Error('Unsupported book photo version');
  let previous=-1;
  const entries=array(pp.entries,BOOK_MAX_PHOTOS).map(raw=>{
   const p=record(raw,['page','dataUrl','caption','takenAt','sourcePhotoId','width','height'],['page','dataUrl','caption','takenAt','sourcePhotoId','width','height']);
   if(!Number.isSafeInteger(p.page)||Number(p.page)<=previous||Number(p.page)<0||Number(p.page)>=book.pages.length)throw Error('Invalid book photo page');previous=Number(p.page);
   const dataUrl=text(p.dataUrl,BOOK_PHOTO_BYTES);
   if(!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(dataUrl)||bookUtf8Bytes(dataUrl)>BOOK_PHOTO_BYTES)throw Error('Invalid or oversized book JPEG');
   const encoded=dataUrl.slice(dataUrl.indexOf(',')+1);if(encoded.length%4)throw Error('Invalid book JPEG encoding');
   const bytes=atob(encoded);if(bytes.length<4||bytes.charCodeAt(0)!==255||bytes.charCodeAt(1)!==216||bytes.charCodeAt(bytes.length-2)!==255||bytes.charCodeAt(bytes.length-1)!==217)throw Error('Invalid book JPEG envelope');
   if(!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||Number(p.width)<1||Number(p.height)<1||Number(p.width)>4096||Number(p.height)>4096||Number(p.width)*Number(p.height)>16777216)throw Error('Invalid book photo size');
   const takenAt=text(p.takenAt,64),sourcePhotoId=text(p.sourcePhotoId,200);
   if(!Number.isFinite(Date.parse(takenAt))||!sourcePhotoId)throw Error('Invalid book photo provenance');
   return{page:Number(p.page),dataUrl,caption:text(p.caption,200),takenAt,sourcePhotoId,width:Number(p.width),height:Number(p.height)};
  });
  book.photoPages={version:1,entries};
 }
 if(bookUtf8Bytes(JSON.stringify(book))>BOOK_BYTES)throw Error('Book exceeds application byte limit');
 return book;
}
export function validBookData(value:unknown):boolean{try{readBookData(value);return true;}catch{return false;}}
export function equalBookData(a:unknown,b:unknown):boolean{try{return JSON.stringify(readBookData(a))===JSON.stringify(readBookData(b));}catch{return false;}}

/** Reflection is descriptor-only but arbitrary Proxy traps may run. Factory identity gates remain separate. */
export function inspectBookOwner(raw:unknown):{kind:'none'}|{kind:'valid';book:BookData}|{kind:'invalid';reason:string}{
 try{
  if(!raw||typeof raw!=='object')return{kind:'none'};
  const bookField=desc(raw,'book');
  if(!bookField||'value'in bookField&&!hasBookPhotos(bookField.value))return{kind:'none'};
  const idField=desc(raw,'id'),isBook=!!idField&&'value'in idField&&[itemId('book_and_quill'),itemId('written_book')].includes(idField.value);
  if(isBook&&Reflect.ownKeys(raw).some(k=>typeof k!=='string'||!['id','count','book'].includes(k)))throw Error('Unsupported book owner fields');
  const b=desc(raw,'book');if(!b)return{kind:'none'};
  if(!b.enumerable||!('value'in b))throw Error('Unreadable book owner');
  const id=desc(raw,'id'),count=desc(raw,'count');
  if(!id||!('value'in id)||!count||!('value'in count)||![itemId('book_and_quill'),itemId('written_book')].includes(id.value)||count.value!==1)throw Error('Unsupported book owner');
  return{kind:'valid',book:readBookData(b.value)};
 }catch(error){return{kind:'invalid',reason:error instanceof Error?error.message:'Unreadable book owner'};}
}

/** New photo extension presence is strict, including accessors. Legacy text metadata keeps its existing eligibility. */
export function hasBookPhotos(value:unknown):boolean {
 try{return !!value&&typeof value==='object'&&Object.getOwnPropertyDescriptor(value,'photoPages')!==undefined;}catch{return true;}
}
/** Descriptor-safe legacy clone without introducing new live-text limits or changing legacy item eligibility. */
export function cloneBookData(value:unknown):BookData {
 if(hasBookPhotos(value))return readBookData(value);
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid legacy book');
 const fields:Record<string,unknown>={};
 for(const key of Reflect.ownKeys(value)){const d=desc(value,key);if(typeof key!=='string'||!d?.enumerable||!('value'in d))throw Error('Unreadable legacy book');Object.defineProperty(fields,key,{value:d.value,enumerable:true,writable:true,configurable:true});}
 const pages=fields.pages;if(!Array.isArray(pages)||Object.getPrototypeOf(pages)!==Array.prototype)throw Error('Invalid legacy book pages');
 const length=desc(pages,'length')?.value;if(!Number.isSafeInteger(length)||length<0||Reflect.ownKeys(pages).length!==length+1)throw Error('Invalid legacy book pages');
 const copy=Array.from({length},(_,i)=>{const d=desc(pages,String(i));if(!d?.enumerable||!('value'in d)||typeof d.value!=='string')throw Error('Unreadable legacy page');return d.value as string;});
 if(fields.title!==undefined&&typeof fields.title!=='string'||fields.author!==undefined&&typeof fields.author!=='string')throw Error('Invalid legacy book text');
 return{...fields,pages:copy} as BookData;
}
