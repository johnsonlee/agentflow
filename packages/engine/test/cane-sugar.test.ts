import {it,expect} from 'vitest';
import {Inventory,ITEMS,RECIPES,createCompound,constructElement,craftOnce,matchRecipe,stackId,itemById,createAgent,giveAgent,SingleChest,parseSave,serializeSave,type ItemStack,type SaveData} from '../src';
const sugar=()=>({id:stackId('sugar'),count:1});
const atom=(p:number,n:number,count:number):ItemStack=>{const r=constructElement(p,n,p);if('error'in r)throw Error(r.error);return{id:r.id,count};};
it('Cane craft and existing Compound Creator resolve one Sugar identity, with existing formula and contiguous catalog unchanged',()=>{
 const chemical=createCompound([atom(6,6,6),atom(1,0,12),atom(8,8,6)]);expect(chemical).toEqual({id:stackId('sugar')});
 const g:[ItemStack|null,ItemStack|null,ItemStack|null,ItemStack|null]=[{id:stackId('sugar_cane'),count:1},null,null,null];expect(craftOnce(g,2)).toEqual(sugar());expect(g).toEqual([null,null,null,null]);
 expect(itemById(stackId('sugar')).chem).toEqual({kind:'compound',formula:'C₆H₁₂O₆'});expect(ITEMS).toHaveLength(602);expect(ITEMS.filter(x=>x.name==='sugar')).toHaveLength(1);expect(RECIPES).toHaveLength(191);
});
it('finite raw Cane converts one at a time in either grid without promising invalid, extra or physical-source output',()=>{
 for(const size of[2,3])for(let index=0;index<size*size;index++){
  const grid:Array<ItemStack|null>=Array(size*size).fill(null);grid[index]={id:850,count:64};expect(craftOnce(grid,size)).toEqual(sugar());expect(grid[index]).toEqual({id:850,count:63});
 }
 for(const input of[{id:850,count:0},{id:850,count:65},{id:850,count:1,damage:0},{id:204,count:1}]){const grid:Array<ItemStack|null>=[input,null,null,null],before=structuredClone(grid);expect(matchRecipe(grid,2)).toBeNull();expect(craftOnce(grid,2)).toBeNull();expect(grid).toEqual(before);}
 const extra:Array<ItemStack|null>=[{id:850,count:1},{id:850,count:1},null,null],before=structuredClone(extra);expect(craftOnce(extra,2)).toBeNull();expect(extra).toEqual(before);
});
it('both origins merge into the existing owner, and cold bag, Agent, cursor and Chest preserve the four finite Sugar items',()=>{
 const bag=new Inventory();expect(bag.addStack(sugar())).toBe(0);const grid:Array<ItemStack|null>=[{id:850,count:3},null,null,null];for(let i=0;i<3;i++)expect(bag.addStack(craftOnce(grid,2)!)).toBe(0);expect(grid).toEqual([null,null,null,null]);expect(bag.slots.filter(Boolean)).toEqual([{id:stackId('sugar'),count:4}]);
 bag.slots[0]!.count=1;const agent=createAgent(0,80,0);expect(giveAgent(agent,sugar())).toBe(0);const chest=new SingleChest();expect(chest.replace(26,sugar()).ok).toBe(true);
 const raw:SaveData={version:1,name:'One Sugar identity',seed:7,generatorVersion:3,mode:'survival',timeOfDay:0,player:{position:{x:0,y:80,z:0},yaw:0,pitch:0,flying:false},inventory:bag.toJSON(),inventoryPending:[sugar()],agent,chests:[{x:1,y:80,z:0,state:chest.snapshot()}],edits:[[1,80,0,203]]};
 const cold=parseSave(serializeSave(raw));expect(cold.inventory).toEqual(raw.inventory);expect(cold.inventoryPending).toEqual(raw.inventoryPending);expect(cold.agent).toEqual(raw.agent);expect(cold.chests).toEqual(raw.chests);
});
