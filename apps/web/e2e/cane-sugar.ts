import {expect,type Page,type TestInfo,type Locator,type CDPSession} from '@playwright/test';
import fs from 'node:fs/promises';
import {serializeSave,stackId} from '@craft/engine';
import {paperCaneFixture} from './paper-cane-fixture';
import {waitForTerrain,snap,target} from './helpers';

/** Initial raw fixture grants one pre-existing Sugar, never Cane or a newly crafted result. */
export async function caneSugarRoute(page:Page,info:TestInfo,mobile:boolean){
 const f=paperCaneFixture(),{root,stand}=f,sugarId=stackId('sugar');
 f.save.name='Natural Cane to one existing Sugar identity';f.save.inventory.slots[5]={id:sugarId,count:1};
 const dx=root.x+.5-stand.x,dz=root.z+.5-stand.z;
 f.save.player.yaw=Math.atan2(-dx,-dz);f.save.player.pitch=Math.atan2(root.y+.5-(stand.y+1.62),Math.hypot(dx,dz));
 const errors:string[]=[],phases:unknown[]=[];let stage='initial',failure:string|null=null;
 const press=(l:Locator)=>mobile?l.tap():l.click(),inv=page.locator('.inventory-screen');
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const owners=()=>page.evaluate(()=>{const g=window.__craft.game!;return{bag:g.inventory.toJSON(),agent:structuredClone(g.agent),drops:g.worldDrops.toJSON(),edits:g.world.exportEdits(),loadErrors:g.loadErrors};});
 const count=(name:string)=>page.evaluate(n=>{const g=window.__craft.game!,id=window.__craft.stackId(n);return g.inventory.slots.reduce((a,s)=>a+(s?.id===id?s.count:0),0);},name);
 const find=(name:string)=>page.evaluate(n=>window.__craft.game!.inventory.slots.findIndex(s=>s?.id===window.__craft.stackId(n)),name);
 const column=()=>page.evaluate(p=>[0,1,2].map(h=>window.__craft.game!.world.getLoadedBlock(p.x,p.y+h,p.z)),root);
 const phase=async(label:string)=>{stage=label;phases.push({label,owners:await owners()});};
 const command=async(text:string)=>{if(mobile)await press(page.getByRole('button',{name:'Chat and commands',exact:true}));else await page.keyboard.press('Slash');const input=page.getByRole('textbox',{name:'Chat',exact:true});await expect(input).toBeVisible();await input.fill(text);await input.press('Enter');await expect(input).toBeHidden();};
 const open=async()=>{if(mobile)await press(page.getByRole('button',{name:'Open inventory',exact:true}));else await page.keyboard.press('e');await expect(inv.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();};
 const close=()=>press(page.getByRole('button',{name:'Close inventory',exact:true}));
 let contact:CDPSession|undefined;
 try{
  const raw=serializeSave(f.save);await fs.writeFile(info.outputPath('initial-disclosed-one-existing-sugar-raw-kit.json'),raw);
  await fs.writeFile(info.outputPath('natural-cane-and-initial-pose-provenance.json'),JSON.stringify({seed:7,generatorVersion:3,root,stand,column:f.generatedColumn,edits:f.save.edits,initialSugar:1,initialCane:0,initialCamera:f.save.player,meaning:'Offline fixture pose faces natural Cane; no runtime camera or outcome writes'},null,2));
  await page.goto('/');await page.evaluate(s=>{localStorage.clear();localStorage.setItem('craft.save.v1',s);},raw);await page.reload();await press(page.getByRole('button',{name:/Continue/}));await waitForTerrain(page);
  expect(await count('sugar')).toBe(1);expect(await count('sugar_cane')).toBe(0);expect(await column()).toEqual([204,204,204]);await expect.poll(()=>target(page)).toMatchObject(root);
  await snap(page,info,'natural-three-Cane-and-one-existing-Sugar');await phase('initial-natural-v3-Cane-no-derived-Cane');
  if(mobile)await press(page.locator('.hotbar [data-slot="4"]'));else await page.keyboard.press('Digit5');
  try{if(mobile){const v=page.viewportSize()!;contact=await page.context().newCDPSession(page);await contact.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:v.width*.65,y:v.height*.42,id:81}]});}else await page.mouse.down({button:'left'});await expect.poll(column).toEqual([0,0,0]);}
  finally{if(contact){await contact.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await contact.detach();contact=undefined;}if(!mobile)await page.mouse.up({button:'left'});}
  await phase('actual-natural-column-three-ground-owners');
  await command(`/tp ${root.x+.5} ${root.y} ${root.z+.5}`);await expect.poll(()=>count('sugar_cane')).toBe(3);expect(await count('sugar')).toBe(1);
  expect((await owners()).bag.slots[4]?.damage).toBe(7);await phase('actual-pickup-three-canonical-Cane-no-toolwear');await open();
  for(let made=1;made<=3;made++){
   stage=`actual-Sugar-craft-${made}`;const source=await find('sugar_cane');expect(source).toBeGreaterThanOrEqual(0);await press(inv.locator(`[data-slot="${source}"]`));await press(inv.locator('[data-craft="0"]'));
   if(made<3)await press(inv.locator(`[data-slot="${source}"]`));await expect(inv.getByTestId('cursor')).toBeEmpty();await expect(inv.locator('[data-craft-result] img')).toHaveAttribute('alt','Sugar');
   await press(inv.locator('[data-craft-result]'));await expect(inv.getByTestId('cursor')).toContainText('Sugar');
   if(made<3){await press(inv.locator(`[data-slot="${await find('sugar')}"]`));expect(await count('sugar')).toBe(1+made);await expect(inv.getByTestId('cursor')).toBeEmpty();}
   else{expect(await count('sugar')).toBe(3);await page.waitForFunction(id=>{const raw=localStorage.getItem('craft.save.v1');if(!raw)return false;const s=JSON.parse(raw);return s.inventoryPending?.length===1&&s.inventoryPending[0].id===id&&s.inventoryPending[0].count===1;},sugarId);await snap(page,info,'third-finite-Sugar-held-and-actually-autosaved');}
  }
  expect(await count('sugar_cane')).toBe(0);await phase('three-Cane-consumed-one-Sugar-held-three-bag');
  const pendingRaw=await page.evaluate(()=>localStorage.getItem('craft.save.v1'));await fs.writeFile(info.outputPath('actual-held-Sugar-autosave.json'),pendingRaw!);
  await page.reload();await press(page.getByRole('button',{name:/Continue/}));await expect(inv).toBeVisible();await expect(inv.locator('[data-recovery="0"] img')).toHaveAttribute('alt','Sugar');expect(await count('sugar')).toBe(3);await snap(page,info,'actual-cold-pending-Sugar-recovery');
  await press(inv.locator('[data-recovery="0"]'));await press(inv.locator(`[data-slot="${await find('sugar')}"]`));await expect(inv.getByTestId('cursor')).toBeEmpty();expect(await count('sugar')).toBe(4);await close();await expect(inv).toBeHidden();await phase('cold-pending-owner-merged-into-same-Sugar-ID');
  const before=await owners();if(mobile)await press(page.getByRole('button',{name:'Pause',exact:true}));else await page.keyboard.press('Escape');await press(page.getByRole('button',{name:'Save & Quit to Title',exact:true}));await page.reload();await press(page.getByRole('button',{name:/Continue/}));await waitForTerrain(page);
  const after=await owners();expect(after).toEqual(before);expect(await count('sugar')).toBe(4);expect(await count('sugar_cane')).toBe(0);expect(after.loadErrors).toEqual([]);await snap(page,info,'final-four-Sugar-cold-owner-conserved');await phase('final-four-Sugar-cold-owner-conserved');expect(errors).toEqual([]);
 }catch(e){failure=e instanceof Error?e.stack??e.message:String(e);throw e;}
 finally{if(contact){await contact.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await contact.detach();}await fs.writeFile(info.outputPath('cane-sugar-browser-proof.json'),JSON.stringify({stage,failure,mobile,sugarId,errors,phases,fixture:'One pre-existingSugar plus prior rawwood/Leather/Ink/Feather/Axe7; noCane. Natural gen3 threeCane harvested and actualUI1Cane→1Sugar three times; thirdheldactualautosave/coldrecovery merges to4, finalcold. Legal chatTP for pickup, no directruntimeoutcome/terrain/camera writes.',uncovered:['native sharedSugar runtime identity/effectivepack calibration','pixel/render/nativeart equivalence','HoneyBottle recipe/bottle return','ordinary potion/food uses','fullEducation/performance/physicalphone']},null,2));}
}
