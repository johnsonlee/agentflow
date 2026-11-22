import {MobLootResolver} from "../src/simulation/mob-loot";
import {WorldDrops} from "../src/ownership/world-drops";
import {itemId} from "../src/catalog/items";
import {bodyBox} from "../src/simulation/physics";
import {expect,it,vi} from "vitest";
import * as THREE from "three";
import {MobManager} from "../../../apps/web/src/simulation/mobs";
import {blockId} from "../src/catalog/blocks";
import {World} from "../src/world/world";
import {NetherGenerator} from "../src/world/nether-generator";
it("disposes every real Manager view exactly once while busy without semantic receipts/removal",()=>{
 let busy=false;const scene=new THREE.Scene(),death=vi.fn(()=>true),w=new World(7,1,"nether"),m=new MobManager(w,scene,death,()=>false,()=>false,()=>busy);m.spawning=false;const mob=m.spawn("blaze",{x:.5,y:60,z:.5});let geometry=0,material=0;scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.addEventListener("dispose",()=>geometry++);for(const mat of Array.isArray(o.material)?o.material:[o.material])mat.addEventListener("dispose",()=>material++);}});
 busy=true;m.remove(mob);expect(m.mobs).toContain(mob);m.dispose();expect(scene.children).toHaveLength(0);expect(geometry).toBe(16);expect(material).toBe(16);expect(death).not.toHaveBeenCalled();expect(m.mobs).toContain(mob);m.dispose();expect(geometry).toBe(16);expect(material).toBe(16);
});
it("naturally spawns only within actual loaded Nether fortress volumes and conserves the cap",()=>{
 const w=new World(7,1,"nether"),g=w.generator as NetherGenerator,f=g.fortressAt(0,0)!;for(let cx=Math.floor((f.x-16)/16);cx<=Math.floor((f.x+16)/16);cx++)for(let cz=Math.floor((f.z-16)/16);cz<=Math.floor((f.z+16)/16);cz++)w.getChunk(cx,cz);const m=new MobManager(w,new THREE.Scene()),count=w.loadedChunkCount(),p={x:f.x+14,y:f.y+1,z:f.z};
 for(let i=0;i<40;i++)m.update(.25,p,0,i*.25,null);expect(m.mobs.length).toBeGreaterThan(0);expect(m.mobs.length).toBeLessThanOrEqual(4);expect(m.mobs.every(b=>b.kind==="blaze")).toBe(true);expect(w.loadedChunkCount()).toBe(count);m.dispose();
 const ow=new World(7),old=new MobManager(ow,new THREE.Scene());old.spawning=false;old.update(.1,{x:0,y:80,z:0},1,0,null);expect(old.mobs).toEqual([]);old.dispose();
});
it("a supported World source lease freezes Manager AI and refuses new semantic actor mutations",()=>{
 const w=new World(7,1,"nether");for(let x=-2;x<4;x++)for(let y=59;y<65;y++)for(let z=-2;z<4;z++)w.setBlock(x,y,z,0);const m=new MobManager(w,new THREE.Scene());m.spawning=false;const mob=m.spawn("blaze",{x:.5,y:60,z:.5}),before=structuredClone({p:mob.position,v:mob.velocity,s:mob.blazeState,h:mob.health});const lease=w.reserveBlockBatch([[0,59,0,blockId("stone")]])!;
 m.update(.25,{x:3,y:62,z:1},0,0);expect({p:mob.position,v:mob.velocity,s:mob.blazeState,h:mob.health}).toEqual(before);expect(m.attack(mob,1,0)).toBe(false);expect(()=>m.spawn("blaze",{x:2,y:60,z:1})).toThrow();m.remove(mob);expect(m.mobs).toContain(mob);lease.release();m.dispose();
});
it.each([NaN,1,-.1,1.1,Infinity,-Infinity])("invalid injected natural-spawn random%s cannot allocate an ID or pose",value=>{
 const w=new World(7,1,"nether"),f=(w.generator as NetherGenerator).fortressAt(0,0)!;for(let cx=Math.floor((f.x-24)/16);cx<=Math.floor((f.x+24)/16);cx++)for(let cz=Math.floor((f.z-24)/16);cz<=Math.floor((f.z+24)/16);cz++)w.getChunk(cx,cz);const m=new MobManager(w,new THREE.Scene());(m as unknown as {rand:()=>number}).rand=()=>value;m.update(.1,{x:f.x+14,y:f.y+1,z:f.z},0,0,null);expect(m.mobs).toEqual([]);expect((m as unknown as {nextId:number}).nextId).toBe(1);m.dispose();
});
it("natural-spawn RNG callbacks cannot reenter public spawn or advance the scheduler",()=>{
 const w=new World(7,1,"nether"),f=(w.generator as NetherGenerator).fortressAt(0,0)!;for(let cx=Math.floor((f.x-24)/16);cx<=Math.floor((f.x+24)/16);cx++)for(let cz=Math.floor((f.z-24)/16);cz<=Math.floor((f.z+24)/16);cz++)w.getChunk(cx,cz);const m=new MobManager(w,new THREE.Scene()),player={x:f.x+14,y:f.y+1,z:f.z};let once=false,refused=false;(m as unknown as {rand:()=>number}).rand=()=>{if(!once){once=true;try{m.spawn("blaze",{x:f.x-4,y:f.y+2,z:f.z});}catch{refused=true;}m.update(.25,player,0,0,null);}return .5;};m.update(.1,player,0,0,null);expect(refused).toBe(true);expect((m as unknown as {spawnTimer:number}).spawnTimer).toBe(2);expect(m.mobs).toHaveLength(1);m.dispose();
});
it.each([0,1])("actual fatal refusal caches credited Rod outcome%s through cold restore without reroll",roll=>{
 const w=new World(7,1,"nether"),drops=new WorldDrops(w);let calls=0;const loot=new MobLootResolver(()=>{calls++;return roll;}),scene=new THREE.Scene(),first=new MobManager(w,scene,(mob,cause)=>loot.tryDrop(mob,()=>null,mob.position,cause==="player"||cause==="agent"?cause:"environment"));const actor=first.spawn("blaze",{x:.5,y:60,z:.5});expect(first.attack(actor,20,0)).toBe(false);expect(actor.health).toBe(1);expect(calls).toBe(1);expect(drops.records).toEqual([]);
 const saved=first.exportState(loot);expect(saved.records[0].pendingLoot).toEqual(roll?[{id:itemId("blaze_rod"),count:1}]:[]);first.dispose();let coldCalls=0;const coldLoot=new MobLootResolver(()=>{coldCalls++;return 1-roll;}),cold=new MobManager(w,new THREE.Scene(),(mob,cause)=>coldLoot.tryDrop(mob,(stacks,at)=>drops.planSpawnBatch(stacks,at),mob.position,cause==="player"||cause==="agent"?cause:"environment"));cold.restore(saved,coldLoot);const loaded=cold.mobs[0];expect(cold.attack(loaded,5,0)).toBe(true);expect(coldCalls).toBe(0);expect(cold.mobs).toEqual([]);expect(drops.records.map(r=>r.stack)).toEqual(roll?[{id:itemId("blaze_rod"),count:1}]:[]);expect(cold.attack(loaded,5,0)).toBe(false);expect(drops.records).toHaveLength(roll);cold.dispose();
});
it("projectiles originate from real loaded Blaze AI and drain into one player impact batch",()=>{
 const w=new World(7,1,"nether");for(let x=-2;x<14;x++)for(let y=58;y<66;y++)for(let z=-2;z<4;z++)w.setBlock(x,y,z,0);const m=new MobManager(w,new THREE.Scene());m.spawning=false;const actor=m.spawn("blaze",{x:.5,y:60,z:.5}),target={x:8,y:60,z:.5};m.update(1,target,0,1,target);m.update(1,target,0,2,target);expect(m.exportFireballs().records).toHaveLength(1);expect(actor.blazeState?.attackSeconds).toBe(2);m.updateFireballs(1,bodyBox(target));const hits=m.drainFireballImpacts();expect(hits).toHaveLength(1);expect(hits[0]).toMatchObject({kind:"player",damage:3,originMobId:actor.id});expect(m.exportFireballs().records).toEqual([]);expect(m.drainFireballImpacts()).toEqual([]);m.dispose();
});

