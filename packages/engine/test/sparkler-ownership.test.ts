import { describe, expect, it } from "vitest";
import baseline from "./fixtures/sparklers-83eee13.json";
import { ITEMS, BLOCKS, RECIPES, SPARKLER_COLORS, allAtlasTextureNames, Inventory, cloneStack, craftOnce, createAgent, giveAgent,
  freshStack, inspectItemState, insertStackIntoSlots, runAgentCommand, World, sanitizeAgent, sanitizeFurnaces, sanitizeWorldDrops, parseSave, serializeSave, sanitizeStack, createFurnace, setFurnaceInput,
  WorldDrops, AIR, blockId, PlayerDeathTransfer, type ItemStack, type PlayerDeathState } from "../src/index";
const id = SPARKLER_COLORS[0].itemId;
const inactive = (count=1): ItemStack => ({id,count,sparkler:{state:"inactive"}});
const active = (): ItemStack => ({id,count:1,sparkler:{state:"active"}});
const at={x:.5,y:1,z:.5};
const base={name:"Sparkler owners",seed:1,mode:"survival" as const,timeOfDay:.2,player:{position:at,yaw:0,pitch:0,flying:false},edits:[]};
const floor={getLoadedBlock: (_x:number,y:number,_z:number)=>y===0?blockId("stone"):AIR};

