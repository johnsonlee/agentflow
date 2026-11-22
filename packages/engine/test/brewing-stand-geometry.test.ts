import * as THREE from "three";
import {WorldRenderer} from "../../../apps/web/src/rendering/renderer";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, BREWING_STAND_PARTS, Inventory, World, blockById, blockCollisionBoxes, blockId,
  blockRenderBoxes, blockSelectionBoxes, bodyBox, boxCollides, createPlayerBody, fenceConnections,
  hasSupport, isOpaque, isSolid, meshChunk, placeBlock, placedBlockOf, raycast, stepPlayer,
} from "../src/index";
const STAND = 201, STONE = blockId("stone");
function scene() {
  const blocks = new Map<string, number>();
  return { blocks, get:(x:number,y:number,z:number)=>blocks.get(`${x},${y},${z}`)??(y===39?STONE:AIR),
    set:(x:number,y:number,z:number,id=STAND)=>blocks.set(`${x},${y},${z}`,id) };
}
function emptyWorld(): World {
  const world=new World(7,2);for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++)world.getChunk(cx,cz).blocks.fill(AIR);return world;
}
it("appends only explicit201 without aliasing or changing the prior320 block definitions",()=>{
  expect(createHash("sha256").update(JSON.stringify(BLOCKS.slice(0,320))).digest("hex")).toBe("c8634e7cff98572cecacebd838c8478e85b60217f0c59efd7e46a30bc5107c6b");
  expect(BLOCKS).toHaveLength(327);expect(BLOCKS[320]).toMatchObject({id:201,name:"brewing_stand",shape:"brewing_stand",solid:true,transparent:true,needsSupport:true,tool:"pickaxe",harvestTier:1});
  expect(new Set(BLOCKS.map(b=>b.id)).size).toBe(327);expect(blockId("brewing_stand")).toBe(STAND);expect(placedBlockOf(STAND)).toBe(STAND);expect(isOpaque(STAND)).toBe(false);
});
it("shares immutable eight-part render, collision and selection bounds without neighbor reads",()=>{
  let reads=0;const get=()=>{reads++;throw Error("Stand geometry must not inspect neighbors with explicitid");};
  const boxes=BREWING_STAND_PARTS.map(p=>p.box);
  expect(boxes).toHaveLength(8);expect(blockCollisionBoxes(get,0,40,0,STAND)).toEqual(boxes);expect(blockRenderBoxes(get,0,40,0,STAND)).toEqual(boxes);expect(blockSelectionBoxes(get,0,40,0,STAND)).toEqual(boxes);expect(reads).toBe(0);
  expect(Object.isFrozen(BREWING_STAND_PARTS)).toBe(true);
  for(const part of BREWING_STAND_PARTS){expect(Object.isFrozen(part)).toBe(true);expect(Object.isFrozen(part.box)).toBe(true);for(const v of part.box){expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(1);}expect(part.box[3]).toBeGreaterThan(part.box[0]);expect(part.box[4]).toBeGreaterThan(part.box[1]);expect(part.box[5]).toBeGreaterThan(part.box[2]);}
  const first=BREWING_STAND_PARTS[0].box[0];expect(()=>{(BREWING_STAND_PARTS[0].box as unknown as number[])[0]=.9;}).toThrow();expect(BREWING_STAND_PARTS[0].box[0]).toBe(first);
});
it("raycasts the actual post and feet with exact normals and passes visible gaps at positive and negative anchors",()=>{
  for(const [x,y,z] of [[0,40,0],[-3,40,-4]]){
    const s=scene();s.set(x,y,z);s.set(x,y,z-2,STONE);
    const post=raycast(s.get,{x:x+.5,y:y+.75,z:z+2},{x:0,y:0,z:-1},5,isSolid)!;
    expect(post).toMatchObject({x,y,z,id:STAND,normal:{x:0,y:0,z:1}});expect(post.distance).toBeCloseTo(2-9/16);
    expect(raycast(s.get,{x:x+.5,y:y+.75,z:z+2},{x:0,y:0,z:-1},1.4,isSolid)).toBeNull();
    const gap=raycast(s.get,{x:x+.1,y:y+.75,z:z+2},{x:0,y:0,z:-1},5,isSolid)!;expect(gap).toMatchObject({x,y,z:z-2,id:STONE});expect(gap.distance).toBeCloseTo(3);
    const top=raycast(s.get,{x:x+.5,y:y+2,z:z+.5},{x:0,y:-1,z:0},3,isSolid)!;expect(top.normal).toEqual({x:0,y:1,z:0});expect(top.distance).toBeCloseTo(2-14/16);
    const foot=raycast(s.get,{x:x+.9,y:y+1,z:z+.1},{x:0,y:-1,z:0},2,isSolid)!;expect(foot.distance).toBeCloseTo(1-2/16);
  }
});
it("actual player movement stops at the rack while small bodies can occupy the true empty gaps",()=>{
  const s=scene();s.set(0,40,0);
  expect(boxCollides(s.get,bodyBox({x:.5,y:40.3,z:.5},.1,.3))).toBe(true);
  expect(boxCollides(s.get,bodyBox({x:.1,y:40.3,z:.8},.1,.1))).toBe(false);
  const player=createPlayerBody({x:.5,y:40.3,z:2});player.flying=true;
  for(let n=0;n<120;n++)stepPlayer(s.get,player,{forward:1,strafe:0,jump:false,descend:false,sprint:false},1/60);
  expect(player.position.z).toBeGreaterThan(1.1);expect(player.position.z).toBeLessThan(1.3);expect(boxCollides(s.get,bodyBox(player.position))).toBe(false);
});
it("real placement requires opaque support, refuses overlapping bodies and source leases without consuming the bag",()=>{
  const w=emptyWorld(),bag=new Inventory();bag.slots[0]={id:STAND,count:2};const far={x:4.5,y:40,z:4.5};
  expect(placeBlock(w,bag,"survival",0,40,0,far)).toBe(false);expect(bag.selectedStack()?.count).toBe(2);
  w.setBlock(0,39,0,blockId("glass"));expect(hasSupport(w,blockById(STAND),0,40,0,AIR)).toBe(false);
  w.setBlock(0,39,0,STONE);const before=bag.toJSON();expect(placeBlock(w,bag,"survival",0,40,0,{x:.5,y:40.2,z:.5})).toBe(false);expect(bag.toJSON()).toEqual(before);
  // Existing placement deliberately remains a conservative fullcell player-overlap probe.
  expect(placeBlock(w,bag,"survival",0,40,0,{x:.1,y:40.3,z:.8})).toBe(false);expect(bag.toJSON()).toEqual(before);
  const lease=w.reserveBlockBatch([[0,40,0,STONE]]);expect(lease).not.toBeNull();expect(placeBlock(w,bag,"survival",0,40,0,far)).toBe(false);expect(bag.toJSON()).toEqual(before);lease!.release();
  expect(placeBlock(w,bag,"survival",0,40,0,far)).toBe(true);expect(w.getLoadedBlock(0,40,0)).toBe(STAND);expect(bag.selectedStack()?.count).toBe(1);
  expect(hasSupport(w,blockById(STAND),0,41,0,AIR)).toBe(false);
});
it("retains old cube, farmland and fence geometry and does not connect a fence to the stand",()=>{
  const s=scene();s.set(0,40,0,blockId("oak_fence"));s.set(1,40,0,STAND);expect(fenceConnections(s.get,0,40,0)).toBe(0);
  expect(blockCollisionBoxes(s.get,0,40,0,STONE)).toEqual([[0,0,0,1,1,1]]);
  expect(blockCollisionBoxes(s.get,0,40,0,blockId("farmland_0"))).toEqual([[0,0,0,1,15/16,1]]);
  expect(blockSelectionBoxes(s.get,0,40,0,blockId("torch"))).toEqual([[0,0,0,1,1,1]]);
});
it("actual chunk mesh emits each shared part with only its base or rod texture and matching bounds",()=>{
  const w=emptyWorld();w.setBlock(5,40,5,STAND);const seen:string[]=[];
  const mesh=meshChunk(w,0,0,name=>{seen.push(name);return name==="brewing_stand_base"?[0,.5,.5,0]:[.5,1,1,.5];});
  expect(mesh.solid.positions).toHaveLength(8*24*3);expect(mesh.solid.indices).toHaveLength(8*36);expect(mesh.liquid.indices).toHaveLength(0);expect(mesh.translucent.indices).toHaveLength(0);
  expect(seen.filter(n=>n==="brewing_stand_base")).toHaveLength(5*6);expect(seen.filter(n=>n==="brewing_stand_rod")).toHaveLength(3*6);expect(new Set(seen)).toEqual(new Set(["brewing_stand_base","brewing_stand_rod"]));
  BREWING_STAND_PARTS.forEach((part,n)=>{const p=Array.from(mesh.solid.positions.slice(n*72,(n+1)*72));for(let axis=0;axis<3;axis++){const values=p.filter((_,i)=>i%3===axis);expect(Math.min(...values)).toBeCloseTo([5,40,5][axis]+part.box[axis]);expect(Math.max(...values)).toBeCloseTo([5,40,5][axis]+part.box[axis+3]);}});
});
it("the nonopaque multipart stand never hides the adjacent fullcube face",()=>{
  const w=emptyWorld();w.setBlock(5,40,5,STAND);w.setBlock(6,40,5,STONE);const mesh=meshChunk(w,0,0,()=>[0,0,1,1]);expect(mesh.solid.indices).toHaveLength((8+1)*36);
});

