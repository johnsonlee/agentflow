import { it, expect } from "vitest";
import { World } from "../src/world/world";
import { TerrainGenerator, SEA_LEVEL } from "../src/world/generator";
import { hash3 } from "../src/core/random";
import { Inventory } from "../src/ownership/inventory";
import { blockId } from "../src/catalog/blocks";
import { stackId } from "../src/catalog/items";
import { tryUseFluidBucket } from "../src/simulation/fluids";

const hit={x:1,y:80,z:1,normal:{x:0,y:1,z:0}};
it("collects a real source into the last selected empty vessel even with every other slot full",()=>{
 const world=new World(12345),bag=new Inventory();world.setBlock(1,79,1,blockId("stone"));world.setBlock(1,80,1,blockId("water"));
 bag.slots.fill(null);for(let i=0;i<36;i++)bag.slots[i]={id:blockId("cobblestone"),count:64};bag.slots[0]={id:stackId("bucket"),count:1};
 expect(tryUseFluidBucket(world,bag,"survival",hit)).toEqual({ok:true,action:"collect",fluid:"water"});
 expect(world.getBlock(1,80,1)).toBe(0);expect(bag.slots[0]).toEqual({id:stackId("water_bucket"),count:1});
 expect(tryUseFluidBucket(world,bag,"survival",{...hit,y:79})).toEqual({ok:true,action:"place",fluid:"water"});
 expect(world.getBlock(1,80,1)).toBe(blockId("water"));expect(bag.slots[0]).toEqual({id:stackId("bucket"),count:1});
});
it("refuses stacked-vessel collection when the full-bucket receiver has no capacity",()=>{
 const world=new World(12345),bag=new Inventory();world.setBlock(1,79,1,blockId("stone"));world.setBlock(1,80,1,blockId("water"));
 for(let i=0;i<36;i++)bag.slots[i]={id:blockId("cobblestone"),count:64};bag.slots[0]={id:stackId("bucket"),count:2};const before=bag.toJSON(),edits=world.exportEdits();
 expect(tryUseFluidBucket(world,bag,"survival",hit)).toEqual({ok:false,reason:"no-room"});expect(bag.toJSON()).toEqual(before);expect(world.exportEdits()).toEqual(edits);
});
it("generates finite natural Lava only in explicit generator v2 without changing legacy v1",()=>{
 const seed=12345,old=new TerrainGenerator(seed),next=new TerrainGenerator(seed,2);let site:{x:number;y:number;z:number}|null=null;
 for(let gx=-30;gx<=30&&!site;gx++)for(let gz=-30;gz<=30&&!site;gz++){const x=gx*32+16,z=gz*32+16,y=old.heightAt(x,z);if(y>SEA_LEVEL+2&&hash3(seed^0x4c415641,x,0,z)<.02)site={x,y,z};}
 expect(site).not.toBeNull();const p=site!,cx=Math.floor(p.x/16),cz=Math.floor(p.z/16),at=(g:TerrainGenerator)=>g.generate(cx,cz).get(((p.x%16)+16)%16,p.y-1,((p.z%16)+16)%16);
 expect(at(next)).toBe(blockId("lava"));expect(at(old)).not.toBe(blockId("lava"));
});

import { FluidSystem, isFluidActionBusy, sanitizeFluidState } from "../src/simulation/fluids";
import { igniteFire } from "../src/simulation/fire";
import { parseSave as deserializeSave, serializeSave } from "../src/persistence/save";
import { blockDrops } from "../src/simulation/farming";
import { canBreak } from "../src/world/rules";

