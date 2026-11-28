import { expect, it } from "vitest";
import { World } from "../src/world/world";
import { Inventory } from "../src/ownership/inventory";
import { blockId } from "../src/catalog/blocks";
import { stackId } from "../src/catalog/items";
import { tryUseFluidBucket, isFluidActionBusy } from "../src/simulation/fluids";
const hit={x:1,y:80,z:1,normal:{x:0,y:1,z:0}};
function source(){const world=new World(1),bag=new Inventory();world.setBlock(1,80,1,blockId("water"));world.setBlock(1,79,1,blockId("stone"));bag.slots[0]={id:stackId("bucket"),count:1};return{world,bag};}
it("independent: a changed selection during permission callbacks cannot consume either vessel",()=>{
 const {world,bag}=source();bag.slots[1]={id:stackId("bucket"),count:1};const before=bag.slots.map(s=>s?{...s}:null),original=world.getBlock.bind(world);let callback=false;
 world.getBlock=(x,y,z)=>{if(!callback&&x===1&&y===79&&z===1){callback=true;bag.selected=1;}return original(x,y,z);};
 expect(tryUseFluidBucket(world,bag,"survival",hit)).toEqual({ok:false,reason:"source-changed"});expect(callback).toBe(true);expect(bag.selected).toBe(1);expect(bag.slots).toEqual(before);expect(original(1,80,1)).toBe(blockId("water"));expect(isFluidActionBusy(world)).toBe(false);
});
it("independent: same-ID source replacement during permission leaves callback changes and refuses collection",()=>{
 const {world,bag}=source(),original=world.getBlock.bind(world);let callback=false;
 world.getBlock=(x,y,z)=>{if(!callback&&x===1&&y===79&&z===1){callback=true;world.setBlock(1,80,1,0);world.setBlock(1,80,1,blockId("water"));}return original(x,y,z);};
 expect(tryUseFluidBucket(world,bag,"survival",hit)).toEqual({ok:false,reason:"source-changed"});expect(callback).toBe(true);expect(original(1,80,1)).toBe(blockId("water"));expect(bag.slots[0]).toEqual({id:stackId("bucket"),count:1});
});
it("independent: throwing permission leaves source and every vessel unchanged",()=>{
 const {world,bag}=source(),original=world.getBlock.bind(world),before=bag.toJSON(),edits=world.exportEdits();let callback=false;
 world.getBlock=(x,y,z)=>{if(x===1&&y===79&&z===1){callback=true;throw Error("permission receiver failed");}return original(x,y,z);};
 expect(tryUseFluidBucket(world,bag,"survival",hit)).toEqual({ok:false,reason:"invalid-state"});expect(callback).toBe(true);expect(world.exportEdits()).toEqual(edits);expect(bag.toJSON()).toEqual(before);expect(isFluidActionBusy(world)).toBe(false);
});
it("independent: denied cooling neighbor rejects the whole multi-cell pour before any observer",()=>{
 const world=new World(1),bag=new Inventory();world.setBlock(1,80,1,blockId("stone"));world.setBlock(1,81,1,0);world.setBlock(2,80,1,blockId("deny"));world.setBlock(2,81,1,blockId("lava"));bag.slots[0]={id:stackId("water_bucket"),count:1};const edits=world.exportEdits(),before=bag.toJSON(),seen:unknown[]=[];world.onBlockChanged((...args)=>seen.push(args));
 expect(tryUseFluidBucket(world,bag,"survival",hit)).toEqual({ok:false,reason:"restricted"});expect(bag.toJSON()).toEqual(before);expect(world.exportEdits()).toEqual(edits);expect(seen).toEqual([]);
});
