import { expect, it } from "vitest";
import oldIDs from "./fixtures/hardened-glass-base-5f-ids.json";
import { AIR, BLOCKS, ITEMS, DYE_COLORS, Inventory, World, blockId, blockById, stackId,
  craftOnce, matchRecipe, placedBlockOf, breakBlock, placeBlock, breakTime, blockDrops,
  WorldDrops, elementZOfBlock, elementParticlesOf, reduceMaterial, createCompound, createAgent, giveAgent, runAgentCommand, serializeSave, parseSave, sanitizeEdits,
  sanitizeAgent, sanitizeInventoryPending, type CraftingGrid, type ItemStack } from "../src/index";
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const hardened = (color: string) => `hardened_${color}_stained_glass`;
function ingredients(color: string, count = 2): CraftingGrid {
  return ["aluminium_oxide", `${color}_stained_glass`, "boron_trioxide",
    `${color}_stained_glass`, "boron_trioxide", "aluminium_oxide",
    "boron_trioxide", "aluminium_oxide", `${color}_stained_glass`].map(n => stack(n, count));
}

it("appends only the approved extended block IDs while every old block and item identity stays exact", () => {
  expect(BLOCKS.slice(0, 345).map(({id,name}) => ({id,name}))).toEqual(oldIDs.blocks);
  expect(ITEMS.map(({id,name}) => ({id,name}))).toEqual(oldIDs.items);
  expect(ITEMS).toHaveLength(606); expect(BLOCKS).toHaveLength(361);
  expect(BLOCKS.slice(345).map(({id,name}) => [id,name])).toEqual(DYE_COLORS.map((c,i) => [32887+i,hardened(c.name)]));
  for (const color of DYE_COLORS) {
    const name=hardened(color.name), id=blockId(name);
    expect(placedBlockOf(id)).toBe(id);
    expect(blockById(id)).toMatchObject({solid:true,transparent:true,translucent:true,shape:"cube"});
    expect(blockDrops(id)).toEqual([stack(name)]);
    // Ordinary glass keeps its pre-existing shatter policy; new self-drop is an app choice.
    expect(blockDrops(blockId(`${color.name}_stained_glass`))).toEqual([]);
  }
});

for (const color of DYE_COLORS) it(`conserves all nine ${color.name} recipe cells across repeated shuffled crafts`, () => {
  const grid=ingredients(color.name), output=stack(hardened(color.name),3);
  expect(matchRecipe(grid,3)?.result).toEqual(output);
  expect(craftOnce(grid,3)).toEqual(output);
  expect(grid).toEqual(ingredients(color.name,1));
  grid.reverse(); expect(craftOnce(grid,3)).toEqual(output);
  expect(grid).toEqual(Array(9).fill(null)); expect(craftOnce(grid,3)).toBeNull();
});

it("rejects incomplete, mixed-color, wrong-ratio, aggregated and wrong-grid recipes without debit", () => {
  const mixed=ingredients("red"); mixed[1]=stack("blue_stained_glass",2);
  const wrongRatio=ingredients("red"); wrongRatio[0]=stack("boron_trioxide",2);
  const holes=ingredients("red"); holes[8]=null;
  const aggregate:CraftingGrid=[stack("aluminium_oxide",3),stack("red_stained_glass",3),stack("boron_trioxide",3),...Array(6).fill(null)];
  for (const grid of [mixed,wrongRatio,holes,aggregate]) {
    const before=structuredClone(grid); expect(craftOnce(grid,3)).toBeNull(); expect(grid).toEqual(before);
  }
  for (const width of [2,4]) {const grid=ingredients("red"),before=structuredClone(grid);expect(craftOnce(grid,width)).toBeNull();expect(grid).toEqual(before);}
  const oversized=[...ingredients("red"),null],before=structuredClone(oversized);expect(craftOnce(oversized,3)).toBeNull();expect(oversized).toEqual(before);
});

for (const color of DYE_COLORS) it(`uses shared player and Agent placement/mining owners for ${color.name}`, () => {
  const name=hardened(color.name),id=blockId(name),world=new World(13),bag=new Inventory();
  bag.add(id,2);world.setBlock(8,90,8,AIR);
  expect(placeBlock(world,bag,"survival",8,90,8,{x:2,y:91,z:2})).toBe(true);
  expect(bag.slots[0]).toEqual(stack(name));expect(world.getBlock(8,90,8)).toBe(id);
  expect(breakTime("survival",id)).toBe(2*breakTime("survival",blockId(`${color.name}_stained_glass`)));
  expect(breakBlock(world,bag,"survival",8,90,8)).toBe(true);expect(world.getBlock(8,90,8)).toBe(AIR);expect(bag.slots[0]).toEqual(stack(name,2));
  const agent=createAgent(8,91,8);expect(giveAgent(agent,stack(name,2))).toBe(0);
  expect(runAgentCommand(world,agent,{op:"place",dir:"down"}).ok).toBe(true);expect(agent.slots[0]).toEqual(stack(name));
  expect(runAgentCommand(world,agent,{op:"destroy",dir:"down"}).ok).toBe(true);expect(agent.slots[0]).toEqual(stack(name,2));
});

