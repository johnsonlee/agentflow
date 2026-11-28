import { describe, expect, it } from "vitest";
import { inspectPortalFrame, findPortalFrame, capturePortalFrame, type PortalFrame, type PortalCell } from "../src/world/portal-frame";
import { blockId } from "../src/catalog/blocks";
import { World } from "../src/world/world";

// Tests use a loaded-cell map; undefined is unknown, never implicit Air.
const key=(p:PortalCell)=>`${p.x},${p.y},${p.z}`;
function fixture(axis:"x"|"z"="x",width=2,height=3){
 const frame:PortalFrame={axis,x:-17,y:12,z:-1,width,height};const cells=new Map<string,number>();
 const cell=(u:number,v:number):PortalCell=>({x:frame.x+(axis==="x"?u:0),y:frame.y+v,z:frame.z+(axis==="z"?u:0)});
 for(let v=-1;v<=height;v++)for(let u=-1;u<=width;u++)cells.set(key(cell(u,v)),u<0||u===width||v<0||v===height?blockId("obsidian"):0);
 return{frame,cells,cell,read:(p:PortalCell)=>cells.get(key(p))};
}
describe("loaded-only portal frame inspection",()=>{
 it.each(["x","z"]as const)("recognizes real ten-block minimal frame on %s without corners",axis=>{
  const f=fixture(axis);for(const u of[-1,2])for(const v of[-1,3])f.cells.delete(key(f.cell(u,v)));
  const r=inspectPortalFrame(f.read,f.frame);expect(r.status).toBe("valid");if(r.status!=="valid")return;
  expect(r.interior).toHaveLength(6);expect(r.boundary).toHaveLength(10);expect(new Set(r.dependencies.map(key)).size).toBe(16);
  expect(findPortalFrame(f.read,f.cell(1,2),axis)).toMatchObject({status:"valid",frame:f.frame});
 });
 it("rejects a missing side, wrong material and blocked interior without mutation",()=>{
  const f=fixture();const before=JSON.stringify([...f.cells]);expect(inspectPortalFrame(f.read,f.frame).status).toBe("valid");expect(JSON.stringify([...f.cells])).toBe(before);
  f.cells.set(key(f.cell(-1,1)),0);expect(inspectPortalFrame(f.read,f.frame).status).toBe("invalid");
  f.cells.set(key(f.cell(-1,1)),blockId("stone"));expect(inspectPortalFrame(f.read,f.frame).status).toBe("invalid");
  f.cells.set(key(f.cell(-1,1)),blockId("obsidian"));f.cells.set(key(f.cell(1,1)),blockId("water"));expect(inspectPortalFrame(f.read,f.frame).status).toBe("invalid");
 });
 it("preserves unknown loaded state instead of generating or treating it as Air",()=>{
  const f=fixture();f.cells.delete(key(f.cell(1,1)));expect(inspectPortalFrame(f.read,f.frame).status).toBe("unknown");
  expect(findPortalFrame(f.read,f.cell(1,2),"x").status).toBe("unknown");
 });
 it("allows a physical Fire ignition cell but no other occupied interior",()=>{
  const f=fixture();f.cells.set(key(f.cell(0,0)),blockId("fire"));expect(inspectPortalFrame(f.read,f.frame).status).toBe("valid");
  expect(findPortalFrame(f.read,f.cell(0,0),"x").status).toBe("valid");
 });
 it("accepts a bounded large rectangle and refuses unsupported sizes/coordinates",()=>{
  const f=fixture("z",21,21);expect(inspectPortalFrame(f.read,f.frame).status).toBe("valid");
  for(const bad of[{width:1},{height:2},{width:22},{height:22},{width:NaN},{x:1.2},{y:0},{axis:"y"}])expect(inspectPortalFrame(f.read,{...f.frame,...bad}as PortalFrame).status).toBe("invalid");
 });
 it("does not search across a solid unrelated cell",()=>{const f=fixture();f.cells.set(key(f.cell(1,1)),blockId("stone"));expect(findPortalFrame(f.read,f.cell(1,2),"x").status).toBe("invalid");});
 it("reads each dependency once for a supplied frame and returns observed identities",()=>{
  const f=fixture(),seen=new Map<string,number>();const r=inspectPortalFrame(p=>{seen.set(key(p),(seen.get(key(p))??0)+1);return f.read(p);},f.frame);
  expect(r.status).toBe("valid");expect([...seen.values()].every(n=>n===1)).toBe(true);if(r.status==="valid")expect(r.dependencies.every(p=>p.id===f.read(p))).toBe(true);
 });
 it.each(["x","z"]as const)("discovers maximum bounded %s rectangle from its farthest interior cell",axis=>{
  const f=fixture(axis,21,21);expect(findPortalFrame(f.read,f.cell(20,20),axis)).toMatchObject({status:"valid",frame:f.frame});
 });
 it("refuses a known hole even when another dependency is unknown",()=>{
  const f=fixture();f.cells.delete(key(f.cell(0,1)));f.cells.set(key(f.cell(-1,2)),0);
  expect(inspectPortalFrame(f.read,f.frame).status).toBe("invalid");
 });
 it("does not read cells for malformed input or cross the world boundary",()=>{
  let reads=0;const read=()=>{reads++;return 0;};
  expect(inspectPortalFrame(read,{...fixture().frame,x:-30000000}).status).toBe("invalid");
  expect(findPortalFrame(read,{x:NaN,y:12,z:0},"x").status).toBe("invalid");expect(reads).toBe(0);
 });
 it("snapshots caller frame before invoking read callbacks",()=>{
  const f=fixture(),original={...f.frame};let once=false;
  const r=inspectPortalFrame(p=>{const id=f.read(p);if(!once){once=true;f.frame.x+=100;f.frame.width=21;}return id;},f.frame);
  expect(once).toBe(true);expect(r).toMatchObject({status:"valid",frame:original});
 });
 it("snapshots caller discovery point before invoking read callbacks",()=>{
  const f=fixture(),point=f.cell(1,2);let once=false;
  const r=findPortalFrame(p=>{const id=f.read(p);if(!once){once=true;point.x+=100;}return id;},point,"x");
  expect(once).toBe(true);expect(r).toMatchObject({status:"valid",frame:f.frame});
 });
 it("does not expose internal geometry to coordinate mutation by a reader",()=>{
  const f=fixture();const r=inspectPortalFrame(p=>{const id=f.read(p);p.x+=100;return id;},f.frame);
  expect(r.status).toBe("valid");if(r.status!=="valid")return;
  expect(r.interior.every(p=>p.x>=-17&&p.x<=-16)).toBe(true);expect(r.dependencies.every(p=>p.id===f.read(p))).toBe(true);
 });
});

