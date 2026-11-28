import {expect,it} from 'vitest';
import {preparePortalArrival} from '../src/world/portal-arrival';
import {readDimensionArchive} from '../src/persistence/dimension-save';
import {createDimensionGeneratedBlockProbe} from '../src/world/dimension-probe';
import {AIR,blockId} from '../src/catalog/blocks';
import type {DimensionWorldState} from '../src/persistence/dimension-world';
function empty():DimensionWorldState{return {seed:7,generatorVersion:1,player:{position:{x:.5,y:48,z:.5},yaw:0,pitch:0,flying:false},edits:[],farming:{version:1,tick:13,accumulator:.4,cursor:0}};}
it('prepares a real Nether target with actual owned portal and safe player/Agent exits without changing input',()=>{
 const input=empty(),before=structuredClone(input),p=preparePortalArrival(input,'nether',{x:0,y:48,z:0});expect(p).not.toBeNull();expect(input).toEqual(before);expect(p!.world.dimension).toBe('nether');expect(p!.created).toBe(true);expect(p!.unchanged()).toBe(true);expect(p!.state.edits).toEqual(p!.world.exportEdits());expect(p!.state.portals).toEqual(p!.world.portals.exportState());expect(p!.state.farming).toEqual(input.farming);expect(p!.position).not.toEqual(p!.agentPosition);
 expect(readDimensionArchive({version:1,active:'nether',inactive:{},links:[]},p!.state,createDimensionGeneratedBlockProbe()).kind).toBe('valid');
 const pos=p!.position;p!.world.setBlock(Math.floor(pos.x),pos.y-1,Math.floor(pos.z),AIR);expect(p!.unchanged()).toBe(false);
});
it('reuses the actual linked owned endpoint, and refuses a missing linked endpoint without replacing it',()=>{
 const a=preparePortalArrival(empty(),'nether',{x:0,y:48,z:0})!;expect(a).not.toBeNull();const before=structuredClone(a.state),b=preparePortalArrival(a.state,'nether',a.position,a.frame);expect(b).not.toBeNull();expect(b!.created).toBe(false);expect(b!.frame).toEqual(a.frame);expect(b!.state.edits).toEqual(before.edits);expect(a.state).toEqual(before);
 expect(preparePortalArrival(a.state,'nether',a.position,{...a.frame,x:a.frame.x+500})).toBeNull();
});
it('refuses malformed world/realm/version/coordinate data without mutating owned edits',()=>{
 const a=empty(),before=structuredClone(a);expect(preparePortalArrival(a,'nether',{x:1e100,y:48,z:0})).toBeNull();expect(preparePortalArrival({...a,generatorVersion:2},'nether',{x:0,y:48,z:0})).toBeNull();expect(preparePortalArrival({...a,edits:[[1,48,1,197]]},'nether',{x:0,y:48,z:0})).toBeNull();expect(a).toEqual(before);
});

it('keeps unrelated owned edits and simulation state through private construction and cold reuse',()=>{
 const input=empty();input.edits=[[80,50,80,blockId('stone')]];input.gravelHarvests={version:1,records:[]};input.fluids={version:1,contactSeconds:.4};const before=structuredClone(input);
 const a=preparePortalArrival(input,'nether',{x:0,y:48,z:0});expect(a).not.toBeNull();expect(a!.state.edits).toContainEqual([80,50,80,blockId('stone')]);expect(a!.state.farming).toEqual(input.farming);expect(a!.state.fluids).toEqual(input.fluids);expect(a!.state.gravelHarvests).toEqual(input.gravelHarvests);expect(input).toEqual(before);
 const b=preparePortalArrival(a!.state,'nether',a!.position,a!.frame);expect(b).not.toBeNull();expect(b!.state.fluids).toEqual(input.fluids);expect(b!.state.farming).toEqual(input.farming);
});

