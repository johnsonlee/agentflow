import {hasBookPhotos,readBookData,MAX_WORLD_SAVE_NODES,MAX_WORLD_SAVE_DEPTH} from '@craft/engine';
import {photoAsJpeg,requireExportCurrent} from '../assessment/portfolio-export';
/** Codec preflight for an already structurally checked, parsed world DTO, before activation/replacement. */
export async function validateWorldBookImages(raw:unknown,current:()=>boolean):Promise<void>{
 const seen=new Set<object>();let nodes=0;
 const visit=async(value:unknown,depth:number):Promise<void>=>{
  requireExportCurrent(current);if(++nodes>MAX_WORLD_SAVE_NODES||depth>MAX_WORLD_SAVE_DEPTH)throw Error('Book photo world traversal exceeds application limits');
  if(!value||typeof value!=='object')return;if(seen.has(value))throw Error('Aliased world book data');seen.add(value);
  const book=Object.getOwnPropertyDescriptor(value,'book');
  if(book&&!('value'in book))throw Error('Unreadable book data');
  if(book&&'value'in book&&hasBookPhotos(book.value)){const b=readBookData(book.value);
   for(const p of b.photoPages?.entries??[]){
    const decoded=await photoAsJpeg({id:p.sourcePhotoId,dataUrl:p.dataUrl,caption:p.caption,takenAt:p.takenAt},current);
    if(decoded.width!==p.width||decoded.height!==p.height||decoded.converted)throw Error('Book photo decoded size does not match its saved metadata');
   }
  }
  for(const key of Reflect.ownKeys(value)){if(key==='length'||key==='book')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!('value'in field))throw Error('Unreadable world data');if(field.value&&typeof field.value==='object')await visit(field.value,depth+1);}
 };
 await visit(raw,0);requireExportCurrent(current);
}

/** Synchronous parsed-DTO presence scan keeps legacy no-photo startup/import timing unchanged. */
export function hasWorldBookPhotos(raw:unknown):boolean{
 const seen=new Set<object>();let nodes=0;
 const visit=(value:unknown,depth:number):boolean=>{
  if(!value||typeof value!=='object')return false;if(++nodes>MAX_WORLD_SAVE_NODES||depth>MAX_WORLD_SAVE_DEPTH)throw Error('Book world traversal exceeds application limits');
  if(seen.has(value))return false;seen.add(value);
  const b=Object.getOwnPropertyDescriptor(value,'book');if(b&&('value'in b?hasBookPhotos(b.value):true))return true;
  for(const k of Reflect.ownKeys(value)){if(k==='length'||k==='book')continue;const d=Object.getOwnPropertyDescriptor(value,k);if(d&&'value'in d&&visit(d.value,depth+1))return true;}
  return false;
 };
 return visit(raw,0);
}
