import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Inventory, World, createHunger, stackId, blockId, freshStack } from "../src";
import { Game } from "../../../apps/web/src/application/game";
function game(support="water"){
 const g=Object.create(Game.prototype), own=()=>({busy:false,records:[],reconcileLoadedReferences:vi.fn(),validateCrossReferences:vi.fn()});
 Object.assign(g,{world:new World(12345),inventory:new Inventory(),hunger:createHunger(),playerStatus:{},recoverySections:[],recoveryOriginal:null,drinkOwner:null,leashes:own(),balloons:own(),paused:false,dead:false,stopped:false,mode:"survival",health:20,body:{position:{x:.5,y:33,z:.5},yaw:0,pitch:-1.45},hud:{message:vi.fn(),flashDamage:vi.fn()},keyboard:{reset:vi.fn()},screenOpen:()=>false,mobs:{raycast:()=>null},attackCooldown:0,placeCooldown:0,creativeCooldown:0,redstone:{interact:()=>false},breakProgress:0,eatTimer:0});
 for(let y=33;y<=38;y++)g.world.setBlock(0,y,0,0);g.world.setBlock(0,32,0,blockId(support));return g;
}
beforeEach(()=>vi.stubGlobal("document",{createElement:()=>({}),pointerLockElement:null}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();(Game as unknown as {activeWriter:Game|null}).activeWriter=null;});
it("actual use scoops a real water source into the selected singleton even with a full bag",()=>{
 const g=game();for(let i=0;i<36;i++)g.inventory.setSlot(i,{id:stackId("stone"),count:64});g.inventory.setSlot(0,{id:stackId("bucket"),count:1});
 g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,32,0)).toBe(0);expect(g.inventory.selectedStack()).toEqual({id:stackId("water_bucket"),count:1});
 expect(g.inventory.slots.slice(1)).toEqual(Array.from({length:35},()=>({id:stackId("stone"),count:64})));
});
it("actual full-bag stacked bucket refusal preserves source and every owner",()=>{
 const g=game();for(let i=0;i<36;i++)g.inventory.setSlot(i,{id:stackId("stone"),count:64});g.inventory.setSlot(0,{id:stackId("bucket"),count:2});const before=g.inventory.toJSON();
 g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,32,0)).toBe(blockId("water"));expect(g.inventory.toJSON()).toEqual(before);
});
it("actual held full bucket pours into top-face air and returns exactly one empty vessel",()=>{
 const g=game("stone");g.inventory.setSlot(0,{id:stackId("water_bucket"),count:1});g.interact(false,true,true,false,.01);
 expect(g.world.getBlock(0,33,0)).toBe(blockId("water"));expect(g.inventory.selectedStack()).toEqual({id:stackId("bucket"),count:1});
});
it("closer actual actor occludes source collection",()=>{
 const g=game();g.inventory.setSlot(0,{id:stackId("bucket"),count:1});g.mobs.raycast=()=>({distance:.1,mob:{kind:"pig"}});g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,32,0)).toBe(blockId("water"));expect(g.inventory.selectedStack()).toEqual({id:stackId("bucket"),count:1});
});
it("actual station use keeps priority over bucket pouring",()=>{
 const g=game("crafting_table");g.openInventory=vi.fn();g.inventory.setSlot(0,{id:stackId("water_bucket"),count:1});g.interact(false,true,true,false,.01);expect(g.openInventory).toHaveBeenCalledWith("crafting_table");expect(g.world.getBlock(0,33,0)).toBe(0);expect(g.inventory.selectedStack()?.id).toBe(stackId("water_bucket"));
});

