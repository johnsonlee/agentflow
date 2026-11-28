import{storedZip,ZIP_BYTE_LIMIT}from'./zip';
export interface ExportPhoto{readonly id:string;readonly dataUrl:string;readonly caption:string;readonly takenAt:string}
export interface JpegPhoto{bytes:Uint8Array;width:number;height:number;converted:boolean}
export type PhotoEncoder=(photo:ExportPhoto)=>Promise<JpegPhoto>;
export class ExportCancelled extends Error{constructor(){super('Portfolio export cancelled.');}}
export function requireExportCurrent(current:()=>boolean):void{if(!current())throw new ExportCancelled();}
function dataField(object:object,key:string):unknown{const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!('value'in d))throw Error('Unreadable Portfolio photo');return d.value;}
/** Primitive fields are copied synchronously; no source mutation, storage, repair/drop or ownership lease. */
export function portfolioExportSnapshot(photos:readonly ExportPhoto[],current:()=>boolean,drafts?:ReadonlyMap<string,string>):readonly ExportPhoto[]{
 requireExportCurrent(current);if(!Array.isArray(photos)||photos.length<1||photos.length>24)throw Error('Export requires1–24 photos');const seen=new Set<string>(),out:ExportPhoto[]=[];let budget=0;
 for(let i=0;i<photos.length;i++){const p=dataField(photos,String(i));if(!p||typeof p!=='object')throw Error('Invalid Portfolio photo');const id=dataField(p,'id'),dataUrl=dataField(p,'dataUrl'),storedCaption=dataField(p,'caption'),takenAt=dataField(p,'takenAt');if(typeof id!=='string'||!id||id.length>64||seen.has(id)||typeof dataUrl!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUrl)||typeof storedCaption!=='string'||typeof takenAt!=='string'||!Number.isFinite(Date.parse(takenAt)))throw Error('Invalid Portfolio photo');seen.add(id);const caption=drafts?.get(id)??storedCaption;if(typeof caption!=='string')throw Error('Invalid photo caption');budget+=dataUrl.length+new TextEncoder().encode(caption).length;if(budget>ZIP_BYTE_LIMIT)throw Error('Portfolio export exceeds32MiB input limit');out.push(Object.freeze({id,dataUrl,caption,takenAt}));}
 requireExportCurrent(current);return Object.freeze(out.reverse()); // Existing insertion order is newest first.
}
function decodeDataUrl(url:string):Uint8Array{const raw=atob(url.slice(url.indexOf(',')+1)),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
function jpegBytes(bytes:Uint8Array):boolean{return bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9;}
/** Decode locally even for JPEG, so malformed payloads never become mislabeled archive entries. */
export async function photoAsJpeg(photo:ExportPhoto,current:()=>boolean=()=>true):Promise<JpegPhoto>{
 requireExportCurrent(current);const image=new Image();try{
  await new Promise<void>((resolve,reject)=>{let poll:ReturnType<typeof setInterval>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;const finish=(error?:unknown)=>{if(poll!==undefined)clearInterval(poll);if(deadline!==undefined)clearTimeout(deadline);error?reject(error):resolve();};image.onload=()=>finish();image.onerror=()=>finish(Error('A Portfolio photo could not be decoded'));poll=setInterval(()=>{try{requireExportCurrent(current);}catch(error){finish(error);}},50);deadline=setTimeout(()=>finish(Error('Photo decode deadline exceeded')),10000);try{image.src=photo.dataUrl;}catch(error){finish(error);}});
  requireExportCurrent(current);
  const width=image.naturalWidth,height=image.naturalHeight;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>16777216)throw Error('Photo dimensions exceed export limit');
  if(photo.dataUrl.startsWith('data:image/jpeg;')){const bytes=decodeDataUrl(photo.dataUrl);if(!jpegBytes(bytes))throw Error('Invalid JPEG payload');return{bytes,width,height,converted:false};}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  try{const context=canvas.getContext('2d');if(!context)throw Error('Photo conversion unavailable');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);const bytes=decodeDataUrl(canvas.toDataURL('image/jpeg',.92));if(!jpegBytes(bytes))throw Error('JPEG conversion unavailable');return{bytes,width,height,converted:true};}finally{canvas.width=0;canvas.height=0;}
 }finally{image.onload=null;image.onerror=null;image.src='';}
}
export async function buildPortfolioZip(snapshot:readonly ExportPhoto[],current:()=>boolean,encode:PhotoEncoder=photo=>photoAsJpeg(photo,current)):Promise<{blob:Blob;photos:number}>{
 requireExportCurrent(current);const entries:Array<{name:string;bytes:Uint8Array}>=[],manifest:Array<{file:string;id:string;caption:string;takenAt:string;width:number;height:number;convertedToJpeg:boolean}>=[];let total=0;
 for(let i=0;i<snapshot.length;i++){requireExportCurrent(current);const photo=snapshot[i],image=await encode(photo);requireExportCurrent(current);if(!jpegBytes(image.bytes)||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1||image.width*image.height>16777216)throw Error('Invalid exported JPEG');total+=image.bytes.length;if(total>ZIP_BYTE_LIMIT)throw Error('Portfolio archive exceeds32MiB export limit');const file=`photo-${String(i+1).padStart(4,'0')}.jpg`;entries.push({name:file,bytes:image.bytes});manifest.push({file,id:photo.id,caption:photo.caption,takenAt:photo.takenAt,width:image.width,height:image.height,convertedToJpeg:image.converted});}
 if(!entries.length)throw Error('No photos to export');const metadata=new TextEncoder().encode(JSON.stringify({format:'agentflow-portfolio-v1',note:'App-specific captions and ordering; not a native Minecraft archive schema.',photos:manifest},null,2)+'\n');const bytes=storedZip([{name:'captions.json',bytes:metadata},...entries]);requireExportCurrent(current);return{blob:new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/zip'}),photos:entries.length};
}
