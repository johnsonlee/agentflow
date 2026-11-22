import { expect,it } from "vitest";
import { parseSave,serializeSave,type SaveData } from "../src/persistence/save";
import { captureDimensionWorld } from "../src/persistence/dimension-world";
import { Inventory } from "../src/ownership/inventory";
import { blockId } from "../src/catalog/blocks";
import { stackId } from "../src/catalog/items";
import { createAgent } from "../src/automation/agent";
function base():SaveData {
 const inventory=new Inventory();inventory.slots[0]={id:stackId("diamond_pickaxe"),count:1,damage:12};const agent=createAgent(2,80,2);agent.slots[0]={id:blockId("stone"),count:7};
 return {version:1,name:"World owners",seed:7,generatorVersion:2,mode:"survival",timeOfDay:.1,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},edits:[],inventory:inventory.toJSON(),agent,playerState:{health:7},inventoryPending:[{id:stackId("bucket"),count:1}]};
}
function withArchive():SaveData {
 const saved=base();saved.dimensions={version:1,active:"overworld",inactive:{nether:{seed:9,generatorVersion:1,player:{position:{x:12.5,y:45,z:13.5},yaw:1,pitch:.1,flying:false},edits:[[12,44,13,blockId("stone")]],furnaces:[],worldDrops:{nextKey:1,records:[]}}},links:[]};return saved;
}
it("round-trips validated inactive worlds while keeping one global player and Agent bag",()=>{
 const saved=withArchive(),before=structuredClone(saved),text=serializeSave(saved),loaded=parseSave(text);
 expect(loaded.dimensions).toEqual(saved.dimensions);expect(loaded.dimensionsInvalid).toBeUndefined();expect(loaded.dimensionOwnershipIssues).toBeUndefined();
 expect(loaded.inventory).toEqual(saved.inventory);expect(loaded.agent).toEqual(saved.agent);expect(loaded.playerState).toEqual({health:7});expect(loaded.inventoryPending).toEqual(saved.inventoryPending);expect(saved).toEqual(before);
 expect(loaded.dimensions!.inactive.nether).not.toHaveProperty("inventory");expect(loaded.dimensions!.inactive.nether).not.toHaveProperty("agent");
 loaded.dimensions!.inactive.nether!.edits.push([13,44,13,1]);expect(saved.dimensions!.inactive.nether!.edits).toHaveLength(1);
});
it("leaves legacy saves without an archive and ignores forged serialized diagnostics",()=>{
 const saved=base();const loaded=parseSave(JSON.stringify({...saved,dimensionsInvalid:true,dimensionOwnershipIssues:[{path:"fake",reason:"fake"}]}));
 expect(loaded.dimensions).toBeUndefined();expect(loaded.dimensionsInvalid).toBeUndefined();expect(loaded.dimensionOwnershipIssues).toBeUndefined();expect(JSON.parse(serializeSave(loaded))).not.toHaveProperty("dimensionsInvalid");
});
it.each([null,{version:2,active:"overworld",inactive:{},links:[]},{version:1,active:"moon",inactive:{},links:[]}])("diagnoses malformed archives before they can be serialized away",dimensions=>{
 const text=JSON.stringify({...base(),dimensions}),loaded=parseSave(text);expect(loaded.dimensionsInvalid).toBe(true);expect(loaded.dimensionOwnershipIssues?.length).toBeGreaterThan(0);expect(loaded.dimensions).toBeUndefined();expect(()=>serializeSave(loaded)).toThrow(/dimension ownership/);expect(()=>captureDimensionWorld(loaded)).toThrow(/Unresolved/);expect(text).toBe(JSON.stringify({...base(),dimensions}));
});
it("rejects bad inactive owners without returning a sanitized partial archive",()=>{
 const saved=withArchive(),raw=JSON.parse(JSON.stringify(saved));raw.dimensions.inactive.nether.inventory={slots:[{id:192,count:1}]};
 const loaded=parseSave(JSON.stringify(raw));expect(loaded.dimensions).toBeUndefined();expect(loaded.dimensionsInvalid).toBe(true);expect(loaded.dimensionOwnershipIssues?.some(i=>i.path==="dimensions.inactive.nether.inventory")).toBe(true);expect(()=>serializeSave(raw)).toThrow(/dimension ownership/);
});
it("validates active raw edits before any legacy correction and refuses dangling links",()=>{
 const saved=withArchive(),raw=JSON.parse(JSON.stringify(saved));raw.edits=[[1,80,1,192]];let loaded=parseSave(JSON.stringify(raw));expect(loaded.dimensionsInvalid).toBe(true);expect(loaded.portalsInvalid).toBe(true);expect(()=>serializeSave(loaded)).toThrow(/dimension/);
 const other=JSON.parse(JSON.stringify(saved));other.dimensions.links=[{from:{dimension:"overworld",portal:{axis:"x",x:1,y:81,z:1,width:2,height:3}},to:{dimension:"nether",portal:{axis:"z",x:1,y:81,z:1,width:2,height:3}}}];loaded=parseSave(JSON.stringify(other));expect(loaded.dimensionsInvalid).toBe(true);expect(loaded.dimensionOwnershipIssues?.some(i=>i.path.startsWith("dimensions.links"))).toBe(true);
});
it("refuses unresolved derived archive diagnostics even when payload fields look valid",()=>{
 const saved=withArchive();saved.dimensionsInvalid=true;expect(()=>serializeSave(saved)).toThrow(/dimension/);expect(()=>captureDimensionWorld(saved)).toThrow(/Unresolved/);
 delete saved.dimensionsInvalid;saved.dimensionOwnershipIssues=[{path:"dimensions",reason:"unresolved"}];expect(()=>serializeSave(saved)).toThrow(/dimension/);expect(()=>captureDimensionWorld(saved)).toThrow(/Unresolved/);
});
it("uses the supplied read-only generated reference probe for parse and serialization",()=>{
 const saved=withArchive();saved.dimensions!.inactive.nether!.gravelHarvests={version:1,records:[{x:20,y:40,z:20,flint:true}]};const text=JSON.stringify(saved);
 expect(parseSave(text).dimensionsInvalid).toBe(true);expect(()=>serializeSave(saved)).toThrow(/dimension/);
 const calls:unknown[][]=[],probe=(...args:Parameters<NonNullable<Parameters<typeof parseSave>[1]>>)=>{calls.push(args);return blockId("gravel");};
 const loaded=parseSave(text,probe);expect(loaded.dimensionsInvalid).toBeUndefined();expect(JSON.parse(serializeSave(loaded,probe)).dimensions).toEqual(saved.dimensions);expect(calls.filter(c=>c[3]===20)).toEqual([["nether",9,1,20,40,20],["nether",9,1,20,40,20]]);expect(calls.filter(c=>c[3]===12)).toEqual([["nether",9,1,12,45,13],["nether",9,1,12,45,13]]); // Check generated Wart above the saved supporting edit.
});
