import { expect,it } from "vitest";
import { World } from "../src/world/world";
import { WORLD_HEIGHT } from "../src/world/chunk";
import { WORLD_BORDER } from "../src/core/math";
import { blockId } from "../src/catalog/blocks";
import { NetherGenerator } from "../src/world/nether-generator";
import { TerrainGenerator } from "../src/world/generator";
import { createDimensionGeneratedBlockProbe } from "../src/world/dimension-probe";
import { skyAt } from "../src/world/time";
import { parseSave } from "../src/persistence/save";
import { Inventory } from "../src/ownership/inventory";

it("keeps legacy world selection explicit and rejects unsupported realm/generator pairs",()=>{
 const legacy=new World(7,2),explicit=new World(7,2,"overworld");expect(legacy.dimension).toBe("overworld");expect(legacy.generator).toBeInstanceOf(TerrainGenerator);expect(legacy.getChunk(0,0).blocks).toEqual(explicit.getChunk(0,0).blocks);
 const nether=new World(7,1,"nether");expect(nether.dimension).toBe("nether");expect(nether.generator).toBeInstanceOf(NetherGenerator);
 expect(()=>new World(7,2,"nether")).toThrow(/generator/);expect(()=>new World(7,1,"moon" as "nether")).toThrow(/dimension/);
});
it("Nether remains without sky light after opening the roof, unlike the Overworld",()=>{
 const nether=new World(7,1,"nether");expect(nether.getLight(0,WORLD_HEIGHT,0)).toBe(0);expect(nether.getLight(0,80,0)).toBe(0);
 expect(nether.getBlock(0,WORLD_HEIGHT-1,0)).toBe(blockId("bedrock"));nether.setBlock(0,WORLD_HEIGHT-1,0,0);nether.setBlock(0,WORLD_HEIGHT-2,0,0);
 expect(nether.getLight(0,WORLD_HEIGHT-1,0)>>4).toBe(0);expect(nether.getLight(0,WORLD_HEIGHT-2,0)>>4).toBe(0);
 const over=new World(7);over.setBlock(0,WORLD_HEIGHT-1,0,blockId("stone"));over.setBlock(0,WORLD_HEIGHT-1,0,0);expect(over.getLight(0,WORLD_HEIGHT-1,0)>>4).toBe(15);
});
it("Nether preserves block light across chunk seams and cold restore without granting daylight",()=>{
 const world=new World(7,1,"nether");for(let x=14;x<=17;x++)for(let y=59;y<=62;y++)for(let z=0;z<=2;z++)world.setBlock(x,y,z,0);
 world.setBlock(15,60,1,blockId("glowstone"));expect(world.getLight(15,60,1)&15).toBe(15);expect(world.getLight(16,60,1)&15).toBe(14);expect(world.getLight(16,60,1)>>4).toBe(0);
 const cold=new World(7,1,"nether");cold.importEdits(world.exportEdits());cold.getChunk(1,0);cold.getChunk(0,0);expect(cold.getLight(16,60,1)&15).toBe(14);expect(cold.getLight(16,60,1)>>4).toBe(0);
});
it("handles valid inclusive boundary columns and refuses outside Nether reads without loading",()=>{
 const world=new World(7,1,"nether");expect(world.getBlock(WORLD_BORDER,0,0)).toBe(blockId("bedrock"));const count=world.loadedChunkCount();expect(world.getBlock(WORLD_BORDER+1,0,0)).toBe(0);expect(world.loadedChunkCount()).toBe(count);
});
it("uses independent deterministic probes for each realm/version and keeps edits outside the probe",()=>{
 const probe=createDimensionGeneratedBlockProbe(),over=new TerrainGenerator(7,2).generate(0,0),nether=new NetherGenerator(7).generate(0,0);
 for(const [x,y,z] of [[0,0,0],[3,30,3],[7,60,7],[15,95,15]]){expect(probe("overworld",7,2,x,y,z)).toBe(over.get(x,y,z));expect(probe("nether",7,1,x,y,z)).toBe(nether.get(x,y,z));}
 expect(probe("nether",7,2,0,0,0)).toBeUndefined();expect(probe("nether",7,1,WORLD_BORDER+1,0,0)).toBeUndefined();expect(probe("nether",7,1,0,NaN,0)).toBeUndefined();
 for(let i=0;i<12;i++)expect(probe("overworld",7,2,i*16,0,0)).toBe(blockId("bedrock"));expect(probe("nether",7,1,0,0,0)).toBe(blockId("bedrock"));
});
it("gives Nether stable red presentation while preserving the ordinary day/night cycle",()=>{
 expect(skyAt(.25,"nether")).toEqual(skyAt(.75,"nether"));expect(skyAt(.25)).toEqual(skyAt(.25,"overworld"));expect(skyAt(.25).light).toBeGreaterThan(skyAt(.75).light);expect(skyAt(.25,"nether").light).toBe(.2);
});
it("validates natural archived Fire support from the correct default realm probe",()=>{
 const nether=new NetherGenerator(7),f=nether.fortressAt(0,0)!,x=f.x,y=f.y,z=f.z;
 const player={position:{x:x+.5,y:y+1,z:z+.5},yaw:0,pitch:0,flying:false};
 const save={version:1,name:"Realms",seed:7,generatorVersion:2,mode:"survival",timeOfDay:.1,inventory:new Inventory().toJSON(),player,edits:[],dimensions:{version:1,active:"overworld",inactive:{nether:{seed:7,generatorVersion:1,player,edits:[[x,y+1,z,blockId("fire")]],fire:{version:1,records:[{x,y:y+1,z,remaining:12}],contactSeconds:0}}},links:[]}};
 const loaded=parseSave(JSON.stringify(save));expect(loaded.dimensionsInvalid).toBeUndefined();expect(loaded.dimensions?.inactive.nether?.fire?.records).toHaveLength(1);
 save.dimensions.inactive.nether.generatorVersion=2;expect(parseSave(JSON.stringify(save)).dimensionsInvalid).toBe(true);
});
