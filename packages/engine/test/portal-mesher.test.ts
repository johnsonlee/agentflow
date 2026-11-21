import { expect,it } from "vitest";
import { Chunk } from "../src/world/chunk";
import type { World } from "../src/world/world";
import { meshChunk } from "../src/rendering/mesher";
function empty(){const chunks=new Map<string,Chunk>();return{getChunk(cx:number,cz:number){const key=`${cx},${cz}`;let c=chunks.get(key);if(!c){c=new Chunk(cx,cz);chunks.set(key,c);}return c;}}as unknown as World;}
it.each([[192,2],[193,0]]as const)("renders hidden portal orientation%s as an actual double-sided center plane",(id,axis)=>{
 const world=empty();world.getChunk(0,0).set(3,70,4,id);const seen:string[]=[];const mesh=meshChunk(world,0,0,name=>{seen.push(name);return[.1,.2,.3,.4];});
 expect(mesh.solid.indices).toHaveLength(0);expect(mesh.liquid.indices).toHaveLength(0);expect(mesh.translucent.indices).toHaveLength(12);expect(mesh.translucent.positions).toHaveLength(24);
 const positions=mesh.translucent.positions;for(let i=axis;i<positions.length;i+=3)expect(positions[i]).toBe(axis===2?4.5:3.5);
 const normals=mesh.translucent.normals;expect(new Set(Array.from(normals).filter((_,i)=>i%3===axis))).toEqual(new Set([-1,1]));expect(mesh.translucent.colors.every(value=>value===1)).toBe(true);expect(seen).toEqual(["nether_portal","nether_portal"]);
});
it.each([192,193])("keeps adjoining portal%s interior cells visible without opaque cube caps",id=>{
 const world=empty(),chunk=world.getChunk(0,0);chunk.set(3,70,4,id);chunk.set(3,71,4,id);const mesh=meshChunk(world,0,0,()=>[0,0,1,1]);
 expect(mesh.translucent.indices).toHaveLength(24);expect(mesh.translucent.positions).toHaveLength(48);expect(mesh.solid.indices).toHaveLength(0);expect(mesh.liquid.indices).toHaveLength(0);
});