it("retains capacity, protection, occupied-source and active-source-lease refusal without losing owners", () => {
  const world=new World(13),id=blockId(hardened("red")),bag=new Inventory();
  for(let i=0;i<36;i++)bag.setSlot(i,stack("stone",64));world.setBlock(8,90,8,id);
  const before=bag.toJSON();expect(breakBlock(world,bag,"survival",8,90,8)).toBe(false);expect(bag.toJSON()).toEqual(before);expect(world.getBlock(8,90,8)).toBe(id);
  const agent=createAgent(8,91,8);for(let i=0;i<27;i++)agent.slots[i]=stack("stone",64);const robot=structuredClone(agent);
  expect(runAgentCommand(world,agent,{op:"destroy",dir:"down"}).ok).toBe(false);expect(agent).toEqual(robot);expect(world.getBlock(8,90,8)).toBe(id);
  const held=new Inventory();held.add(id,2);const owner=held.toJSON();
  expect(placeBlock(world,held,"survival",8,90,8,{x:2,y:91,z:2})).toBe(false);expect(held.toJSON()).toEqual(owner);
  world.setBlock(8,90,8,AIR);world.setBlock(8,89,8,blockId("deny"));
  expect(placeBlock(world,held,"survival",8,90,8,{x:2,y:91,z:2})).toBe(false);expect(held.toJSON()).toEqual(owner);
  world.setBlock(8,89,8,AIR);const lease=world.reserveBlockBatch([[8,90,8,id]]);expect(lease).not.toBeNull();
  try{expect(placeBlock(world,held,"survival",8,90,8,{x:2,y:91,z:2})).toBe(false);expect(held.toJSON()).toEqual(owner);expect(world.getBlock(8,90,8)).toBe(AIR);}finally{lease!.release();}
});

it("round trips every extended hardening ID through unchanged save edits, bag, pending and Agent codecs", () => {
  const bag=new Inventory(),agent=createAgent(8,91,8),edits:[number,number,number,number][]=[];
  for(const [i,color]of DYE_COLORS.entries()){const n=hardened(color.name);bag.add(stackId(n),3);giveAgent(agent,stack(n,2));edits.push([i,90,0,blockId(n)]);}
  const pending=DYE_COLORS.slice(0,10).map(c=>stack(hardened(c.name),2));
  const parsed=parseSave(serializeSave({name:"hardened app",seed:13,mode:"survival",timeOfDay:.3,player:{position:{x:8,y:91,z:8},yaw:0,pitch:0,flying:false},inventory:bag.toJSON(),agent,inventoryPending:pending,edits}));
  expect(Inventory.fromJSON(parsed.inventory).toJSON()).toEqual(bag.toJSON());expect(sanitizeAgent(parsed.agent)).toEqual(agent);expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual(pending);expect(sanitizeEdits(parsed.edits)).toEqual(edits);
  const world=new World(13);world.importEdits(sanitizeEdits(parsed.edits));expect(world.exportEdits()).toEqual(edits);
  for(const [i,c]of DYE_COLORS.entries())expect(world.getBlock(i,90,0)).toBe(blockId(hardened(c.name)));
});


it("never treats non-element extended blocks as atomic119+ or invents Material Reducer composition", () => {
  for(const c of DYE_COLORS){const id=blockId(hardened(c.name));expect(elementZOfBlock(id)).toBeNull();expect(elementParticlesOf(id)).toBeNull();expect(reduceMaterial(id)).toBeNull();expect(createCompound([{id,count:1}])).toHaveProperty("error");}
});

it("retains accepted public ground fallback with full bags and refuses a changed player owner", () => {
  const world=new World(13),name=hardened("red"),id=blockId(name),bag=new Inventory();
  for(let i=0;i<36;i++)bag.setSlot(i,stack("stone",64));world.setBlock(8,90,8,id);
  const before=bag.toJSON(),drops=new WorldDrops(world),sink=drops.planSpawnBatch.bind(drops);
  expect(breakBlock(world,bag,"survival",8,90,8,Math.random,[],sink)).toBe(true);expect(bag.toJSON()).toEqual(before);expect(drops.records.map(r=>r.stack)).toEqual([stack(name)]);
  const agent=createAgent(8,91,8);for(let i=0;i<27;i++)agent.slots[i]=stack("stone",64);const robot=structuredClone(agent);world.setBlock(8,90,8,id);
  expect(runAgentCommand(world,agent,{op:"destroy",dir:"down"},{worldDrop:sink}).ok).toBe(true);expect(agent).toEqual(robot);expect(drops.records.reduce((n,r)=>n+r.stack.count,0)).toBe(2);
  world.setBlock(8,90,8,id);const count=drops.records.reduce((n,r)=>n+r.stack.count,0);
  expect(breakBlock(world,bag,"survival",8,90,8,Math.random,[],(stacks,pos)=>{bag.setSlot(0,stack("dirt",1));return sink(stacks,pos);})).toBe(false);
  expect(world.getBlock(8,90,8)).toBe(id);expect(bag.slots[0]).toEqual(stack("dirt",1));expect(drops.records.reduce((n,r)=>n+r.stack.count,0)).toBe(count);
});
