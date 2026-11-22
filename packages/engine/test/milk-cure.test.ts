import { withLegacyBirchRecipes } from "./helpers/legacy-birch-recipes";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import prefix from "./fixtures/milk-prefix-785f7f0.json";
import { Inventory, ITEMS, BLOCKS, RECIPES, MOB_SPECS, allAtlasTextureNames, stackId, craftOnce, createMob, mobDrops,
  createPlayerStatus, applyPoison, tickPlayerStatus, finishMilkDrink, MILK_DRINK_SECONDS, MobLootResolver, mobSnapshot, restoreMobSnapshot, sanitizeMobState, diagnoseRawCowState, parseSave, serializeSave, sanitizeStack, inspectBucketOwner, createAgent, giveAgent, runAgentCommand, World, WorldDrops, AIR, blockId, createFurnace, setFurnaceInput, tickFurnace, smeltResult, foodOf, PlayerDeathTransfer, LeashStore, BalloonStore, combineReleaseAttempts, joinLeashRefundSink, type PlayerDeathState, type LeashContext, type ItemStack } from "../src/index";
const bucket=(count=1):ItemStack=>({id:stackId("bucket"),count});
const milk=():ItemStack=>({id:stackId("milk_bucket"),count:1});
const digest=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const full=()=>{const inv=new Inventory();for(let i=0;i<36;i++)inv.slots[i]={id:stackId("stone"),count:64};return inv;};

describe("adult Cow milk and finite cure owners",()=>{
 it("preserves all inherited registries/mob definitions while appending the sourced five identities and bucket recipe",()=>{
  expect(digest(ITEMS.slice(0,576))).toBe(prefix.itemsSHA256);expect(digest(BLOCKS.slice(0,308))).toBe(prefix.blocksSHA256);expect(digest(withLegacyBirchRecipes(RECIPES.slice(0,166)))).toBe(prefix.recipesSHA256);expect(digest(allAtlasTextureNames().slice(0,862))).toBe(prefix.namesSHA256);
  const oldMobSpecs=Object.fromEntries(Object.entries(MOB_SPECS).slice(0,7));expect(JSON.parse(JSON.stringify(oldMobSpecs))).toEqual(prefix.oldMobSpecs);
  expect([ITEMS.length,BLOCKS.length,RECIPES.length,allAtlasTextureNames().length]).toEqual([600, 327, 185, 906]);
  expect(ITEMS.slice(576,581).map(x=>[x.id,x.name,x.maxStack])).toEqual([[832,"bucket",16],[833,"milk_bucket",1],[834,"raw_beef",64],[835,"cooked_beef",64],[836,"leather",64]]);
  const grid:(ItemStack|null)[]=Array(9).fill(null);for(const i of [0,2,4])grid[i]={id:stackId("iron_ingot"),count:2};expect(craftOnce(grid,3)).toEqual(bucket());expect(grid.filter(Boolean).map(x=>x!.count)).toEqual([1,1,1]);
 });
 it("reserves stacked Milk elsewhere before debit, replaces a singleton in a full bag and preserves selected-empty repeated use",()=>{
  const inv=full();inv.slots[0]=bucket();expect(inv.fillSelectedMilkBucket()).toEqual({ok:true});expect(inv.slots[0]).toEqual(milk());
  inv.slots[0]=bucket(2);inv.slots[1]=bucket(15);const before=structuredClone(inv.slots);expect(inv.fillSelectedMilkBucket()).toEqual({ok:false,reason:"no-room"});expect(inv.slots).toEqual(before);
  inv.slots[2]=null;expect(inv.fillSelectedMilkBucket()).toEqual({ok:true});expect(inv.slots[0]).toEqual(bucket());expect(inv.slots[2]).toEqual(milk());
 });
 it("atomically returns the selected empty bucket and clears a real supported Poison owner before natural expiry",()=>{
  expect(MILK_DRINK_SECONDS).toBe(1.6);const inv=full();inv.slots[0]=milk();const status=createPlayerStatus();applyPoison(status);tickPlayerStatus(status,1.5,20);expect(status.poison?.remaining).toBe(3.5);
  expect(finishMilkDrink(inv,status)).toBe(true);expect(inv.slots[0]).toEqual(bucket());expect(status).toEqual({});expect(finishMilkDrink(inv,status)).toBe(false);
 });
 it("creates only supported adult Cow state and draws the two source-bounded unconditional loot pools",()=>{
  const cow=createMob(1,"cow",{x:.5,y:1,z:.5});expect(cow).toMatchObject({kind:"cow",health:10,cowState:{lifeStage:"adult"}});expect(MOB_SPECS.cow).toMatchObject({width:.9,height:1.3});
  expect(mobDrops("cow",()=>0,"environment")).toEqual([{id:stackId("raw_beef"),count:1}]);expect(mobDrops("cow",()=>1,"agent")).toEqual([{id:stackId("leather"),count:2},{id:stackId("raw_beef"),count:3}]);
 });
});


