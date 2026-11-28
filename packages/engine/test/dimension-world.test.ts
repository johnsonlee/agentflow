import { expect, it } from "vitest";
import { Inventory, createAgent, type SaveData } from "../src";
import { captureDimensionWorld, replaceDimensionWorld } from "../src/persistence/dimension-world";
function save(): SaveData {
 const inventory=new Inventory();inventory.setSlot(0,{id:435,count:1,damage:11});
 return {version:1,name:"One shared owner",seed:7,mode:"survival",timeOfDay:.4,player:{position:{x:1,y:80,z:2},yaw:.2,pitch:.1,flying:false},inventory:inventory.toJSON(),inventoryPending:[{id:191,count:1}],playerState:{health:7},edits:[],furnaces:[],portals:{version:1,records:[]},worldDrops:{nextKey:1,records:[]}};
}
it("clears every omitted old realm owner while preserving global equipment/pending/health once",()=>{
 const current=save();const target={seed:9,player:{...current.player,position:{x:12,y:45,z:13}},edits:[]};
 const result=replaceDimensionWorld(current,target);
 expect(result).not.toHaveProperty("furnaces");expect(result).not.toHaveProperty("portals");expect(result).not.toHaveProperty("worldDrops");
 expect(Object.keys(captureDimensionWorld(current)).sort()).toEqual(["edits","furnaces","player","portals","seed","worldDrops"]);
 expect(result.inventory).toEqual(current.inventory);expect(result.inventoryPending).toEqual(current.inventoryPending);expect(result.playerState).toEqual({health:7});expect(result.seed).toBe(9);
 expect(Object.keys(captureDimensionWorld(current))).not.toContain("inventory");expect(Object.keys(captureDimensionWorld(current))).not.toContain("inventoryPending");expect(Object.keys(captureDimensionWorld(current))).not.toContain("playerState");
 expect(current.furnaces).toEqual([]);expect(current.portals?.records).toEqual([]);
});
it("round-trips worlds without copying a prior player's newly changed global bag or health",()=>{
 const original=save(),oldWorld=captureDimensionWorld(original),target={seed:9,player:{...original.player,position:{x:12,y:45,z:13}},edits:[]};
 const away=replaceDimensionWorld(original,target);away.inventory.slots[0]={id:435,count:1,damage:12};away.playerState={health:5};away.inventoryPending=[];
 const back=replaceDimensionWorld(away,oldWorld);
 expect(back.seed).toBe(7);expect(back.player).toEqual(original.player);expect(back.inventory.slots[0]?.damage).toBe(12);expect(back.playerState?.health).toBe(5);expect(back.inventoryPending).toEqual([]);
 expect(oldWorld).not.toHaveProperty("inventory");expect(oldWorld).not.toHaveProperty("playerState");
});
it("snapshots and replacements do not alias input world or global owner arrays",()=>{
 const source=save(),world=captureDimensionWorld(source);world.edits.push([1,2,3,1]);expect(source.edits).toEqual([]);
 const next=replaceDimensionWorld(source,world);next.edits.push([2,3,4,1]);next.inventory.slots[0]=null;next.player.position!.x=99;
 expect(world.edits).toHaveLength(1);expect(source.inventory.slots[0]?.id).toBe(435);expect(world.player.position?.x).toBe(1);
});
it.each(["inventory","agent","playerState","inventoryPending","portalsInvalid"])("refuses foreign owner/diagnostic %s without touching current save",key=>{
 const source=save(),before=structuredClone(source),target={seed:9,player:source.player,edits:[],[key]:{}};
 expect(()=>replaceDimensionWorld(source,target)).toThrow(/Foreign/);expect(source).toEqual(before);
});
it("refuses accessors without invoking them and does not mutate source on refusal",()=>{
 const source=save();let calls=0;const target={seed:9,player:source.player,edits:[]};Object.defineProperty(target,"portals",{get(){calls++;return undefined;},enumerable:true});
 expect(()=>replaceDimensionWorld(source,target)).toThrow(/accessor/);expect(calls).toBe(0);expect(source.seed).toBe(7);
});
it.each(["seed","player","edits"])("refuses missing required world field %s",key=>{
 const source=save(),target=captureDimensionWorld(source);Reflect.deleteProperty(target,key);expect(()=>replaceDimensionWorld(source,target)).toThrow(/Missing/);
});

it("Agent bag stays global across a return even when its inventory changes in the other world",()=>{
 const source=save();source.agent=createAgent(1,80,2);source.agent.slots[0]={id:191,count:2};const prior=captureDimensionWorld(source);
 const next=replaceDimensionWorld(source,{seed:9,player:source.player,edits:[]});next.agent!.slots[0]={id:191,count:1};
 const returned=replaceDimensionWorld(next,prior);expect(returned.agent!.slots[0]).toEqual({id:191,count:1});expect(prior).not.toHaveProperty("agent");
 returned.agent!.slots[0]=null;expect(next.agent!.slots[0]).toEqual({id:191,count:1});expect(source.agent.slots[0]).toEqual({id:191,count:2});
});