it("cools real adjacent Lava exactly once, returns the vessel, preserves Water and notifies after final owners",()=>{
 const world=new World(12345),bag=new Inventory();world.setBlock(1,80,1,blockId("stone"));world.setBlock(2,81,1,blockId("lava"));bag.slots[0]={id:stackId("water_bucket"),count:1};
 const observed:unknown[]=[];let nested:unknown;world.onBlockChanged(()=>{observed.push({held:structuredClone(bag.slots[0]),water:world.getBlock(1,81,1),cast:world.getBlock(2,81,1),busy:isFluidActionBusy(world)});nested=tryUseFluidBucket(world,bag,"survival",{...hit,y:81});throw Error("postcommit observer");});
 expect(tryUseFluidBucket(world,bag,"survival",hit)).toEqual({ok:true,action:"place",fluid:"water"});expect(observed).toEqual(Array.from({length:2},()=>({held:{id:stackId("bucket"),count:1},water:blockId("water"),cast:blockId("obsidian"),busy:true})));expect(nested).toEqual({ok:false,reason:"invalid-state"});expect(isFluidActionBusy(world)).toBe(false);
 expect(blockDrops(blockId("lava"))).toEqual([]);expect(canBreak(world,"creative",1,81,1)).toBe(false);
});
it("revalidates qualifying Water before cooling across permission callbacks, ABA and chunk unload",()=>{
 for(const mode of ["remove","aba","unload"]){
  const world=new World(12345),bag=new Inventory(),base={x:15,y:80,z:1,normal:{x:0,y:1,z:0}};world.setBlock(15,80,1,blockId("stone"));world.setBlock(15,81,1,0);world.setBlock(16,81,1,blockId("water"));bag.slots[0]={id:stackId("lava_bucket"),count:1};const original=world.getBlock.bind(world);let changed=false;
  world.getBlock=(x,y,z)=>{if(!changed&&x===15&&y===80&&z===1){changed=true;if(mode==="unload")world.unloadChunk(1,0);else{world.setBlock(16,81,1,0);if(mode==="aba")world.setBlock(16,81,1,blockId("water"));}}return original(x,y,z);};
  expect(tryUseFluidBucket(world,bag,"survival",base)).toEqual({ok:false,reason:"source-changed"});expect(changed).toBe(true);expect(bag.slots[0]).toEqual({id:stackId("lava_bucket"),count:1});expect(original(15,81,1)).toBe(0);
  if(mode==="remove")expect(original(16,81,1)).toBe(0);if(mode==="aba")expect(original(16,81,1)).toBe(blockId("water"));if(mode==="unload")expect(world.hasChunk(1,0)).toBe(false);
 }
});
it("rejects plants/Fire as pour faces and locked or malformed full vessels without loss",()=>{
 for(const name of ["fire","dandelion","water","lava"]){const world=new World(1),bag=new Inventory();world.setBlock(1,80,1,blockId(name));bag.slots[0]={id:stackId("water_bucket"),count:1};const before=bag.toJSON(),edits=world.exportEdits();expect(tryUseFluidBucket(world,bag,"survival",hit).ok).toBe(false);expect(bag.toJSON()).toEqual(before);expect(world.exportEdits()).toEqual(edits);}
 for(const corrupt of ["count","metadata","locked"]){const world=new World(1),bag=new Inventory();world.setBlock(1,79,1,blockId("stone"));world.setBlock(1,80,1,blockId("water"));bag.slots[0]={id:stackId("bucket"),count:1};if(corrupt==="count")bag.slots[0].count=17;if(corrupt==="metadata")Object.assign(bag.slots[0],{damage:0});if(corrupt==="locked")Object.defineProperty(bag.slots,"0",{writable:false});const before=bag.toJSON();expect(tryUseFluidBucket(world,bag,"survival",hit).ok).toBe(false);expect(bag.toJSON()).toEqual(before);expect(world.getBlock(1,80,1)).toBe(blockId("water"));}
});
it("stages dependent Fire removal before any world observer and preserves lazy ordinary writes",()=>{
 const world=new World(1),bag=new Inventory();world.setBlock(1,80,1,blockId("stone"));world.setBlock(1,81,1,0);bag.slots[0]={id:stackId("flint_and_steel"),count:1};expect(igniteFire(world,bag,"survival",hit)).toBe(true);let owner=false;const observed:unknown[]=[];
 world.onBlockChanged(()=>{observed.push({owner,water:world.getLoadedBlock(1,80,1),fire:world.getLoadedBlock(1,81,1),records:world.fires.exportState().records});});expect(world.commitBlockBatch([[1,80,1,blockId("water")]],()=>{owner=true;})).toBe(true);expect(observed).toEqual(Array.from({length:2},()=>({owner:true,water:blockId("water"),fire:0,records:[]})));
 const far=new World(1);expect(far.commitBlockBatch([[12345,80,1,blockId("stone")]])).toBe(false);expect(far.loadedChunkCount()).toBe(0);far.setBlock(12345,80,1,blockId("stone"));expect(far.getLoadedBlock(12345,80,1)).toBe(blockId("stone"));
});
it("retains fractional contact through unknown chunks without advancing or resetting, then deals real accumulated damage",()=>{
 const world=new World(1),fluids=new FluidSystem(world),box={minX:1.1,maxX:1.9,minY:80.1,maxY:80.9,minZ:1.1,maxZ:1.9};expect(fluids.restore({version:1,contactSeconds:.75})).toEqual({invalid:false,present:true});expect(fluids.update(.25,box)).toBe(0);expect(fluids.exportState().contactSeconds).toBe(.75);expect(world.loadedChunkCount()).toBe(0);world.setBlock(1,80,1,blockId("lava"));expect(fluids.update(.25,box)).toBe(1);expect(fluids.exportState().contactSeconds).toBe(0);fluids.restore({version:1,contactSeconds:.75});expect(fluids.update(.25,null)).toBe(0);expect(fluids.exportState().contactSeconds).toBe(0);expect(sanitizeFluidState(null).invalid).toBe(true);
});
it("strictly diagnoses raw fluids/generator/whole vessels before sanitation and refuses invalid serialization",()=>{
 const raw={version:1,seed:12345,name:"source",mode:"survival",timeOfDay:0,player:{position:{x:1,y:80,z:1},yaw:0,pitch:0,flying:false},inventory:new Inventory().toJSON(),edits:[],generatorVersion:2,fluids:{version:1,contactSeconds:.75}};
 const good=deserializeSave(JSON.stringify(raw));expect(good.generatorVersion).toBe(2);expect(good.fluids).toEqual(raw.fluids);expect(good.fluidsInvalid).toBeUndefined();expect(JSON.parse(serializeSave(good)).fluids).toEqual(raw.fluids);
 for(const[change,flag]of [[{fluids:null},"fluidsInvalid"],[{fluids:{version:1,contactSeconds:1}},"fluidsInvalid"],[{generatorVersion:3},"generatorVersionInvalid"],[{edits:[[1,80,1,192]]},"fluidsInvalid"],[{edits:[[1,80,1,190],[1,80,1,190]]},"fluidsInvalid"]]as const){const saved=deserializeSave(JSON.stringify({...raw,...change}));expect((saved as unknown as Record<string,unknown>)[flag]).toBe(true);expect(()=>serializeSave(saved)).toThrow();}
 const invalid={...raw,inventory:{...raw.inventory,slots:[{id:stackId("water_bucket"),count:2},...Array.from({length:35},()=>null)]}};expect(deserializeSave(JSON.stringify(invalid)).bucketOwnershipIssues?.length).toBeGreaterThan(0);expect(()=>serializeSave(invalid as unknown as Parameters<typeof serializeSave>[0])).toThrow();
 const {generatorVersion:_v,fluids:_f,...legacy}=raw;expect(deserializeSave(JSON.stringify(legacy)).generatorVersion).toBeUndefined();expect(new World(12345).generatorVersion).toBe(1);
});
it("keeps v2 basin floors/rims and all nine sources identical across chunk generation order",()=>{
 const a=new TerrainGenerator(12345,2);let basin:ReturnType<TerrainGenerator["lavaBasinAt"]>=null;for(let gx=-15;gx<=15&&!basin;gx++)for(let gz=-15;gz<=15&&!basin;gz++)basin=a.lavaBasinAt(gx*32+16,gz*32+16);expect(basin).not.toBeNull();const p=basin!,chunks=new Map<string,ReturnType<TerrainGenerator["generate"]>>();
 for(const dx of [-1,0,1])for(const dz of [-1,0,1]){const x=p.x+dx,z=p.z+dz,cx=Math.floor(x/16),cz=Math.floor(z/16),key=`${cx},${cz}`;if(!chunks.has(key))chunks.set(key,a.generate(cx,cz));const c=chunks.get(key)!;expect(c.get((x%16+16)%16,p.y,(z%16+16)%16)).toBe(blockId("lava"));expect(c.get((x%16+16)%16,p.floorY,(z%16+16)%16)).toBe(blockId("stone"));}
 for(const[c,cells]of chunks){const[cx,cz]=c.split(",").map(Number);expect(new TerrainGenerator(12345,2).generate(cx,cz).blocks).toEqual(cells.blocks);}
});