describe("actual World portal observations",()=>{
 function actual(){const f=fixture(),world=new World(1);for(const [k,id]of f.cells){const[x,y,z]=k.split(",").map(Number);world.setBlock(x,y,z,id);}return{...f,world};}
 it("does not generate missing chunks or change edits",()=>{
  const world=new World(1),before=world.exportEdits();expect(capturePortalFrame(world,{x:0,y:80,z:0},"x").status).toBe("unknown");expect(world.hasChunk(0,0)).toBe(false);expect(world.exportEdits()).toEqual(before);
 });
 it("pins all16 real cells and rejects same-ID replacement",()=>{
  const f=actual(),before=f.world.exportEdits(),plan=capturePortalFrame(f.world,f.cell(1,2),"x");expect(plan.status).toBe("valid");expect(plan.expected).toHaveLength(16);expect(plan.unchanged()).toBe(true);expect(f.world.exportEdits()).toEqual(before);
  const p=f.cell(-1,1);f.world.setBlock(p.x,p.y,p.z,0);f.world.setBlock(p.x,p.y,p.z,blockId("obsidian"));expect(plan.unchanged()).toBe(false);
 });
 it("rejects unload/reload even when the structural block values are identical",()=>{
  const f=actual(),plan=capturePortalFrame(f.world,f.cell(0,0),"x");expect(plan.status).toBe("valid");f.world.unloadChunk(-2,-1);f.world.getChunk(-2,-1);expect(plan.unchanged()).toBe(false);
 });
 it("refuses a source changed during inspection and keeps that external change",()=>{
  const f=actual(),original=f.world.captureCell.bind(f.world),target=f.cell(1,2),last=f.cell(2,2);let invoked=false;
  f.world.captureCell=(x,y,z)=>{
   const snapshot=original(x,y,z);
   if(!invoked&&x===last.x&&y===last.y&&z===last.z){invoked=true;f.world.setBlock(target.x,target.y,target.z,blockId("stone"));f.world.setBlock(target.x,target.y,target.z,0);}
   return snapshot;
  };
  const plan=capturePortalFrame(f.world,target,"x");expect(invoked).toBe(true);expect(plan).toMatchObject({status:"invalid",reason:"source-changed-during-inspection"});expect(plan.expected).toHaveLength(0);expect(plan.unchanged()).toBe(false);expect(f.world.getBlock(target.x,target.y,target.z)).toBe(0);
 });
 it("freezes returned plan geometry and expectations before permission callbacks",()=>{
  const f=actual(),plan=capturePortalFrame(f.world,f.cell(0,0),"x");expect(plan.status).toBe("valid");if(plan.status!=="valid")return;
  expect(Object.isFrozen(plan)).toBe(true);expect(Object.isFrozen(plan.frame)).toBe(true);expect(Object.isFrozen(plan.interior)).toBe(true);expect(Object.isFrozen(plan.interior[0])).toBe(true);expect(Object.isFrozen(plan.expected)).toBe(true);expect(Object.isFrozen(plan.expected[0])).toBe(true);
 });
});
