import { describe, expect, it } from "vitest";
import { Inventory, WATER_DRINK_SECONDS, stackId, parseSave, serializeSave, PlayerDeathTransfer, WorldDrops, AIR, blockId, type PlayerDeathState, type ItemStack } from "../src/index";
const empty=():ItemStack=>({id:stackId("glass_bottle"),count:1});
const water=():ItemStack=>({id:stackId("water_bottle"),count:1});
const full=()=>{const inv=new Inventory();for(let i=0;i<36;i++)inv.slots[i]={id:stackId("stone"),count:64};return inv;};

describe("bounded completed WaterBottle drink ownership",()=>{
  it("returns one empty container in the selected cell even with a full bag, preserving all other owners by reference",()=>{
    expect(WATER_DRINK_SECONDS).toBe(1.6);const inv=full();inv.selected=4;inv.slots[4]=water();
    inv.slots[6]={...empty(),count:63};
    inv.slots[5]={id:stackId("written_book"),count:1,book:{pages:["unchanged"],title:"Owned"}};
    const others=[...inv.slots],before=structuredClone(inv.toJSON());
    expect(inv.drinkSelectedWaterBottle()).toEqual({ok:true});expect(inv.slots[4]).toEqual(empty());
    for(let i=0;i<36;i++)if(i!==4){expect(inv.slots[i]).toBe(others[i]);expect(inv.slots[i]).toEqual(before.slots[i]);}
    expect(inv.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"not-water-bottle"});expect(inv.slots[4]).toEqual(empty());
  });
  it("refuses malformed filled source owners and sparse/redirected selected ownership without creating an empty bottle",()=>{
    for(const raw of [{...water(),count:0},{...water(),count:2},{...water(),count:NaN},{...water(),damage:0},{...water(),book:{pages:[]}},{...water(),glow:{state:"active"}},{...water(),contents:"empty"}]){
      const inv=new Inventory();inv.slots[0]=raw as ItemStack;const before=structuredClone(inv.slots);expect(inv.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"invalid-state"});expect(inv.slots).toEqual(before);
    }
    for(const selected of [-1,9,NaN,.5]){const inv=new Inventory();inv.slots[0]=water();inv.selected=selected;const before=structuredClone(inv.slots);expect(inv.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"invalid-state"});expect(inv.slots).toEqual(before);}
    const sparse=new Inventory();sparse.slots[0]=water();delete sparse.slots[35];const before=structuredClone(sparse.slots);expect(sparse.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"invalid-state"});expect(sparse.slots).toEqual(before);
  });
  it("uses the actual selected water owner only and preserves a fill-drink-refill container loop",()=>{
    const inv=new Inventory();inv.slots[2]=water();expect(inv.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"not-water-bottle"});expect(inv.slots[2]).toEqual(water());
    inv.select(2);expect(inv.drinkSelectedWaterBottle()).toEqual({ok:true});expect(inv.slots[2]).toEqual(empty());
    expect(inv.fillSelectedBottle()).toEqual({ok:true});expect(inv.slots[2]).toEqual(water());expect(inv.drinkSelectedWaterBottle()).toEqual({ok:true});expect(inv.slots[2]).toEqual(empty());expect(inv.slots.filter(Boolean)).toHaveLength(1);
  });
});