const at={x:.5,y:1,z:.5};
const floor={getLoadedBlock:(_x:number,y:number,_z:number)=>y===0?blockId("stone"):AIR};
const savedBase=()=>({name:"Milk owners",seed:1,mode:"survival" as const,timeOfDay:.2,player:{position:at,yaw:0,pitch:0,flying:false},inventory:new Inventory().toJSON(),edits:[]});
describe("cure refusal and whole-bucket recovery",()=>{
 it("refuses malformed source/container counts or unrelated bag owners with both sources untouched",()=>{
  for(const raw of [{...milk(),count:0},{...milk(),count:2},{...milk(),count:NaN},{...milk(),book:{pages:[]}},{...milk(),glow:{state:"active"}},{...milk(),damage:0},{...milk(),contents:"poison"}]){
   const inv=new Inventory();inv.slots[0]=raw as ItemStack;const status=createPlayerStatus();applyPoison(status);const before=structuredClone({slots:inv.slots,status});
   expect(finishMilkDrink(inv,status)).toBe(false);expect({slots:inv.slots,status}).toEqual(before);expect(inspectBucketOwner(raw).kind).toBe("invalid");expect(sanitizeStack(raw)).toBeNull();
  }
  const inv=new Inventory();inv.slots[0]=milk();inv.slots[35]={id:stackId("stone"),count:0};const status=createPlayerStatus();applyPoison(status);const before=structuredClone({slots:inv.slots,status});expect(finishMilkDrink(inv,status)).toBe(false);expect({slots:inv.slots,status}).toEqual(before);
 });
 it("refuses unknown/malformed or unmodifiable status instead of erasing it or spending Milk",()=>{
  for(const raw of [null,[],{weakness:{remaining:3}},{poison:null},{poison:{remaining:0,elapsed:0}},{poison:{remaining:6,elapsed:0}},{poison:{remaining:3,elapsed:1.25}},{poison:{remaining:3,elapsed:0,extra:1}}]){
   const inv=new Inventory();inv.slots[0]=milk();const before=structuredClone({slots:inv.slots,status:raw});expect(finishMilkDrink(inv,raw as never)).toBe(false);expect({slots:inv.slots,status:raw}).toEqual(before);
  }
  const inv=new Inventory();inv.slots[0]=milk();const status=createPlayerStatus();applyPoison(status);Object.freeze(status);expect(finishMilkDrink(inv,status)).toBe(false);expect(inv.slots[0]).toEqual(milk());expect(status.poison).toEqual({remaining:5,elapsed:0});
  const frozenBag=new Inventory();frozenBag.slots[0]=milk();Object.freeze(frozenBag.slots);const mutable=createPlayerStatus();applyPoison(mutable);expect(finishMilkDrink(frozenBag,mutable)).toBe(false);expect(mutable.poison).toBeDefined();
 });
 it("checks selected source and status ACK before the joint cure commit",()=>{
  for(const action of ["redirect","replace","count","status"]){
   const inv=new Inventory();inv.slots[0]=milk();inv.slots[1]=milk();const original=inv.slots[0],status=createPlayerStatus();applyPoison(status);let reads=0;
   Object.defineProperty(inv,"selected",{configurable:true,get:()=>{if(reads++===0)return 0;if(action==="replace")inv.slots[0]=milk();if(action==="count")original!.count=2;if(action==="status")status.poison!.remaining=4;return action==="redirect"?1:0;}});
   expect(finishMilkDrink(inv,status)).toBe(false);expect(inv.slots[0]?.id).toBe(stackId("milk_bucket"));expect(status.poison?.remaining).toBe(action==="status"?4:5);
  }
 });
 it("does not let completed Water drinking clear Poison, and permits the real Milk refill/cure loop",()=>{
  const inv=new Inventory();const status=createPlayerStatus();applyPoison(status);inv.slots[0]={id:stackId("water_bottle"),count:1};expect(inv.drinkSelectedWaterBottle()).toEqual({ok:true});expect(status.poison).toEqual({remaining:5,elapsed:0});
  inv.slots[0]=bucket();expect(inv.fillSelectedMilkBucket()).toEqual({ok:true});expect(finishMilkDrink(inv,status)).toBe(true);expect(status).toEqual({});expect(inv.slots[0]).toEqual(bucket());
  expect(inv.fillSelectedMilkBucket()).toEqual({ok:true});expect(finishMilkDrink(inv,status)).toBe(true);expect(inv.slots.filter(Boolean)).toEqual([bucket()]);
 });
 it("diagnoses raw buckets across every supported owner before loaders can repair or discard units",()=>{
  const invalid={...milk(),count:2};const raw=savedBase();raw.inventory.slots[0]=invalid;
  const fixtures=[raw,{...savedBase(),inventoryPending:[invalid]},{...savedBase(),agent:{...createAgent(0,1,0),slots:[invalid]}},{...savedBase(),furnaces:[{x:0,y:1,z:0,state:{...createFurnace(),input:invalid}}]},
   {...savedBase(),worldDrops:{nextKey:2,records:[{key:1,stack:invalid,position:at,velocity:{x:0,y:0,z:0},ageSeconds:0,pickupDelaySeconds:0}]}},{...savedBase(),inventory:{...savedBase().inventory,offhand:milk()}},{...savedBase(),inventory:{...savedBase().inventory,equipment:{head:bucket()}}},{...savedBase(),mobs:{nextId:2,records:[{pendingLoot:[milk()]}]}}];
  for(const fixture of fixtures){expect(parseSave(JSON.stringify({version:1,...fixture})).bucketOwnershipIssues?.length).toBeGreaterThan(0);}
  const parsed=parseSave(JSON.stringify({version:1,...raw}));expect(Inventory.fromJSON(parsed.inventory).slots[0]).toBeNull();expect(parsed.bucketOwnershipIssues?.some(x=>x.path==="inventory.slots[0]")).toBe(true);
  expect(parseSave(JSON.stringify({version:1,...savedBase(),bucketOwnershipIssues:[{path:"spoof",reason:"not trusted"}],cowStateInvalid:true})).bucketOwnershipIssues).toBeUndefined();
  expect(parseSave(JSON.stringify({version:1,...savedBase(),cowStateInvalid:true})).cowStateInvalid).toBeUndefined();expect(JSON.parse(serializeSave({...savedBase(),bucketOwnershipIssues:[{path:"derived",reason:"omitted"}],cowStateInvalid:true})).cowStateInvalid).toBeUndefined();
 });
 it("splits bulk Milk into singles, preserves Agent/drop/cold owners and parks buckets inertly in furnaces",()=>{
  const inv=new Inventory();expect(inv.add(stackId("milk_bucket"),2)).toBe(0);expect(inv.slots.slice(0,2)).toEqual([milk(),milk()]);expect(inv.add(stackId("bucket"),32)).toBe(0);expect(inv.slots.slice(2,4)).toEqual([bucket(16),bucket(16)]);
  const agent=createAgent(0,1,0);expect(giveAgent(agent,stackId("milk_bucket"),2)).toBe(0);expect(agent.slots.slice(0,2)).toEqual([milk(),milk()]);const before=structuredClone(agent.slots);
  expect(runAgentCommand(new World(1),agent,{op:"drop",slot:0},{worldDrop:()=>null}).ok).toBe(false);expect(agent.slots).toEqual(before);const drops=new WorldDrops(floor);expect(runAgentCommand(new World(1),agent,{op:"drop",slot:0},{worldDrop:drops.planSpawnBatch.bind(drops)}).ok).toBe(true);expect(drops.records.map(r=>r.stack)).toEqual([milk()]);
  const stored=parseSave(serializeSave({...savedBase(),inventory:inv.toJSON(),agent,worldDrops:drops.toJSON()}));expect(stored.bucketOwnershipIssues).toBeUndefined();expect(Inventory.fromJSON(stored.inventory).slots.slice(0,4)).toEqual([milk(),milk(),bucket(16),bucket(16)]);
  for(const value of [milk(),bucket()]){const f=createFurnace();setFurnaceInput(f,value);f.fuel={id:stackId("coal"),count:1};const saved=structuredClone(f);tickFurnace(f,100);expect(f).toEqual(saved);}
 });
 it("keeps Milk or returned Bucket in one refused/retried death batch and respects keepInventory",()=>{
  for(const cured of [false,true]){
   const inv=new Inventory();inv.slots[0]=milk();const status=createPlayerStatus();applyPoison(status);if(cured)expect(finishMilkDrink(inv,status)).toBe(true);const expected=cured?bucket():milk();
   const d:PlayerDeathState={phase:"pending",position:at,keepInventory:false},transfer=new PlayerDeathTransfer(),before=inv.toJSON();expect(transfer.tryTransfer(inv,[],d,()=>null,()=>{})).toBe(false);expect(inv.toJSON()).toEqual(before);
   const drops=new WorldDrops(floor);expect(transfer.tryTransfer(inv,[],d,drops.planSpawnBatch.bind(drops),()=>{})).toBe(true);expect(drops.records.map(r=>r.stack)).toEqual([expected]);expect(inv.slots[0]).toBeNull();expect(transfer.tryTransfer(inv,[],d,()=>{throw Error("duplicate");},()=>{})).toBe(true);
   const kept=new Inventory();kept.slots[0]=expected;expect(new PlayerDeathTransfer().tryTransfer(kept,[],{phase:"pending",position:at,keepInventory:true},()=>{throw Error("no drop");},()=>{})).toBe(true);expect(kept.slots[0]).toEqual(expected);
  }
 });
 it("uses the native raw-beef smelting relation and declared food values without touching older recipes",()=>{
  expect(smeltResult(stackId("raw_beef"))).toBe(stackId("cooked_beef"));expect(foodOf(stackId("raw_beef"))).toEqual({hunger:3,saturation:1.8});expect(foodOf(stackId("cooked_beef"))).toEqual({hunger:8,saturation:12.8});
  const f=createFurnace();setFurnaceInput(f,{id:stackId("raw_beef"),count:2});f.fuel={id:stackId("coal"),count:1};tickFurnace(f,20);expect(f.input).toBeNull();expect(f.output).toEqual({id:stackId("cooked_beef"),count:2});
 });
});

