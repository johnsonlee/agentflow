import {expect,type Page,type TestInfo,type CDPSession} from '@playwright/test';
import fs from 'node:fs/promises';
import {Inventory,serializeSave,type SaveData,type CodeProgram} from '@craft/engine';
import {snap,waitForTerrain} from './helpers';

/** HUD correctness fixture: empty bag, flat platform, dormant one-block AST, air-facing camera.
 * No runtime Game/world/inventory/program/clock writes; every action is real input. */
export async function hudSecondaryTouchRoute(page:Page,info:TestInfo,viewport:{width:number;height:number}){
 await page.setViewportSize(viewport);
 const phases:unknown[]=[],events:unknown[]=[],errors:string[]=[],program:CodeProgram={name:'Dormant secondary HUD fixture',trigger:{type:'run'},blocks:[{type:'command',cmd:{op:'turn',side:'left'}}]};
 const edits:[number,number,number,number][]=[];for(let x=3;x<=14;x++)for(let z=3;z<=15;z++){edits.push([x,79,z,3]);for(let y=80;y<=84;y++)edits.push([x,y,z,0]);}
 const initial:SaveData={version:1,name:'Secondary-touch five HUD actions',seed:7,generatorVersion:3,mode:'survival',timeOfDay:.25,player:{position:{x:8.5,y:80,z:12.5},yaw:Math.PI,pitch:.1,flying:false},inventory:new Inventory().toJSON(),programs:[program],playerState:{health:20},edits,mobs:{nextId:1,records:[]},gamerules:{doMobSpawning:false,doDaylightCycle:false}};
 const onError=(e:Error)=>errors.push(e.message),onConsole=(m:{type():string;text():string})=>{if(m.type()==='error')errors.push(m.text());if(m.text().startsWith('HUD_SECONDARY '))events.push(JSON.parse(m.text().slice(14)));};
 page.on('pageerror',onError);page.on('console',onConsole);
 let stage='initial',failure:string|null=null;let finger:CDPSession|undefined;
 const read=()=>page.evaluate(()=>{const g=window.__craft.game!,t=(g as unknown as{touch:{look:unknown}|null}).touch;const visible=(s:string)=>{const n=document.querySelector(s)as HTMLElement|null;return !!n&&!n.hidden&&getComputedStyle(n).display!=='none';};return{paused:g.paused,photos:g.portfolio.photos.length,programs:structuredClone(g.programs),running:g.programRunning,bag:g.inventory.toJSON(),drops:g.worldDrops.toJSON(),agent:structuredClone(g.agent),look:t?.look?structuredClone(t.look):null,code:visible('.code-screen'),portfolio:visible('.portfolio-screen'),chat:visible('.chat-input'),pause:visible('.pause-screen'),codeBlocks:document.querySelectorAll('.code-screen .cb-block').length,position:{...g.body.position},errors:[...g.loadErrors]};});
 const phase=async(label:string)=>{stage=label;const state=await read();phases.push({order:phases.length+1,label,state});return state;};
 try{
  const raw=serializeSave(initial);await fs.writeFile(info.outputPath('initial-disclosed-emptybag-platform-dormant-AST.json'),raw);await page.goto('/');await page.evaluate(s=>{localStorage.clear();localStorage.setItem('craft.save.v1',s);},raw);await page.reload();await page.getByRole('button',{name:/Continue/}).tap();await waitForTerrain(page);
  await page.evaluate(()=>{for(const type of['pointerdown','pointerup','pointercancel','click','keydown','keyup'])document.addEventListener(type,e=>{const p=e as PointerEvent,k=e as KeyboardEvent,t=e.target as HTMLElement;console.log('HUD_SECONDARY '+JSON.stringify({type,label:t.getAttribute?.('aria-label')??t.className,pointerType:p.pointerType,pointerId:p.pointerId,isPrimary:p.isPrimary,code:k.code,isTrusted:e.isTrusted,defaultPrevented:e.defaultPrevented,time:performance.now()}));},true);});
  finger=await page.context().newCDPSession(page);const view={x:viewport.width*.65,y:viewport.height*.42,id:118};const before=await phase('initial');expect(before.programs).toEqual([program]);expect(before.bag.slots.every(s=>s===null)).toBe(true);expect(before.photos).toBe(0);
  let secondaryId=122;
  for(const label of['Code Builder','Take photo','Portfolio','Chat and commands','Pause']){
   stage=`secondary-${label}`;await finger.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[view]});await page.waitForTimeout(450);const held=await phase(`${label}-view-held`);expect(held.look).not.toBeNull();expect(held.paused).toBe(false);
   const box=(await page.getByRole('button',{name:label,exact:true}).boundingBox())!,second={x:box.x+box.width/2,y:box.y+box.height/2,id:secondaryId++};
   try{
    await finger.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[view,second]});await page.waitForTimeout(100);const down=await phase(`${label}-second-down-no-activation`);expect(down.photos).toBe(held.photos);expect(down.code).toBe(false);expect(down.portfolio).toBe(false);expect(down.chat).toBe(false);expect(down.pause).toBe(false);expect(down.look).not.toBeNull();
    await finger.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[second]});
    if(label==='Code Builder'){await expect(page.getByRole('heading',{name:'Code Builder',exact:true})).toBeVisible();await expect(page.locator('.code-screen .cb-block')).toHaveCount(1);}
    if(label==='Take photo')await expect.poll(()=>page.evaluate(()=>window.__craft.game!.portfolio.photos.length)).toBe(1);
    if(label==='Portfolio')await expect(page.getByRole('heading',{name:'Portfolio (1)',exact:true})).toBeVisible();
    if(label==='Chat and commands')await expect(page.getByRole('textbox',{name:'Chat',exact:true})).toBeVisible();
    if(label==='Pause')await expect(page.locator('.pause-screen')).toBeVisible();
    const up=await phase(`${label}-second-up-actual-outcome`);expect(up.programs).toEqual([program]);expect(up.running).toBe(false);expect(up.photos).toBe(label==='Code Builder'?0:1);expect(up.bag).toEqual(before.bag);expect(up.drops.records).toEqual([]);expect(up.errors).toEqual([]);await snap(page,info,`secondary-${label.replaceAll(' ','-')}-${viewport.width}x${viewport.height}`);
   }finally{await finger.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   if(label==='Code Builder')await page.getByRole('button',{name:'Close Code Builder',exact:true}).tap();
   if(label==='Portfolio')await page.getByRole('button',{name:'Close portfolio',exact:true}).tap();
   if(label==='Chat and commands')await page.getByRole('textbox',{name:'Chat',exact:true}).press('Escape');
   if(label==='Pause')await page.getByRole('button',{name:'Back to Game',exact:true}).tap();
   const closed=await phase(`${label}-released-and-closed`);expect(closed.paused).toBe(false);expect(closed.code).toBe(false);expect(closed.portfolio).toBe(false);expect(closed.chat).toBe(false);expect(closed.pause).toBe(false);expect(closed.look).toBeNull();expect(closed.photos).toBe(label==='Code Builder'?0:1);
  }
  // Exercise browser-native focused button defaults, rather than dispatching a synthetic click.
  const pauseButton=page.getByRole('button',{name:'Pause',exact:true});await pauseButton.focus();await page.keyboard.down('Space');expect((await read()).paused).toBe(false);await page.keyboard.up('Space');await expect(page.locator('.pause-screen')).toBeVisible();await phase('native-Space-keyup-opens-Pause-once');await page.getByRole('button',{name:'Back to Game',exact:true}).tap();
  await pauseButton.focus();await page.keyboard.press('Enter');await expect(page.locator('.pause-screen')).toBeVisible();await phase('native-Enter-opens-Pause-once');await page.getByRole('button',{name:'Back to Game',exact:true}).tap();
  const final=await phase('final');expect(final.programs).toEqual([program]);expect(final.running).toBe(false);expect(final.photos).toBe(1);expect(final.bag).toEqual(before.bag);expect(final.agent).toEqual(before.agent);expect(final.position).toEqual(before.position);expect(final.errors).toEqual([]);expect(final.chat).toBe(false);expect(final.paused).toBe(false);expect(errors).toEqual([]);
 }catch(e){failure=e instanceof Error?e.stack??e.message:String(e);throw e;}
 finally{if(finger){await finger.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await finger.detach();}page.off('pageerror',onError);page.off('console',onConsole);await fs.writeFile(info.outputPath('secondary-five-HUD-proof.json'),JSON.stringify({stage,failure,viewport,phases,events,errors,fixture:'Initial emptybag/platform/dormantone-commandAST andair-facingcamera. No runtime Game/world/item/program/clock/RNG writes. Real view118held +secondfingerdown/up onall5 topHUDbuttons; nodownactivation, correctcompletedoutcome, actualmodalcloseafterviewrelease. Camera1 exactly, Portfolio1, CodeBuilderoneblock/noautoRun, Chat/Pause. NativefocusedSpacekeyup andEnter defaultclick controls. Read-only DOMeventtelemetry.',uncovered:['naturalnavigation/acquisition','nativeEducationgraphics/fullfunctionality','performance/physicalphone','all5keyboard combinations (focusedunit plus actualPausebrowserdefault only)']},null,2));}
}
