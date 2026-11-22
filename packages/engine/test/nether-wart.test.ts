import {expect,it} from 'vitest';
import {AIR,World,Inventory,blockId,stackId,placeBlock,breakBlock,FarmingSystem,blockDrops,baseStackId,createAgent,runAgentCommand} from '../src/index';
const feet={x:2,y:90,z:2};
function bed(){const w=new World(73);w.setBlock(8,89,8,blockId('soul_sand'));w.setBlock(8,90,8,AIR);return w;}
it('plants one canonical Wart on Soul Sand; refuses obstruction, wrong support and Deny; Creative copies',()=>{
 const w=bed(),bag=new Inventory();bag.add(stackId('nether_wart'),3);
 expect(placeBlock(w,bag,'survival',8,90,8,feet)).toBe(true);expect(w.getBlock(8,90,8)).toBe(197);expect(bag.slots[0]?.count).toBe(2);
 expect(placeBlock(w,bag,'survival',8,90,8,feet)).toBe(false);w.setBlock(8,90,8,AIR);w.setBlock(8,88,8,blockId('deny'));
 expect(placeBlock(w,bag,'survival',8,90,8,feet)).toBe(false);expect(placeBlock(w,bag,'creative',8,90,8,feet)).toBe(true);expect(bag.slots[0]?.count).toBe(2);
 w.setBlock(8,90,8,AIR);w.setBlock(8,89,8,blockId('stone'));expect(placeBlock(w,bag,'creative',8,90,8,feet)).toBe(false);
});
it('harvests canonical items at every age, including a supported plant in one support harvest',()=>{
 const w=bed(),bag=new Inventory();for(let age=0;age<4;age++){expect(baseStackId(197+age)).toBe(842);expect(blockDrops(197+age)).toEqual([{id:842,count:age===3?3:1}]);}
 w.setBlock(8,90,8,200);expect(breakBlock(w,bag,'survival',8,89,8)).toBe(true);expect(w.getBlock(8,89,8)).toBe(AIR);expect(w.getBlock(8,90,8)).toBe(AIR);expect(bag.slots.reduce((n,s)=>n+(s?.id===842?s.count:0),0)).toBe(3);
});
it('receiver reentry cannot replace a Wart source, double harvest or grow it during the reserved receipt',()=>{
 const w=bed(),bag=new Inventory();w.setBlock(8,90,8,200);let committed=0;
 expect(breakBlock(w,bag,'survival',8,90,8,Math.random,[],(drops)=>{
 expect(drops).toEqual([{id:842,count:3}]);w.setBlock(8,90,8,AIR);expect(w.getBlock(8,90,8)).toBe(200);expect(breakBlock(w,bag,'survival',8,90,8)).toBe(false);
 return {commit(){committed++;return true;}};
 })).toBe(true);expect(committed).toBe(1);expect(w.getBlock(8,90,8)).toBe(AIR);
});
it('a refused receiver leaves mature Wart intact and awards no inventory',()=>{
 const w=bed(),bag=new Inventory();w.setBlock(8,90,8,200);expect(breakBlock(w,bag,'survival',8,90,8,Math.random,[],()=>null)).toBe(false);expect(w.getBlock(8,90,8)).toBe(200);expect(bag.slots.reduce((n,s)=>n+(s?.id===842?s.count:0),0)).toBe(0);
});
it('grows without water or light and resumes the same cadence after a cold edits/state restore',()=>{
 const a=bed();a.setBlock(8,90,8,197);let fa=new FarmingSystem(a);fa.update(.45,0);const b=bed();b.importEdits(a.exportEdits());const fb=new FarmingSystem(b,fa.toJSON());
 for(let i=0;i<500;i++){fa.update(1,0);fb.update(1,0);expect(b.getBlock(8,90,8)).toBe(a.getBlock(8,90,8));}expect(a.getBlock(8,90,8)).toBe(200);expect(fb.toJSON()).toEqual(fa.toJSON());fa.dispose();fb.dispose();
});

