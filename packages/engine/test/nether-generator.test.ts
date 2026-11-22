import {expect,it} from "vitest";
import {createHash} from "node:crypto";
import {NetherGenerator} from "../src/world/nether-generator";
import {TerrainGenerator} from "../src/world/generator";
import {blockId} from "../src/catalog/blocks";
import {WORLD_HEIGHT} from "../src/world/chunk";
import baseline from "./fixtures/nether-7c-baseline.json";
const hash=(values:Uint16Array)=>{const bytes=new Uint8Array(values.length*2),v=new DataView(bytes.buffer);values.forEach((n,i)=>v.setUint16(i*2,n,true));return createHash("sha256").update(bytes).digest("hex");};
it("retains exact independently captured clean7c version2 outputs across23 seed/edge/basin chunks",()=>{
 for(const c of baseline.chunks)expect(hash(new TerrainGenerator(c.seed,2).generate(c.cx,c.cz).blocks)).toBe(c.blocksSHA256);
});
it("generates seed-dependent roofed caves without Overworld vegetation or Water",()=>{
 const a=new NetherGenerator(12345),b=new NetherGenerator(-2147483648);expect(hash(a.generate(-1,-1).blocks)).not.toBe(hash(b.generate(-1,-1).blocks));
 for(const g of [a,b]){const c=g.generate(-1,-1);for(const id of c.blocks)expect([0,blockId("bedrock"),190,194,195,196,200,blockId("glowstone")]).toContain(id);}
 expect(WORLD_HEIGHT).toBe(96);
});
it("agrees at negative and positive chunk seams with its exact-coordinate probe in either loading order",()=>{
 const g=new NetherGenerator(7),coords=[[-1,-1],[0,-1],[-1,0],[0,0],[15,15],[16,15],[-16,-16],[-17,-16]];
 const before=coords.map(([x,z])=>hash(g.generate(x,z).blocks));
 for(const [cx,cz] of [...coords].reverse()){const c=g.generate(cx,cz);for(const x of [0,15])for(const z of [0,15])for(let y=0;y<96;y++)expect(c.get(x,y,z)).toBe(g.blockAt(cx*16+x,y,cz*16+z));}
 expect(coords.map(([x,z])=>hash(g.generate(x,z).blocks))).toEqual(before);
});
it("materializes a real fortress with owned-source Wart bed and detached future Blaze volume",()=>{
 const g=new NetherGenerator(12345),f=g.fortressAt(0,0)!;expect(Object.isFrozen(f)).toBe(true);expect(Object.isFrozen(f.wartBed)).toBe(true);expect(Object.isFrozen(f.blazeVolume)).toBe(true);
 for(let x=0;x<3;x++)for(let z=0;z<3;z++){expect(g.blockAt(f.wartBed.x+x,f.y,f.wartBed.z+z)).toBe(195);expect(g.blockAt(f.wartBed.x+x,f.y+1,f.wartBed.z+z)).toBe(200);}
 expect(g.blockAt(f.x,f.y,f.z)).toBe(196);expect(g.blockAt(f.x,f.y+1,f.z)).toBe(0);expect(g.blockAt(f.x,f.y+6,f.z)).toBe(196);
 for(let x=f.minX;x<=f.maxX;x++){expect(g.blockAt(x,f.y,f.z)).toBe(196);}
 expect(g.fortressAt(255,255)).toEqual(f);expect(g.fortressAt(-1,-1)?.x).toBeLessThan(0);
});
it("natural spawn describes dry two-cell headroom with full support and never invents a platform",()=>{
 const g=new NetherGenerator(12345),p=g.findNaturalSpawn(0,0,32)!;expect(p).not.toBeNull();expect(Object.isFrozen(p)).toBe(true);const x=Math.floor(p.x),z=Math.floor(p.z);
 expect([194,196,blockId("glowstone")]).toContain(g.blockAt(x,p.y-1,z));expect(g.blockAt(x,p.y,z)).toBe(0);expect(g.blockAt(x,p.y+1,z)).toBe(0);
 expect(g.findNaturalSpawn(NaN,0)).toBeNull();expect(g.findNaturalSpawn(0,0,129)).toBeNull();
});
it("rejects unknown versions and out-of-bounds chunks while retaining valid positive/negative border cells",()=>{
 expect(()=>new NetherGenerator(1,2 as 1)).toThrow();const g=new NetherGenerator(0);
 for(const cx of [-1875000,1874999])expect(g.generate(cx,0).blocks.length).toBe(24576);
 for(const cx of [1875001,-1875001,Infinity,.5])expect(()=>g.generate(cx,0)).toThrow();
 expect(g.fortressAt(Infinity,0)).toBeNull();expect(g.blockAt(30000001,2,0)).toBe(0);
});
it("supports the inclusive positive world-border column in a partially intersecting chunk",()=>{
 const g=new NetherGenerator(0),c=g.generate(1875000,0);expect(c.get(0,0,0)).toBe(blockId("bedrock"));expect(c.get(0,95,0)).toBe(blockId("bedrock"));
 for(let x=1;x<16;x++)for(let y=0;y<96;y++)expect(c.get(x,y,0)).toBe(0);
});
