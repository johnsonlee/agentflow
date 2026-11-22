import { expect,it } from "vitest";
import { blockId } from "../src/catalog/blocks";
import { createPlayerBody,stepPlayer,bodyBox,surfaceSpeedAt,type BlockGetter } from "../src/simulation/physics";
import { createMob,stepMob } from "../src/simulation/entities";
import { World } from "../src/world/world";
import { Inventory } from "../src/ownership/inventory";
import { stackId } from "../src/catalog/items";
import { igniteFire,FIRE_LIFETIME_SECONDS } from "../src/simulation/fire";
const input={forward:1,strafe:0,jump:false,descend:false,sprint:false};
const flat=(id:number):BlockGetter=>(_x,y,_z)=>y===0?id:0;
function walk(id:number,y:number,flying=false){const body=createPlayerBody({x:.5,y,z:.5});body.onGround=true;body.flying=flying;for(let i=0;i<120;i++)stepPlayer(flat(id),body,input,1/60);return body;}
it("actual grounded player motion contacts the lowered Soul Sand surface and slows",()=>{
 const sand=walk(blockId("soul_sand"),.875),stone=walk(blockId("stone"),1);
 expect(sand.position.y).toBeCloseTo(.875,3);expect(sand.onGround).toBe(true);expect((.5-sand.position.z)/(.5-stone.position.z)).toBeLessThan(.6);
});
it("actual grounded mob motion also slows on Soul Sand",()=>{
 const travel=(id:number,y:number)=>{const mob=createMob(1,"pig",{x:.5,y,z:.5});mob.onGround=true;mob.walking=true;mob.thinkTimer=100;for(let i=0;i<120;i++)stepMob(flat(id),mob,1/60,()=>1);return mob;};
 const sand=travel(blockId("soul_sand"),.875),stone=travel(blockId("stone"),1);expect(sand.position.y).toBeCloseTo(.875,3);expect((.5-sand.position.z)/(.5-stone.position.z)).toBeLessThan(.6);
});
it("flying above a slowing block retains ordinary flight motion",()=>{
 const sand=walk(blockId("soul_sand"),3,true),stone=walk(blockId("stone"),3,true);expect(sand.position.z).toBeCloseTo(stone.position.z,10);expect(sand.position.y).toBeCloseTo(3,10);
});
it("a lower adjacent Soul Sand face cannot slow a body supported by neighboring Stone",()=>{
 const mixed:BlockGetter=(x,y)=>y===0?blockId(x===0?"soul_sand":"stone"):0;
 expect(surfaceSpeedAt(mixed,{x:.8,y:1,z:.5})).toBe(1);expect(surfaceSpeedAt(flat(blockId("soul_sand")),{x:.5,y:.875,z:.5})).toBe(.4);
 expect(surfaceSpeedAt(mixed,{x:Infinity,y:1,z:0})).toBe(1);
});
function fire(){const world=new World(12345,1,"nether"),inventory=new Inventory();world.setBlock(1,80,1,blockId("netherrack"));world.setBlock(1,81,1,0);inventory.slots[0]={id:stackId("flint_and_steel"),count:1};expect(igniteFire(world,inventory,"survival",{x:1,y:80,z:1,normal:{x:0,y:1,z:0}})).toBe(true);return {world,inventory};}
it("real Netherrack Fire remains owned through time/cold load and ordinary support remains finite",()=>{
 const {world,inventory}=fire();for(let i=0;i<20;i++)world.fires.update(1);expect(world.getBlock(1,81,1)).toBe(blockId("fire"));expect(world.fires.exportState().records[0].remaining).toBe(FIRE_LIFETIME_SECONDS);expect(inventory.slots[0]?.damage).toBe(1);
 const cold=new World(12345,1,"nether");cold.importEdits(world.exportEdits());expect(cold.fires.restore(world.fires.exportState(),cold.exportEdits()).invalid).toBe(false);cold.fires.update(1);expect(cold.getBlock(1,81,1)).toBe(blockId("fire"));
 // Preserve established support-change invalidation, then re-ignite ordinary Stone.
 cold.setBlock(1,80,1,blockId("stone"));expect(cold.getBlock(1,81,1)).toBe(0);expect(cold.fires.exportState().records).toEqual([]);
 expect(igniteFire(cold,inventory,"survival",{x:1,y:80,z:1,normal:{x:0,y:1,z:0}})).toBe(true);for(let i=0;i<20;i++)cold.fires.update(1);expect(cold.getBlock(1,81,1)).toBe(0);expect(inventory.slots[0]?.damage).toBe(2);
});
it("unknown support suspends Fire ownership, expiry and contact instead of erasing it",()=>{
 const {world}=fire(),box=bodyBox({x:1.5,y:81,z:1.5});expect(world.fires.update(.5,box)).toBe(0);const before=world.fires.exportState(),get=world.getLoadedBlock.bind(world);
 world.getLoadedBlock=(x,y,z)=>x===1&&y===80&&z===1?undefined:get(x,y,z);expect(world.fires.update(1,box)).toBe(0);expect(world.fires.exportState()).toEqual(before);expect(get(1,81,1)).toBe(blockId("fire"));
 world.getLoadedBlock=get;expect(world.fires.update(.5,box)).toBe(1);expect(world.getBlock(1,81,1)).toBe(blockId("fire"));
});
it("a real World source lease also freezes ordinary Fire timers until released",()=>{
 const world=new World(12345),inventory=new Inventory();world.setBlock(1,80,1,blockId("stone"));world.setBlock(1,81,1,0);inventory.slots[0]={id:stackId("flint_and_steel"),count:1};expect(igniteFire(world,inventory,"survival",{x:1,y:80,z:1,normal:{x:0,y:1,z:0}})).toBe(true);
 const before=world.fires.exportState(),lease=world.reserveBlockBatch([[1,81,1,0]])!;expect(lease).not.toBeNull();world.fires.update(1);expect(world.fires.exportState()).toEqual(before);expect(lease.valid()).toBe(true);lease.release();world.fires.update(1);expect(world.fires.exportState().records[0].remaining).toBe(FIRE_LIFETIME_SECONDS-1);
});
it("a reentrant loaded-cell probe cannot tick the same ordinary Fire twice",()=>{
 const world=new World(12345),inventory=new Inventory();world.setBlock(1,80,1,blockId("stone"));world.setBlock(1,81,1,0);inventory.slots[0]={id:stackId("flint_and_steel"),count:1};expect(igniteFire(world,inventory,"survival",{x:1,y:80,z:1,normal:{x:0,y:1,z:0}})).toBe(true);
 const get=world.getLoadedBlock.bind(world);let once=false;world.getLoadedBlock=(x,y,z)=>{if(!once){once=true;expect(world.fires.update(1)).toBe(0);}return get(x,y,z);};
 world.fires.update(1);expect(world.fires.exportState().records[0].remaining).toBe(FIRE_LIFETIME_SECONDS-1);
});
