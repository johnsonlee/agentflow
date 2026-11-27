/// <reference types="vite/client" />
import fontkit,{type Font}from'@pdf-lib/fontkit';
import notices from'./fonts/THIRD-PARTY-NOTICES.txt?raw';
import{requireBookExportCurrent}from'./book-export';
import{bookGraphemes}from'./book-layout';
const sources=[{url:new URL('./fonts/NotoSansCJKhk-Regular.otf',import.meta.url).href,bytes:16427604,sha:'97c937514d645eae90415d30ba025e08a94d5bdffdc627404864f90aa0c7d83b'},{url:new URL('./fonts/NotoEmoji.ttf',import.meta.url).href,bytes:1982596,sha:'de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551'}]as const;
export interface BookFontRun{readonly text:string;readonly kind:'text'|'emoji';readonly font:Font;readonly raster:boolean}
export interface BookFonts{readonly textBytes:Uint8Array;readonly text:Font;readonly emoji:Font;readonly notices:string;runs(text:string):readonly BookFontRun[];width(text:string,size:number):number}
const cached:Array<Uint8Array|undefined>=[];
async function fontBytes(index:number,current:()=>boolean):Promise<Uint8Array>{
 requireBookExportCurrent(current);if(cached[index])return cached[index]!.slice();const source=sources[index],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000),poll=setInterval(()=>{try{requireBookExportCurrent(current);}catch{controller.abort();}},50);
 try{const response=await fetch(source.url,{signal:controller.signal,credentials:'same-origin'});requireBookExportCurrent(current);if(!response.ok)throw Error('Book font could not be loaded');const bytes=new Uint8Array(await response.arrayBuffer());requireBookExportCurrent(current);if(bytes.length!==source.bytes)throw Error('Book font size does not match its bundled version');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');requireBookExportCurrent(current);if(hash!==source.sha)throw Error('Book font does not match its bundled version');cached[index]=bytes.slice();return bytes;}finally{clearTimeout(timer);clearInterval(poll);}
}
export function createBookFonts(textBytes:Uint8Array,emojiBytes:Uint8Array):BookFonts{
 const text=fontkit.create(textBytes),variable=fontkit.create(emojiBytes),getVariation=(variable as Font&{getVariation?:(axes:Record<string,number>)=>Font}).getVariation;if(typeof getVariation!=='function')throw Error('Bundled emoji font variation support is unavailable');const emoji=getVariation.call(variable,{wght:400});
 const runs=(value:string):readonly BookFontRun[]=>{
  value=value.replace(/\t/g,'    ');
  const out:Array<{text:string;kind:'text'|'emoji';font:Font;raster:boolean}>=[];
  for(const cluster of bookGraphemes(value)){
   const kind=/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|\u20e3/u.test(cluster)?'emoji':'text',font=kind==='emoji'?emoji:text;
   const shaped=font.layout(cluster);if(!shaped.glyphs.length||shaped.glyphs.some(g=>g.id===0))throw Error('A book character is not available in the bundled export fonts. Your text is unchanged.');
   const last=out[out.length-1];if(last?.kind===kind)last.text+=cluster;else out.push({text:cluster,kind,font,raster:kind==='emoji'});
  }
  for(const run of out){const shaped=run.font.layout(run.text);if(shaped.glyphs.some(g=>g.id===0))throw Error('Book text could not be shaped safely.');run.raster=run.raster||/\p{Mark}|\u200d/u.test(run.text)||shaped.positions.some((p,i)=>p.xOffset!==0||p.yOffset!==0||p.yAdvance!==0||p.xAdvance!==shaped.glyphs[i].advanceWidth)||shaped.glyphs.some(g=>g.codePoints.length!==1);}return out;
 };
 return{textBytes,text,emoji,notices,runs,width(value,size){return runs(value).reduce((sum,run)=>sum+run.font.layout(run.text).positions.reduce((n,p)=>n+p.xAdvance,0)/run.font.unitsPerEm*size,0);}};
}
export async function loadBookFonts(current:()=>boolean):Promise<BookFonts>{const text=await fontBytes(0,current),emoji=await fontBytes(1,current);requireBookExportCurrent(current);return createBookFonts(text,emoji);}