const at={x:.5,y:1,z:.5};
const floor={getLoadedBlock:(_x:number,y:number,_z:number)=>y===0?blockId("stone"):AIR};
const savedBase=()=>({name:"Drinking owner",seed:1,mode:"survival" as const,timeOfDay:.2,player:{position:at,yaw:0,pitch:0,flying:false},inventory:new Inventory().toJSON(),edits:[]});
describe("completed-drink source ACK and downstream container ownership",()=>{
  it("refuses a selected-slot redirection during planning and never drinks a replacement owner with the same ID",()=>{
    const inv=new Inventory();inv.slots[0]=water();inv.slots[1]=water();const before=[...inv.slots];let reads=0;
    Object.defineProperty(inv,"selected",{get:()=>reads++===0?0:1,configurable:true});
    expect(inv.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"invalid-state"});expect(inv.slots).toEqual(before);for(let i=0;i<36;i++)expect(inv.slots[i]).toBe(before[i]);
    const second=new Inventory();second.slots[0]=water();const replacement=water();let nextReads=0;
    Object.defineProperty(second,"selected",{get:()=>{if(nextReads++>0)second.slots[0]=replacement;return 0;},configurable:true});
    expect(second.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"invalid-state"});expect(second.slots[0]).toBe(replacement);expect(second.slots[0]).toEqual(water());
  });
  it("rejects getter metadata, inherited selected IDs and malformed unrelated owners without normalizing the bag",()=>{
    for(const raw of [Object.assign(Object.create({id:stackId("water_bottle")}),{count:1}),Object.defineProperty({id:stackId("water_bottle")},"count",{get:()=>1,enumerable:true})]){
      const inv=new Inventory();inv.slots[0]=raw as ItemStack;const source=inv.slots[0];expect(inv.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"invalid-state"});expect(inv.slots[0]).toBe(source);
    }
    const inv=new Inventory();inv.slots[0]=water();inv.slots[35]={id:stackId("stone"),count:0};const before=structuredClone(inv.slots);expect(inv.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"invalid-state"});expect(inv.slots).toEqual(before);
  });
  it("persists the committed empty owner while preserving separately held/crafting WaterBottles and old save absence",()=>{
    const inv=new Inventory();inv.slots[0]=water();const pending=[water(),{...empty(),count:2}];expect(inv.drinkSelectedWaterBottle()).toEqual({ok:true});
    const saved=parseSave(serializeSave({...savedBase(),inventory:inv.toJSON(),inventoryPending:pending}));expect(saved.bottleOwnershipIssues).toBeUndefined();
    expect(Inventory.fromJSON(saved.inventory).slots[0]).toEqual(empty());expect(saved.inventoryPending).toEqual(pending);expect(pending).toEqual([water(),{...empty(),count:2}]);
    const loaded=Inventory.fromJSON(saved.inventory);expect(loaded.drinkSelectedWaterBottle()).toEqual({ok:false,reason:"not-water-bottle"});expect(loaded.fillSelectedBottle()).toEqual({ok:true});expect(loaded.slots[0]).toEqual(water());
    expect(parseSave(serializeSave(savedBase())).bottleOwnershipIssues).toBeUndefined();
  });
  it("death before or after completion transfers exactly the current container once, preserving refusal and keepInventory",()=>{
    for(const completed of [false,true]){
      const inv=new Inventory();inv.slots[0]=water();if(completed)expect(inv.drinkSelectedWaterBottle()).toEqual({ok:true});
      const expected=completed?empty():water(),d:PlayerDeathState={phase:"pending",position:at,keepInventory:false},transfer=new PlayerDeathTransfer(),before=inv.toJSON();
      expect(transfer.tryTransfer(inv,[],d,()=>null,()=>{})).toBe(false);expect(inv.toJSON()).toEqual(before);expect(d.phase).toBe("pending");
      const drops=new WorldDrops(floor);expect(transfer.tryTransfer(inv,[],d,drops.planSpawnBatch.bind(drops),()=>{})).toBe(true);expect(inv.slots[0]).toBeNull();expect(drops.records.map(r=>r.stack)).toEqual([expected]);
      expect(transfer.tryTransfer(inv,[],d,()=>{throw Error("duplicate");},()=>{})).toBe(true);expect(drops.records).toHaveLength(1);
      const restored=new WorldDrops(floor,drops.toJSON()),receiver=new Inventory();restored.update(.5);expect(restored.tryPickup(restored.records[0].position,stack=>receiver.addStack(stack))).toBe(1);expect(receiver.slots[0]).toEqual(expected);
      const kept=new Inventory();kept.slots[0]=completed?empty():water();const keep:PlayerDeathState={phase:"pending",position:at,keepInventory:true};expect(new PlayerDeathTransfer().tryTransfer(kept,[],keep,()=>{throw Error("keep must not drop");},()=>{})).toBe(true);expect(kept.slots[0]).toEqual(expected);
    }
  });
});
