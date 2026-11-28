import {expect,it} from "vitest";
import {World} from "../src/world/world";
import {bodyBox} from "../src/simulation/physics";
import {BlazeFireballs,sanitizeBlazeFireballs} from "../src/simulation/blaze-fireballs";
import {blockId} from "../src/catalog/blocks";
function world(){const w=new World(7,1,"nether");for(let x=0;x<48;x++)for(let y=59;y<63;y++)for(let z=0;z<2;z++)w.setBlock(x,y,z,0);return w;}
const p={x:.5,y:60.8,z:.5},d={x:1,y:0,z:0};
it("stops a swept shot at a real solid wall before an occluded player",()=>{
 const w=world();w.setBlock(2,60,0,blockId("stone"));const f=new BlazeFireballs(w);expect(f.trySpawn(91,p,d)).toBe(true);f.update(1,bodyBox({x:4,y:60,z:.5}));expect(()=>f.exportState()).toThrow();const hits=f.drainImpacts();expect(hits).toHaveLength(1);expect(hits[0].kind).toBe("block");expect(hits[0].position.x).toBeCloseTo(1.88,6);expect(f.exportState().records).toEqual([]);expect(f.drainImpacts()).toEqual([]);
});
it("unloaded flight pauses its pose and age without loading, then resumes the same owner",()=>{
 const w=world(),f=new BlazeFireballs(w);expect(f.trySpawn(91,p,d)).toBe(true);const before=f.exportState();w.unloadChunk(0,0);const count=w.loadedChunkCount();f.update(.25,null);expect(f.exportState()).toEqual(before);expect(w.loadedChunkCount()).toBe(count);w.getChunk(0,0);f.update(.25,null);expect(f.exportState().records[0].position.x).toBeCloseTo(2.5,6);expect(f.exportState().records[0].ageSeconds).toBeCloseTo(.25,6);
});
it("a real World source lease freezes projectile time and rejects a new owner",()=>{
 const w=world(),f=new BlazeFireballs(w);f.trySpawn(91,p,d);const before=f.exportState(),lease=w.reserveBlockBatch([[0,60,0,blockId("stone")]])!;expect(lease).not.toBeNull();f.update(.25,null);expect(f.trySpawn(92,p,d)).toBe(false);expect(f.records).toEqual(before.records);expect(()=>f.exportState()).toThrow();lease.release();expect(f.exportState()).toEqual(before);
});
it("cold state preserves a historical origin label even without that originating actor",()=>{
 const w=world(),f=new BlazeFireballs(w);f.trySpawn(999,p,d);f.update(.25,null);const raw=f.exportState(),cold=new BlazeFireballs(w,raw);expect(cold.loadIssues).toBe(0);expect(cold.exportState()).toEqual(raw);raw.records[0].position.x=40;expect(cold.records[0].position.x).toBeCloseTo(2.5,6);
});
it("strictly refuses malformed known projectile ownership without reading getters",()=>{
 const w=world(),f=new BlazeFireballs(w);f.trySpawn(9,p,d);const base=f.exportState();let reads=0;const getter={version:1,nextKey:2,get records(){reads++;return [];}},extra=structuredClone(base);Object.assign(extra.records,{"00":{id:841,count:99}});
 for(const bad of [null,{...base,version:2},{...base,nextKey:1},{...base,records:[base.records[0],base.records[0]]},{...base,records:[{...base.records[0],originMobId:0}]},{...base,records:[{...base.records[0],ageSeconds:5}]},{...base,records:[{...base.records[0],velocity:{x:9,y:0,z:0}}]},getter,extra])expect(sanitizeBlazeFireballs(bad).invalid).toBe(true);expect(reads).toBe(0);
});
it("refuses reentrant spawn input callbacks before any owner ACK",()=>{
 const w=world(),f=new BlazeFireballs(w);let once=false,nested:boolean|undefined;const input=new Proxy({...p},{getOwnPropertyDescriptor(t,k){if(!once){once=true;nested=f.trySpawn(92,{x:8.5,y:60.8,z:.5},d);}return Reflect.getOwnPropertyDescriptor(t,k);}});expect(f.trySpawn(91,input,d)).toBe(true);expect(nested).toBe(false);expect(f.records).toHaveLength(1);
});
it("a reentrant target-box validation cannot advance the clock twice",()=>{
 const w=world(),f=new BlazeFireballs(w);f.trySpawn(91,p,d);let once=false;const target=new Proxy(bodyBox({x:40,y:60,z:.5}),{ownKeys(t){if(!once){once=true;f.update(.25,null);}return Reflect.ownKeys(t);}});f.update(.25,target);expect(f.records[0].ageSeconds).toBeCloseTo(.25,8);expect(f.records[0].position.x).toBeCloseTo(2.5,8);
});
it("a reentrant restore cannot overwrite an ACKed new projectile",()=>{
 const w=world(),f=new BlazeFireballs(w);let once=false,nested:boolean|undefined;const raw=new Proxy({version:1,nextKey:1,records:[]},{ownKeys(t){if(!once){once=true;nested=f.trySpawn(91,p,d);}return Reflect.ownKeys(t);}});expect(f.restore(raw)).toBe(true);expect(nested).toBe(false);expect(f.records).toEqual([]);
});
it("keeps the capacity/counter bounded and expires only after actual loaded time",()=>{
 const w=world(),f=new BlazeFireballs(w);for(let i=0;i<64;i++)expect(f.trySpawn(i+1,p,d)).toBe(true);expect(f.trySpawn(65,p,d)).toBe(false);expect(f.exportState().nextKey).toBe(65);
 const one=new BlazeFireballs(w);one.trySpawn(1,p,d);for(let i=0;i<20;i++)one.update(.25,null);expect(one.records).toEqual([]);expect(one.drainImpacts()).toEqual([]);
});
it.each([-1,1])("outward radius at world border%s terminates instead of treating outside as an unloaded chunk",sign=>{
 const w=new World(7,1,"nether"),edge=sign*30000000;for(let dx=0;dx<4;dx++)for(let y=59;y<63;y++)for(let z=0;z<2;z++)w.setBlock(edge-sign*dx,y,z,0);const f=new BlazeFireballs(w);expect(f.trySpawn(1,{x:edge-sign*.5,y:60.8,z:.5},{x:sign,y:0,z:0})).toBe(true);f.update(1,null);f.drainImpacts();expect(f.records).toEqual([]);
});
