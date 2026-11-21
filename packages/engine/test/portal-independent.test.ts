import { expect,it } from "vitest";
import { World,Inventory,blockId,stackId,tryUsePortalIgnition,igniteFire,breakBlock,placeBlock,tillSoil,type DropSink } from "../src";
function prepared(){
 const world=new World(1),inventory=new Inventory();
 for(let y=79;y<=83;y++)for(let x=-1;x<=2;x++)world.setBlock(x,y,0,((y===79||y===83)&&x>=0&&x<=1||(x===-1||x===2)&&y>=80&&y<=82)?blockId("obsidian"):0);
 inventory.setSlot(0,{id:stackId("flint_and_steel"),count:1});expect(tryUsePortalIgnition(world,inventory,"survival",{x:0,y:79,z:0,normal:{x:0,y:1,z:0}}).ok).toBe(true);
 inventory.setSlot(0,{id:stackId("diamond_pickaxe"),count:1,damage:0});world.setBlock(10,80,10,blockId("stone"));return{world,inventory};
}
it.each(["import-edits","clear-portals","restore-portals"]as const)("independent: receiver %s cannot reset leased source/owners after acknowledging drops",action=>{
 const {world,inventory}=prepared();let receiverCalls=0,dropped=0;
 const sink:DropSink=stacks=>({commit:()=>{
  receiverCalls++;dropped+=stacks.reduce((n,s)=>n+s.count,0);
  if(action==="import-edits")world.importEdits([]);
  else if(action==="clear-portals")world.portals.clear();
  else world.portals.restore(undefined);
  return true;
 }});
 const result=breakBlock(world,inventory,"survival",0,79,0,()=>.1,[],sink);
 expect(receiverCalls).toBe(1);expect(result).toBe(true);expect(dropped).toBe(1);expect(world.getBlock(0,79,0)).toBe(0);expect(world.portals.exportState().records).toEqual([]);expect(world.getBlock(10,80,10)).toBe(blockId("stone"));expect(inventory.selectedStack()?.damage).toBe(1);
 for(let y=80;y<=82;y++)for(let x=0;x<=1;x++)expect(world.getBlock(x,y,0)).toBe(0);
 expect(world.blockSourceLeaseBusy).toBe(false);
});
it("independent: importEdits during an acknowledged portal receiver cannot clear an unrelated live Fire owner",()=>{
 const {world,inventory}=prepared();inventory.setSlot(1,{id:stackId("flint_and_steel"),count:1});inventory.select(1);
 expect(igniteFire(world,inventory,"survival",{x:10,y:80,z:10,normal:{x:0,y:1,z:0}})).toBe(true);inventory.select(0);
 const fireBefore=world.fires.exportState();expect(fireBefore.records).toHaveLength(1);let dropped=0;
 const sink:DropSink=stacks=>({commit:()=>{dropped+=stacks.reduce((n,s)=>n+s.count,0);world.importEdits([]);return true;}});
 expect(breakBlock(world,inventory,"survival",0,79,0,()=>.1,[],sink)).toBe(true);expect(dropped).toBe(1);
 expect(world.getBlock(10,81,10)).toBe(blockId("fire"));expect(world.fires.exportState()).toEqual(fireBefore);expect(world.blockSourceLeaseBusy).toBe(false);
});
it("independent: reentrant ordinary placement during a portal receiver refuses without consuming its separate owner",()=>{
 const {world,inventory}=prepared(),other=new Inventory();other.setSlot(0,{id:stackId("stone"),count:1});const before=other.toJSON();let placed:boolean|undefined;
 const sink:DropSink=()=>({commit:()=>{placed=placeBlock(world,other,"survival",10,81,10,{x:0,y:80,z:0});return true;}});
 expect(breakBlock(world,inventory,"survival",0,79,0,()=>.1,[],sink)).toBe(true);expect(placed).toBe(false);expect(other.toJSON()).toEqual(before);expect(world.getBlock(10,81,10)).toBe(0);
});
it("independent: reentrant soil conversion during a portal receiver refuses without wearing its separate hoe",()=>{
 const {world,inventory}=prepared(),other=new Inventory();other.setSlot(0,{id:stackId("iron_hoe"),count:1,damage:0});world.setBlock(10,80,10,blockId("grass"));const before=other.toJSON();let tilled:boolean|undefined;
 const sink:DropSink=()=>({commit:()=>{tilled=tillSoil(world,other,"survival",{x:10,y:80,z:10,normal:{x:0,y:1,z:0}});return true;}});
 expect(breakBlock(world,inventory,"survival",0,79,0,()=>.1,[],sink)).toBe(true);expect(tilled).toBe(false);expect(other.toJSON()).toEqual(before);expect(world.getBlock(10,80,10)).toBe(blockId("grass"));
});