describe("adult Cow snapshots, pending causes and attached owners",()=>{
 it("strictly persists adult pose and rejects unsupported age/body/health/roll fields before raw recovery is lost",()=>{
  const cow=createMob(1,"cow",at);cow.yaw=.7;cow.velocity={x:.1,y:0,z:.2};const snap=mobSnapshot(cow);const loaded=restoreMobSnapshot(snap);expect(loaded.cowState).toEqual({lifeStage:"adult"});expect(loaded.position).toEqual(at);expect(loaded.yaw).toBe(.7);expect(loaded.velocity).toEqual(cow.velocity);
  for(const change of [{cowState:undefined},{cowState:{lifeStage:"baby"}},{cowState:{lifeStage:"adult",age:2}},{width:999},{health:11},{pendingLoot:[]},{pendingLoot:[{id:stackId("raw_beef"),count:4}]}]){
   const raw={...snap,...change},mobs={nextId:2,records:[raw]};expect(sanitizeMobState(mobs).invalid).toBeGreaterThan(0);expect(diagnoseRawCowState(mobs)).toBe(true);expect(parseSave(JSON.stringify({version:1,...savedBase(),mobs})).cowStateInvalid).toBe(true);
  }
  const pig={...mobSnapshot(createMob(2,"pig",at)),cowState:{lifeStage:"adult"}};expect(diagnoseRawCowState({nextId:3,records:[pig]})).toBe(true);
  const badSpider={...mobSnapshot(createMob(3,"spider",at)),health:-1};expect(diagnoseRawCowState({nextId:4,records:[badSpider]})).toBe(false);expect(parseSave(JSON.stringify({version:1,...savedBase(),mobs:{nextId:4,records:[badSpider]}})).cowStateInvalid).toBeUndefined();
  expect(diagnoseRawCowState({nextId:2,records:[snap,{...mobSnapshot(createMob(1,"pig",at))}]})).toBe(true);expect(diagnoseRawCowState({nextId:1,records:[snap]})).toBe(true);
 });
 it("retains the first Cow loot roll and cause across failed delivery, cold restore and a different retry cause",()=>{
  let draws=0;const resolver=new MobLootResolver(()=>{draws++;return 1;}),cow=createMob(1,"cow",at);expect(resolver.tryDrop(cow,()=>null,at,"player")).toBe(false);expect(draws).toBe(2);expect(resolver.exportPending(cow)).toEqual([{id:stackId("leather"),count:2},{id:stackId("raw_beef"),count:3}]);
  const snapshot=mobSnapshot(cow,resolver.exportPending(cow),resolver.exportPendingCause(cow)),stored=parseSave(serializeSave({...savedBase(),mobs:{nextId:2,records:[snapshot]}}));expect(stored.cowStateInvalid).toBeUndefined();const clean=sanitizeMobState(stored.mobs);expect(clean.invalid).toBe(0);
  const loaded=restoreMobSnapshot(clean.data.records[0]),next=new MobLootResolver(()=>{throw Error("reroll");});expect(next.restorePending(loaded,clean.data.records[0].pendingLoot,clean.data.records[0].pendingLootCause)).toBe(true);expect(next.exportPendingCause(loaded)).toBe("player");const drops=new WorldDrops(floor);expect(next.tryDrop(loaded,drops.planSpawnBatch.bind(drops),at,"agent")).toBe(true);expect(drops.records.map(r=>r.stack)).toEqual([{id:stackId("leather"),count:2},{id:stackId("raw_beef"),count:3}]);expect(next.tryDrop(loaded,()=>{throw Error("duplicate");},at,"environment")).toBe(true);
 });
 it("supports valid adult Cow Lead/Balloon owners and joins refunds with cached loot in one refused/retried batch",()=>{
  const cow=createMob(1,"cow",{x:1.5,y:1,z:.5}),ctx:LeashContext={mobs:[cow],player:at,getLoadedBlock:floor.getLoadedBlock},leads=new LeashStore(),balloons=new BalloonStore(),inv=new Inventory();
  inv.slots[0]={id:stackId("lead_rope"),count:1};expect(leads.attachFromInventory(inv,"survival",cow,ctx)).toBe(true);inv.slots[0]={id:stackId("red_balloon"),count:1};expect(balloons.attachFromInventory(inv,"survival",{kind:"mob",mobId:1},ctx)).toBe(true);
  const resolver=new MobLootResolver(()=>1),drops=new WorldDrops(floor);
  for(const accepted of [false,true]){const attempt=combineReleaseAttempts([()=>leads.beginRelease([1],ctx,true),()=>balloons.beginRelease([1],ctx,true)]);if(attempt.kind!=="ready")throw Error("missing lease");try{const sink=joinLeashRefundSink(attempt.lease,(stacks,pos)=>accepted?drops.planSpawnBatch(stacks,pos):null);expect(resolver.tryDrop(cow,sink,cow.position,"player")).toBe(accepted);}finally{attempt.lease.cancel();}if(!accepted){expect(leads.records).toHaveLength(1);expect(balloons.records).toHaveLength(1);expect(drops.records).toEqual([]);}}
  expect(leads.records).toEqual([]);expect(balloons.records).toEqual([]);expect(drops.records.map(r=>r.stack.id).sort()).toEqual([stackId("leather"),stackId("raw_beef"),stackId("lead_rope"),stackId("red_balloon")].sort());
 });
});


