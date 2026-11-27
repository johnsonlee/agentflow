/** Local ZIP32 stored entries (PKWARE APPNOTE6.3.10). No compression/service/dependency. */
export const ZIP_BYTE_LIMIT=32*1024*1024;
export interface ZipEntry{readonly name:string;readonly bytes:Uint8Array}
export function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
export function storedZip(entries:readonly ZipEntry[]):Uint8Array{
 if(!entries.length||entries.length>65535)throw Error('Invalid ZIP file count');const seen=new Set<string>(),encoder=new TextEncoder(),parts:Array<{name:Uint8Array;data:Uint8Array;crc:number;offset:number}>=[];let offset=0,centralBytes=0;
 for(const e of entries){if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(e.name)||seen.has(e.name)||!(e.bytes instanceof Uint8Array))throw Error('Unsafe or duplicate ZIP filename');seen.add(e.name);const name=encoder.encode(e.name);if(name.length>65535)throw Error('ZIP filename too long');if(offset+centralBytes+30+46+name.length*2+e.bytes.length+22>ZIP_BYTE_LIMIT)throw Error('Portfolio archive exceeds32MiB export limit');const data=e.bytes.slice();parts.push({name,data,crc:crc32(data),offset});offset+=30+name.length+data.length;centralBytes+=46+name.length;}
 const bytes=new Uint8Array(offset+centralBytes+22),view=new DataView(bytes.buffer);let at=0;
 const u16=(n:number)=>{view.setUint16(at,n,true);at+=2;},u32=(n:number)=>{view.setUint32(at,n,true);at+=4;},put=(data:Uint8Array)=>{bytes.set(data,at);at+=data.length;};
 for(const p of parts){u32(0x04034b50);u16(20);u16(0x800);u16(0);u16(0);u16(0x21);u32(p.crc);u32(p.data.length);u32(p.data.length);u16(p.name.length);u16(0);put(p.name);put(p.data);}
 const directory=at;
 for(const p of parts){u32(0x02014b50);u16(20);u16(20);u16(0x800);u16(0);u16(0);u16(0x21);u32(p.crc);u32(p.data.length);u32(p.data.length);u16(p.name.length);u16(0);u16(0);u16(0);u16(0);u32(0);u32(p.offset);put(p.name);}
 u32(0x06054b50);u16(0);u16(0);u16(parts.length);u16(parts.length);u32(centralBytes);u32(directory);u16(0);return bytes;
}
