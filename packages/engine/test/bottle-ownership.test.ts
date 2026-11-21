import { describe, expect, it } from "vitest";
import baseline from "./fixtures/bottles-0d75051.json";
import { Inventory, ITEMS, BLOCKS, RECIPES, allAtlasTextureNames, stackId, bottleKind, matchRecipe, craftOnce, inspectBottleOwner, sanitizeStack, parseSave, serializeSave, diagnoseRawBottleOwnership, sanitizeAgent, createAgent, giveAgent, runAgentCommand, World, WorldDrops, AIR, blockId, createFurnace, setFurnaceInput, tickFurnace, PlayerDeathTransfer, type PlayerDeathState, type ItemStack } from "../src/index";
const empty = (count=1):ItemStack => ({ id:stackId("glass_bottle"),count });
const water = ():ItemStack => ({ id:stackId("water_bottle"),count:1 });
const full = () => {const inv=new Inventory(); inv.slots.fill(null); for(let i=0;i<36;i++)inv.slots[i]={id:stackId("stone"),count:64}; return inv;};

describe("whole glass/water bottle ownership",()=>{
  it("preserves every old definition/recipe/texture identity and appends only the two whole bottles",()=>{
    expect(JSON.parse(JSON.stringify(ITEMS.slice(0,574)))).toEqual(baseline.items);
    expect(JSON.parse(JSON.stringify(BLOCKS.slice(0,308)))).toEqual(baseline.blocks);
    expect(JSON.parse(JSON.stringify(RECIPES.slice(0,165)))).toEqual(baseline.recipes);
    expect(allAtlasTextureNames().slice(0,860)).toEqual(baseline.names);
    expect(ITEMS.slice(574,576).map(i=>[i.id,i.name,i.maxStack])).toEqual([[830,"glass_bottle",64],[831,"water_bottle",1]]);
    expect(bottleKind(830)).toBe("empty");expect(bottleKind(831)).toBe("water");expect(bottleKind(stackId("spider_eye"))).toBeNull();
  });
  it("crafts three bottles from the retained width3 glass V only",()=>{
    const grid:(ItemStack|null)[]=Array(9).fill(null);for(const i of [0,2,4])grid[i]={id:stackId("glass"),count:2};
    expect(craftOnce(grid,3)).toEqual(empty(3));expect(grid.filter(Boolean).map(s=>s!.count)).toEqual([1,1,1]);
    expect(craftOnce([{id:stackId("glass"),count:1},null,null,{id:stackId("glass"),count:1}],2)).toBeNull();
  });
  it("replaces a singleton even in a full bag but never substitutes empty-stack room for filled-water capacity",()=>{
    const inv=full();inv.slots[0]=empty();expect(inv.fillSelectedBottle()).toEqual({ok:true});expect(inv.slots[0]).toEqual(water());
    inv.slots[0]=empty(2);inv.slots[1]=empty(63);const before=structuredClone(inv.slots);expect(inv.fillSelectedBottle()).toEqual({ok:false,reason:"no-room"});expect(inv.slots).toEqual(before);
  });
  it("keeps the selected empty remainder, reserves one distinct water owner and supports repeated fills",()=>{
    const inv=new Inventory();inv.slots[0]=empty(3);expect(inv.fillSelectedBottle()).toEqual({ok:true});expect(inv.slots.slice(0,2)).toEqual([empty(2),water()]);
    expect(inv.fillSelectedBottle()).toEqual({ok:true});expect(inv.slots.slice(0,3)).toEqual([empty(),water(),water()]);
    expect(inv.fillSelectedBottle()).toEqual({ok:true});expect(inv.slots.slice(0,3)).toEqual([water(),water(),water()]);
  });
  it("refuses zero-count and malformed glass grid owners instead of synthesizing bottles",()=>{
    for(const count of [0,-1,65,NaN]){
      const grid:(ItemStack|null)[]=Array(9).fill(null);for(const i of [0,2,4])grid[i]={id:stackId("glass"),count:1};grid[0]!.count=count;
      const before=structuredClone(grid);expect(matchRecipe(grid,3)).toBeNull();expect(craftOnce(grid,3)).toBeNull();expect(grid).toEqual(before);
    }
  });
  it("refuses malformed bottle sources and unrelated sparse or corrupt bag owners without repair",()=>{
    for(const raw of [empty(0),empty(65),empty(NaN),{...empty(),book:{pages:[]}},{...empty(),damage:0},{...empty(),glow:{state:"inactive"}},{...empty(),content:"water"}]){
      const inv=new Inventory();inv.slots[0]=raw as ItemStack;const before=structuredClone(inv.slots);expect(inv.fillSelectedBottle()).toEqual({ok:false,reason:"invalid-state"});expect(inv.slots).toEqual(before);
    }
    const inv=new Inventory();inv.slots[0]=empty(2);delete inv.slots[35];const before=structuredClone(inv.slots);expect(inv.fillSelectedBottle()).toEqual({ok:false,reason:"invalid-state"});expect(inv.slots).toEqual(before);
  });
});