import { DimensionWorldArchive } from "../src/persistence/dimension-world";
it("archives a fresh source only at commit, removes target ownership, and round-trips without any bag snapshot",()=>{
 const first=save(),over=captureDimensionWorld(first),nether={...captureDimensionWorld(first),seed:9};
 const archive=new DimensionWorldArchive("overworld"),entry=archive.begin("nether",nether)!;
 expect(archive.exportState()).toEqual({version:1,active:"overworld",inactive:{}});
 first.edits.push([1,2,3,1]);const committed=entry.commit(captureDimensionWorld(first))!;
 expect(committed.world.seed).toBe(9);expect(committed.archive.active).toBe("nether");expect(committed.archive.inactive).not.toHaveProperty("nether");
 expect(committed.archive.inactive.overworld?.edits).toEqual([[1,2,3,1]]);expect(committed.archive.inactive.overworld).not.toHaveProperty("inventory");
 committed.world.edits.push([4,5,6,1]);const returned=archive.begin("overworld")!.commit(committed.world)!;
 expect(returned.world.edits).toEqual([[1,2,3,1]]);expect(returned.archive.inactive.nether?.edits).toEqual([[4,5,6,1]]);expect(returned.archive.inactive).not.toHaveProperty("overworld");
 expect(over.edits).toEqual([]);expect(entry.commit(over)).toBeNull();
});
it("refuses concurrent, same-realm, missing-destination and overwrite transitions without losing worlds",()=>{
 const world=captureDimensionWorld(save()),archive=new DimensionWorldArchive("overworld",{nether:world});
 const before=archive.exportState();expect(archive.begin("overworld")).toBeNull();expect(archive.begin("nether",world)).toBeNull();expect(archive.exportState()).toEqual(before);
 const stage=archive.begin("nether")!;expect(archive.begin("nether")).toBeNull();stage.cancel();expect(stage.commit(world)).toBeNull();expect(archive.exportState()).toEqual(before);expect(archive.begin("nether")).not.toBeNull();
 expect(new DimensionWorldArchive("overworld").begin("nether")).toBeNull();
});
it("does not alias generated destinations, returned preparations or exported archives",()=>{
 const world=captureDimensionWorld(save()),archive=new DimensionWorldArchive("overworld"),entry=archive.begin("nether",world)!;
 world.seed=77;entry.destination.seed=88;const outcome=entry.commit(captureDimensionWorld(save()))!;expect(outcome.world.seed).toBe(7);
 outcome.archive.inactive.overworld!.edits.push([1,2,3,1]);expect(archive.exportState().inactive.overworld!.edits).toEqual([]);
});
it("invalid source commit releases reservation and preserves the existing archive",()=>{
 const world=captureDimensionWorld(save()),archive=new DimensionWorldArchive("overworld",{nether:world}),before=archive.exportState();
 const stage=archive.begin("nether")!;const invalid={...world,inventory:{}};expect(()=>stage.commit(invalid)).toThrow(/Foreign/);expect(archive.exportState()).toEqual(before);expect(archive.begin("nether")).not.toBeNull();
});
it("refuses an archive containing its active world or a foreign realm before copying it",()=>{
 const world=captureDimensionWorld(save());expect(()=>new DimensionWorldArchive("overworld",{overworld:world})).toThrow(/Duplicate/);
 expect(()=>new DimensionWorldArchive("overworld",{other:world} as unknown as {nether:typeof world})).toThrow(/invalid/);
});

it.each(["fluidsInvalid","portalsInvalid","fireInvalid","generatorVersionInvalid"] as const)("does not move a world or hide unresolved %s source diagnostics",key=>{
 const source=save(),world=captureDimensionWorld(source);source[key]=true;const before=structuredClone(source);
 expect(()=>captureDimensionWorld(source)).toThrow(/Unresolved/);expect(()=>replaceDimensionWorld(source,world)).toThrow(/Unresolved/);expect(source).toEqual(before);
});
it("refuses nonempty raw owner diagnostics, without invoking a diagnostic getter",()=>{
 const source=save();source.portalOwnershipIssues=[{path:"inventory.slots[0]",reason:"hidden portal owner"}];expect(()=>captureDimensionWorld(source)).toThrow(/Unresolved/);
 const other=save();let calls=0;Object.defineProperty(other,"portalsInvalid",{get(){calls++;return false;}});expect(()=>captureDimensionWorld(other)).toThrow(/Accessor/);expect(calls).toBe(0);
});

it("independent: refuses a non-enumerable required world owner before cloning can omit it",()=>{
 const source=save(),target=captureDimensionWorld(source);Object.defineProperty(target,"seed",{value:9,enumerable:false,configurable:true});
 const archive=new DimensionWorldArchive("overworld");expect(()=>archive.begin("nether",target)).toThrow(/enumerable/);
 expect(archive.exportState()).toEqual({version:1,active:"overworld",inactive:{}});expect(archive.begin("nether",captureDimensionWorld(source))).not.toBeNull();
 expect(()=>replaceDimensionWorld(source,target)).toThrow(/enumerable/);
});
it("independent: refuses a non-enumerable inactive realm rather than silently dropping its owner",()=>{
 const world=captureDimensionWorld(save()),inactive={};Object.defineProperty(inactive,"nether",{value:world,enumerable:false});
 expect(()=>new DimensionWorldArchive("overworld",inactive)).toThrow(/enumerable/);
});
