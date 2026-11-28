import { nativePageWorldTap } from './native-world-tap';
import {expect,type Locator,type Page,type TestInfo} from '@playwright/test';
import fs from 'node:fs/promises';
import {aimAtTop,blockAt,countStack,createWorld,lookAtCell,parkMouse,pressMouse,snap,target,waitForTerrain} from './helpers';
/** Raw ingredients and a table/pad are fixtures. Crafting, placing, station transfers, time and cold restore use real UI. */
export async function brewingStationRoute(page:Page,info:TestInfo,mobile:boolean){
 const errors=await createWorld(page,{mode:'survival'}),press=(l:Locator)=>mobile?l.tap():l.click(),finger=mobile?await page.context().newCDPSession(page):null;
 const use=async()=>{ if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
 const fixture=await page.evaluate(()=>{const g=window.__craft.game!,p=g.body.position,x=Math.floor(p.x),z=Math.floor(p.z),floor=Math.floor(p.y+.01)-1;
  for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){g.world.setBlock(x+dx,floor,z+dz,window.__craft.blockId('stone'));for(let dy=1;dy<=4;dy++)g.world.setBlock(x+dx,floor+dy,z+dz,0);}
  g.world.setBlock(x,floor+1,z-2,window.__craft.blockId('crafting_table'));g.inventory.slots.fill(null);
  for(const [slot,name,count] of [[0,'blaze_rod',1],[1,'cobblestone',3],[2,'water_bottle',1],[3,'water_bottle',1],[4,'water_bottle',1],[5,'nether_wart',2],[6,'blaze_powder',2],[7,'silver',1]] as const)g.inventory.slots[slot]={id:window.__craft.stackId(name),count};
  g.inventory.select(8);return{x,y:floor+1,z:z-2,standX:x+2,standZ:z};});
 if(!mobile)await parkMouse(page);await lookAtCell(page,fixture.x,fixture.y,fixture.z);await target(page);await use();await expect(page.getByRole('heading',{name:'Crafting Table',exact:true})).toBeVisible();
 const inv=page.locator('.inventory-screen'),slot=(i:number)=>inv.locator(`[data-slot="${i}"]`),craft=(i:number)=>inv.locator(`[data-craft="${i}"]`);
 await press(slot(0));await press(craft(1));await press(slot(1));for(const i of [3,4,5])await press(craft(i));
 await expect(inv.locator('[data-craft-result] img')).toHaveAttribute('alt','Brewing Stand');await press(inv.locator('[data-craft-result]'));await press(slot(0));
 expect(await countStack(page,'blaze_rod')).toBe(0);expect(await countStack(page,'cobblestone')).toBe(0);expect(await countStack(page,'brewing_stand')).toBe(1);
 await press(page.getByRole('button',{name:'Close inventory'}));if(mobile)await press(page.locator('.hotbar [data-slot="0"]'));else await page.keyboard.press('Digit1');
 await aimAtTop(page,fixture.standX,fixture.y-1,fixture.standZ);await target(page);await use();await expect.poll(()=>blockAt(page,fixture.standX,fixture.y,fixture.standZ)).toBe(201);
 await page.waitForTimeout(300);const open=async()=>{await lookAtCell(page,fixture.standX,fixture.y,fixture.standZ);await expect.poll(()=>target(page)).toMatchObject({x:fixture.standX,y:fixture.y,z:fixture.standZ,id:201});await use();await expect(page.getByRole('heading',{name:'Brewing Stand',exact:true})).toBeVisible();};await open();
 const read=()=>page.evaluate(()=>{const g=window.__craft.game! as unknown as{brewingStands:Map<string,{snapshot():{bottles:Array<{id:number;count:number}|null>;ingredient:{id:number;count:number}|null;fuel:{id:number;count:number}|null;fuelUses:number;progressSeconds:number;batch:string|null}}>};return structuredClone([...g.brewingStands.values()][0].snapshot());});
 const cell=(key:string|number)=>inv.locator(`[data-brewing="${key}"]`);
 for(const [bag,bottle]of [[2,0],[3,1],[4,2]]){await press(slot(bag));await press(cell(bottle));}
 await press(slot(6));await press(cell('fuel'));await press(slot(5));await press(cell('ingredient'));
 await expect.poll(async()=>(await read()).progressSeconds).toBeGreaterThan(0);await snap(page,info,'actual-three-bottle-brewing-ui');
 const pause=async()=>{await press(page.getByRole('button',{name:'Close inventory'}));if(mobile)await press(page.getByRole('button',{name:'Pause',exact:true}));else await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'Game Menu'})).toBeVisible();};await pause();const paused=await read();await page.waitForTimeout(350);expect(await read()).toEqual(paused);
 await press(page.getByRole('button',{name:'Save & Quit to Title'}));const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('craft.save.v1')!).brewingStands[0].state);expect(saved).toEqual(paused);
 await page.reload();await press(page.getByRole('button',{name:/Continue/}));await waitForTerrain(page);await open();
 const awkward=await page.evaluate(()=>window.__craft.stackId('awkward_potion'));await expect.poll(async()=>(await read()).bottles.map(s=>s?.id),{timeout:75000}).toEqual([awkward,awkward,awkward]);
 const completed=await read();expect(completed.ingredient?.count).toBe(1);expect(completed.fuel?.count).toBe(1);expect(completed.fuelUses).toBe(19);expect(completed.progressSeconds).toBe(0);
 // Remove the unused Wart before changing reagent; no product or timer is injected.
 await press(cell('ingredient'));await press(slot(5));await press(slot(7));await press(cell('ingredient'));
 const antidote=await page.evaluate(()=>window.__craft.stackId('antidote'));await expect.poll(async()=>(await read()).bottles.map(s=>s?.id),{timeout:75000}).toEqual([antidote,antidote,antidote]);
 const medicine=await read();expect(medicine.ingredient).toBeNull();expect(medicine.fuelUses).toBe(18);expect(medicine.fuel?.count).toBe(1);await snap(page,info,'three-antidotes-from-actual-two-stage-brewing');
 for(const [bottle,bag]of [[0,2],[1,3],[2,4]]){await press(cell(bottle));await press(slot(bag));}expect(await countStack(page,'antidote')).toBe(3);
 await pause();await press(page.getByRole('button',{name:'Save & Quit to Title'}));await page.reload();await press(page.getByRole('button',{name:/Continue/}));await waitForTerrain(page);expect(await countStack(page,'antidote')).toBe(3);expect(await countStack(page,'nether_wart')).toBe(1);const final=await read();expect(final.bottles).toEqual([null,null,null]);expect(final.fuelUses).toBe(18);expect(final.fuel?.count).toBe(1);
 await fs.writeFile(info.outputPath('brewing-observations.json'),JSON.stringify({fixture,paused,saved,completed,medicine,final,coverage:'Raw ingredients fixture; actual craft/place/use/three bottles/20-second application recipe clock/pause/cold restore/two reactions/product ownership. No native timing, medicine drinking or natural rod acquisition claim.'},null,2));await snap(page,info,'cold-restored-brewing-owners');expect(await page.evaluate(()=>window.__craft.game!.loadErrors)).toEqual([]);expect(errors).toEqual([]);
}
