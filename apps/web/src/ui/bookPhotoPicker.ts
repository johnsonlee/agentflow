import {readBookData, BOOK_PHOTO_BYTES, type BookPhotoPage} from '@craft/engine';
import {portfolioExportSnapshot,photoAsJpeg,type ExportPhoto} from '../assessment/portfolio-export';
/** Copy source primitives before awaiting codec work. No inventory lease spans this operation. */
export async function prepareBookPhoto(photo:ExportPhoto,page:number,current:()=>boolean):Promise<BookPhotoPage>{
 const source=portfolioExportSnapshot([photo],current)[0];
 if(source.dataUrl.length>BOOK_PHOTO_BYTES)throw Error('Photo exceeds the 256 KiB application book limit.');
 const jpeg=await photoAsJpeg(source,current);if(!current())throw Error('Book photo selection cancelled.');
 let dataUrl=source.dataUrl;
 if(jpeg.converted){let raw='';for(const byte of jpeg.bytes)raw+=String.fromCharCode(byte);dataUrl='data:image/jpeg;base64,'+btoa(raw);}
 const photoPage={page,dataUrl,caption:source.caption,takenAt:source.takenAt,sourcePhotoId:source.id,width:jpeg.width,height:jpeg.height};
 return readBookData({pages:Array.from({length:page+1},()=>''),photoPages:{version:1,entries:[photoPage]}}).photoPages!.entries[0];
}