describe("Milk fill destination commit guards",()=>{
 it("refuses a late nonwritable or accessor destination without partial fill, throw or setter callback",()=>{
  for(const count of [1,2])for(const kind of ["readonly","accessor"]){
   const inv=new Inventory();inv.slots[0]=bucket(count);const owners=inv.slots.slice();let setterCalls=0;
   Object.defineProperty(inv.slots,"35",kind==="readonly"?{value:null,writable:false,configurable:true}:{get:()=>null,set:()=>{setterCalls++;},configurable:true});
   expect(()=>expect(inv.fillSelectedMilkBucket()).toEqual({ok:false,reason:"invalid-state"})).not.toThrow();
   expect(inv.slots).toEqual(owners);expect(setterCalls).toBe(0);expect(inv.slots[0]).toBe(owners[0]);
  }
 });
 it("rechecks destinations after a late selected ACK and refuses a redirected or replaced source",()=>{
  for(const defect of ["readonly","redirect","replace"]){
   const inv=new Inventory();inv.slots[0]=bucket();const original=inv.slots[0];let reads=0;
   Object.defineProperty(inv,"selected",{get:()=>{if(reads++===0)return 0;if(defect==="readonly")Object.defineProperty(inv.slots,"35",{value:null,writable:false});if(defect==="replace")inv.slots[0]=bucket();return defect==="redirect"?1:0;}});
   expect(()=>expect(inv.fillSelectedMilkBucket()).toEqual({ok:false,reason:"invalid-state"})).not.toThrow();
   expect(inv.slots[0]).toEqual(bucket());expect(original).toEqual(bucket());expect(inv.slots.filter(Boolean)).toHaveLength(1);
  }
 });
});
