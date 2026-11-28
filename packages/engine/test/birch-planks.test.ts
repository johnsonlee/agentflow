import {withLegacyBirchRecipes} from "./helpers/legacy-birch-recipes";
import {readFileSync}from 'node:fs';
import {createHash}from 'node:crypto';
import {expect,it}from 'vitest';
import{AIR,BLOCKS,ITEMS,RECIPES,Inventory,World,WorldDrops,TerrainGenerator,blockId,stackId,matchRecipe,craftOnce,placeBlock,breakBlock,createAgent,runAgentCommand,parseSave,serializeSave,sanitizeAgent,sanitizeFurnaces,createFurnace,tickFurnace,fuelSeconds,reduceMaterial,type ItemStack,type SaveData,type Recipe}from '../src';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/birch-prefix-6893.json',import.meta.url),'utf8'));
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value,(_,v)=>v===Infinity?'Infinity':v)).digest('hex');
const s=(name:string,count=1):ItemStack=>({id:stackId(name),count});
function grid(recipe:Recipe,mixed=false):Array<ItemStack|null>{const out:Array<ItemStack|null>=Array(9).fill(null);let p=0;if(recipe.pattern)recipe.pattern.forEach((row,y)=>[...row].forEach((key,x)=>{if(key!==' '){let name=recipe.key![key];if(mixed&&recipe.keyTags?.[key]==='planks'&&p++%2===0)name='birch_planks';out[y*3+x]=s(name,2);}}));else recipe.ingredients!.forEach((name,i)=>out[i]=s(name,2));return out;}
function flat(){const w=new World(7,2);for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){w.setBlock(x,79,z,blockId('stone'));for(let y=80;y<=83;y++)w.setBlock(x,y,z,AIR);}return w;}
it('appends only Birch202; all old321 block definitions,594 items and two Overworld gen2 chunks remain exact',()=>{
 expect(blockId('birch_planks')).toBe(202);expect(BLOCKS).toHaveLength(baseline.blockCount+24);expect(sha(BLOCKS.slice(0,baseline.blockCount))).toBe(baseline.blocksSHA256);expect(ITEMS).toHaveLength(baseline.itemCount+12);expect(sha(ITEMS.slice(0,baseline.itemCount))).toBe(baseline.itemsSHA256);
 for(const old of baseline.chunks){const c=new TerrainGenerator(12345,2).generate(old.x,old.z);expect(createHash('sha256').update(new Uint8Array(c.blocks.buffer)).digest('hex')).toBe(old.sha256);}
});
it('preserves all171 recipe positions and all non-Birch legacy results while correcting Birch output identity',()=>{
 expect(RECIPES).toHaveLength(baseline.recipes.length+34);
 baseline.recipes.forEach((old:Recipe,index:number)=>{const now=RECIPES[index];if(old.id==='oak_planks_from_birch'){expect(now).toEqual({id:'birch_planks',ingredients:['birch_log'],result:['birch_planks',4]});expect(matchRecipe(grid(old),3)?.result).toEqual(s('birch_planks',4));}else{expect(now.id).toBe(old.id);expect(withLegacyBirchRecipes([now])[0]).toEqual(old);expect(matchRecipe(grid(old),3)?.result).toEqual(baseline.recipeOutputs[index].result);}});
});
it('Birch log converts in any grid cell to four Birch Planks and debits exactly one log',()=>{
 for(const size of[2,3])for(let index=0;index<size*size;index++){const cells:Array<ItemStack|null>=Array(size*size).fill(null);cells[index]=s('birch_log',2);expect(matchRecipe(cells,size)?.result).toEqual(s('birch_planks',4));expect(craftOnce(cells,size)).toEqual(s('birch_planks',4));expect(cells[index]).toEqual(s('birch_log'));}
});
it.each(['stick','wooden_pickaxe','wooden_axe','wooden_shovel','wooden_sword','wooden_hoe','crafting_table','bookshelf'])('declared generic %s accepts individual mixed Oak/Birch cells and consumes each once',id=>{
 const recipe=RECIPES.find(r=>r.id===id)!,mixed=grid(recipe,true),before=structuredClone(mixed);expect(recipe.keyTags).toBeDefined();expect(mixed.some(x=>x?.id===blockId('birch_planks'))).toBe(true);expect(matchRecipe(mixed,3)?.result).toEqual(s(recipe.result[0],recipe.result[1]));expect(craftOnce(mixed,3)).toEqual(s(recipe.result[0],recipe.result[1]));for(let i=0;i<9;i++)expect(mixed[i]).toEqual(before[i]?{...before[i]!,count:1}:null);
 const birchOnly=grid(recipe);for(const stack of birchOnly)if(stack?.id===blockId('oak_planks'))stack.id=blockId('birch_planks');expect(matchRecipe(birchOnly,3)?.result).toEqual(s(recipe.result[0],recipe.result[1]));
});
it.each(['oak_fence','wooden_door'])('species-specific %s retains Oak-only inputs and refuses any Birch substitution',id=>{
 const recipe=RECIPES.find(r=>r.id===id)!;expect(recipe.keyTags).toBeUndefined();expect(matchRecipe(grid(recipe),3)?.result).toEqual(s(recipe.result[0],recipe.result[1]));for(let i=0;i<9;i++){const cells=grid(recipe);if(cells[i]?.id!==blockId('oak_planks'))continue;cells[i]=s('birch_planks');expect(matchRecipe(cells,3)).toBeNull();expect(craftOnce(cells,3)).toBeNull();expect(cells[i]).toEqual(s('birch_planks'));}
});
it('Birch is whole-cube axe-appropriate material; player and Agent place/harvest retain exact identity',()=>{
 const w=flat(),bag=new Inventory();bag.slots[0]=s('birch_planks',2);expect(placeBlock(w,bag,'survival',1,80,0,{x:.5,y:80,z:2.5})).toBe(true);expect(w.getBlock(1,80,0)).toBe(202);expect(bag.slots[0]).toEqual(s('birch_planks'));bag.slots[0]=s('wooden_axe');expect(breakBlock(w,bag,'survival',1,80,0)).toBe(true);expect(bag.slots[0]?.damage).toBe(1);expect(bag.slots.some(x=>x?.id===202&&x.count===1)).toBe(true);
 const a=createAgent(0,80,0,2);a.slots[0]=s('birch_planks',2);expect(runAgentCommand(w,a,{op:'place',dir:'forward'}).ok).toBe(true);expect(w.getBlock(0,80,-1)).toBe(202);expect(a.slots[0]).toEqual(s('birch_planks'));expect(runAgentCommand(w,a,{op:'destroy',dir:'forward'}).ok).toBe(true);expect(a.slots[0]).toEqual(s('birch_planks',2));
});
it.each(['player','Agent'])('full or refused %s receiver leaves Birch source and all cargo unchanged',who=>{
 const w=flat(),bag=new Inventory(),a=createAgent(0,80,0,2);w.setBlock(0,80,-1,202);for(let i=0;i<36;i++)bag.slots[i]=s('cobblestone',64);for(let i=0;i<27;i++)a.slots[i]=s('cobblestone',64);const before=structuredClone({bag:bag.toJSON(),agent:a});const act=(sink?:()=>null)=>who==='player'?breakBlock(w,bag,'survival',0,80,-1,Math.random,[],sink):runAgentCommand(w,a,{op:'destroy',dir:'forward'},{worldDrop:sink}).ok;expect(act()).toBe(false);expect(act(()=>null)).toBe(false);expect(w.getBlock(0,80,-1)).toBe(202);expect({bag:bag.toJSON(),agent:a}).toEqual(before);
});
it.each(['player','Agent'])('Birch %s publication pins its physical source through receiver reentry and releases after refusal',who=>{
 const w=flat(),bag=new Inventory(),a=createAgent(0,80,0,2);w.setBlock(0,80,-1,202);const act=(sink:()=>null)=>who==='player'?breakBlock(w,bag,'survival',0,80,-1,Math.random,[],sink):runAgentCommand(w,a,{op:'destroy',dir:'forward'},{worldDrop:sink}).ok;let calls=0;expect(act(()=>{calls++;w.setBlock(0,80,-1,AIR);expect(w.getBlock(0,80,-1)).toBe(202);expect(act(()=>null)).toBe(false);return null;})).toBe(false);expect(calls).toBe(1);expect(w.getBlock(0,80,-1)).toBe(202);expect(w.blockSourceLeaseBusy).toBe(false);
});
it('acknowledged Birch receiver yields one normal ground receipt, correct tool wear, then no duplicate after source retirement',()=>{
 const w=flat(),bag=new Inventory(),drops=new WorldDrops(w);bag.slots[0]=s('wooden_axe');bag.slots[1]=s('diamond_sword');w.setBlock(0,80,-1,202);const sink=(stacks:readonly ItemStack[],position:{x:number;y:number;z:number})=>{const batch=drops.planSpawnBatch(stacks,position)!;return{commit(){bag.selected=1;return batch.commit();}};};expect(breakBlock(w,bag,'survival',0,80,-1,Math.random,[],sink)).toBe(true);expect(bag.slots[0]?.damage).toBe(1);expect(bag.slots[1]?.damage).toBeUndefined();expect(drops.records.map(r=>r.stack)).toEqual([s('birch_planks')]);expect(breakBlock(w,bag,'survival',0,80,-1,Math.random,[],sink)).toBe(false);expect(drops.records).toHaveLength(1);
});
it('Birch furnace fuel inherits the current15s Oak app policy and reducer uses the exact generic native plank row',()=>{
 expect(fuelSeconds(202)).toBe(15);const f=createFurnace();f.input=s('iron_ore');f.fuel=s('birch_planks',2);for(let i=0;i<10;i++)tickFurnace(f,1);expect(f.output).toEqual(s('iron_ingot'));expect(f.fuel).toEqual(s('birch_planks'));expect(f.burnLeft).toBe(5);expect(reduceMaterial(202)).toEqual([s('carbon',49),s('hydrogen',6),s('oxygen',44),s('nitrogen')]);expect(reduceMaterial(202)).toEqual(reduceMaterial(blockId('oak_planks')));
});
it('Birch202 survives raw save/cold reconstruction in edits, player bag, pending cursor, Agent, furnace fuel and ground receipts',()=>{
 const w=flat(),bag=new Inventory(),a=createAgent(0,80,0),drops=new WorldDrops(w);bag.slots[0]=s('birch_planks',4);a.slots[26]=s('birch_planks',3);w.setBlock(1,80,0,202);w.setBlock(2,80,0,blockId('furnace'));expect(drops.planSpawnBatch([s('birch_planks')],{x:.5,y:80,z:.5})!.commit()).toBe(true);const f=createFurnace();f.fuel=s('birch_planks',2);const raw:SaveData={version:1,name:'Birch owners',seed:7,generatorVersion:2,mode:'survival',timeOfDay:.25,player:{position:{x:.5,y:80,z:2.5},yaw:0,pitch:0,flying:false},inventory:bag.toJSON(),inventoryPending:[s('birch_planks',2)],agent:a,edits:w.exportEdits(),furnaces:[{x:2,y:80,z:0,state:f}],worldDrops:drops.toJSON()};const cold=parseSave(serializeSave(raw));expect(cold.inventoryPending).toEqual(raw.inventoryPending);expect(Inventory.fromJSON(cold.inventory).toJSON()).toEqual(bag.toJSON());expect(sanitizeAgent(cold.agent)).toEqual(a);expect(sanitizeFurnaces(cold.furnaces)).toEqual({furnaces:raw.furnaces,dropped:0});const restored=new World(7,2);restored.importEdits(cold.edits);expect(restored.getBlock(1,80,0)).toBe(202);expect(new WorldDrops(restored,cold.worldDrops).toJSON()).toEqual(drops.toJSON());
});