it("real source ray refuses denied build and repeated action cannot refill a removed source",()=>{
 const g=game();g.inventory.setSlot(0,{id:stackId("bucket"),count:1});g.world.setBlock(0,31,0,blockId("deny"));g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,32,0)).toBe(blockId("water"));expect(g.inventory.selectedStack()?.id).toBe(stackId("bucket"));
 g.world.setBlock(0,31,0,blockId("stone"));g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,32,0)).toBe(0);const once=g.inventory.toJSON();g.interact(false,true,true,false,.01);expect(g.inventory.toJSON()).toEqual(once);
});
it("bottle use keeps its existing non-consuming water rule",()=>{
 const g=game();g.inventory.setSlot(0,{id:stackId("glass_bottle"),count:1});g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,32,0)).toBe(blockId("water"));expect(g.inventory.selectedStack()?.id).toBe(stackId("water_bottle"));
});
it("raw fluid and generator recovery freezes actual actions and preserves the original envelope",()=>{
 const original='\n{"generatorVersion":99,"fluids":{"version":1,"contactSeconds":2}}\n';vi.stubGlobal("localStorage",{getItem:()=>original});const g=game();g.restoreFluids({fluidsInvalid:true,generatorVersionInvalid:true});expect(g.recoveryOriginal).toBe(original);expect(g.recoverySections).toContain("fluids");g.inventory.setSlot(0,{id:stackId("bucket"),count:1});g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,32,0)).toBe(blockId("water"));expect(g.runChat("/give stone")).toContain("Export a backup");g.selectHudHotbar(1);expect(g.inventory.selected).toBe(0);
});
it("real Lava tick uses an explicit damage cause only during active Survival",()=>{
 const g=game(),update=vi.fn((_dt:number,_box:unknown)=>1);g.world.fluids={update};g.hurt=vi.fn();g.updateFluids(.25);expect(g.hurt).toHaveBeenCalledWith(1,"lava");g.mode="creative";g.updateFluids(.25);expect(update.mock.calls[1][1]).toBeNull();expect(g.hurt).toHaveBeenCalledTimes(1);
 for(const state of [{paused:true},{dead:true},{stopped:true},{screenOpen:()=>true},{recoverySections:["fluids"]},{leashes:{busy:true}}]){const g=game(),update=vi.fn((_dt:number,_box:unknown)=>1);g.world.fluids={update};Object.assign(g,state);g.hurt=vi.fn();g.updateFluids(2);expect(update).not.toHaveBeenCalled();expect(g.hurt).not.toHaveBeenCalled();}
});
it("actual Lava hurt bypasses armor without wearing it and Creative stays safe",()=>{
 const g=game();g.inventory.equipment.chest=freshStack(stackId("diamond_chestplate"));const before=g.inventory.toJSON();g.hurt(1,"lava");expect(g.health).toBe(19);expect(g.inventory.toJSON()).toEqual(before);g.mode="creative";g.hurt(1,"lava");expect(g.health).toBe(19);expect(g.inventory.toJSON()).toEqual(before);
});

it("actual committed-world observers see the final bucket and cannot reenter save, transfer or selection",()=>{
 const g=game();(Game as unknown as {activeWriter:Game|null}).activeWriter=g;g.inventory.setSlot(0,{id:stackId("bucket"),count:1});g.savePayload=vi.fn(()=>"{}");const observed:unknown[]=[];
 g.world.onBlockChanged((x:number,y:number,z:number,id:number)=>{
  if(x!==0||y!==32||z!==0||id!==0)return;
  const source=g.world.getBlock(x,y,z),owner={...g.inventory.selectedStack()},busy=g.ownershipBusy,saved=g.save();
  g.selectHudHotbar(1);const selected=g.inventory.selected,dropped=g.dropStack({id:stackId("water_bucket"),count:1});g.exportSaveBackup();
  observed.push({source,owner,busy,saved,selected,dropped,saveError:g.saveError});
 });
 g.interact(false,true,true,false,.01);expect(observed).toEqual([{source:0,owner:{id:stackId("water_bucket"),count:1},busy:true,saved:false,selected:0,dropped:false,saveError:"Items are being transferred. Retry saving afterward."}]);expect(g.savePayload).not.toHaveBeenCalled();expect(g.inventory.selectedStack()).toEqual({id:stackId("water_bucket"),count:1});expect(g.ownershipBusy).toBe(false);
});
