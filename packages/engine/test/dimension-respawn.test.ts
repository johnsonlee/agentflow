import {afterEach,expect,it,vi} from 'vitest';
import {prepareOverworldRespawn} from '../src/world/dimension-respawn';
import {World,type BlockEdit} from '../src/world/world';
import {AIR,blockId,tryBlockById} from '../src/catalog/blocks';
import {WORLD_BORDER} from '../src/core/math';
import {WORLD_HEIGHT} from '../src/world/chunk';
import {bodyBox,boxCollides} from '../src/simulation/physics';
import type {DimensionWorldState} from '../src/persistence/dimension-world';
const columns=[0,-4,4,-8,8];
function source():DimensionWorldState{return {seed:7,generatorVersion:2,player:{position:{x:WORLD_BORDER-.5,y:80,z:-WORLD_BORDER+.5},yaw:.7,pitch:.2,flying:true},edits:[],farming:{version:1,tick:13,accumulator:.4,cursor:0},fluids:{version:1,contactSeconds:.4},mobs:{nextId:5,records:[]},worldDrops:{nextKey:9,records:[]},snowballProjectiles:{version:1,nextKey:3,records:[]},blazeFireballs:{version:1,nextKey:4,records:[]}};}
function fill(id:number):BlockEdit[]{const edits:BlockEdit[]=[];for(const x of columns)for(const z of columns)for(let y=0;y<WORLD_HEIGHT;y++)edits.push([x,y,z,id]);return edits;}
afterEach(()=>vi.restoreAllMocks());
it('prepares an actual dry Overworld player and separate Agent near origin, ignoring an archived void pose and preserving source',()=>{
 const raw=source();raw.player.position!.y=-30;const before=structuredClone(raw),p=prepareOverworldRespawn(raw);expect(p).not.toBeNull();expect(raw).toEqual(before);expect(p!.world.dimension).toBe('overworld');expect(Math.abs(p!.position.x)).toBeLessThan(11);expect(Math.abs(p!.position.z)).toBeLessThan(11);expect(p!.unchanged()).toBe(true);expect(p!.position.y).toBeGreaterThan(0);expect(p!.position.y+1.8).toBeLessThanOrEqual(WORLD_HEIGHT);expect(p!.position).not.toEqual(p!.agentPosition);expect(Object.values(p!.agentPosition).every(Number.isSafeInteger)).toBe(true);
 const box=bodyBox(p!.position),get=(x:number,y:number,z:number)=>p!.world.getLoadedBlock(x,y,z)??AIR;expect(boxCollides(get,box)).toBe(false);expect(tryBlockById(get(Math.floor(p!.position.x),p!.position.y-1,Math.floor(p!.position.z)))?.shape).toBe('cube');expect(p!.state.edits).toEqual(p!.world.exportEdits());expect(p!.state.player.position).toEqual(p!.position);expect(p!.state.farming).toEqual(raw.farming);expect(p!.state.fluids).toEqual(raw.fluids);expect(p!.state.mobs).toEqual(raw.mobs);expect(p!.state.worldDrops).toEqual(raw.worldDrops);expect(p!.state.snowballProjectiles).toEqual(raw.snowballProjectiles);expect(p!.state.blazeFireballs).toEqual(raw.blazeFireballs);expect(Object.isFrozen(p)).toBe(true);expect(Object.isFrozen(p!.position)).toBe(true);expect(Object.isFrozen(p!.agentPosition)).toBe(true);
});
it('refuses edited void, all-hazard columns, solid ceiling and unsupported lowered floor without building a platform',()=>{
 for(const id of [AIR,blockId('water'),blockId('lava'),blockId('bedrock')]){const raw=source();raw.edits=fill(id);const before=JSON.stringify(raw);expect(prepareOverworldRespawn(raw)).toBeNull();expect(JSON.stringify(raw)).toBe(before);}
 const raw=source();raw.edits=fill(blockId('bedrock')).map(([x,y,z,id])=>[x,y,z,y>=90?AIR:y===89?blockId('soul_sand'):id]);expect(prepareOverworldRespawn(raw)).toBeNull();
});
it('refuses unknown body or support cells and never promotes unverified space to a safe spawn',()=>{
 vi.spyOn(World.prototype,'captureCell').mockReturnValue(undefined);const raw=source(),before=structuredClone(raw);expect(prepareOverworldRespawn(raw)).toBeNull();expect(raw).toEqual(before);
});
it('refuses corrupt archived owners, impossible coordinates, unsupported version and descriptor-bearing input',()=>{
 for(const alter of [(w:DimensionWorldState)=>{w.generatorVersion=4 as 1;},(w:DimensionWorldState)=>{w.player.position!.x=WORLD_BORDER+1;},(w:DimensionWorldState)=>{w.player.position!.z=NaN;},(w:DimensionWorldState)=>{w.edits=[[0,40,0,197]];},(w:DimensionWorldState)=>{w.edits=[[0,40,0,AIR],[0,40,0,AIR]];},(w:DimensionWorldState)=>{w.fluids={version:1,contactSeconds:NaN};}]){const raw=source();alter(raw);expect(prepareOverworldRespawn(raw)).toBeNull();}
 const getter=source();Object.defineProperty(getter,'seed',{enumerable:true,get(){throw Error('accessor invoked');}});expect(prepareOverworldRespawn(getter)).toBeNull();
});
it('binds support, Agent cell and chunk identities and refuses while a World source lease is busy',()=>{
 const p=prepareOverworldRespawn(source())!;expect(p).not.toBeNull();const x=Math.floor(p.position.x),y=p.position.y,z=Math.floor(p.position.z),support=p.world.captureCell(x,y-1,z)!;const lease=p.world.reserveBlockBatch([[x,y-1,z,support.id]])!;expect(lease).not.toBeNull();expect(p.unchanged()).toBe(false);lease.release();expect(p.unchanged()).toBe(true);p.world.setBlock(p.agentPosition.x,p.agentPosition.y,p.agentPosition.z,blockId('stone'));expect(p.unchanged()).toBe(false);
 const b=prepareOverworldRespawn(source())!;b.world.setBlock(Math.floor(b.position.x),b.position.y-1,Math.floor(b.position.z),AIR);expect(b.unchanged()).toBe(false);
 const c=prepareOverworldRespawn(source())!;const cx=Math.floor(c.position.x/16),cz=Math.floor(c.position.z/16);c.world.unloadChunk(cx,cz);c.world.getBlock(Math.floor(c.position.x),c.position.y,Math.floor(c.position.z));expect(c.unchanged()).toBe(false);
});
it('keeps unrelated positive and negative boundary owners and restores actual cold fluid and gravel clocks without advancing',()=>{
 const raw=source();raw.edits=[[WORLD_BORDER,50,WORLD_BORDER,blockId('stone')],[-WORLD_BORDER,50,-WORLD_BORDER,blockId('stone')],[3,70,3,blockId('gravel')]];raw.gravelHarvests={version:1,records:[{x:3,y:70,z:3,flint:false}]};const before=structuredClone(raw),p=prepareOverworldRespawn(raw);expect(p).not.toBeNull();expect(raw).toEqual(before);expect(p!.state.edits).toEqual(raw.edits);expect(p!.world.fluids.exportState()).toEqual(raw.fluids);expect(p!.world.gravelHarvests.exportState()).toEqual(raw.gravelHarvests);expect(p!.state.farming).toEqual(raw.farming);
});