describe("five Journal-supported Sparklers and real offhand owners",()=>{
  it("preserves every old definition, recipe and atlas identity as an exact prefix",()=>{
    expect(JSON.parse(JSON.stringify(ITEMS.slice(0,568)))).toEqual(baseline.items);
    expect(JSON.parse(JSON.stringify(BLOCKS))).toEqual(baseline.blocks);
    expect(JSON.parse(JSON.stringify(RECIPES.slice(0,160)))).toEqual(baseline.recipes);
    expect(allAtlasTextureNames().slice(0,849)).toEqual(baseline.names);
    expect([ITEMS.length,BLOCKS.length,RECIPES.length,allAtlasTextureNames().length]).toEqual([581,308,167,867]);
    expect(Object.isFrozen(SPARKLER_COLORS)).toBe(true); expect(SPARKLER_COLORS.every(Object.isFrozen)).toBe(true);
  });
  it("crafts all five vertical chloride/Mg/stick grids and refuses wrong color chemistry and short grids",()=>{
    for(const color of SPARKLER_COLORS){
      const recipe=RECIPES.find(r=>r.id===color.itemName)!;
      const grid: (ItemStack|null)[]=Array(9).fill(null);
      for(const [i,name] of [[1,color.compound],[4,"magnesium"],[7,"stick"]] as const){
        grid[i]={id:ITEMS.find(x=>x.name===name)!.id,count:2};
      }
      const before=structuredClone(grid);
      expect(craftOnce(grid,3)).toEqual(freshStack(color.itemId));
      expect(grid.filter(Boolean).map(x=>x!.count)).toEqual([1,1,1]);
      const wrong=structuredClone(before);wrong[4]={id:ITEMS.find(x=>x.name==="iron")!.id,count:1};
      expect(craftOnce(wrong,3)).toBeNull(); expect(wrong[1]).toEqual(before[1]);
      expect(recipe.pattern).toEqual(["C","M","S"]);expect(craftOnce(before.slice(0,4),2)).toBeNull();
    }
  });
  it("rejects cross-kind, active bulk and malformed state without normalizing the incoming owner",()=>{
    const invalid=[{...active(),count:2},{...inactive(),glow:{state:"inactive"}},{...inactive(),sparkler:null},
      {...inactive(),damage:0},{id:1,count:1,sparkler:{state:"active"}}];
    for(const raw of invalid){const stack=raw as ItemStack;expect(inspectItemState(stack).kind).toBe("invalid");expect(sanitizeStack(stack)).toBeNull();
      const slots=[inactive()];const before=structuredClone(slots);expect(insertStackIntoSlots(slots,stack)).toBe(stack.count);expect(slots).toEqual(before);}
    const unit=active(),copy=cloneStack(unit);copy.sparkler!.state="inactive";expect(unit).toEqual(active());
  });
  it("keeps active/inactive/legacy separate, refuses full-bag splitting and allows full-bag singleton",()=>{
    const bag=new Inventory();bag.slots.fill({id:1,count:64});bag.slots[0]=inactive(2);const before=bag.toJSON();
    expect(bag.activateSelectedSparkler()).toEqual({ok:false,reason:"needs-room"});expect(bag.toJSON()).toEqual(before);
    bag.slots[0]=inactive();expect(bag.activateSelectedSparkler().ok).toBe(true);expect(bag.slots[0]).toEqual(active());
    const target=new Inventory();expect(target.addStack(active())).toBe(0);expect(target.addStack(active())).toBe(0);expect(target.addStack(inactive())).toBe(0);expect(target.addStack({id,count:1})).toBe(0);
    expect(target.slots.filter(Boolean)).toEqual([active(),active(),inactive(),{id,count:1}]);
  });
  it("atomically swaps selected/offhand with validation and detached state",()=>{
    const bag=new Inventory();bag.slots[0]=inactive(3);expect(bag.swapSelectedOffhand()).toBe(true);expect(bag.offhand).toEqual(inactive(3));expect(bag.slots[0]).toBeNull();
    bag.slots[0]={id:1,count:1};const before=bag.toJSON();expect(bag.swapSelectedOffhand()).toBe(false);expect(bag.setOffhand({...active(),count:2})).toBe(false);expect(bag.toJSON()).toEqual(before);
    const unit=active();expect(bag.setOffhand(unit)).toBe(true);unit.sparkler!.state="inactive";expect(bag.offhand).toEqual(active());
  });
  it("lights offhand into one active unit, reserves remainder outside main, refuses without room",()=>{
    const bag=new Inventory();bag.slots.fill({id:1,count:64});bag.slots[0]=inactive(63);bag.offhand=inactive(2);let before=bag.toJSON();
    expect(bag.activateOffhandSparkler()).toEqual({ok:false,reason:"needs-room"});expect(bag.toJSON()).toEqual(before);
    bag.slots[1]=null;const main=bag.slots[0];expect(bag.activateOffhandSparkler().ok).toBe(true);expect(bag.slots[0]).toBe(main);expect(bag.slots[0]).toEqual(inactive(63));expect(bag.slots[1]).toEqual(inactive());expect(bag.offhand).toEqual(active());
    bag.offhand=inactive();bag.slots[1]={id:1,count:64};expect(bag.activateOffhandSparkler().ok).toBe(true);expect(bag.offhand).toEqual(active());
  });
  it("never creates a unit from malformed metadata-less offhand counts",()=>{
    for(const count of [0,-1,NaN,Infinity,1.5,65]){const bag=new Inventory();bag.offhand={id,count};const before=structuredClone(bag.offhand);
      expect(bag.activateOffhandSparkler()).toEqual({ok:false,reason:"invalid-state"});expect(bag.offhand).toEqual(before);expect(bag.slots.every(x=>x===null)).toBe(true);}
  });
  it("preserves offhand and ordinary Agent/furnace/drop owners through cold save and legacy absence",()=>{
    const bag=new Inventory();bag.offhand=active();bag.slots[0]={id,count:3};const agent=createAgent(0,1,0);giveAgent(agent,active());const drops=new WorldDrops(floor);expect(drops.spawnBatch([active()],at)).toBe(true);
    const furnace=createFurnace();expect(setFurnaceInput(furnace,active())).toBeNull();const invalid={...active(),count:2};const before=furnace.input;expect(setFurnaceInput(furnace,invalid)).toBe(invalid);expect(furnace.input).toBe(before);
    const saved=parseSave(serializeSave({...base,inventory:bag.toJSON(),inventoryPending:[inactive(2)],agent,furnaces:[{x:0,y:1,z:0,state:furnace}],worldDrops:drops.toJSON()}));
    expect(saved.sparklerOwnershipIssues).toBeUndefined();expect(sanitizeAgent(saved.agent)!.slots[0]).toEqual(active());expect(sanitizeFurnaces(saved.furnaces).furnaces[0].state.input).toEqual(active());expect(sanitizeWorldDrops(saved.worldDrops).data.records[0].stack).toEqual(active());const loaded=Inventory.fromJSON(saved.inventory);expect(loaded.offhand).toEqual(active());expect(loaded.slots[0]).toEqual({id,count:3});expect(saved.inventoryPending).toEqual([inactive(2)]);
    const old=Inventory.fromJSON({slots:[{id,count:2}],selected:0});expect(old.offhand).toBeNull();expect(old.toJSON()).not.toHaveProperty("offhand");expect(old.slots[0]).toEqual({id,count:2});
  });
  it("transfers actual Agent/drop owners with reserve-before-debit, refused bulk and detached pickup",()=>{
    const agent=createAgent(0,1,0),world=new World(1),drops=new WorldDrops(floor);
    expect(giveAgent(agent,active())).toBe(0);expect(giveAgent(agent,{...active(),count:2})).toBe(2);const before=structuredClone(agent);
    expect(runAgentCommand(world,agent,{op:"drop",slot:0},{worldDrop:stacks=>{stacks[0].sparkler!.state="inactive";return null;}}).ok).toBe(false);expect(agent).toEqual(before);
    expect(runAgentCommand(world,agent,{op:"drop",slot:0},{worldDrop:drops.planSpawnBatch.bind(drops)}).ok).toBe(true);expect(agent.slots[0]).toBeNull();expect(drops.records[0].stack).toEqual(active());
    drops.update(.6);const snapshot=drops.toJSON();expect(drops.tryPickup(drops.records[0].position,stack=>{stack.sparkler!.state="inactive";return stack.count;})).toBe(0);expect(drops.toJSON()).toEqual(snapshot);
    expect(drops.tryPickup(drops.records[0].position,stack=>giveAgent(agent,stack))).toBe(1);expect(agent.slots[0]).toEqual(active());expect(drops.records).toEqual([]);
    const bulk=new WorldDrops(floor);expect(bulk.spawnBatch([inactive(130)],at)).toBe(true);expect(bulk.records.map(x=>x.stack)).toEqual([inactive(64),inactive(64),inactive(2)]);
    expect(bulk.planSpawnBatch([{...active(),count:2}],at)).toBeNull();
  });

  it("diagnoses malformed/unsupported raw offhand and every discarded stateful owner before repair",()=>{
    const bag=new Inventory();const raw=JSON.parse(serializeSave({...base,inventory:bag.toJSON()}));
    const cases=[{...raw,inventory:{...raw.inventory,offhand:{...active(),count:2}}},
      {...raw,inventory:{...raw.inventory,offhand:{id:1,count:1}}},
      {...raw,inventoryPending:[{...active(),sparkler:{state:"bad"}}]},
      {...raw,agent:{...createAgent(0,1,0),offhand:active()}},
      {...raw,furnaces:[{x:0,y:1,z:0,state:{...createFurnace(),input:{...active(),count:2}}}]},
      {...raw,inventory:{...raw.inventory,equipment:{head:active()}}}];
    for(const value of cases){const text=" \n"+JSON.stringify(value)+" \n";const snapshot=JSON.stringify(value);expect(parseSave(text).sparklerOwnershipIssues?.length).toBeGreaterThan(0);expect(JSON.stringify(value)).toBe(snapshot);}
  });
  it("diagnoses invalid legacy Sparkler bag/pending/offhand counts before sanitizers discard units",()=>{
    const raw=JSON.parse(serializeSave({...base,inventory:new Inventory().toJSON()}));
    for(const count of [0,-1,65,1.5,null]){
      const unit={id,count};
      for(const value of [
        {...raw,inventory:{...raw.inventory,slots:[unit]}},
        {...raw,inventory:{...raw.inventory,offhand:unit}},
        {...raw,inventoryPending:[unit]},
      ]) expect(parseSave(JSON.stringify(value)).sparklerOwnershipIssues?.length).toBeGreaterThan(0);
    }
    const slots=Array(37).fill(null);slots[36]={id,count:1};
    expect(parseSave(JSON.stringify({...raw,inventory:{...raw.inventory,slots}})).sparklerOwnershipIssues?.some(x=>x.path==="inventory.slots[36]")).toBe(true);
  });

  it("death reserves offhand/bag/pending together before debit, retries once and keeps on keepInventory",()=>{
    const bag=new Inventory();bag.offhand=active();bag.slots[0]=inactive(2);const pending=[inactive()];const death:PlayerDeathState={phase:"pending",position:at,keepInventory:false};const before=bag.toJSON();
    const transfer=new PlayerDeathTransfer();expect(transfer.tryTransfer(bag,pending,death,()=>null,()=>{pending.length=0;})).toBe(false);expect(bag.toJSON()).toEqual(before);expect(pending).toEqual([inactive()]);
    const drops=new WorldDrops(floor);expect(transfer.tryTransfer(bag,pending,death,drops.planSpawnBatch.bind(drops),()=>{pending.length=0;})).toBe(true);expect(bag.offhand).toBeNull();expect(bag.slots.every(x=>x===null)).toBe(true);expect(pending).toEqual([]);expect(drops.records.reduce((n,x)=>n+x.stack.count,0)).toBe(4);
    expect(transfer.tryTransfer(bag,pending,death,()=>{throw Error("replay");},()=>{})).toBe(true);
    const kept=new Inventory();kept.offhand=active();expect(new PlayerDeathTransfer().tryTransfer(kept,[],{phase:"pending",position:at,keepInventory:true},()=>{throw Error("unexpected drop");},()=>{})).toBe(true);expect(kept.offhand).toEqual(active());
  });
});
