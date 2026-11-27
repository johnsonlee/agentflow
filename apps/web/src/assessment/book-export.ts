import{downloadBlob}from'../platform/download';
import{cloneBookData,hasBookPhotos,readBookData,type BookData}from'@craft/engine';
export const BOOK_EXPORT_INPUT_LIMIT=8*1024*1024,BOOK_EXPORT_OUTPUT_LIMIT=32*1024*1024,BOOK_EXPORT_PAGE_LIMIT=1000;
export class BookExportCancelled extends Error{constructor(){super('Book export cancelled.');}}
export function requireBookExportCurrent(current:()=>boolean):void{if(!current())throw new BookExportCancelled();}
export interface BookExportPhoto{readonly page:number;readonly dataUrl:string;readonly caption:string;readonly takenAt:string;readonly sourcePhotoId:string;readonly width:number;readonly height:number}
export interface BookExportSnapshot{readonly mode:'draft'|'signed';readonly title:string;readonly author:string;readonly pages:readonly string[];readonly photos:readonly BookExportPhoto[];readonly textAttachment:string}
function wellFormed(text:string):boolean{for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;}
/** Caller first proves the original live owner. This only detaches the screen's private draft. */
export function bookExportSnapshot(draft:BookData,mode:'draft'|'signed',current:()=>boolean):BookExportSnapshot{
 requireBookExportCurrent(current);if(mode!=='draft'&&mode!=='signed')throw Error('Invalid book export mode');const book=hasBookPhotos(draft)?readBookData(draft):cloneBookData(draft);
 if(!book.pages.length||book.pages.length>BOOK_EXPORT_PAGE_LIMIT)throw Error('This book exceeds the PDF export page budget. Your book is unchanged.');
 const title=book.title??'Book',author=book.author??'',pages=book.pages.slice(),photos=(book.photoPages?.entries??[]).map(p=>Object.freeze({...p}));
 if(![title,author,...pages,...photos.map(p=>p.caption)].every(wellFormed))throw Error('Book contains incomplete Unicode text. Export was not changed or truncated.');
 const textAttachment=JSON.stringify({format:'agentflow-book-pdf-text-v1',note:'App-specific exact UTF-8 text; not a native Minecraft Book schema.',mode,title,author,sourceTitle:book.title??null,sourceAuthor:book.author??null,pages:pages.map((text,page)=>({page:page+1,text,caption:photos.find(p=>p.page===page)?.caption??''}))},null,2)+'\n';
 if(new TextEncoder().encode(textAttachment).length+photos.reduce((n,p)=>n+p.dataUrl.length,0)>BOOK_EXPORT_INPUT_LIMIT)throw Error('Book exceeds the PDF export byte budget. Your book is unchanged.');
 requireBookExportCurrent(current);return Object.freeze({mode,title,author,pages:Object.freeze(pages),photos:Object.freeze(photos),textAttachment});
}
export function bookPdfFilename(snapshot:BookExportSnapshot):string{
 const clean=(s:string)=>s.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'-').replace(/[. ]+$/g,'').trim();const title=clean(snapshot.title)||'Book',author=clean(snapshot.author);let stem=`${title}${author?' '+author:''}${snapshot.mode==='draft'?' - draft':''}`;if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem))stem='Book - '+stem;const chunks=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(stem),p=>p.segment):Array.from(stem);let bounded='';for(const cluster of chunks){if(new TextEncoder().encode(bounded+cluster).length>180)break;bounded+=cluster;}return`${bounded.replace(/[. ]+$/g,'')||'Book'}.pdf`;
}
export interface BookPdfResult{readonly blob:Blob;readonly pages:number;readonly logicalPages:number;readonly rasterTextRuns:number;readonly convertedPhotos:number}
export interface BookPdfServices{build(snapshot:BookExportSnapshot,current:()=>boolean):Promise<BookPdfResult>;download(blob:Blob,name:string,current:()=>boolean,onDisposed:()=>void):()=>void}
export const bookPdfServices:BookPdfServices={
 async build(snapshot,current){requireBookExportCurrent(current);const module=await import('./book-pdf');requireBookExportCurrent(current);return module.buildBookPdf(snapshot,current);},
 download(blob,name,current,onDisposed){requireBookExportCurrent(current);try{return downloadBlob(blob,name,current,onDisposed);}catch(error){requireBookExportCurrent(current);throw error;}},
};