it("reconciles loaded cross-chunk Water/Lava in both load and restored edit orders before observers",()=>{
 for(const first of [0,1]){
  const world=new World(1),generate=world.generator.generate.bind(world.generator);world.generator.generate=(cx,cz)=>{const chunk=generate(cx,cz);if(cz===0&&cx===0)chunk.set(15,80,1,blockId("lava"));if(cz===0&&cx===1)chunk.set(0,80,1,blockId("water"));return chunk;};
  world.getChunk(first,0);if(first===0)expect(world.getLoadedBlock(15,80,1)).toBe(blockId("lava"));const notifications:unknown[]=[];world.onBlockChanged(()=>{notifications.push({cast:world.getLoadedBlock(15,80,1),water:world.getLoadedBlock(16,80,1),light:world.getLight(15,80,1)&15});});world.getChunk(1-first,0);expect(world.getLoadedBlock(15,80,1)).toBe(blockId("obsidian"));expect(notifications).toEqual([{cast:blockId("obsidian"),water:blockId("water"),light:0}]);expect(world.loadedChunkCount()).toBe(2);
 }
 for(const reverse of [false,true]){const world=new World(1),edits: [number,number,number,number][]=[[15,80,1,blockId("lava")],[16,80,1,blockId("water")]];world.importEdits(reverse?edits.reverse():edits);expect(world.getLoadedBlock(15,80,1)).toBe(blockId("obsidian"));expect(world.getLoadedBlock(16,80,1)).toBe(blockId("water"));}
});

