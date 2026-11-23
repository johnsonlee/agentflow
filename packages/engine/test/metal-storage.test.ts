import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {BLOCKS,ITEMS,RECIPES,METAL_STORAGE_BLOCKS,Inventory,World,WorldDrops,SingleChest,
  blockId,blockById,stackId,elementBlockId,canHarvest,toolOf,craftOnce,matchRecipe,
  placeBlock,breakBlock,createAgent,runAgentCommand,parseSave,serializeSave,sanitizeAgent,
  NATIVE_MATERIAL_REDUCTIONS,REDUCTIONS,reduceMaterial,type ItemStack,type CraftingGrid,type SaveData} from '../src';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/metal-storage-prefix-391.json',import.meta.url),'utf8'));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value,(_,x)=>x===Infinity?'Infinity':x)).digest('hex');
const stack=(name:string,count=1):ItemStack=>({id:stackId(name),count});
function flat(){const w=new World(7,3);for(let x=-2;x<=3;x++)for(let z=-2;z<=2;z++){w.setBlock(x,79,z,blockId('stone'));for(let y=80;y<=83;y++)w.setBlock(x,y,z,0);}return w;}
it('appends three ordinary205..207 blocks and six recipes without changing324 blocks,600 items or179 archived recipes',()=>{
 expect(BLOCKS).toHaveLength(345);expect(ITEMS).toHaveLength(604);expect(RECIPES).toHaveLength(205);
 expect(hash(BLOCKS.slice(0,324))).toBe(baseline.hashes.blocks);expect(hash(ITEMS.slice(0,600))).toBe(baseline.hashes.items);expect(hash(RECIPES.slice(0,179))).toBe(baseline.hashes.recipes);
 expect(METAL_STORAGE_BLOCKS.map(b=>[b.id,b.name])).toEqual([[205,'iron_block'],[206,'gold_block'],[207,'diamond_block']]);
 expect(new Set(BLOCKS.map(b=>b.id)).size).toBe(BLOCKS.length);
 for(const row of METAL_STORAGE_BLOCKS){expect(blockId(row.name)).toBe(row.id);expect(stackId(row.name)).toBe(row.id);expect([elementBlockId(26),elementBlockId(79),elementBlockId(6)]).not.toContain(row.id);}
});
it.each(METAL_STORAGE_BLOCKS)('$name finite nine material inputs round-trip once, with no2x2/mixed/chemical substitution',({name,material})=>{
 const cells:CraftingGrid=Array.from({length:9},()=>stack(material));expect(craftOnce(cells,3)).toEqual(stack(name));expect(cells).toEqual(Array(9).fill(null));expect(craftOnce(cells,3)).toBeNull();
 for(const width of [2,3])for(let index=0;index<width*width;index++){
  const reverse:CraftingGrid=Array(width*width).fill(null);reverse[index]=stack(name);expect(craftOnce(reverse,width)).toEqual(stack(material,9));expect(reverse.every(s=>s===null)).toBe(true);expect(craftOnce(reverse,width)).toBeNull();
 }
 expect(craftOnce(Array.from({length:4},()=>stack(material)),2)).toBeNull();
 for(const wrong of ['iron','gold','carbon','element_26','element_79','element_6']){
  const mixed:CraftingGrid=Array.from({length:9},()=>stack(material));mixed[4]=stack(wrong);const before=structuredClone(mixed);expect(matchRecipe(mixed,3)).toBeNull();expect(craftOnce(mixed,3)).toBeNull();expect(mixed).toEqual(before);
 }
 const excess:CraftingGrid=Array.from({length:9},()=>stack(material));excess[0]!.count=65;expect(craftOnce(excess,3)).toBeNull();expect(excess[0]!.count).toBe(65);
});
it.each(METAL_STORAGE_BLOCKS)('$name Player placement and explicit app harvest tiers produce one canonical block, never nine free ingredients',({name,harvestTier,hardness})=>{
 const id=blockId(name);expect(blockById(id)).toMatchObject({solid:true,transparent:false,shape:'cube',tool:'pickaxe',hardness,harvestTier});
 expect(canHarvest(id,null)).toBe(false);expect(canHarvest(id,toolOf(stackId('diamond_axe')))).toBe(false);
 for(const tool of ['wooden_pickaxe','golden_pickaxe','stone_pickaxe','iron_pickaxe','diamond_pickaxe'])expect(canHarvest(id,toolOf(stackId(tool)))).toBe((toolOf(stackId(tool))!.tier)>=harvestTier);
 const w=flat(),bag=new Inventory();bag.slots[0]=stack(name,2);expect(placeBlock(w,bag,'survival',1,80,0,{x:.5,y:80,z:2.5})).toBe(true);expect(w.getBlock(1,80,0)).toBe(id);expect(bag.slots[0]).toEqual(stack(name));
 bag.slots[0]=stack('diamond_pickaxe');expect(breakBlock(w,bag,'survival',1,80,0)).toBe(true);expect(w.getBlock(1,80,0)).toBe(0);expect(bag.slots[0]!.damage).toBe(1);expect(bag.slots.find(s=>s?.id===id)).toEqual(stack(name));
 const wrong=flat(),bare=new Inventory();wrong.setBlock(1,80,0,id);bare.slots[0]=stack('wooden_pickaxe');expect(breakBlock(wrong,bare,'survival',1,80,0)).toBe(true);expect(bare.slots.filter(s=>s?.id===id)).toEqual([]);expect(bare.slots[0]!.damage).toBe(1);
});
it.each(METAL_STORAGE_BLOCKS)('$name refused/reentrant Player receiver preserves source and tool until one ground receipt commits',({name})=>{
 const w=flat(),bag=new Inventory(),drops=new WorldDrops(w);w.setBlock(0,80,-1,blockId(name));bag.slots[0]={...stack('iron_pickaxe'),damage:7};for(let i=1;i<36;i++)bag.slots[i]=stack('cobblestone',64);const before=structuredClone(bag.toJSON());
 expect(breakBlock(w,bag,'survival',0,80,-1)).toBe(false);let calls=0;
 expect(breakBlock(w,bag,'survival',0,80,-1,Math.random,[],()=>{calls++;w.setBlock(0,80,-1,0);expect(w.getBlock(0,80,-1)).toBe(blockId(name));expect(breakBlock(w,bag,'survival',0,80,-1,Math.random,[],()=>null)).toBe(false);return null;})).toBe(false);
 expect(calls).toBe(1);expect(bag.toJSON()).toEqual(before);expect(w.blockSourceLeaseBusy).toBe(false);
 expect(breakBlock(w,bag,'survival',0,80,-1,Math.random,[],(items,at)=>drops.planSpawnBatch(items,at))).toBe(true);expect(drops.records.map(r=>r.stack)).toEqual([stack(name)]);expect(bag.slots[0]!.damage).toBe(8);expect(bag.slots.slice(1)).toEqual(before.slots.slice(1));
 expect(breakBlock(w,bag,'survival',0,80,-1)).toBe(false);expect(drops.records).toHaveLength(1);
});
it.each(METAL_STORAGE_BLOCKS)('$name Agent retains ordinary tool-free authority, placement ownership and complete refusal/ground transfer',({name})=>{
 const w=flat(),a=createAgent(0,80,0,2);a.slots[0]=stack(name,2);expect(runAgentCommand(w,a,{op:'place',dir:'forward'}).ok).toBe(true);expect(w.getBlock(0,80,-1)).toBe(blockId(name));expect(a.slots[0]).toEqual(stack(name));expect(runAgentCommand(w,a,{op:'destroy',dir:'forward'}).ok).toBe(true);expect(a.slots[0]).toEqual(stack(name,2));
 w.setBlock(0,80,-1,blockId(name));for(let i=0;i<27;i++)a.slots[i]=stack('cobblestone',64);const before=structuredClone(a);expect(runAgentCommand(w,a,{op:'destroy',dir:'forward'}).ok).toBe(false);expect(runAgentCommand(w,a,{op:'destroy',dir:'forward'},{worldDrop:()=>null}).ok).toBe(false);expect(a).toEqual(before);expect(w.getBlock(0,80,-1)).toBe(blockId(name));
 const d=new WorldDrops(w);expect(runAgentCommand(w,a,{op:'destroy',dir:'forward'},{worldDrop:(items,at)=>d.planSpawnBatch(items,at)}).ok).toBe(true);expect(a).toEqual(before);expect(d.records.map(r=>r.stack)).toEqual([stack(name)]);expect(runAgentCommand(w,a,{op:'destroy',dir:'forward'}).ok).toBe(false);
});
it('three ordinary block identities survive edits, bag, pending cursor, Agent, Chest and ground cold owners without changing chemical identities',()=>{
 const w=flat(),bag=new Inventory(),a=createAgent(0,80,0),chest=new SingleChest(),d=new WorldDrops(w);METAL_STORAGE_BLOCKS.forEach(({name},i)=>{bag.slots[i]=stack(name,i+1);a.slots[i]=stack(name,i+4);chest.replace(i,stack(name,i+7));w.setBlock(i,80,-1,blockId(name));});w.setBlock(3,80,0,blockId('chest'));expect(d.planSpawnBatch(METAL_STORAGE_BLOCKS.map(x=>stack(x.name)),{x:.5,y:80,z:.5})!.commit()).toBe(true);
 const raw:SaveData={version:1,name:'Ordinary storage owners',seed:7,generatorVersion:3,mode:'survival',timeOfDay:.25,player:{position:{x:.5,y:80,z:2.5},yaw:0,pitch:0,flying:false},inventory:bag.toJSON(),inventoryPending:[stack('gold_block',3)],agent:a,chests:[{x:3,y:80,z:0,state:chest.snapshot()}],worldDrops:d.toJSON(),edits:w.exportEdits()};
 const cold=parseSave(serializeSave(raw));expect(cold.inventory).toEqual(raw.inventory);expect(cold.inventoryPending).toEqual(raw.inventoryPending);expect(sanitizeAgent(cold.agent)).toEqual(a);expect(cold.chests).toEqual(raw.chests);expect(cold.worldDrops).toEqual(raw.worldDrops);const restored=new World(7,3);restored.importEdits(cold.edits);for(const [i,row]of METAL_STORAGE_BLOCKS.entries())expect(restored.getBlock(i,80,-1)).toBe(blockId(row.name));expect(new WorldDrops(restored,cold.worldDrops).toJSON()).toEqual(d.toJSON());
 expect(stackId('iron')).not.toBe(stackId('iron_ingot'));expect(stackId('gold')).not.toBe(stackId('gold_ingot'));expect(stackId('carbon')).not.toBe(stackId('diamond'));
});

it('three ordinary storage reducers append exact native64+36 outputs without altering27 retained rows or treating atoms as blocks',()=>{expect(hash(NATIVE_MATERIAL_REDUCTIONS.slice(0,27))).toBe(baseline.nativeReductionPrefix.hash);expect(NATIVE_MATERIAL_REDUCTIONS).toHaveLength(32);expect(hash(REDUCTIONS.slice(0,29))).toBe(baseline.derivedReductionPrefix.hash);expect(REDUCTIONS.slice(29,32).map(([name])=>name)).toEqual(['iron_block','gold_block','diamond_block']);for(const [name,element,z]of [['iron_block','iron',26],['gold_block','gold',79],['diamond_block','carbon',6]]as const){expect(reduceMaterial(blockId(name))).toEqual([stack(element,64),stack(element,36)]);expect(reduceMaterial(blockId(name))!.reduce((n,s)=>n+s.count,0)).toBe(100);expect(reduceMaterial(stackId(element))).toBeNull();expect(reduceMaterial(elementBlockId(z))).toBeNull();}});
