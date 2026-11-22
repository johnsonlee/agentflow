import {expect,it} from 'vitest';
import {AIR,World,Inventory,blockId,stackId,createAgent,runAgentCommand,breakBlock,BrewingStand,parseSave,serializeSave,diagnoseRawBrewingItemOwnership,captureDimensionWorld,replaceDimensionWorld} from '../src';
const stand=()=>{const b=new BrewingStand();b.replace(0,{id:stackId('water_bottle'),count:1});b.replace('ingredient',{id:stackId('nether_wart'),count:2});b.replace('fuel',{id:stackId('blaze_powder'),count:1});for(let i=0;i<7;i++)b.update(1);return b.snapshot();};
function save(){return {version:1 as const,name:'Brewing world',seed:7,mode:'survival' as const,timeOfDay:.4,player:{position:{x:1,y:80,z:2},yaw:0,pitch:0,flying:false},inventory:new Inventory().toJSON(),edits:[[8,80,8,201] as [number,number,number,number]],brewingStands:[{x:8,y:80,z:8,state:stand()}]};}
it('cold save keeps partial work and source owners detached; absent legacy field stays absent',()=>{
 const raw=save(),before=structuredClone(raw),cold=parseSave(serializeSave(raw));expect(cold.brewingOwnershipIssues).toBeUndefined();expect(cold.brewingStands).toEqual(raw.brewingStands);expect(raw).toEqual(before);
 const b=new BrewingStand(cold.brewingStands![0].state);for(let i=0;i<13;i++)b.update(1);expect(b.snapshot().bottles[0]).toEqual({id:845,count:1});expect(b.snapshot().ingredient?.count).toBe(1);expect(b.snapshot().fuelUses).toBe(19);
 const legacy=save();Reflect.deleteProperty(legacy,'brewingStands');legacy.edits=[];expect(parseSave(serializeSave(legacy))).not.toHaveProperty('brewingStands');
});
it('retains raw broken station diagnostics and refuses overwriting incomplete physical bindings',()=>{
 for(const change of [(s:any)=>s.brewingStands=[],(s:any)=>s.edits=[],(s:any)=>s.brewingStands[0].state.fuelUses=20,(s:any)=>s.brewingStands.push(structuredClone(s.brewingStands[0]))]){
  const raw=save();change(raw);const bytes=JSON.stringify(raw),cold=parseSave(bytes);expect(cold.brewingOwnershipIssues!.length).toBeGreaterThan(0);expect(()=>serializeSave(cold)).toThrow(/brewing/);expect(()=>serializeSave(raw)).toThrow(/brewing/);expect(JSON.stringify(raw)).toBe(bytes);
 }
});
it('preserves stations in their own realm and diagnoses inactive orphan owners before projection',()=>{
 const raw=save();const active=save();active.edits=[];active.brewingStands=[];
 const input={...active,dimensions:{version:1 as const,active:'overworld' as const,inactive:{nether:captureDimensionWorld(raw)},links:[]}};
 const cold=parseSave(serializeSave(input));expect(cold.dimensionsInvalid).toBeUndefined();expect(cold.dimensions!.inactive.nether!.brewingStands).toEqual(raw.brewingStands);
 const back=replaceDimensionWorld(cold,cold.dimensions!.inactive.nether!);expect(back.brewingStands).toEqual(raw.brewingStands);expect(back.inventory).toEqual(active.inventory);
 input.dimensions.inactive.nether!.edits=[];const bad=parseSave(JSON.stringify(input));expect(bad.dimensionsInvalid).toBe(true);expect(bad.dimensionOwnershipIssues!.some(i=>i.path.includes('brewingStands'))).toBe(true);expect(()=>serializeSave(input)).toThrow(/dimension/);
});
it('validates medicine singleton counts and supported ownership before legacy repair in every retained container',()=>{
 const raw:any=save(),bad={id:846,count:2};raw.inventory.slots[0]=bad;raw.inventory.offhand={id:847,count:1};raw.inventory.equipment={head:{id:848,count:1}};raw.inventoryPending=[{id:849,count:1,damage:1}];
 raw.agent={...createAgent(0,80,0),offhand:{id:846,count:1}};raw.agent.slots[0]={id:845,count:2};
 raw.furnaces=[{x:1,y:80,z:1,state:{input:{id:848,count:2},fuel:null,output:null,burnLeft:0,burnTotal:0,progress:0}}];raw.worldDrops={nextKey:1,records:[{stack:{id:849,count:3}}]};raw.mobs={records:[{pendingLoot:[{id:846,count:1}]}]};
 const paths=diagnoseRawBrewingItemOwnership(raw).map(i=>i.path);expect(paths).toEqual(expect.arrayContaining(['inventory.slots[0]','inventory.offhand','inventory.equipment.head','inventoryPending[0]','agent.offhand','agent.slots[0]','furnaces[0].state.input','worldDrops.records[0].stack','mobs.records[0].pendingLoot[0]']));
 expect(parseSave(JSON.stringify(raw)).brewingOwnershipIssues!.length).toBeGreaterThanOrEqual(9);expect(()=>serializeSave(raw)).toThrow(/brewing/);
 for(let id=845;id<=849;id++)expect(diagnoseRawBrewingItemOwnership({inventory:{slots:[{id,count:1}]}})).toEqual([]);
 let reads=0;const stack=Object.defineProperty({count:1},'id',{get(){reads++;return 846;},enumerable:true});expect(diagnoseRawBrewingItemOwnership({inventory:{slots:[stack]}})).toHaveLength(1);expect(reads).toBe(0);
});
it.each(['player','Agent'])('pins actual stand world cell and bag through %s receiver reentry, cancellation and one receipt',who=>{
 const w=new World(7),bag=new Inventory(),agent=createAgent(8,81,8);bag.slots[0]={id:stackId('iron_pickaxe'),count:1};w.setBlock(8,80,8,201);let commits=0;
 const harvest=(receiver:any)=>who==='player'?breakBlock(w,bag,'survival',8,80,8,Math.random,[],receiver):runAgentCommand(w,agent,{op:'destroy',dir:'down'},{worldDrop:receiver}).ok;
 expect(harvest(()=>{w.setBlock(8,80,8,AIR);expect(w.getBlock(8,80,8)).toBe(201);expect(harvest(()=>null)).toBe(false);return null;})).toBe(false);expect(w.getBlock(8,80,8)).toBe(201);expect(w.blockSourceLeaseBusy).toBe(false);
 expect(harvest(()=>({commit(){commits++;w.setBlock(8,80,8,AIR);expect(w.getBlock(8,80,8)).toBe(201);return true;}}))).toBe(true);expect(commits).toBe(1);expect(w.getBlock(8,80,8)).toBe(AIR);expect(w.blockSourceLeaseBusy).toBe(false);
});
