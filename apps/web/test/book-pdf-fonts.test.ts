import{it,expect}from'vitest';
import{readFileSync}from'node:fs';
import{createBookFonts,bookCffProgram,bookFullFontEmbedding}from'../src/assessment/book-fonts';
const text=new Uint8Array(readFileSync(new URL('../src/assessment/fonts/NotoSansCJKhk-Regular.otf',import.meta.url))),emoji=new Uint8Array(readFileSync(new URL('../src/assessment/fonts/NotoEmoji.ttf',import.meta.url)));
it('actual pinned font parser supports required CJK and complete emoji clusters; not a PDF visual assertion',()=>{const fonts=createBookFonts(text,emoji);for(const value of['Latin café Ω','世界 中文 繁體 日本語 한글','😀','❤️','👩‍🔬','👨‍👩‍👧‍👦','🏳️‍🌈','👍🏽','🇰🇷','1️⃣','é']){const runs=fonts.runs(value);expect(runs.map(r=>r.text).join('')).toBe(value);expect(fonts.width(value,12)).toBeGreaterThan(0);expect(runs.every(r=>r.font.layout(r.text).glyphs.every(g=>g.id!==0))).toBe(true);}expect(fonts.runs('👩‍🔬')[0].font.layout('👩‍🔬').glyphs).toHaveLength(1);expect(fonts.runs('é').some(r=>r.raster)).toBe(true);expect(fonts.runs('世界').every(r=>!r.raster)).toBe(true);});
it('missing glyphs fail instead of painting tofu or dropping unsupported text',()=>{const fonts=createBookFonts(text,emoji);expect(()=>fonts.runs(String.fromCodePoint(0x10ffff))).toThrow(/character|shaped/);});

it('preserves complete real CID-CFF program and original returning font-dictionary glyphs; no PDF output',()=>{
 const fonts=createBookFonts(text,emoji),before=text.slice(),full=bookFullFontEmbedding(fonts),view=new DataView(text.buffer,text.byteOffset,text.byteLength),count=view.getUint16(4);let original:Uint8Array|undefined;
 for(let i=0;i<count;i++){const p=12+16*i;if(String.fromCharCode(...text.subarray(p,p+4))==='CFF '){const offset=view.getUint32(p+8),length=view.getUint32(p+12);original=text.subarray(offset,offset+length);}}
 expect(original).toBeDefined();expect(Buffer.from(full.program).equals(Buffer.from(original!))).toBe(true);expect(full.subset).toBe(false);const admitted=full.adapter.create(full.program);expect(admitted.cff).toBe(true);expect(fonts.text.cff).not.toBe(true);
 const sequence='相片 사진 写真 한글';expect(admitted.layout(sequence).glyphs.map(g=>g.id)).toEqual(fonts.text.layout(sequence).glyphs.map(g=>g.id));
 // This real 12->11->12 returning-FD sequence was corrupted by the old subsetter.
 // Compare actual complete glyph outline programs, not only nonzero glyph IDs/options.
 for(const cp of['相','片','사','진','写','真','한','글']){const actual=admitted.glyphForCodePoint(cp.codePointAt(0)!);expect(actual.path.toSVG()).toBe(fonts.text.glyphForCodePoint(cp.codePointAt(0)!).path.toSVG());expect(actual.path.toSVG().length).toBeGreaterThan(0);}
 expect(Buffer.from(text).equals(Buffer.from(before))).toBe(true);const changed=full.program.slice();changed[changed.length-1]^=1;expect(()=>full.adapter.create(changed)).toThrow(/Unexpected/);
});
it('rejects malformed font containers instead of falling back to a subset or mismatched font',()=>{
 for(const fault of['signature','directory','CFF2','duplicate','out-of-range','CFF-header']as const){const copy=text.slice(),v=new DataView(copy.buffer),count=v.getUint16(4);let table=-1;for(let i=0;i<count;i++){const p=12+16*i;if(String.fromCharCode(...copy.subarray(p,p+4))==='CFF ')table=p;}expect(table).toBeGreaterThan(0);
  if(fault==='signature')copy[0]=0;if(fault==='directory')v.setUint16(4,65535);if(fault==='CFF2')copy[table+3]=50;if(fault==='duplicate'){copy.set(copy.subarray(table,table+16),12+(table===12?16:0));}if(fault==='out-of-range')v.setUint32(table+8,copy.length);if(fault==='CFF-header')copy[v.getUint32(table+8)]=2;
  expect(()=>bookCffProgram(copy),fault).toThrow(/CID mapping/);
 }
});
it('rejects changed real complete-font CID numbering instead of encoding original GIDs against different CIDs',()=>{
 const raw=bookCffProgram(text);expect(raw.length).toBe(15458582);expect(Array.from(raw.subarray(13865,13870))).toEqual([2,0,1,255,253]);
 for(const delta of['nonidentity','exceeds-glyph-count']as const){const copy=text.slice(),program=bookCffProgram(copy);if(delta==='nonidentity')program[13867]=2;else program[13869]=254;expect(()=>bookCffProgram(copy),delta).toThrow(/CID mapping/);}
});
