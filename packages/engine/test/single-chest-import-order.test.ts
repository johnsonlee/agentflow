import {expect,it,vi}from 'vitest';
it.each(['owner-first','barrel-first'])('full-bag Agent harvesting is import-order independent: %s',async order=>{
 vi.resetModules();if(order==='owner-first')await import('../src/ownership/single-chest');else await import('../src');
 const{SingleChest}=await import('../src/ownership/single-chest');const{World}=await import('../src/world/world');const{createAgent,runAgentCommand}=await import('../src/automation/agent');const{WorldDrops}=await import('../src/ownership/world-drops');const{blockId}=await import('../src/catalog/blocks');
 const w=new World(7,2);w.setBlock(0,80,-1,203);w.setBlock(0,81,-1,0);const a=createAgent(0,80,0,2);a.slots.fill(null);for(let i=0;i<27;i++)a.slots[i]={id:blockId('stone'),count:64};const chest=new SingleChest();chest.replace(26,{id:blockId('birch_planks'),count:12});const ground=new WorldDrops(w),before=structuredClone(a.slots);expect(runAgentCommand(w,a,{op:'destroy',dir:'forward'},{destroyContents:()=>chest.contents(),worldDrop:ground.planSpawnBatch.bind(ground)}).ok).toBe(true);expect(a.slots).toEqual(before);expect(ground.records.map(r=>r.stack)).toEqual([{id:203,count:1},{id:202,count:12}]);
});