it('does not reuse another route reserved endpoint and respects Deny throughout its bounded creation area',()=>{
 const a=preparePortalArrival(empty(),'nether',{x:0,y:48,z:0})!;expect(a).not.toBeNull();const other=preparePortalArrival(a.state,'nether',a.position,undefined,[a.frame]);expect(other).not.toBeNull();expect(other!.created).toBe(true);expect(other!.frame).not.toEqual(a.frame);expect(other!.state.portals?.records).toContainEqual(a.frame);
 const denied=empty();for(let x=-9;x<=10;x++)for(let z=-9;z<=9;z++)denied.edits.push([x,1,z,blockId('deny')]);const before=structuredClone(denied);expect(preparePortalArrival(denied,'nether',{x:0,y:48,z:0})).toBeNull();expect(denied).toEqual(before);const creative=preparePortalArrival(denied,'nether',{x:0,y:48,z:0},undefined,[],'creative');expect(creative).not.toBeNull();expect(denied).toEqual(before);
});
it('composes a legitimate cold Water/Lava reconciliation with the opposite-realm route',async()=>{
 const {World}=await import('../src/world/world'),{Inventory}=await import('../src/ownership/inventory'),{tryUsePortalIgnition}=await import('../src/simulation/portals'),{createPortalRouteSave}=await import('../src/persistence/portal-route'),{parseSave}=await import('../src/persistence/save');
 const base=preparePortalArrival(empty(),'nether',{x:0,y:48,z:0})!;expect(base).not.toBeNull();const target=structuredClone(base.state),w=new World(7,1,'nether');w.importEdits(target.edits);w.portals.restore(target.portals,target.edits);w.setBlock(1008,60,0,blockId('water'));w.unloadChunk(63,0);w.setBlock(1007,60,0,blockId('lava'));expect(w.getLoadedBlock(1008,60,0)).toBeUndefined();expect(w.getLoadedBlock(1007,60,0)).toBe(blockId('lava'));target.edits=w.exportEdits();
 const source=new World(7),bag=new Inventory();for(let x=0;x<4;x++)for(let y=80;y<85;y++)source.setBlock(x,y,1,x===0||x===3||y===80||y===84?blockId('obsidian'):AIR);bag.slots[0]={id:838,count:1};expect(tryUsePortalIgnition(source,bag,'survival',{x:1,y:80,z:1,normal:{x:0,y:1,z:0}}).ok).toBe(true);
 const raw={version:1,name:'cold route',seed:7,generatorVersion:1,mode:'survival',timeOfDay:.2,inventory:bag.toJSON(),player:{position:{x:1.5,y:81,z:1.5},yaw:0,pitch:0,flying:false},edits:source.exportEdits(),portals:source.portals.exportState(),dimensions:{version:1,active:'overworld',inactive:{nether:target},links:[]}};
 const saved=parseSave(JSON.stringify(raw));expect(saved.dimensionsInvalid).toBeUndefined();const before=structuredClone(saved),prepared=preparePortalArrival(target,'nether',base.position,base.frame)!;expect(prepared).not.toBeNull();expect(prepared.world.getLoadedBlock(1007,60,0)).toBe(blockId('obsidian'));
 const next=createPortalRouteSave(saved,'overworld',source.portals.exportState().records[0],prepared.state,prepared.frame,prepared.position,prepared.agentPosition);expect(next).not.toBeNull();expect(next!.edits).toContainEqual([1007,60,0,blockId('obsidian')]);expect(next!.inventory).toEqual(saved.inventory);expect(saved).toEqual(before);
});
it('the prepared wrapper cannot rebind its exact World or guard',()=>{
 const p=preparePortalArrival(empty(),'nether',{x:0,y:48,z:0})!;expect(p).not.toBeNull();expect(Reflect.set(p,'world',{})).toBe(false);expect(Reflect.set(p,'unchanged',()=>true)).toBe(false);expect(Object.isFrozen(p)).toBe(true);
});
