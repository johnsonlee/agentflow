import { withLegacyBirchRecipes } from "./helpers/legacy-birch-recipes";
import {it,expect} from "vitest";
import {createHash} from "node:crypto";
import prefix from "./fixtures/flint-prefix-240b979.json";
import {ITEMS,BLOCKS,RECIPES,allAtlasTextureNames,World,Inventory,WorldDrops,blockId,stackId,blockDrops,dropOf,baseStackId,breakBlock,createAgent,runAgentCommand,parseSave,serializeSave,sanitizeGravelHarvestState,GravelHarvestResolver} from "../src";
const at={x:1,y:80,z:1},g=()=>blockId("gravel"),hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const setup=()=>{const w=new World(12345);w.setBlock(at.x,at.y,at.z,g());w.setBlock(at.x,at.y+1,at.z,0);return w;};
const mine=(w:World,inv:Inventory,rand=()=>0,sink?:Parameters<typeof breakBlock>[8])=>breakBlock(w,inv,"survival",at.x,at.y,at.z,rand,[],sink);
it("preserves all old registries and canonical Gravel identity while appending only Flint",()=>{
 expect(hash(ITEMS.slice(0,581))).toBe(prefix.itemsSHA256);expect(hash(BLOCKS.slice(0,308))).toBe(prefix.blocksSHA256);expect(hash(withLegacyBirchRecipes(RECIPES.slice(0,167)))).toBe(prefix.recipesSHA256);expect(hash(allAtlasTextureNames().slice(0,867))).toBe(prefix.namesSHA256);
 expect([ITEMS.length,BLOCKS.length,RECIPES.length,allAtlasTextureNames().length]).toEqual([594, 322, 171, 893]);expect(ITEMS[581]).toMatchObject({id:837,name:"flint",maxStack:64,icon:"item_flint"});
 expect(blockDrops(g(),()=>0)).toEqual([{id:837,count:1}]);expect(blockDrops(g(),()=>.1)).toEqual([{id:g(),count:1}]);expect(dropOf(g())).toBe(g());expect(baseStackId(g())).toBe(g());
});
it("retains the first refused player decision across cold restore and shared Agent delivery",()=>{
 const w=setup(),inv=new Inventory();let draws=0;expect(mine(w,inv,()=>{draws++;return 0;},()=>null)).toBe(false);expect(draws).toBe(1);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());expect(w.gravelHarvests.exportState().records).toEqual([{...at,flint:true}]);
 const cold=new World(12345);cold.importEdits(w.exportEdits());expect(cold.gravelHarvests.restore(w.gravelHarvests.exportState()).invalid).toBe(0);const agent=createAgent(1,80,2,2),drops=new WorldDrops(cold);
 expect(runAgentCommand(cold,agent,{op:"destroy",dir:"forward"},{gravelRand:()=>{throw Error("reroll");},worldDrop:drops.planSpawnBatch.bind(drops)}).ok).toBe(true);expect(drops.records.map(r=>r.stack)).toEqual([{id:837,count:1}]);expect(cold.gravelHarvests.exportState().records).toEqual([]);
});
it("invalidates real same-ID replacement/import but not no-op same-ID writes; leased RNG callback cannot replace its source",()=>{
 const w=setup();expect(w.gravelHarvests.plan(at.x,at.y,at.z,()=>0)?.stack.id).toBe(837);w.setBlock(at.x,at.y,at.z,g());expect(w.gravelHarvests.plan(at.x,at.y,at.z,()=>{throw Error("no reroll");})?.stack.id).toBe(837);
 w.setBlock(at.x,at.y,at.z,0);w.setBlock(at.x,at.y,at.z,g());expect(w.gravelHarvests.plan(at.x,at.y,at.z,()=>.9)?.stack.id).toBe(g());w.importEdits([[at.x,at.y,at.z,g()]]);expect(w.gravelHarvests.exportState().records).toEqual([]);
 const inv=new Inventory();let draws=0;expect(mine(w,inv,()=>{draws++;w.setBlock(at.x,at.y,at.z,0);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());w.setBlock(at.x,at.y,at.z,g());return 0;})).toBe(true);expect(draws).toBe(1);expect(inv.slots.filter(Boolean)).toEqual([{id:837,count:1}]);expect(w.getBlock(at.x,at.y,at.z)).toBe(0);expect(w.gravelHarvests.exportState().records).toEqual([]);
});
it("refuses invalid/throwing RNG without cache/world/tool changes and keeps unrelated block RNG untouched",()=>{
 for(const value of [NaN,Infinity,-1,1,2,"throw"]){const w=setup(),inv=new Inventory();inv.slots[0]={id:stackId("iron_shovel"),count:1,damage:2};const before=inv.toJSON();expect(mine(w,inv,()=>{if(value==="throw")throw Error("bad");return value as number;})).toBe(false);expect(inv.toJSON()).toEqual(before);expect(w.gravelHarvests.exportState().records).toEqual([]);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());}
 const w=setup(),inv=new Inventory();w.setBlock(at.x,at.y,at.z,blockId("dirt"));expect(mine(w,inv,()=>{throw Error("ordinary dirt must not draw");})).toBe(true);
});
it("rejects selected-owner changes and pins source through receiver reservation",()=>{
 for(const defect of ["rng-selection","sink-selection","sink-source"]){const w=setup(),inv=new Inventory();inv.slots[0]={id:stackId("iron_shovel"),count:1,damage:2};let commit=0;
 const rand=()=>{if(defect==="rng-selection")inv.selected=1;return 0;};const sink=()=>{if(defect==="sink-selection")inv.slots[0]!.damage=3;if(defect==="sink-source"){w.setBlock(at.x,at.y,at.z,0);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());w.setBlock(at.x,at.y,at.z,g());}return {commit:()=>{commit++;return true;}};};
 const success=defect==="sink-source";expect(mine(w,inv,rand,sink)).toBe(success);expect(commit).toBe(success?1:0);expect(w.getBlock(at.x,at.y,at.z)).toBe(success?0:g());expect(inv.slots.filter(s=>s?.id===837)).toEqual([]);expect(inv.slots[0]?.damage).toBe(success||defect==="sink-selection"?3:2);
 }
});
it("diagnoses malformed raw decisions before repair and rejects mismatched loaded sources, ignoring spoof flags",()=>{
 const base={version:1,name:"Flint",seed:12345,mode:"survival",player:{position:at},inventory:new Inventory().toJSON(),edits:[]};
 for(const bad of [null,[],{version:2,records:[]},{version:1,records:[{...at,flint:1}]},{version:1,records:[{...at,flint:true,extra:0}]},{version:1,records:[{...at,flint:true},{...at,flint:false}]}])expect(parseSave(JSON.stringify({...base,gravelHarvests:bad})).gravelHarvestInvalid).toBe(true);
 expect(sanitizeGravelHarvestState(undefined)).toMatchObject({invalid:0,present:false});expect(parseSave(JSON.stringify({...base,gravelHarvestInvalid:true})).gravelHarvestInvalid).toBeUndefined();expect(JSON.parse(serializeSave({...base,gravelHarvestInvalid:true} as never)).gravelHarvestInvalid).toBeUndefined();
 const w=setup();w.setBlock(at.x,at.y,at.z,0);expect(w.gravelHarvests.restore({version:1,records:[{...at,flint:true}]}).invalid).toBe(1);expect(w.gravelHarvests.exportState().records).toEqual([]);
});

