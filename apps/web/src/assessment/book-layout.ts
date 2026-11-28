import{BOOK_EXPORT_PAGE_LIMIT,type BookExportSnapshot,type BookExportPhoto}from'./book-export';
export const BOOK_PDF_WIDTH=595.28,BOOK_PDF_HEIGHT=841.89,BOOK_PDF_MARGIN=36,BOOK_PDF_TEXT_SIZE=12,BOOK_PDF_LINE_HEIGHT=18;
export interface BookTextLine{readonly text:string;readonly x:number;readonly y:number;readonly size:number}
export interface BookPhotoPlacement{readonly photo:BookExportPhoto;readonly x:number;readonly y:number;readonly width:number;readonly height:number}
export interface BookPdfPage{readonly logicalPage:number;readonly continuation:number;readonly lines:readonly BookTextLine[];readonly photo?:BookPhotoPlacement}
export interface BookTextMetrics{width(text:string,size:number):number}
export function bookGraphemes(text:string):string[]{
 if(typeof Intl.Segmenter!=='function')throw Error('This browser cannot safely wrap Unicode book text.');return Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),p=>p.segment);
}
export function wrapBookText(text:string,width:number,size:number,metrics:BookTextMetrics):string[]{
 const out:string[]=[];for(const paragraph of text.split(/\r\n|\r|\n/)){let line='';for(const cluster of bookGraphemes(paragraph)){const measured=metrics.width(cluster,size);if(!Number.isFinite(measured)||measured<0||measured>width)throw Error('A book character cannot fit safely in the export.');if(line&&metrics.width(line+cluster,size)>width){out.push(line);line='';}line+=cluster;}out.push(line);}return out;
}
/** Readable app layout, not native parchment/page geometry. Logical empty pages are retained. */
export function layoutBookPdf(snapshot:BookExportSnapshot,metrics:BookTextMetrics):readonly BookPdfPage[]{
 const pages:BookPdfPage[]=[],width=BOOK_PDF_WIDTH-BOOK_PDF_MARGIN*2,bottom=BOOK_PDF_MARGIN+22;
 for(let logical=0;logical<snapshot.pages.length;logical++){
  let continuation=0,lines:BookTextLine[]=[],photo:BookPhotoPlacement|undefined,y=BOOK_PDF_HEIGHT-BOOK_PDF_MARGIN-16;
  const flush=()=>{pages.push({logicalPage:logical,continuation,lines,photo});if(pages.length>BOOK_EXPORT_PAGE_LIMIT)throw Error('Book exceeds the PDF export layout budget.');continuation++;lines=[];photo=undefined;y=BOOK_PDF_HEIGHT-BOOK_PDF_MARGIN-16;};
  const add=(text:string,size:number,height:number)=>{for(const line of wrapBookText(text,width,size,metrics)){if(y-height<bottom)flush();lines.push({text:line,x:BOOK_PDF_MARGIN,y,size});y-=height;}};
  add(snapshot.title,14,20);if(snapshot.author)add(snapshot.author,10,15);y-=8;
  const image=snapshot.photos.find(p=>p.page===logical);if(image){const scale=Math.min(width/image.width,300/image.height,1),w=image.width*scale,h=image.height*scale;if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Invalid book photo layout');if(y-h<bottom)flush();photo={photo:image,x:(BOOK_PDF_WIDTH-w)/2,y:y-h,width:w,height:h};y-=h+16;if(image.caption)add(image.caption,10,15);y-=6;}
  add(snapshot.pages[logical],BOOK_PDF_TEXT_SIZE,BOOK_PDF_LINE_HEIGHT);flush();
 }
 return pages;
}
