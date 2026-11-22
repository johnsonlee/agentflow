import {it,expect} from 'vitest';
import {World,WorldDrops,CaneSupportSystem,blockId} from '../src';
it('old unloaded Cane candidates do not starve a newly unsupported loaded column past a bounded queue cycle',()=>{
 const world=new World(7,3);
 for(let i=0;i<257;i++){world.setBlock(i*16+15,79,8,blockId('sand'));world.setBlock(i*16+15,80,8,204);}
 const drops=new WorldDrops(world),system=new CaneSupportSystem(world,(items,at)=>drops.planSpawnBatch(items,at));
 try{
  for(let i=0;i<257;i++)world.unloadChunk(i,0);
  world.setBlock(8,79,8,blockId('sand'));world.setBlock(9,79,8,blockId('water'));world.setBlock(8,80,8,204);world.setBlock(9,79,8,blockId('stone'));
  const loaded=world.loadedChunkCount();expect(loaded).toBe(1);
  for(let i=0;i<3;i++)system.update(.1);
  expect(world.loadedChunkCount()).toBe(loaded);expect(world.getLoadedBlock(8,80,8)).toBe(0);expect(drops.records.reduce((n,r)=>n+(r.stack.id===850?r.stack.count:0),0)).toBe(1);
 }finally{system.dispose();}
});

it('refusing older receivers cannot starve an independent loaded receiving owner',()=>{
 const world=new World(7,3);
 for(let i=0;i<257;i++){world.setBlock(i*16+8,79,8,blockId('stone'));world.setBlock(i*16+8,80,8,204);}
 const drops=new WorldDrops(world),system=new CaneSupportSystem(world,(items,at)=>at.x<5000?null:drops.planSpawnBatch(items,at));
 try{
  world.setBlock(5000,79,8,blockId('stone'));world.setBlock(5000,80,8,204);const loaded=world.loadedChunkCount();
  for(let i=0;i<3;i++)system.update(.1);
  expect(world.loadedChunkCount()).toBe(loaded);expect(world.getLoadedBlock(5000,80,8)).toBe(0);expect(drops.records.reduce((n,r)=>n+(r.stack.id===850?r.stack.count:0),0)).toBe(1);
  for(let i=0;i<257;i++)expect(world.getLoadedBlock(i*16+8,80,8)).toBe(204);
  system.update(.1);expect(drops.records.reduce((n,r)=>n+r.stack.count,0)).toBe(1);
 }finally{system.dispose();}
});
