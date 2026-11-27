import{photoAsJpeg,type JpegPhoto}from'./portfolio-export';
import{requireBookExportCurrent,type BookExportPhoto,BOOK_EXPORT_OUTPUT_LIMIT}from'./book-export';
export interface BookJpegGeometry{width:number;height:number;components:number;orientation:number}
/** Bounded JPEG header/EXIF inspection. Full pixel decoding remains a separate browser gate. */
export function readBookJpegGeometry(bytes:Uint8Array):BookJpegGeometry{
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw Error('Invalid book JPEG envelope');let at=2,width=0,height=0,components=0,orientation=1,seenOrientation=false;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 while(at<bytes.length-2){if(bytes[at++]!==255)throw Error('Invalid book JPEG marker');while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;if(at+2>bytes.length)throw Error('Truncated JPEG');const length=view.getUint16(at),start=at+2,end=at+length;if(length<2||end>bytes.length)throw Error('Truncated JPEG segment');
  if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)throw Error('Invalid JPEG size');const h=view.getUint16(start+1),w=view.getUint16(start+3),c=bytes[start+5];if(length!==8+3*c)throw Error('Invalid JPEG component table');if(width&&(width!==w||height!==h||components!==c))throw Error('Conflicting JPEG sizes');width=w;height=h;components=c;}
  if(marker===0xe1&&end-start>=4&&String.fromCharCode(...bytes.subarray(start,start+4))==='Exif'){
   if(end-start<14||bytes[start+4]!==0||bytes[start+5]!==0)throw Error('Invalid photo orientation metadata');const t=start+6,order=view.getUint16(t),little=order===0x4949;if(!little&&order!==0x4d4d)throw Error('Invalid EXIF byte order');const u16=(p:number)=>{if(p<t||p+2>end)throw Error('Truncated EXIF');return view.getUint16(p,little);},u32=(p:number)=>{if(p<t||p+4>end)throw Error('Truncated EXIF');return view.getUint32(p,little);};if(u16(t+2)!==42)throw Error('Invalid EXIF header');const offset=u32(t+4),ifd=t+offset,n=u16(ifd);if(n>1024||ifd+2+n*12>end)throw Error('Invalid EXIF directory');
   for(let i=0;i<n;i++){const entry=ifd+2+i*12;if(u16(entry)!==0x112)continue;if(u16(entry+2)!==3||u32(entry+4)!==1)throw Error('Unsupported photo orientation');const value=u16(entry+8);if(value<1||value>8||seenOrientation&&value!==orientation)throw Error('Conflicting photo orientation');orientation=value;seenOrientation=true;}
  }
  at=end;
 }
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>4096||height>4096||width*height>16777216||![1,3,4].includes(components))throw Error('Unsupported book JPEG dimensions');return{width,height,components,orientation};
}
function bytesFromUrl(url:string):Uint8Array{const raw=atob(url.slice(url.indexOf(',')+1));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
/** Browser decode handles EXIF orientation; normalization is explicit, never an original-byte claim. */
async function normalizeJpeg(photo:BookExportPhoto,current:()=>boolean):Promise<JpegPhoto>{
 const image=new Image();try{
  await new Promise<void>((resolve,reject)=>{let settled=false;const finish=(error?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(poll);error?reject(error):resolve();},timer=setTimeout(()=>finish(Error('Book photo decode deadline exceeded')),10000),poll=setInterval(()=>{try{requireBookExportCurrent(current);}catch(e){finish(e);}},50);image.onload=()=>finish();image.onerror=()=>finish(Error('Book photo could not be decoded'));try{image.src=photo.dataUrl;}catch(e){finish(e);}});
  requireBookExportCurrent(current);if(image.naturalWidth!==photo.width||image.naturalHeight!==photo.height)throw Error('Book photo decoded size changed');const canvas=document.createElement('canvas');canvas.width=photo.width;canvas.height=photo.height;
  try{const context=canvas.getContext('2d');if(!context)throw Error('Book photo conversion unavailable');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);const bytes=bytesFromUrl(canvas.toDataURL('image/jpeg',.92));if(bytes.length>BOOK_EXPORT_OUTPUT_LIMIT)throw Error('Converted book photo exceeds export budget');const geometry=readBookJpegGeometry(bytes);if(geometry.orientation!==1||geometry.width!==photo.width||geometry.height!==photo.height||geometry.components!==3)throw Error('Book photo conversion could not be verified');requireBookExportCurrent(current);return{bytes,width:photo.width,height:photo.height,converted:true};}finally{canvas.width=0;canvas.height=0;}
 }finally{image.onload=null;image.onerror=null;image.src='';}
}
export async function decodeBookPhoto(photo:BookExportPhoto,current:()=>boolean):Promise<JpegPhoto>{
 requireBookExportCurrent(current);const image=await photoAsJpeg({id:photo.sourcePhotoId,dataUrl:photo.dataUrl,caption:photo.caption,takenAt:photo.takenAt},current);requireBookExportCurrent(current);if(image.width!==photo.width||image.height!==photo.height)throw Error('Book photo dimensions do not match the saved page');const geometry=readBookJpegGeometry(image.bytes);
 if(geometry.orientation!==1||geometry.components===4)return normalizeJpeg(photo,current);
 if(geometry.width!==photo.width||geometry.height!==photo.height)throw Error('Book JPEG dimensions do not match its decoded page');return image;
}