it("keeps full-bag first decision without direct insertion, then commits one output and normal tool wear",()=>{
 const w=setup(),inv=new Inventory();for(let i=0;i<36;i++)inv.slots[i]={id:blockId("stone"),count:64};inv.slots[0]={id:stackId("iron_shovel"),count:1,damage:2};let draws=0;
 expect(mine(w,inv,()=>{draws++;return 0;})).toBe(false);expect(draws).toBe(1);expect(inv.slots[0]?.damage).toBe(2);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());expect(w.gravelHarvests.exportState().records).toEqual([{...at,flint:true}]);
 inv.slots[35]=null;expect(mine(w,inv,()=>{throw Error("fullbag retry rerolled");})).toBe(true);expect(inv.slots[35]).toEqual({id:837,count:1});expect(inv.slots[0]?.damage).toBe(3);expect(w.getBlock(at.x,at.y,at.z)).toBe(0);expect(w.gravelHarvests.exportState().records).toEqual([]);
});
it("refuses late locked destination/tool descriptors before any receiver commit or world debit",()=>{
 for(const phase of ["rng","sink"])for(const defect of ["destination","accessor","tool-damage","nonextensible-tool"]){
  const w=setup(),inv=new Inventory();inv.slots[0]={id:stackId("iron_shovel"),count:1,...(defect==="nonextensible-tool"?{}:{damage:2})};let committed=0,setters=0;
  const lock=()=>{if(defect==="destination")Object.defineProperty(inv.slots,"35",{value:null,writable:false});if(defect==="accessor")Object.defineProperty(inv.slots,"35",{get:()=>null,set:()=>{setters++;}});if(defect==="tool-damage")Object.defineProperty(inv.slots[0]!,"damage",{value:2,writable:false});if(defect==="nonextensible-tool")Object.preventExtensions(inv.slots[0]!);};
  const rand=()=>{if(phase==="rng")lock();return 0;};const sink=()=>{lock();return {commit:()=>{committed++;return true;}};};
  expect(()=>expect(mine(w,inv,rand,phase==="sink"?sink:undefined)).toBe(false)).not.toThrow();expect(committed).toBe(0);expect(setters).toBe(0);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());expect(inv.slots.some(s=>s?.id===837)).toBe(false);expect(inv.slots[0]?.damage).toBe(defect==="nonextensible-tool"?undefined:2);
 }
});
it("refuses invalid owned stacks before drawing and keeps Creative removal draw/drop/wear free",()=>{
 for(const bad of [{id:stackId("iron_shovel"),count:0},{id:stackId("iron_shovel"),count:2},{id:837,count:NaN}]){const w=setup(),inv=new Inventory();inv.slots[0]=bad;let draws=0;expect(mine(w,inv,()=>{draws++;return 0;})).toBe(false);expect(draws).toBe(0);expect(w.gravelHarvests.exportState().records).toEqual([]);}
 const w=setup(),inv=new Inventory();inv.slots[0]={id:stackId("iron_shovel"),count:1,damage:2};expect(mine(w,inv,()=>0,()=>null)).toBe(false);expect(breakBlock(w,inv,"creative",at.x,at.y,at.z,()=>{throw Error("creative draw");})).toBe(true);expect(inv.slots.filter(Boolean)).toEqual([{id:stackId("iron_shovel"),count:1,damage:2}]);expect(w.gravelHarvests.exportState().records).toEqual([]);
});
it("shares Agent direct full-bag retry decisions and rejects late Agent source/owner changes",()=>{
 const w=setup(),agent=createAgent(1,80,2,2);for(let i=0;i<27;i++)agent.slots[i]={id:blockId("stone"),count:64};let draws=0;expect(runAgentCommand(w,agent,{op:"destroy",dir:"forward"},{gravelRand:()=>{draws++;return .9;}}).ok).toBe(false);expect(draws).toBe(1);agent.slots[26]=null;expect(runAgentCommand(w,agent,{op:"destroy",dir:"forward"},{gravelRand:()=>{throw Error("Agent reroll");}}).ok).toBe(true);expect(agent.slots[26]).toEqual({id:g(),count:1});
 for(const defect of ["selection","source","late-slot"]){const w=setup(),agent=createAgent(1,80,2,2);let commits=0;expect(runAgentCommand(w,agent,{op:"destroy",dir:"forward"},{gravelRand:()=>0,worldDrop:()=>{if(defect==="selection")agent.selected=1;if(defect==="source"){w.setBlock(at.x,at.y,at.z,0);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());w.setBlock(at.x,at.y,at.z,g());}if(defect==="late-slot")Object.defineProperty(agent.slots,"26",{value:null,writable:false});return{commit:()=>{commits++;return true;}};}}).ok).toBe(defect==="source");expect(commits).toBe(defect==="source"?1:0);expect(w.getBlock(at.x,at.y,at.z)).toBe(defect==="source"?0:g());expect(agent.slots.every(s=>s===null)).toBe(true);}
});
it("bounds strict pending state, rejects corrupt sparse/accessor owners and keeps probe/export/reentry safe",()=>{
 const invalid=[{version:1,records:Array(1)},{version:1,records:[{x:1.2,y:80,z:1,flint:true}]},{version:1,records:[{x:1,y:-1,z:1,flint:true}]},{version:1,records:[{...at,flint:false}],extra:1},{version:1,records:Array.from({length:4097},(_,x)=>({x,y:80,z:1,flint:false}))}];
 for(const raw of invalid)expect(sanitizeGravelHarvestState(raw).invalid).toBeGreaterThan(0);
 const w=setup();expect(w.gravelHarvests.plan(at.x,at.y,at.z,()=>{expect(w.gravelHarvests.exportState().records).toEqual([]);expect(w.gravelHarvests.plan(at.x,at.y,at.z,()=>0)).toBeNull();return .999;})).toMatchObject({stack:{id:g(),count:1}});
});
it("persists decisions separately from owned outputs through actual parse/serialize and source import",()=>{
 const w=setup(),inv=new Inventory();expect(mine(w,inv,()=>0,()=>({commit:()=>false}))).toBe(false);const raw=serializeSave({name:"pending",seed:12345,mode:"survival",timeOfDay:.2,player:{position:at,yaw:0,pitch:0,flying:false},inventory:inv.toJSON(),edits:w.exportEdits(),gravelHarvests:w.gravelHarvests.exportState()});const parsed=parseSave(raw),cold=new World(parsed.seed);cold.importEdits(parsed.edits);expect(cold.gravelHarvests.restore(parsed.gravelHarvests)).toEqual({invalid:0,present:true});expect(parsed.gravelHarvestInvalid).toBeUndefined();expect(Inventory.fromJSON(parsed.inventory).slots.every(s=>s===null)).toBe(true);const loadedInv=Inventory.fromJSON(parsed.inventory);expect(mine(cold,loadedInv,()=>{throw Error("cold reroll");})).toBe(true);expect(loadedInv.slots.filter(Boolean)).toEqual([{id:837,count:1}]);
});