it('Agent plants and harvests canonical Wart, obeys Deny and reserves source across a receipt',()=>{
 const w=bed(),agent=createAgent(8,91,8);agent.slots[0]={id:842,count:2};
 expect(runAgentCommand(w,agent,{op:'place',dir:'down'}).ok).toBe(true);expect(agent.slots[0]?.count).toBe(1);expect(w.getBlock(8,90,8)).toBe(197);
 w.setBlock(8,90,8,200);let receipts=0;
 expect(runAgentCommand(w,agent,{op:'destroy',dir:'down'},{worldDrop(drops){expect(drops).toEqual([{id:842,count:3}]);w.setBlock(8,90,8,AIR);expect(w.getBlock(8,90,8)).toBe(200);return {commit(){receipts++;return true;}};}}).ok).toBe(true);
 expect(receipts).toBe(1);expect(agent.slots[0]?.count).toBe(1);expect(w.getBlock(8,90,8)).toBe(AIR);
 w.setBlock(8,88,8,blockId('deny'));expect(runAgentCommand(w,agent,{op:'place',dir:'down'}).ok).toBe(false);expect(agent.slots[0]?.count).toBe(1);
});
it('unknown support and unloaded cells suspend crop changes without loading chunks',()=>{
 const w=bed();w.setBlock(8,90,8,197);const f=new FarmingSystem(w),get=w.getLoadedBlock.bind(w);const chunks=w.loadedChunkCount();
 w.getLoadedBlock=(x,y,z)=>y===89?undefined:get(x,y,z);for(let n=0;n<500;n++)f.update(1,0);expect(w.getBlock(8,90,8)).toBe(197);expect(w.loadedChunkCount()).toBe(chunks);
 w.getLoadedBlock=get;w.unloadChunk(0,0);for(let n=0;n<50;n++)f.update(1,0);expect(w.loadedChunkCount()).toBe(chunks-1);f.dispose();
});

