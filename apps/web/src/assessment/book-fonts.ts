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

/** Full CID-CFF program only: no charset, FDSelect, dictionary or subroutine rewriting.
 * PDF 1.5 table5.23 permits raw CIDFont CFF as FontFile3/CIDFontType0C.
 * The adapter targets pinned pdf-lib1.17.1/@pdf-lib/fontkit1.1.1 Fontkit contract.
 * It supplies original SFNT metrics/outlines with the verified raw CFF identity program.
 * Actual standard-reader validation remains required; this is not native font parity.
 */
export function bookCffProgram(sfnt:Uint8Array):Uint8Array{
 const fail=():never=>{throw Error('Bundled Book font cannot be embedded without changing its CID mapping.');};
 const u16=(b:Uint8Array,p:number)=>{if(p<0||p+2>b.length)fail();return b[p]*256+b[p+1];};
 const u32=(b:Uint8Array,p:number)=>{if(p<0||p+4>b.length)fail();return new DataView(b.buffer,b.byteOffset+p,4).getUint32(0);};
 if(sfnt.length<12||String.fromCharCode(...sfnt.subarray(0,4))!=='OTTO')fail();const tables=u16(sfnt,4);if(tables<1||tables>128||12+16*tables>sfnt.length)fail();let program:Uint8Array|undefined;
 for(let i=0;i<tables;i++){const p=12+16*i,offset=u32(sfnt,p+8),length=u32(sfnt,p+12);if(offset>sfnt.length||length>sfnt.length-offset)fail();const tag=String.fromCharCode(...sfnt.subarray(p,p+4));if(tag==='CFF2')fail();if(tag==='CFF '){if(program)fail();program=sfnt.subarray(offset,offset+length);}}
 if(!program||program.length<4||program[0]!==1||program[2]<4||program[2]>=program.length)return fail();const b=program;
 const index=(at:number)=>{const count=u16(b,at);at+=2;if(count===0)return{items:[]as Uint8Array[],end:at};if(at>=b.length)fail();const size=b[at++];if(size<1||size>4||at+(count+1)*size>b.length)fail();const offset=(n:number)=>{let value=0;for(let i=0;i<size;i++)value=value*256+b[at+n*size+i];return value;},base=at+(count+1)*size,items:Uint8Array[]=[];if(offset(0)!==1)fail();for(let i=0;i<count;i++){const first=offset(i),last=offset(i+1);if(first>last||last<1||base+last-1>b.length)fail();items.push(b.subarray(base+first-1,base+last-1));}return{items,end:base+offset(count)-1};};
 const names=index(b[2]),top=index(names.end),strings=index(top.end);if(names.items.length!==1||top.items.length!==1)fail();const dict=new Map<string,number[]>(),data=top.items[0];let values:number[]=[],at=0;
 while(at<data.length){const op=data[at++];if(op>=32&&op<=246)values.push(op-139);else if(op>=247&&op<=254){if(at>=data.length)fail();values.push(op<=250?(op-247)*256+data[at++]+108:-(op-251)*256-data[at++]-108);}else if(op===28){if(at+2>data.length)fail();values.push(new DataView(data.buffer,data.byteOffset+at,2).getInt16(0));at+=2;}else if(op===29){if(at+4>data.length)fail();values.push(new DataView(data.buffer,data.byteOffset+at,4).getInt32(0));at+=4;}else if(op===30){let end=false;while(!end){if(at>=data.length)fail();const n=data[at++];end=(n>>4)===15||(n&15)===15;}values.push(Number.NaN);}else{let key=String(op);if(op===12){if(at>=data.length)fail();key+=' '+data[at++];}if(dict.has(key))fail();dict.set(key,values);values=[];}}
 if(values.length||!dict.has('12 30')||!dict.has('12 36')||!dict.has('12 37'))fail();const ros=dict.get('12 30')!;const sid=(n:number)=>{if(!Number.isSafeInteger(n)||n<391||n-391>=strings.items.length)fail();return String.fromCharCode(...strings.items[n-391]);};if(ros.length!==3||sid(ros[0])!=='Adobe'||sid(ros[1])!=='Identity'||ros[2]!==0)fail();const single=(key:string)=>{const v=dict.get(key);if(!v||v.length!==1||!Number.isSafeInteger(v[0])||v[0]<0||v[0]>=b.length)return fail();return v[0];};
 const glyphs=index(single('17')).items.length;if(glyphs<1||glyphs>65535)fail();at=single('15');if(at<=2)fail();const format=b[at++];let gid=1;
 // CID0 is implicit .notdef. Require EVERY original CID==GID, not only current text.
 if(format===0){while(gid<glyphs){if(u16(b,at)!==gid++)fail();at+=2;}}else if(format===1||format===2){while(gid<glyphs){const first=u16(b,at);at+=2;if(at>=b.length)fail();const left=format===1?b[at++]:u16(b,at);if(format===2)at+=2;if(first!==gid||gid+left>=glyphs)fail();gid+=left+1;}}else fail();
 return b;
}
export function bookFullFontEmbedding(fonts:Pick<BookFonts,'textBytes'|'text'>):{program:Uint8Array;adapter:typeof fontkit;subset:false}{
 const program=bookCffProgram(fonts.textBytes),full:Font=Object.create(fonts.text);
 // cff is the pinned pdf-lib Fontkit Font interface discriminator, absent at runtime
 // on the original OTF host. Do not alter its stream, tables, caches or glyph objects.
 Object.defineProperty(full,'cff',{value:true});
 const adapter:typeof fontkit={...fontkit,create:(data:Uint8Array)=>{if(data.length!==program.length||data.some((value,i)=>value!==program[i]))throw Error('Unexpected Book font adapter input.');return full;}};
 return{program,adapter,subset:false};
}