it("refuses malformed tool durability and caps decisions without eviction or extra random draws",()=>{
 for(const damage of [NaN,Infinity,-1,250,1.2]){const w=setup(),inv=new Inventory();inv.slots[0]={id:stackId("iron_shovel"),count:1,damage};let draws=0;expect(mine(w,inv,()=>{draws++;return 0;})).toBe(false);expect(draws).toBe(0);expect(w.getBlock(at.x,at.y,at.z)).toBe(g());}
 const resolver=new GravelHarvestResolver({getBlock:()=>g()});let draws=0;for(let x=0;x<4096;x++)expect(resolver.plan(x,80,1,()=>{draws++;return 0;})).not.toBeNull();expect(resolver.plan(4096,80,1,()=>{draws++;return 0;})).toBeNull();expect(draws).toBe(4096);expect(resolver.exportState().records).toHaveLength(4096);expect(resolver.plan(0,80,1,()=>{throw Error("cached first evicted");})?.stack).toEqual({id:837,count:1});
});

for(const actor of ["player","agent"] as const)it(`${actor} refuses early/late receiver count locks before source removal and safely retries the retained decision`,()=>{
 for(const phase of ["initial","rng","sink"]){
  const w=setup(),inv=new Inventory(),agent=createAgent(1,80,2,2),slots=actor==="player"?inv.slots:agent.slots;
  slots[0]={id:stackId("iron_shovel"),count:1,damage:2};slots[1]={id:837,count:1};let draws=0,commits=0;
  const lock=()=>Object.defineProperty(slots[1]!,"count",{value:1,writable:false});if(phase==="initial")lock();
  const rand=()=>{draws++;if(phase==="rng")lock();return 0;};const sink=()=>{lock();return{commit:()=>{commits++;return true;}};};
  const act=()=>actor==="player"?mine(w,inv,rand,phase==="sink"?sink:undefined):runAgentCommand(w,agent,{op:"destroy",dir:"forward"},{gravelRand:rand,...(phase==="sink"?{worldDrop:sink}:{})}).ok;
  expect(()=>expect(act()).toBe(false)).not.toThrow();expect(w.getBlock(at.x,at.y,at.z)).toBe(g());expect(slots[1]?.count).toBe(1);expect(slots[0]?.damage).toBe(2);expect(commits).toBe(0);expect(draws).toBe(phase==="initial"?0:1);
  // A late valid first roll remains a decision attached to the unchanged source, never an item.
  expect(w.gravelHarvests.exportState().records).toEqual(phase==="initial"?[]:[{...at,flint:true}]);
  Object.defineProperty(slots[1]!,"count",{value:1,writable:true});const retry=()=>{if(phase!=="initial")throw Error("late count refusal rerolled");return 0;};
  expect(actor==="player"?mine(w,inv,retry):runAgentCommand(w,agent,{op:"destroy",dir:"forward"},{gravelRand:retry}).ok).toBe(true);expect(slots[1]?.count).toBe(2);expect(w.getBlock(at.x,at.y,at.z)).toBe(0);expect(slots[0]?.damage).toBe(actor==="player"?3:2);expect(w.gravelHarvests.exportState().records).toEqual([]);
 }
});
it("accepts an unwritten readonly receiver ID while requiring its count to remain writable",()=>{
 const w=setup(),inv=new Inventory();inv.slots[1]={id:837,count:1};Object.defineProperty(inv.slots[1],"id",{value:837,writable:false});expect(mine(w,inv,()=>0)).toBe(true);expect(inv.slots[1]).toEqual({id:837,count:2});
});
