import { expect,it } from "vitest";
import { World } from "../src/world/world";
import { Inventory } from "../src/ownership/inventory";
import { AIR,blockId } from "../src/catalog/blocks";
import { tryUsePortalIgnition } from "../src/simulation/portals";
import { findPortalLanding } from "../src/world/portal-landing";
import { WORLD_BORDER } from "../src/core/math";
function setup(axis:"x"|"z"="x") {
 const world=new World(12345),bag=new Inventory();
 const cell=(u:number,v:number)=>({x:axis==="x"?u:1,y:80+v,z:axis==="z"?u:1});
 for(let v=0;v<=4;v++)for(let u=0;u<=3;u++){const p=cell(u,v);world.setBlock(p.x,p.y,p.z,u===0||u===3||v===0||v===4?blockId("obsidian"):AIR);}
 bag.slots[0]={id:838,count:1};const floor=cell(1,0);expect(tryUsePortalIgnition(world,bag,"survival",{...floor,normal:{x:0,y:1,z:0}}).ok).toBe(true);
 const frame=world.portals.exportState().records[0];
 return {world,bag,frame};
}
function pad(world:World,x:number,z:number,id=blockId("stone")) { world.setBlock(x,80,z,id);world.setBlock(x,81,z,AIR);world.setBlock(x,82,z,AIR); }
it.each(["x","z"] as const)("finds a real dry supported exit for axis %s without edits, loads or wear",axis=>{
 const {world,bag,frame}=setup(axis),x=axis==="x"?1:0,z=axis==="z"?1:0;pad(world,x,z);
 const before=world.exportEdits(),chunks=world.loadedChunkCount(),tool=structuredClone(bag.slots[0]);const landing=findPortalLanding(world,frame);
 expect(landing?.position).toEqual({x:x+.5,y:81,z:z+.5});expect(landing?.unchanged()).toBe(true);
 expect(world.exportEdits()).toEqual(before);expect(world.loadedChunkCount()).toBe(chunks);expect(bag.slots[0]).toEqual(tool);
});
it("refuses a void rather than building or clearing anything",()=>{const {world,frame}=setup();const before=world.exportEdits(),chunks=world.loadedChunkCount();expect(findPortalLanding(world,frame)).toBeNull();expect(world.exportEdits()).toEqual(before);expect(world.loadedChunkCount()).toBe(chunks);});
it.each(["water","lava","fire","stone"])("avoids occupied or hazardous exit %s and chooses the other supported side",name=>{
 const {world,frame}=setup();pad(world,1,0);pad(world,1,2);world.setBlock(1,81,0,blockId(name));expect(findPortalLanding(world,frame)?.position).toEqual({x:1.5,y:81,z:2.5});
});
it("rejects low ceilings and partial or raised fence support",()=>{
 const {world,frame}=setup();pad(world,1,0);world.setBlock(1,82,0,blockId("stone"));expect(findPortalLanding(world,frame)).toBeNull();
 world.setBlock(1,82,0,AIR);world.setBlock(1,80,0,blockId("oak_fence"));expect(findPortalLanding(world,frame)).toBeNull();
});
it("requires actual owned and physically coherent portal cells",()=>{
 const {world,frame}=setup();pad(world,1,0);expect(findPortalLanding(world,{...frame,x:frame.x+1})).toBeNull();
 world.setBlock(frame.x-1,frame.y,frame.z,AIR);expect(findPortalLanding(world,frame)).toBeNull();
});
it("invalidates support ABA and unload/reload even if the final block IDs match",()=>{
 const {world,frame}=setup();pad(world,1,0);const plan=findPortalLanding(world,frame)!;expect(plan).not.toBeNull();world.setBlock(1,80,0,AIR);world.setBlock(1,80,0,blockId("stone"));expect(plan.unchanged()).toBe(false);
 const other=findPortalLanding(world,frame)!;expect(other).not.toBeNull();world.unloadChunk(0,0);world.getChunk(0,0);expect(other.unchanged()).toBe(false);
});
it("never resurrects a landing after its actual portal owner is cleared and restored",()=>{
 const {world,bag,frame}=setup();pad(world,1,0);const plan=findPortalLanding(world,frame)!,edits=world.exportEdits(),saved=world.portals.exportState(),tool=structuredClone(bag.slots[0]);
 expect(plan.unchanged()).toBe(true);world.portals.clear();expect(plan.unchanged()).toBe(false);
 expect(world.portals.restore(saved,edits).invalid).toBe(false);expect(plan.unchanged()).toBe(false);
 expect(findPortalLanding(world,frame)?.unchanged()).toBe(true);expect(world.exportEdits()).toEqual(edits);expect(bag.slots[0]).toEqual(tool);
});
it("refuses unknown cells without generating their chunks",()=>{
 const {world,frame}=setup();pad(world,1,0);world.unloadChunk(0,0);const chunks=world.loadedChunkCount();expect(findPortalLanding(world,frame)).toBeNull();expect(world.loadedChunkCount()).toBe(chunks);
});
it("does not alias caller frame or let callers move an accepted landing",()=>{
 const {world,frame}=setup();pad(world,1,0);const plan=findPortalLanding(world,frame)!;frame.x=200;expect(plan.frame.x).toBe(1);expect(plan.unchanged()).toBe(true);expect(Object.isFrozen(plan.position)).toBe(true);expect(Object.isFrozen(plan.frame)).toBe(true);
});
it("skips an out-of-border side while retaining a valid inward exit",()=>{
 const world=new World(12345),bag=new Inventory(),z=-WORLD_BORDER;
 for(let y=80;y<=84;y++)for(let x=0;x<=3;x++)world.setBlock(x,y,z,x===0||x===3||y===80||y===84?blockId("obsidian"):AIR);
 bag.slots[0]={id:838,count:1};expect(tryUsePortalIgnition(world,bag,"survival",{x:1,y:80,z,normal:{x:0,y:1,z:0}}).ok).toBe(true);
 pad(world,1,z+1);const frame=world.portals.exportState().records[0];expect(findPortalLanding(world,frame)?.position).toEqual({x:1.5,y:81,z:z+1.5});
});
