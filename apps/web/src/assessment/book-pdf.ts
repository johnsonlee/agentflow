import{PDFDocument,rgb,type PDFPage}from'pdf-lib';
import fontkit,{type Font}from'@pdf-lib/fontkit';
import{loadBookFonts,type BookFonts}from'./book-fonts';
import{decodeBookPhoto}from'./book-image';
import{layoutBookPdf,BOOK_PDF_WIDTH,BOOK_PDF_HEIGHT,BOOK_PDF_MARGIN}from'./book-layout';
import{BOOK_EXPORT_OUTPUT_LIMIT,requireBookExportCurrent,type BookExportSnapshot,type BookPdfResult}from'./book-export';
/** Shaped-text/outline-emoji PNG fallback; original photo JPEG remains a separate XObject. */
function textRunPng(font:Font,text:string,size:number):{dataUrl:string;x:number;y:number;width:number;height:number;advance:number}{
 const run=font.layout(text),scale=size/font.unitsPerEm,density=3;let cursor=0,cursorY=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(let i=0;i<run.glyphs.length;i++){const box=run.glyphs[i].bbox,p=run.positions[i];if(run.glyphs[i].path.toSVG().length){minX=Math.min(minX,cursor+p.xOffset+box.minX);maxX=Math.max(maxX,cursor+p.xOffset+box.maxX);minY=Math.min(minY,cursorY+p.yOffset+box.minY);maxY=Math.max(maxY,cursorY+p.yOffset+box.maxY);}cursor+=p.xAdvance;cursorY+=p.yAdvance;}
 if(![minX,minY,maxX,maxY].every(Number.isFinite))throw Error('A shaped text run has no drawable export outline');const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil((maxX-minX)*scale*density)+4);canvas.height=Math.max(1,Math.ceil((maxY-minY)*scale*density)+4);
 if(canvas.width*canvas.height>16777216)throw Error('Shaped text export run exceeds its image budget');
 try{const context=canvas.getContext('2d');if(!context)throw Error('Shaped text rendering is unavailable');context.setTransform(scale*density,0,0,-scale*density,2-minX*scale*density,2+maxY*scale*density);context.fillStyle='#111';cursor=0;cursorY=0;
  for(let i=0;i<run.glyphs.length;i++){const glyph=run.glyphs[i],p=run.positions[i];if(glyph.path.toSVG().length){context.save();context.translate(cursor+p.xOffset,cursorY+p.yOffset);context.fill(new Path2D(glyph.path.toSVG()));context.restore();}cursor+=p.xAdvance;cursorY+=p.yAdvance;}
  return{dataUrl:canvas.toDataURL('image/png'),x:minX*scale-2/density,y:minY*scale-2/density,width:canvas.width/density,height:canvas.height/density,advance:cursor*scale};
 }finally{canvas.width=0;canvas.height=0;}
}
async function drawBookLine(document:PDFDocument,page:PDFPage,fonts:BookFonts,embedded:Awaited<ReturnType<PDFDocument['embedFont']>>,text:string,x:number,y:number,size:number,current:()=>boolean,budget:{used:number}):Promise<number>{
 let at=x,raster=0;for(const run of fonts.runs(text)){requireBookExportCurrent(current);if(!run.raster){page.drawText(run.text,{x:at,y,size,font:embedded,color:rgb(.07,.07,.07)});at+=fonts.width(run.text,size);}else{const image=textRunPng(run.font,run.text,size);budget.used+=Math.ceil(image.dataUrl.slice(image.dataUrl.indexOf(',')+1).length*3/4);if(budget.used>BOOK_EXPORT_OUTPUT_LIMIT)throw Error('Book PDF exceeds its image/font working-byte budget');const png=await document.embedPng(image.dataUrl);requireBookExportCurrent(current);page.drawImage(png,{x:at+image.x,y:y+image.y,width:image.width,height:image.height});at+=image.advance;raster++;}}return raster;
}
/** All inputs are detached. No Game, inventory, Portfolio, storage or journal access. */
export async function buildBookPdf(snapshot:BookExportSnapshot,current:()=>boolean):Promise<BookPdfResult>{
 const started=Date.now(),alive=()=>current()&&Date.now()-started<60000;requireBookExportCurrent(alive);const fonts=await loadBookFonts(alive);requireBookExportCurrent(alive);const layout=layoutBookPdf(snapshot,fonts),document=await PDFDocument.create();requireBookExportCurrent(alive);document.registerFontkit(fontkit);const embedded=await document.embedFont(fonts.textBytes,{subset:true});requireBookExportCurrent(alive);
 document.setTitle(snapshot.title);document.setAuthor(snapshot.author);document.setSubject(snapshot.mode==='draft'?'Unsaved Book draft snapshot':'Read-only Written Book snapshot');document.setCreator('Agentflow Craft Book export');document.setProducer('pdf-lib1.17.1; app layout, not native Minecraft output');
 const images=new Map<number,Awaited<ReturnType<PDFDocument['embedJpg']>>>(),budget={used:fonts.textBytes.length+new TextEncoder().encode(snapshot.textAttachment+fonts.notices).length};let imageBytes=0,convertedPhotos=0;
 for(const photo of snapshot.photos){const decoded=await decodeBookPhoto(photo,alive);requireBookExportCurrent(alive);imageBytes+=decoded.bytes.length;budget.used+=decoded.bytes.length;if(imageBytes>BOOK_EXPORT_OUTPUT_LIMIT||budget.used>BOOK_EXPORT_OUTPUT_LIMIT)throw Error('Book photos exceed the PDF export budget');images.set(photo.page,await document.embedJpg(decoded.bytes));requireBookExportCurrent(alive);if(decoded.converted)convertedPhotos++;}
 let rasterTextRuns=0;
 for(let i=0;i<layout.length;i++){requireBookExportCurrent(alive);const planned=layout[i],page=document.addPage([BOOK_PDF_WIDTH,BOOK_PDF_HEIGHT]);for(const line of planned.lines)rasterTextRuns+=await drawBookLine(document,page,fonts,embedded,line.text,line.x,line.y,line.size,alive,budget);
  if(planned.photo){const image=images.get(planned.photo.photo.page);if(!image)throw Error('A book photo was not prepared');page.drawImage(image,{x:planned.photo.x,y:planned.photo.y,width:planned.photo.width,height:planned.photo.height});}
  rasterTextRuns+=await drawBookLine(document,page,fonts,embedded,`Book page ${planned.logicalPage+1}/${snapshot.pages.length}${planned.continuation?' (continued)':''}  |  PDF ${i+1}/${layout.length}`,BOOK_PDF_MARGIN,BOOK_PDF_MARGIN,9,alive,budget);await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 await document.attach(new TextEncoder().encode(snapshot.textAttachment),'book-text.json',{mimeType:'application/json',description:'Exact UTF-8 Book writing and captions; app-specific attachment. Some shaped text or emoji runs are images and are not searchable text.'});requireBookExportCurrent(alive);
 await document.attach(new TextEncoder().encode(fonts.notices),'font-and-library-notices.txt',{mimeType:'text/plain',description:'Bundled font and PDF library license notices.'});requireBookExportCurrent(alive);const bytes=await document.save();requireBookExportCurrent(alive);if(bytes.length>BOOK_EXPORT_OUTPUT_LIMIT)throw Error('Book PDF exceeds the 32 MiB application export budget');
 return{blob:new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/pdf'}),pages:layout.length,logicalPages:snapshot.pages.length,rasterTextRuns,convertedPhotos};
}
