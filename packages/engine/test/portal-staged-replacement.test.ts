import { expect,it } from "vitest";
import { World,Inventory,blockId,stackId,tryUsePortalIgnition,validatePortalEdits } from "../src";
function prepared(){
 const world=new World(1),inventory=new Inventory();
 for(let y=79;y<=83;y++)for(let x=-1;x<=2;x++)world.setBlock(x,y,0,((y===79||y===83)&&x>=0&&x<=1||(x===-1||x===2)&&y>=80&&y<=82)?blockId("obsidian"):0);
 inventory.setSlot(0,{id:stackId("flint_and_steel"),count:1});
 expect(tryUsePortalIgnition(world,inventory,"survival",{x:0,y:79,z:0,normal:{x:0,y:1,z:0}}).ok).toBe(true);return world;
}
it.each([0,191,192,193])("independent: invalidated frame honors explicit replacement %i without orphan physical cells",replacement=>{
 const world=prepared();const observed:{owned:number;ids:number[]}[]=[];
 world.onBlockChanged(()=>observed.push({owned:world.portals.exportState().records.length,ids:[0,1].flatMap(x=>[80,81,82].map(y=>world.getBlock(x,y,0)))}));
 expect(world.commitBlockBatch([[0,79,0,0],[0,80,0,replacement]])).toBe(true);
 expect(world.portals.exportState().records).toEqual([]);
 // Any portal physical ID loses its owner when this frame is invalidated.
 expect(world.getBlock(0,80,0)).toBe(replacement===192||replacement===193?0:replacement);
 for(let y=80;y<=82;y++)for(let x=0;x<=1;x++)if(x!==0||y!==80)expect(world.getBlock(x,y,0)).toBe(0);
 expect(observed.length).toBeGreaterThan(0);
 for(const state of observed)expect(state).toEqual({owned:0,ids:[replacement===192||replacement===193?0:replacement,0,0,0,0,0]});
 expect(validatePortalEdits(world.portals.exportState(),world.exportEdits())).toBe(true);
});