it('refuses leaves as a sole canopy support instead of respawning above foliage',()=>{
 const raw=source();raw.edits=fill(blockId('bedrock')).map(([x,y,z,id])=>[x,y,z,y>=90?AIR:y===89?blockId('oak_leaves'):id]);for(const x of columns)for(const z of columns){raw.edits.push([x+1,89,z,blockId('oak_leaves')]);for(let y=90;y<WORLD_HEIGHT;y++)raw.edits.push([x+1,y,z,AIR]);}expect(prepareOverworldRespawn(raw)===null).toBe(true);
});
it('preserves actual finite Fire timers and only reflects existing deterministic cold Lava reconciliation',()=>{
 const raw=source();raw.edits=[[200,70,200,blockId('stone')],[200,71,200,blockId('fire')],[0,64,0,blockId('water')],[1,64,0,blockId('lava')]];raw.fire={version:1,contactSeconds:.3,records:[{x:200,y:71,z:200,remaining:6.25}]};const before=structuredClone(raw),p=prepareOverworldRespawn(raw);expect(p).not.toBeNull();expect(raw).toEqual(before);expect(p!.state.fire).toEqual(raw.fire);expect(p!.world.fires.exportState()).toEqual(raw.fire);expect(p!.state.fluids).toEqual(raw.fluids);expect(p!.state.edits).toEqual(raw.edits.map(e=>e[0]===1&&e[1]===64&&e[2]===0?[1,64,0,blockId('obsidian')]:e));expect(p!.unchanged()).toBe(true);
});
