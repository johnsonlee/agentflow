import { nativePageWorldTap } from './native-world-tap';
import {expect,type Page,type TestInfo,type Locator} from '@playwright/test';
import fs from 'node:fs/promises';
import {Inventory,blockId,stackId,serializeSave,farmlandId,wheatId,type SaveData} from '@craft/engine';
import {waitForTerrain,snap,lookAtCell,aimAtTop,parkMouse,pressMouse,target} from './helpers';

type Cell={x:number;y:number;z:number};
const crops:Cell[]=[8,16,24].map(x=>({x,y:80,z:8}));
const pools:Cell[][]=[8,24].map(x=>[-1,0,1].map(dx=>({x:x+dx,y:79,z:19})));
const iceTargets:Cell[]=[8,24].map(x=>({x,y:80,z:20}));
/** Preowned finite test inputs, not acquisition evidence. All outcomes after Continue use real input. */
function fixture():SaveData{
 const bag=new Inventory();bag.slots[0]={id:stackId('super_fertilizer'),count:2};bag.slots[1]={id:stackId('ice_bomb'),count:2};bag.slots[2]={id:stackId('super_fertilizer'),count:1};bag.slots[3]={id:stackId('iron_axe'),count:1,damage:7};bag.slots[4]={id:stackId('written_book'),count:1,book:{pages:['preserved finite laboratory cargo '.repeat(5)],title:'Lab cargo',author:'Fixture'}};
 const edits=new Map<string,[number,number,number,number]>(),put=(x:number,y:number,z:number,id:number)=>edits.set(`${x},${y},${z}`,[x,y,z,id]);
 for(let x=3;x<=29;x++)for(let z=3;z<=27;z++){put(x,78,z,blockId('stone'));put(x,79,z,blockId('stone'));for(let y=80;y<=84;y++)put(x,y,z,0);}
 for(const p of crops){put(p.x,79,p.z,farmlandId(7));put(p.x,80,p.z,wheatId(0));put(p.x+1,79,p.z,blockId('water'));}
 for(const pool of pools)for(const p of pool)put(p.x,p.y,p.z,blockId('water'));
 for(const p of iceTargets)put(p.x,p.y,p.z,blockId('stone'));
 const stand={x:8.5,y:80,z:12.5};
 return{version:1,name:'Atomic finite Lab product UI',seed:7,generatorVersion:3,mode:'survival',timeOfDay:.25,player:{position:stand,yaw:0,pitch:Math.atan2(-1.12,4),flying:false},inventory:bag.toJSON(),playerState:{health:20},edits:[...edits.values()],mobs:{nextId:1,records:[]},gamerules:{doMobSpawning:false,doDaylightCycle:false}};
}