import { breakBlock } from "../src/world/rules";
import { createAgent, runAgentCommand } from "../src/automation/agent";
import { fuelSeconds } from "../src/crafting/smelting";
import { reduceMaterial } from "../src/crafting/chemistry";
import { meshChunk } from "../src/rendering/mesher";
it("preserves generic Agent Obsidian destruction while rejecting Lava terrain and player lower-tier harvest",()=>{
 for(const name of [null,"wooden_pickaxe","stone_pickaxe","iron_pickaxe","golden_pickaxe","diamond_pickaxe"]){const world=new World(1),bag=new Inventory();world.setBlock(1,80,1,blockId("obsidian"));if(name)bag.slots[0]={id:stackId(name),count:1,damage:0};expect(breakBlock(world,bag,"survival",1,80,1)).toBe(true);expect(bag.slots.filter(s=>s?.id===blockId("obsidian"))).toEqual(name==="diamond_pickaxe"?[{id:blockId("obsidian"),count:1}]:[]);if(name)expect(bag.slots[0]?.damage).toBe(1);}
 const world=new World(1),agent=createAgent(1,81,1);world.setBlock(1,80,1,blockId("lava"));expect(runAgentCommand(world,agent,{op:"destroy",dir:"down"}).ok).toBe(false);expect(world.getBlock(1,80,1)).toBe(blockId("lava"));expect(agent.slots.every(s=>s===null)).toBe(true);expect(reduceMaterial(blockId("lava"))).toBeNull();world.setBlock(1,80,1,blockId("obsidian"));expect(runAgentCommand(world,agent,{op:"destroy",dir:"down"}).ok).toBe(true);expect(agent.slots[0]).toEqual({id:blockId("obsidian"),count:1});expect(fuelSeconds(stackId("lava_bucket"))).toBe(0);
});
it("keeps Lava on its own opaque emissive mesh and removes source light on scoop/cooling",()=>{
 const world=new World(1);for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)world.getChunk(x,z).blocks.fill(0);const uv=()=>[0,0,1,1]as const;
 world.setBlock(5,80,5,blockId("lava"));world.setBlock(6,80,5,blockId("lava"));let mesh=meshChunk(world,0,0,uv);expect(mesh.solid.indices.length).toBe(60);expect(mesh.liquid.indices.length).toBe(0);expect(Math.max(...Array.from(mesh.solid.positions).filter((_,i)=>i%3===1))).toBe(80.875);expect(world.getLight(5,80,5)&15).toBe(15);
 const bag=new Inventory();bag.slots[0]={id:stackId("bucket"),count:1};expect(tryUseFluidBucket(world,bag,"survival",{x:5,y:80,z:5,normal:{x:0,y:1,z:0}}).ok).toBe(true);expect(world.getLight(6,80,5)&15).toBe(15);world.setBlock(7,80,5,blockId("water"));expect(world.getBlock(6,80,5)).toBe(blockId("obsidian"));expect(world.getLight(6,80,5)&15).toBe(0);mesh=meshChunk(world,0,0,uv);expect(mesh.liquid.indices.length).toBeGreaterThan(0);expect(mesh.solid.indices.length).toBe(36);expect(world.getBlock(7,80,5)).toBe(blockId("water"));
});
it("preserves cold fractional contact and whole full-vessel owners across inventory/Agent/ground/pending",()=>{
 const bag=new Inventory();bag.add(stackId("water_bucket"),2);bag.add(stackId("lava_bucket"),2);expect(bag.slots.slice(0,4)).toEqual(["water_bucket","water_bucket","lava_bucket","lava_bucket"].map(name=>({id:stackId(name),count:1})));
 const raw={seed:1,name:"owners",mode:"survival"as const,timeOfDay:0,player:{position:{x:1,y:80,z:1},yaw:0,pitch:0,flying:false},inventory:bag.toJSON(),edits:[],generatorVersion:2 as const,fluids:{version:1 as const,contactSeconds:.75},inventoryPending:[{id:stackId("lava_bucket"),count:1}],agent:{...createAgent(1,80,1),slots:[{id:stackId("water_bucket"),count:1},...Array(26).fill(null)]},worldDrops:{nextKey:2,records:[{key:1,stack:{id:stackId("lava_bucket"),count:1},position:{x:1,y:80,z:1},velocity:{x:0,y:0,z:0},ageSeconds:0,pickupDelaySeconds:0}]}};
 const restored=deserializeSave(serializeSave(raw));expect(restored.bucketOwnershipIssues).toBeUndefined();expect(restored.inventory.slots.slice(0,4)).toEqual(bag.slots.slice(0,4));expect(restored.agent?.slots[0]).toEqual(raw.agent.slots[0]);expect(restored.inventoryPending).toEqual(raw.inventoryPending);expect(restored.worldDrops).toEqual(raw.worldDrops);const world=new World(1,2);world.setBlock(1,80,1,blockId("lava"));expect(world.fluids.restore(restored.fluids).invalid).toBe(false);expect(world.fluids.update(.25,{minX:1.1,maxX:1.9,minY:80.1,maxY:80.9,minZ:1.1,maxZ:1.9})).toBe(1);
});