it('diagnoses hidden crop owners before repair across every retained raw item container',async()=>{
 const {diagnoseRawWartOwnership,parseSave,serializeSave}=await import('../src/persistence/save');
 const raw:any={version:1,name:'wart',seed:7,mode:'survival',timeOfDay:0,player:{position:feet,yaw:0,pitch:0,flying:false},edits:[],inventory:new Inventory().toJSON()};
 raw.inventory.slots[0]={id:197,count:1};raw.inventory.offhand={id:198,count:1};raw.inventory.equipment={head:{id:199,count:1}};raw.inventoryPending=[{id:200,count:1}];
 raw.agent={...createAgent(0,90,0),offhand:{id:197,count:1}};raw.agent.slots[0]={id:198,count:1};
 raw.furnaces=[{x:0,y:90,z:0,state:{input:{id:199,count:1},fuel:null,output:null,burnLeft:0,burnTotal:0,progress:0}}];
 raw.worldDrops={nextKey:1,records:[{stack:{id:200,count:1}}]};raw.mobs={records:[{pendingLoot:[{id:197,count:1}]}]};
 const paths=diagnoseRawWartOwnership(raw).map(i=>i.path);expect(paths).toEqual(expect.arrayContaining(['inventory.slots[0]','inventory.offhand','inventory.equipment.head','inventoryPending[0]','agent.offhand','agent.slots[0]','furnaces[0].state.input','worldDrops.records[0].stack','mobs.records[0].pendingLoot[0]']));
 const loaded=parseSave(JSON.stringify(raw));expect(loaded.wartOwnershipIssues?.length).toBe(9);expect(()=>serializeSave(loaded)).toThrow(/Wart/);expect(()=>serializeSave(raw)).toThrow(/Wart/);
});
it('raw crop support uses its own realm generated reference and refuses orphan crops before repair',async()=>{
 const {diagnoseRawWartSupport,parseSave,serializeSave}=await import('../src/persistence/save');
 const raw:any={version:1,name:'wart-support',seed:7,mode:'survival',timeOfDay:0,player:{position:feet,yaw:0,pitch:0,flying:false},edits:[[8,90,8,197]],inventory:new Inventory().toJSON()};
 expect(diagnoseRawWartSupport(raw,'overworld',()=>AIR)).toHaveLength(1);expect(diagnoseRawWartSupport(raw,'overworld',()=>195)).toEqual([]);
 expect(parseSave(JSON.stringify(raw),()=>AIR).wartOwnershipIssues).toHaveLength(1);expect(()=>serializeSave(raw,()=>AIR)).toThrow(/Wart/);
 raw.edits.push([8,89,8,195]);expect(parseSave(JSON.stringify(raw),()=>AIR).wartOwnershipIssues).toBeUndefined();expect(()=>serializeSave(raw,()=>AIR)).not.toThrow();
 raw.dimensions={version:1,active:'overworld',inactive:{nether:{seed:9,generatorVersion:1,player:raw.player,edits:[[8,90,8,200]]}},links:[]};
 const bad=parseSave(JSON.stringify(raw),()=>AIR);expect(bad.dimensionsInvalid).toBe(true);expect(bad.dimensionOwnershipIssues?.some(i=>i.path==='dimensions.inactive.nether.edits[0]'&&i.reason.includes('Soul Sand'))).toBe(true);
 raw.dimensions.inactive.nether.edits.push([8,89,8,195]);expect(parseSave(JSON.stringify(raw),()=>AIR).dimensionsInvalid).toBeUndefined();
});
it('refuses full or changed receivers without source debit and releases the world lease',()=>{
 const w=bed(),bag=new Inventory();w.setBlock(8,90,8,200);for(let i=0;i<36;i++)bag.slots[i]={id:blockId('stone'),count:64};
 expect(breakBlock(w,bag,'survival',8,90,8)).toBe(false);expect(w.getBlock(8,90,8)).toBe(200);expect(w.blockSourceLeaseBusy).toBe(false);
 let commits=0;expect(breakBlock(w,bag,'survival',8,90,8,Math.random,[],()=>{bag.selected=1;return {commit(){commits++;return true;}};})).toBe(false);expect(commits).toBe(0);expect(w.getBlock(8,90,8)).toBe(200);expect(w.blockSourceLeaseBusy).toBe(false);
});
it('canonical Wart metadata, counts, unsupported owners and malformed crop edits require raw recovery',async()=>{
 const {diagnoseRawWartOwnership,diagnoseRawWartSupport}=await import('../src/persistence/save');
 for(const stack of [{id:842,count:0},{id:842,count:65},{id:842,count:1,damage:1}])expect(diagnoseRawWartOwnership({inventory:{slots:[stack]}}).some(i=>i.path==='inventory.slots[0]')).toBe(true);
 expect(diagnoseRawWartOwnership({inventory:{slots:[{id:842,count:64}]}})).toEqual([]);expect(diagnoseRawWartOwnership({inventory:{equipment:{head:{id:842,count:1}}}})).toHaveLength(1);
 expect(diagnoseRawWartSupport({seed:7,edits:[[8,90,8,197],[8,90,8,198],[8,89,8,195]]},'overworld',()=>AIR)[0]?.reason).toContain('Malformed');
});
it('a real growth observer cannot recursively advance the farming clock',()=>{
 const w=bed();w.setBlock(8,90,8,197);const f=new FarmingSystem(w);let outer=0;const observed:Array<{before:number;after:number}>=[];let nested=false;
 const off=w.onBlockChanged((x,y,z,id)=>{if(nested||x!==8||y!==90||z!==8||id<198||id>200)return;nested=true;const before=f.toJSON().tick;f.update(1,0);observed.push({before,after:f.toJSON().tick});});
 for(let n=0;n<500&&!observed.length;n++){outer++;f.update(1,0);}off();f.dispose();
 expect(observed).toHaveLength(1);expect(observed[0].after).toBe(observed[0].before);expect(f.toJSON().tick).toBe(outer);expect(f.toJSON().accumulator).toBe(0);
});