it("actual renderer selection and cracks use the same eight parts and restore the legacy cube outline",()=>{
  const w=emptyWorld();w.setBlock(5,40,5,STAND);const view=Object.create(WorldRenderer.prototype) as WorldRenderer;
  const port=view as unknown as {world:World;selection:THREE.LineSegments;crack:THREE.Mesh;selectionGeometryKey:string;crackTextures:THREE.Texture[]};
  port.world=w;port.selection=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial());port.crack=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());port.selectionGeometryKey="cube";port.crackTextures=Array.from({length:10},()=>new THREE.Texture());
  let oldDisposals=0;port.selection.geometry.addEventListener("dispose",()=>oldDisposals++);port.crack.geometry.addEventListener("dispose",()=>oldDisposals++);
  view.setSelection({x:5,y:40,z:5},.4);expect(oldDisposals).toBe(2);expect(port.selectionGeometryKey).toContain("brewing_stand:");expect(port.selection.geometry.getAttribute("position").count).toBe(8*24);expect(port.crack.geometry.index?.count).toBe(8*36);expect((port.crack.material as THREE.MeshBasicMaterial).map).toBe(port.crackTextures[4]);
  port.selection.geometry.computeBoundingBox();expect(port.selection.geometry.boundingBox!.min.y).toBeCloseTo(-.502);expect(port.selection.geometry.boundingBox!.max.y).toBeCloseTo(14/16-.5+.002);const same=port.selection.geometry;view.setSelection({x:5,y:40,z:5},.5);expect(port.selection.geometry).toBe(same);
  w.setBlock(5,40,5,STONE);view.setSelection({x:5,y:40,z:5});expect(port.selectionGeometryKey).toBe("cube");expect(port.selection.geometry.getAttribute("position").count).toBe(24);expect(port.crack.geometry.index?.count).toBe(36);view.setSelection(null);expect(port.selection.visible).toBe(false);expect(port.crack.visible).toBe(false);
  port.selection.geometry.dispose();port.crack.geometry.dispose();for(const t of port.crackTextures)t.dispose();
});