export async function labProductOwnedUseRoute(page:Page,info:TestInfo,mobile:boolean,viewport:{width:number;height:number}){
 await page.setViewportSize(viewport);
 const prefix=`${mobile?'mobile':'desktop'}-${viewport.width}x${viewport.height}`,errors:string[]=[],phases:unknown[]=[],saves:unknown[]=[],actions:unknown[]=[];
 let stage='fixture',failure:string|null=null;
 const save=fixture(),kit=serializeSave(save),press=(l:Locator)=>mobile?l.tap():l.click();
 const onError=(e:Error)=>errors.push(e.message),onConsole=(m:{type():string;text():string})=>{if(m.type()==='error')errors.push(m.text());};
 page.on('pageerror',onError);page.on('console',onConsole);
 const file=(name:string)=>info.outputPath(`${prefix}-${name}`);
 const read=()=>page.evaluate(({crops,pools})=>{const g=window.__craft.game!;return{mode:g.mode,bag:g.inventory.toJSON(),crops:crops.map(p=>g.world.getLoadedBlock(p.x,p.y,p.z)),pools:pools.map(pool=>pool.map(p=>g.world.getLoadedBlock(p.x,p.y,p.z))),drops:g.worldDrops.toJSON(),loadErrors:[...g.loadErrors]};},{crops,pools});
 const phase=async(label:string)=>{stage=label;phases.push({order:phases.length+1,label,read:await read()});};
 const select=async(slot:number)=>{if(mobile)await press(page.locator(`.hotbar [data-slot="${slot}"]`));else await page.keyboard.press(`Digit${slot+1}`);await expect.poll(()=>page.evaluate(()=>window.__craft.game!.inventory.selected)).toBe(slot);};
 const command=async(text:string)=>{if(mobile)await press(page.getByRole('button',{name:'Chat and commands',exact:true}));else await page.keyboard.press('Slash');const input=page.getByRole('textbox',{name:'Chat',exact:true});await expect(input).toBeVisible();await input.fill(text);await input.press('Enter');await expect(input).toBeHidden();await waitForTerrain(page);};
 const aim=async(p:Cell)=>{await command(`/tp ${p.x+.5} 80 ${p.z+4.5}`);if(!mobile)await parkMouse(page);await lookAtCell(page,p.x,p.y,p.z);await expect.poll(()=>target(page)).toMatchObject(p);};
 const use=async()=>{await page.waitForFunction(()=>((window.__craft.game! as unknown as{placeCooldown:number}).placeCooldown)===0);const before=await read(),aimed=await target(page);if(mobile){const v=page.viewportSize()!;await nativePageWorldTap(page, v.width*.65,v.height*.42);}else await pressMouse(page,'right');await expect.poll(()=>page.evaluate(()=>((window.__craft.game! as unknown as{placeCooldown:number}).placeCooldown))).toBeGreaterThan(0);actions.push({order:actions.length+1,stage,aimed,before,after:await read(),actualControl:mobile?'native Input.synthesizeTapGesture touch50ms':'mouse right down/up',processedLabCooldown:true});};
 const exactCargo=(state:Awaited<ReturnType<typeof read>>)=>{expect(state.bag.slots[3]).toEqual(save.inventory.slots[3]);expect(state.bag.slots[4]).toEqual(save.inventory.slots[4]);expect(state.drops.records).toEqual([]);expect(state.loadErrors).toEqual([]);};
 const viewIce=async(index:number,label:string)=>{const p=pools[index][1];await command(`/tp ${p.x+.5} 80 16.5`);if(!mobile)await parkMouse(page);await aimAtTop(page,p.x,p.y,p.z);await expect.poll(()=>target(page)).toMatchObject({...p,id:blockId('ice')});await snap(page,info,`${prefix}-${label}`);};
 const cold=async(label:string)=>{
  stage=label;if(mobile)await press(page.getByRole('button',{name:'Pause',exact:true}));else await page.keyboard.press('Escape');
  const before=await read();await press(page.getByRole('button',{name:'Save & Quit to Title',exact:true}));
  const raw=await page.evaluate(()=>localStorage.getItem('craft.save.v1')!);await fs.writeFile(file(`${label}-raw-save.json`),raw);const parsed=JSON.parse(raw);
  expect(parsed.inventory).toEqual(before.bag);expect(parsed.mode).toBe(before.mode);
  const savedCell=(p:Cell)=>parsed.edits.find((e:number[])=>e[0]===p.x&&e[1]===p.y&&e[2]===p.z)?.[3];
  expect(crops.map(savedCell)).toEqual(before.crops);expect(pools.map(pool=>pool.map(savedCell))).toEqual(before.pools);
  await page.reload();expect(await page.evaluate(()=>localStorage.getItem('craft.save.v1'))).toBe(raw);await press(page.getByRole('button',{name:/Continue/}));await waitForTerrain(page);
  const after=await read();expect(after).toEqual(before);exactCargo(after);saves.push({label,before,after,rawFile:`${prefix}-${label}-raw-save.json`});await snap(page,info,`${prefix}-${label}`);await phase(label);
 };
 try{
  await fs.writeFile(file('initial-disclosed-raw-kit.json'),kit);
  await page.goto('/');await page.evaluate(raw=>{localStorage.clear();localStorage.setItem('craft.save.v1',raw);},kit);await page.reload();await press(page.getByRole('button',{name:/Continue/}));await waitForTerrain(page);
  const initial=await read();expect(initial.mode).toBe('survival');expect(initial.bag.slots[0]).toEqual({id:stackId('super_fertilizer'),count:2});expect(initial.bag.slots[1]).toEqual({id:stackId('ice_bomb'),count:2});expect(initial.bag.slots[2]).toEqual({id:stackId('super_fertilizer'),count:1});exactCargo(initial);await phase('initial-finite-disclosed-inputs');
  await select(0);await aim(crops[0]);await use();await expect.poll(async()=>(await read()).crops[0]).toBe(wheatId(7));expect((await read()).bag.slots[0]?.count).toBe(1);await phase('actual-survival-Wheat-N-to-Nminus1');
  await use();await page.waitForTimeout(400);expect((await read()).bag.slots[0]?.count).toBe(1);expect((await read()).crops[0]).toBe(wheatId(7));await phase('actual-mature-Wheat-noop-preserves-source');
  await aim(crops[1]);await use();await expect.poll(async()=>(await read()).crops[1]).toBe(wheatId(7));expect((await read()).bag.slots[0]).toBeNull();expect((await read()).bag.slots[2]?.count).toBe(1);await snap(page,info,`${prefix}-survival-last-fertilizer-unit`);await phase('actual-survival-Wheat-lastunit-null');
  await select(1);await aim(iceTargets[0]);await use();await expect.poll(async()=>(await read()).pools[0]).toEqual(Array(3).fill(blockId('ice')));expect((await read()).bag.slots[1]?.count).toBe(1);await phase('actual-survival-IceBomb-three-Water-one-debit');
  await use();await page.waitForTimeout(400);expect((await read()).bag.slots[1]?.count).toBe(1);await phase('actual-dry-IceBomb-noop-preserves-source');await viewIce(0,'survival-three-visible-Ice-one-debit');await cold('survival-cold-exact-world-and-bag');
  await command('/gamemode creative');await expect.poll(async()=>(await read()).mode).toBe('creative');await select(2);await aim(crops[2]);const beforeCreative=await read();expect(beforeCreative.crops[2]).not.toBe(wheatId(7));await use();await expect.poll(async()=>(await read()).crops[2]).toBe(wheatId(7));expect((await read()).bag.slots[2]?.count).toBe(1);await phase('actual-Creative-Wheat-preserves-finite-source');
  await select(1);await aim(iceTargets[1]);await use();await expect.poll(async()=>(await read()).pools[1]).toEqual(Array(3).fill(blockId('ice')));expect((await read()).bag.slots[1]?.count).toBe(1);await viewIce(1,'Creative-three-visible-Ice-finite-source-preserved');await phase('actual-Creative-IceBomb-preserves-finite-source');await cold('creative-final-cold-exact-world-and-bag');expect(errors).toEqual([]);
 }catch(e){failure=e instanceof Error?e.stack??e.message:String(e);throw e;}
 finally{page.off('pageerror',onError);page.off('console',onConsole);await fs.writeFile(file('owned-lab-product-browser-proof.json'),JSON.stringify({stage,failure,mobile,viewport,errors,phases,saves,actions,fixtures:{crops,pools,iceTargets,finiteSource:'Fertilizer slot0×2 and slot2×1; IceBomb slot1×2; canonical wornAxe7/book<=256chars',navigation:'Actual typed /tp and /gamemode creative commands; existing lookAtCell sets yaw/pitch ONLY to aim. Actual hotbar/rightmouse or short CDP touchscreen tap/Pause/SaveQuit/Continue. No runtime world/item/drop/clock/rate/RNG writes.',coverage:'Finite Survival N/last-unit and mature/dry no-op, 3-Water area IceBomb, finite Creative preservation, two rawsave/title/cold exact relevant worlds and bags. Correctness targeting fixture, not natural acquisition/navigation or adversarial browser reentry.'},uncovered:['NativeEducation effect/calibration/graphics equality','fullEducation','natural material acquisition/navigation','reentrant fault browser injection (realGame unit probes cover boundary)','performance/physicalphone']},null,2));}
}