const at={x:.5,y:1,z:.5};
const floor={getLoadedBlock:(_x:number,y:number,_z:number)=>y===0?blockId("stone"):AIR};
const savedBase=()=>({name:"Bottle owners",seed:1,mode:"survival" as const,timeOfDay:.2,player:{position:at,yaw:0,pitch:0,flying:false},inventory:new Inventory().toJSON(),edits:[]});
describe("bottle transfers and raw original preservation",()=>{
  it("splits requested water quantities into singleton bag/Agent/ground owners, keeping empty identities distinct",()=>{
    const inv=new Inventory();expect(inv.add(stackId("water_bottle"),3)).toBe(0);expect(inv.slots.slice(0,3)).toEqual([water(),water(),water()]);
    expect(inv.addStack(empty(64))).toBe(0);expect(inv.slots[3]).toEqual(empty(64));expect(inv.setSlot(4,{...water(),count:2})).toBe(false);
    const agent=createAgent(0,1,0);expect(giveAgent(agent,stackId("water_bottle"),2)).toBe(0);expect(agent.slots.slice(0,2)).toEqual([water(),water()]);
    expect(giveAgent(agent,empty(3))).toBe(0);const drops=new WorldDrops(floor);
    expect(drops.spawnBatch([{...water(),count:2},empty(2)],at)).toBe(true);expect(drops.records.map(r=>r.stack)).toEqual([water(),water(),empty(2)]);
    const restored=new WorldDrops(floor,drops.toJSON());expect(restored.records.map(r=>r.stack)).toEqual([water(),water(),empty(2)]);
    restored.update(.5);const receiver=full(),pose=restored.records[0].position;expect(restored.tryPickup(pose,stack=>receiver.addStack(stack),stackId("water_bottle"))).toBe(0);expect(restored.records).toHaveLength(3);
    receiver.slots[0]=null;receiver.slots[1]=null;expect(restored.tryPickup(pose,stack=>receiver.addStack(stack),stackId("water_bottle"))).toBe(2);expect(receiver.slots.slice(0,2)).toEqual([water(),water()]);expect(restored.records.map(r=>r.stack)).toEqual([empty(2)]);
  });
  it("Agent whole-bottle give/drop refuses full receiver, then transfers exactly once into real ground owners",()=>{
    const agent=createAgent(0,1,0);giveAgent(agent,water());const before=structuredClone(agent.slots);const world=new World(1);
    expect(runAgentCommand(world,agent,{op:"drop",slot:0},{giveToPlayer:stack=>stack.count}).ok).toBe(true);expect(agent.slots).toEqual(before);
    expect(runAgentCommand(world,agent,{op:"drop",slot:0},{worldDrop:()=>null}).ok).toBe(false);expect(agent.slots).toEqual(before);
    const drops=new WorldDrops(floor);expect(runAgentCommand(world,agent,{op:"drop",slot:0},{worldDrop:drops.planSpawnBatch.bind(drops)}).ok).toBe(true);
    expect(agent.slots[0]).toBeNull();expect(drops.records.map(r=>r.stack)).toEqual([water()]);expect(runAgentCommand(world,agent,{op:"drop",slot:0},{worldDrop:drops.planSpawnBatch.bind(drops)}).ok).toBe(false);
  });
  it("keeps ordinary furnace parking inert, saves known bottle IDs and refuses unsupported offhand",()=>{
    const inv=new Inventory();expect(inv.setOffhand(water())).toBe(false);expect(inv.offhand).toBeNull();
    const f=createFurnace();expect(setFurnaceInput(f,water())).toBeNull();f.fuel={id:stackId("coal"),count:1};const before=structuredClone(f);tickFurnace(f,100);expect(f).toEqual(before);
    inv.slots[0]=empty(5);inv.slots[1]=water();const save=parseSave(serializeSave({...savedBase(),inventory:inv.toJSON(),furnaces:[{x:0,y:1,z:0,state:f}]}));
    expect(save.bottleOwnershipIssues).toBeUndefined();expect(Inventory.fromJSON(save.inventory).slots.slice(0,2)).toEqual([empty(5),water()]);expect(save.furnaces?.[0].state.input).toEqual(water());
    expect(sanitizeAgent(createAgent(0,1,0))).not.toBeNull();
  });
  it("preserves all bottle/death/pending owners on refused batch, then transfers once after retry",()=>{
    const inv=new Inventory();inv.slots[0]=empty(2);inv.slots[1]=water();const pending=[water()];const d:PlayerDeathState={phase:"pending",position:at,keepInventory:false};
    const transfer=new PlayerDeathTransfer(),before=inv.toJSON();expect(transfer.tryTransfer(inv,pending,d,()=>null,()=>{pending.length=0;})).toBe(false);expect(inv.toJSON()).toEqual(before);expect(pending).toEqual([water()]);
    const drops=new WorldDrops(floor);expect(transfer.tryTransfer(inv,pending,d,drops.planSpawnBatch.bind(drops),()=>{pending.length=0;})).toBe(true);expect(drops.records.map(r=>r.stack)).toEqual([empty(2),water(),water()]);expect(pending).toEqual([]);
    expect(transfer.tryTransfer(inv,pending,d,()=>{throw Error("duplicate");},()=>{})).toBe(true);expect(drops.records).toHaveLength(3);
    const kept=new Inventory();kept.slots[0]=water();const keep:PlayerDeathState={phase:"pending",position:at,keepInventory:true};expect(new PlayerDeathTransfer().tryTransfer(kept,[],keep,()=>{throw Error("keep must not drop");},()=>{})).toBe(true);expect(kept.slots[0]).toEqual(water());
  });
  it("diagnoses new known bottle counts/metadata before inventory and pending loaders can discard them",()=>{
    for(const bad of [{...water(),count:2},empty(65),empty(0),{...water(),book:{pages:["bad content"]}},{...empty(),damage:0},{...water(),contents:"empty"}]){
      expect(inspectBottleOwner(bad).kind).toBe("invalid");expect(sanitizeStack(bad)).toBeNull();const raw=savedBase();raw.inventory.slots[0]=bad as ItemStack;
      const parsed=parseSave(JSON.stringify({version:1,...raw}));expect(parsed.bottleOwnershipIssues).toEqual(expect.arrayContaining([expect.objectContaining({path:"inventory.slots[0]"})]));expect(Inventory.fromJSON(parsed.inventory).slots[0]).toBeNull();
      const pending=parseSave(JSON.stringify({version:1,...savedBase(),inventoryPending:[bad]}));expect(pending.bottleOwnershipIssues?.some(i=>i.path==="inventoryPending[0]")).toBe(true);expect(pending.inventoryPending).toEqual([]);
    }
  });
  it("covers raw Agent, furnace, ground, unsupported offhand/equipment and mob-pending owners before repair",()=>{
    const invalid={...water(),count:2};const raw=savedBase();raw.inventory.slots[0]=empty();
    const fixtures=[
      {...raw,inventory:{...raw.inventory,offhand:water()}},
      {...raw,inventory:{...raw.inventory,equipment:{head:water()}}},
      {...raw,agent:{...createAgent(0,1,0),slots:[invalid]}},
      {...raw,agent:{...createAgent(0,1,0),offhand:water()}},
      {...raw,furnaces:[{x:0,y:1,z:0,state:{...createFurnace(),input:invalid}}]},
      {...raw,worldDrops:{nextKey:2,records:[{key:1,stack:invalid,position:at,velocity:{x:0,y:0,z:0},ageSeconds:0,pickupDelaySeconds:0}]}},
      {...raw,mobs:{nextId:2,records:[{pendingLoot:[water()]}]}},
      {...raw,inventoryPending:Array(11).fill(null).map((_,i)=>i===10?water():null)},
    ];
    for(const fixture of fixtures){expect(diagnoseRawBottleOwnership(fixture).length).toBeGreaterThan(0);expect(parseSave(JSON.stringify({version:1,...fixture})).bottleOwnershipIssues?.length).toBeGreaterThan(0);}
    const deathRaw={version:1,...savedBase(),inventory:{...raw.inventory,slots:[invalid,...Array(35).fill(null)]},playerState:{health:0,death:{phase:"pending",position:at,keepInventory:false}}};
    const parsed=parseSave(JSON.stringify(deathRaw));expect(parsed.playerStateOwnershipInvalid).toBe(true);expect(parsed.bottleOwnershipIssues?.some(i=>i.path==="inventory.slots[0]")).toBe(true);
  });
  it("does not trust serialized diagnostic flags or scan arbitrary unowned bottle-looking text",()=>{
    const raw={version:1,...savedBase(),bottleOwnershipIssues:[{path:"spoof",reason:"bad"}],programs:[{source:JSON.stringify({...water(),count:2})}]};
    expect(parseSave(JSON.stringify(raw)).bottleOwnershipIssues).toBeUndefined();expect(JSON.parse(serializeSave({...savedBase(),bottleOwnershipIssues:[{path:"derived",reason:"not persisted"}]})).bottleOwnershipIssues).toBeUndefined();
    const legacy=parseSave(serializeSave(savedBase()));expect(legacy.bottleOwnershipIssues).toBeUndefined();
  });
});