it("original Blaze anatomy remains readable in the dark and cleanup continues after one disposer throws",()=>{
 const w=new World(7,1,"nether");for(let x=-2;x<4;x++)for(let y=58;y<65;y++)for(let z=-2;z<4;z++)w.setBlock(x,y,z,0);const scene=new THREE.Scene(),m=new MobManager(w,scene);m.spawning=false;m.spawn("blaze",{x:.5,y:60,z:.5});m.update(.1,{x:0,y:60,z:0},0,0,null);const meshes:THREE.Mesh[]=[];scene.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});expect(meshes).toHaveLength(16);expect(meshes.filter(o=>typeof o.userData.blazeRod==="number")).toHaveLength(12);expect(new Set(meshes.map(o=>(o.material as THREE.MeshBasicMaterial).color.getHex())).size).toBeGreaterThan(2);
 let material=0;for(const mesh of meshes)(mesh.material as THREE.Material).addEventListener("dispose",()=>material++);meshes[0].geometry.addEventListener("dispose",()=>{throw Error("one geometry disposer failed");});expect(()=>m.dispose()).toThrow();expect(material).toBe(16);expect(scene.children).toEqual([]);expect(()=>m.dispose()).not.toThrow();expect(material).toBe(16);
});
it("busy Manager retirement releases the projectile view while preserving its semantic owner",()=>{
 const w=new World(7,1,"nether"),scene=new THREE.Scene();let busy=false;const m=new MobManager(w,scene,()=>true,()=>false,()=>false,()=>busy);expect(m.restoreFireballs({version:1,nextKey:2,records:[{key:1,originMobId:91,position:{x:.5,y:60.8,z:.5},velocity:{x:8,y:0,z:0},ageSeconds:0}]})).toBe(true);m.updateFireballs(.1,null);const before=m.exportFireballs();expect(scene.children).toHaveLength(1);busy=true;m.dispose();expect(scene.children).toEqual([]);expect(m.exportFireballs()).toEqual(before);m.dispose();expect(m.exportFireballs()).toEqual(before);
});