it("reconciles a dense loaded source chunk without a blanket source-count refusal",()=>{
 const world=new World(1),generate=world.generator.generate.bind(world.generator);world.generator.generate=(cx,cz)=>{const chunk=generate(cx,cz);if(cx===0&&cz===0){for(let y=50;y<70;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)chunk.set(x,y,z,blockId("lava"));chunk.set(1,70,1,blockId("water"));}return chunk;};world.getChunk(0,0);expect(world.getLoadedBlock(1,69,1)).toBe(blockId("obsidian"));expect(world.getLoadedBlock(2,69,1)).toBe(blockId("lava"));expect(world.getLoadedBlock(1,70,1)).toBe(blockId("water"));expect(world.getLight(1,69,1)&15).toBe(0);expect(world.loadedChunkCount()).toBe(1);
});

it("restores saved physical Fire before a later support edit without deleting the still-unrestored owner",()=>{
 const world=new World(1);world.importEdits([[1,81,1,blockId("fire")],[1,80,1,blockId("stone")]]);
 expect(world.getLoadedBlock(1,81,1)).toBe(blockId("fire"));
 const raw={version:1,records:[{x:1,y:81,z:1,remaining:7}],contactSeconds:.75};expect(world.fires.restore(raw).invalid).toBe(false);expect(world.fires.exportState()).toEqual(raw);
 const seen:unknown[]=[];world.onBlockChanged(()=>seen.push({fire:world.getLoadedBlock(1,81,1),owners:world.fires.exportState().records}));world.setBlock(1,80,1,blockId("dirt"));expect(world.getLoadedBlock(1,81,1)).toBe(0);expect(world.fires.exportState().records).toEqual([]);expect(seen).toEqual([{fire:0,owners:[]},{fire:0,owners:[]}]);
});
it("respects explicit non-Fire replacements while invalidating an old Fire support owner",()=>{
 for(const replacement of [blockId("obsidian"),0]){const world=new World(1),bag=new Inventory();world.setBlock(1,80,1,blockId("stone"));world.setBlock(1,81,1,0);bag.slots[0]={id:stackId("flint_and_steel"),count:1};expect(igniteFire(world,bag,"survival",hit)).toBe(true);const seen:unknown[]=[];world.onBlockChanged(()=>seen.push({support:world.getLoadedBlock(1,80,1),above:world.getLoadedBlock(1,81,1),owners:world.fires.exportState().records}));expect(world.commitBlockBatch([[1,80,1,blockId("dirt")],[1,81,1,replacement]])).toBe(true);expect(world.getLoadedBlock(1,81,1)).toBe(replacement);expect(world.fires.exportState().records).toEqual([]);expect(seen).toEqual(Array.from({length:2},()=>({support:blockId("dirt"),above:replacement,owners:[]})));}
});
