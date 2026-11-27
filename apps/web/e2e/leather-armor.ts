import { nativePageWorldTap } from './native-world-tap';
import fs from "node:fs/promises";
import {WORLD_HEIGHT} from "@craft/engine";
import {expect, type Page, type TestInfo, type Locator} from "@playwright/test";
import {waitForTerrain, countStack, snap, target} from "./helpers";

// PORTABLE DRAFT: intended sibling of existing helpers.ts. Never executed as browser evidence.
// All evaluate callbacks observe only; all product changes use trusted input or disclosed chat.
const pieces = [
  {name:"leather_helmet", label:"Leather Cap", slot:"head", cells:[0,1,2,3,5], max:55},
  {name:"leather_chestplate", label:"Leather Tunic", slot:"chest", cells:[0,2,3,4,5,6,7,8], max:80},
  {name:"leather_leggings", label:"Leather Pants", slot:"legs", cells:[0,1,2,3,5,6,8], max:75},
  {name:"leather_boots", label:"Leather Boots", slot:"feet", cells:[0,2,3,5], max:65},
] as const;
const observe = (page:Page) => page.evaluate(() => {
  const g=window.__craft.game!;
  return {mode:g.mode,health:g.health,dead:g.dead,food:g.hunger.food,regenTimer:g.hunger.timer,
    equipment:JSON.parse(JSON.stringify(g.inventory.equipment)),
    slots:JSON.parse(JSON.stringify(g.inventory.slots)),
    position:{...g.body.position},loadErrors:[...g.loadErrors],
    hostiles:g.mobs.mobs.filter(m=>m.kind==="zombie"||m.kind==="spider"||m.kind==="blaze").map(m=>({id:m.id,kind:m.kind,position:{...m.position}})),
    zombies:g.mobs.mobs.filter(m=>m.kind==="zombie").map(m=>({id:m.id,health:m.health,position:{...m.position},attackTimer:m.attackTimer}))};
});

export async function leatherArmorRoute(page:Page,info:TestInfo,mobile:boolean) {
  const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const evidence:Record<string,unknown>={status:"STARTED_NOT_PASS",mobile,
    fixtures:["fresh isolated Playwright context, seed12345, animals off", "chat gives exactly24Leather and oneTable; no armor given", "one disclosed summonedZombie; actual melee only", "legal teleport navigation and mode health resets; no direct product writes"],hits:[]};
  const press=(l:Locator)=>mobile?l.tap():l.click();
  const inv=page.locator(".inventory-screen");
  const touch=mobile?await page.context().newCDPSession(page):null;
  const chat=async()=>{
    if(mobile)await press(page.getByRole("button",{name:"Chat and commands",exact:true}));
    else await page.keyboard.press("Slash");
    await expect(page.getByRole("textbox",{name:"Chat",exact:true})).toBeVisible();
  };
  const submit=async(text:string)=>{
    const input=page.getByRole("textbox",{name:"Chat",exact:true});
    await input.fill(text);await input.press("Enter");await expect(input).toBeHidden();
  };
  const command=async(text:string)=>{await chat();await submit(text);};
  const open=async()=>{
    if(mobile)await press(page.getByRole("button",{name:"Open inventory",exact:true}));
    else await page.keyboard.press("e");
    await expect(inv).toBeVisible();
    await expect(inv.getByRole("heading",{name:"Inventory",exact:true})).toBeVisible();
  };
  const close=()=>press(page.getByRole("button",{name:"Close inventory",exact:true}));
  const slot=async(name:string)=>page.evaluate(n=>{
    const id=window.__craft.stackId(n);return window.__craft.game!.inventory.slots.findIndex(s=>s?.id===id);
  },name);
  const empty=()=>page.evaluate(()=>window.__craft.game!.inventory.slots.findIndex(s=>s===null));
  const select=async(i:number)=>{
    expect(i).toBeGreaterThanOrEqual(0);expect(i).toBeLessThan(9);
    if(mobile)await press(page.locator(`.hotbar [data-slot="${i}"]`));
    else await page.keyboard.press(`Digit${i+1}`);
  };
  const contact=async(dx:number,dy:number)=>{
    const v=page.viewportSize()!,x=v.width*.6,y=v.height*.42;
    if(touch){
      await touch.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:3}]});
      // Exceed10px touch slop even for a small final correction, then finish at exact delta.
      await touch.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+20,y,id:3}]});
      await touch.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+dx,y:y+dy,id:3}]});
      await touch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    }else{
      // Middle-button drag is the existing unlocked camera input; no direct yaw/pitch assignments.
      await page.mouse.move(x,y);await page.mouse.down({button:"middle"});
      await page.mouse.move(x+dx,y+dy,{steps:5});await page.mouse.up({button:"middle"});
    }
    await page.waitForTimeout(40);
  };
  const aim=async(yaw:number,pitch:number)=>{
    for(let i=0;i<90;i++){
      const b=await page.evaluate(()=>({yaw:window.__craft.game!.body.yaw,pitch:window.__craft.game!.body.pitch}));
      const dyaw=Math.atan2(Math.sin(yaw-b.yaw),Math.cos(yaw-b.yaw)),dp=pitch-b.pitch;
      if(Math.abs(dyaw)<.025&&Math.abs(dp)<.025)return;
      const sensitivity=mobile?.006:.0025;
      const clamp=(x:number)=>Math.max(-60,Math.min(60,x));
      await contact(clamp(-dyaw/sensitivity),clamp(-dp/sensitivity));
    }
    throw Error("Trusted camera input did not reach requested aim; no direct-write fallback");
  };
  const use=async()=>{ if(mobile){const v=page.viewportSize()!;await nativePageWorldTap(page,v.width*.65,v.height*.45);}else{await page.mouse.down({button:"right"});await page.waitForTimeout(50);await page.mouse.up({button:"right"});} };
  // Inspect only already-loaded terrain. Never call getBlock/getChunk/generator in evaluate.
  const flat=async(origin:{x:number;y:number;z:number},r:number)=>page.evaluate(({origin,r,height})=>{
    const g=window.__craft.game!,ground=new Set(["grass","dirt","stone","sand"].map(n=>window.__craft.blockId(n)));
    for(let distance=0;distance<=r;distance++)for(let dx=-distance;dx<=distance;dx++)for(let dz=-distance;dz<=distance;dz++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==distance)continue;
      const x=Math.floor(origin.x)+dx,z=Math.floor(origin.z)+dz;
      for(let y=2;y<=height-4;y++){
        let ok=true;for(let a=-2;a<=2&&ok;a++)for(let b=-2;b<=2&&ok;b++){
          const base=g.world.getLoadedBlock(x+a,y-1,z+b);
          if(base===undefined||!ground.has(base)){ok=false;break;}
          for(let h=0;h<4;h++)if(g.world.getLoadedBlock(x+a,y+h,z+b)!==0){ok=false;break;}
        }
        if(ok)return {x:x+.5,y,z:z+.5};
      }
    }return null;
  },{origin,r,height:WORLD_HEIGHT});
  const cold=async(label:string)=>{
    await command("/gamemode survival"); // Called only at the isolated natural workshop.
    const before=await observe(page);expect(before.mode).toBe("survival");
    if(mobile)await press(page.getByRole("button",{name:"Pause",exact:true}));else await page.keyboard.press("Escape");
    await press(page.getByRole("button",{name:"Save & Quit to Title",exact:true}));
    await page.reload();await press(page.getByRole("button",{name:/Continue/}));await waitForTerrain(page);
    const after=await observe(page);expect(after.equipment).toEqual(before.equipment);expect(after.slots).toEqual(before.slots);
    expect(after.loadErrors).toEqual([]);expect(after.dead).toBe(false);
    evidence[label]={before,after};await open();
    for(const p of pieces){if(after.equipment[p.slot]){
      await expect(inv.locator(`[data-equipment="${p.slot}"] img`)).toHaveAttribute("alt",p.label);
      await expect(inv.locator(`[data-equipment="${p.slot}"] .durability`)).toHaveAttribute("data-durability",String(p.max-(after.equipment[p.slot].damage??0)));
    }else await expect(inv.locator(`[data-equipment="${p.slot}"] img`)).toHaveCount(0);}
    await snap(page,info,label);await close();await command("/gamemode creative");
    expect((await observe(page)).equipment).toEqual(before.equipment);
  };
  try{
    // Each test receives a fresh context; no localStorage/raw-save/owned-stack injection.
    await page.goto("/");await expect(page.getByRole("heading",{name:"AgentFlow Craft"})).toBeVisible();
    await press(page.getByRole("button",{name:"Create New World",exact:true}));await page.getByLabel("Seed").fill("12345");
    await press(page.getByRole("button",{name:/Game Mode/}));await press(page.getByRole("button",{name:"Spawn Animals: On",exact:true}));
    await press(page.getByRole("button",{name:"Create",exact:true}));await waitForTerrain(page);
    expect((await observe(page)).mode).toBe("survival");
    const start=(await observe(page)).position,workshop=await flat(start,24);expect(workshop).not.toBeNull();
    if(!workshop)throw Error("No loaded natural5x5 workshop; fixture must be reviewed rather than injected");
    await command(`/tp ${workshop.x} ${workshop.y} ${workshop.z}`);await waitForTerrain(page);
    await command("/give crafting_table");await command("/give leather 24");
    expect(await countStack(page,"leather")).toBe(24);for(const p of pieces)expect(await countStack(page,p.name)).toBe(0);
    await select(await slot("crafting_table"));await aim(0,-1.2);expect(await target(page)).not.toBeNull();await use();
    await expect.poll(async()=>(await target(page))?.id).toBe(await page.evaluate(()=>window.__craft.blockId("crafting_table")));
    expect(await countStack(page,"crafting_table")).toBe(0);await page.waitForTimeout(300);await use();
    await expect(page.getByRole("heading",{name:"Crafting Table",exact:true})).toBeVisible();
    let remaining=24;
    for(const p of pieces){
      const input=await slot("leather");expect(input).toBeGreaterThanOrEqual(0);await press(inv.locator(`[data-slot="${input}"]`));
      for(const c of p.cells)await press(inv.locator(`[data-craft="${c}"]`));remaining-=p.cells.length;
      if(remaining>0)await press(inv.locator(`[data-slot="${input}"]`));
      await expect(inv.getByTestId("cursor")).toBeEmpty();
      await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt",p.label);
      await press(inv.locator("[data-craft-result]"));const out=await empty();expect(out).toBeGreaterThanOrEqual(0);
      await press(inv.locator(`[data-slot="${out}"]`));expect(await countStack(page,p.name)).toBe(1);
      expect(await countStack(page,"leather")).toBe(remaining);
      for(let c=0;c<9;c++)await expect(inv.locator(`[data-craft="${c}"] img`)).toHaveCount(0);
    }
    await snap(page,info,"leather-four-actual-table-recipes-finite24");await close();await open();
    for(const p of pieces){await press(inv.locator(`[data-slot="${await slot(p.name)}"]`));await press(inv.locator(`[data-equipment="${p.slot}"]`));
      await expect(inv.locator(`[data-equipment="${p.slot}"] img`)).toHaveAttribute("alt",p.label);expect(await countStack(page,p.name)).toBe(0);}
    await snap(page,info,"leather-all-four-equipped-from-inventory");await close();
    await expect(page.locator("[data-armor-points]")).toHaveAttribute("data-armor-points","7");evidence.crafted=await observe(page);
    // Offline seed12345/gen3 provenance selects this natural25column Sand patch.
    // Real gameplay must independently load and recheck every support/headroom cell.
    const arena={x:13.5,y:55,z:80.5};
    const fixtureOwners=(await observe(page));
    expect(await page.evaluate(()=>({seed:window.__craft.game!.world.seed,version:window.__craft.game!.world.generatorVersion}))).toEqual({seed:12345,version:3});
    await command("/gamemode creative");await command(`/tp ${arena.x} ${arena.y} ${arena.z}`);await waitForTerrain(page);
    const loadedPatch=await page.evaluate(p=>{
      const g=window.__craft.game!;
      return Array.from({length:25},(_,i)=>{const x=Math.floor(p.x)+i%5-2,z=Math.floor(p.z)+Math.floor(i/5)-2;
        return{x,z,y:p.y,support:g.world.getLoadedBlock(x,p.y-1,z),air4:[0,1,2,3].map(h=>g.world.getLoadedBlock(x,p.y+h,z))};});
    },arena);
    const sand=await page.evaluate(()=>window.__craft.blockId("sand"));
    for(const c of loadedPatch){expect(c.support).toBe(sand);expect(c.air4).toEqual([0,0,0,0]);}
    expect((await observe(page)).equipment).toEqual(fixtureOwners.equipment);expect((await observe(page)).slots).toEqual(fixtureOwners.slots);
    const separation=Math.hypot(arena.x-workshop.x,arena.z-workshop.z);expect(separation).toBeGreaterThan(64);expect(separation).toBeLessThan(92);
    await command("/time set night");
    // Summon is3blocks ahead at current yaw. Initial actual camera input established yaw~0.
    // Starting1block south of center keeps the summon point inside the5x5 patch.
    await command(`/tp ${arena.x} ${arena.y} ${arena.z+1}`);await waitForTerrain(page);
    const summonYaw=await page.evaluate(()=>window.__craft.game!.body.yaw);expect(Math.abs(Math.atan2(Math.sin(summonYaw),Math.cos(summonYaw)))).toBeLessThan(.025);
    const previous=(await observe(page)).zombies.map(z=>z.id);await command("/summon zombie");
    const spawned=(await observe(page)).zombies.filter(z=>!previous.includes(z.id));expect(spawned).toHaveLength(1);const zombie=spawned[0];
    expect(zombie.position.x).toBeGreaterThanOrEqual(arena.x-2.5);expect(zombie.position.x).toBeLessThan(arena.x+2.5);
    expect(zombie.position.z).toBeGreaterThanOrEqual(arena.z-2.5);expect(zombie.position.z).toBeLessThan(arena.z+2.5);
    expect(Math.abs(zombie.position.y-arena.y)).toBeLessThan(1);
    await command(`/tp ${arena.x} ${arena.y} ${arena.z}`);await waitForTerrain(page);
    evidence.combatFixture={seed:12345,generatorVersion:3,workshop,arena,separation,loadedPatch,summonYaw,zombie,naturalNotEnclosed:true,
      provenance:"offline-natural-patches.json:25Sand/id8supports atY54 and4AIR atY55..58; chunks0,4/0,5 SHA256 retained; real loaded cells rechecked above"};
    for(let hit=1;hit<=55;hit++){
      if(hit%10===1)await command("/time set night");
      await command(`/tp ${arena.x} ${arena.y} ${arena.z}`);await waitForTerrain(page);
      const before=await observe(page);expect(before.mode).toBe("creative");expect(before.dead).toBe(false);
      expect(before.equipment.chest.damage??0).toBe(hit-1);
      expect(before.hostiles.filter(m=>m.id!==zombie.id&&Math.hypot(m.position.x-before.position.x,m.position.z-before.position.z)<48)).toEqual([]);
      await command("/gamemode survival"); // setMode actual source resets health20 and does not touch equipment.
      await page.waitForFunction(n=>(window.__craft.game!.inventory.equipment.chest?.damage??0)>=n,hit,{timeout:30_000,polling:"raf"});
      await chat(); // Pauses active simulation using real UI, before read-only observations.
      const after=await observe(page);expect(after.dead).toBe(false);expect(after.mode).toBe("survival");
      expect(after.equipment.chest.damage).toBe(hit); // Exactly one hit; never silently accept an extra hit.
      expect(after.health).toBeCloseTo(20-3*(1-7*.04),5); // Includes cap's55th, breaking hit under existing app policy.
      for(const p of pieces.slice(1))expect(after.equipment[p.slot].damage).toBe(hit);
      if(hit<55)expect(after.equipment.head.damage).toBe(hit);else expect(after.equipment.head).toBeNull();
      expect(after.zombies.find(z=>z.id===zombie.id)?.health).toBe(zombie.health);
      expect(after.zombies.find(z=>z.id===zombie.id)?.attackTimer).toBeGreaterThan(0);
      expect(after.hostiles.filter(m=>m.id!==zombie.id&&Math.hypot(m.position.x-after.position.x,m.position.z-after.position.z)<48)).toEqual([]);
      (evidence.hits as unknown[]).push({number:hit,before,after});
      await submit("/gamemode creative");const reset=await observe(page);expect(reset.health).toBe(20);expect(reset.equipment).toEqual(after.equipment);
      if(hit===1){
        // Cold save full set after real wear, with the hostile isolated64..96 away.
        await command(`/tp ${workshop.x} ${workshop.y} ${workshop.z}`);await waitForTerrain(page);await cold("leather-four-worn-cold-restored");
        await command(`/tp ${arena.x} ${arena.y} ${arena.z}`);await waitForTerrain(page);
      }
      if(hit===54||hit===55){
        const uiOwner=(await observe(page)).equipment;
        await command(`/tp ${workshop.x} ${workshop.y} ${workshop.z}`);await waitForTerrain(page);
        await command("/gamemode survival");await open();for(const p of pieces.slice(1))await expect(inv.locator(`[data-equipment="${p.slot}"] .durability`)).toHaveAttribute("data-durability",String(p.max-hit));
        if(hit===54)await expect(inv.locator('[data-equipment="head"] .durability')).toHaveAttribute("data-durability","1");
        else await expect(inv.locator('[data-equipment="head"] img')).toHaveCount(0);
        await snap(page,info,`leather-real-melee-hit-${hit}`);await close();await command("/gamemode creative");
        expect((await observe(page)).equipment).toEqual(uiOwner);
        if(hit<55){await command(`/tp ${arena.x} ${arena.y} ${arena.z}`);await waitForTerrain(page);}
      }
    }
    await command(`/tp ${workshop.x} ${workshop.y} ${workshop.z}`);await waitForTerrain(page);await command("/time set night");
    expect(await countStack(page,"leather_helmet")).toBe(0);await cold("leather-cap-broken-three-worn-cold-restored");
    const retained=(await observe(page)).equipment;expect(retained.head).toBeNull();
    await command("/gamemode survival");const capacity=await page.evaluate(()=>window.__craft.game!.inventory.spaceFor(window.__craft.blockId("cobblestone")));
    await command("/give cobblestone 2304");expect(await countStack(page,"cobblestone")).toBe(capacity);
    const bag=await observe(page);expect(bag.slots.every((s:unknown)=>s!==null)).toBe(true);
    await open();await expect(inv.getByTestId("cursor")).toBeEmpty();await press(inv.locator('[data-equipment="chest"]'));
    await expect(inv.locator('[data-equipment="chest"] img')).toHaveCount(0);await expect(inv.getByTestId("cursor")).toContainText("Leather Tunic");
    await close();await expect(inv).toBeVisible();await expect(inv.getByRole("status")).toContainText("Inventory full");
    expect((await observe(page)).slots).toEqual(bag.slots);await snap(page,info,"leather-fullbag-tunic-cursor-close-refused");
    await page.reload();await press(page.getByRole("button",{name:/Continue/}));await expect(inv).toBeVisible();
    await expect(inv.locator('[data-recovery="0"] img')).toHaveAttribute("alt","Leather Tunic");
    expect((await observe(page)).slots).toEqual(bag.slots);await press(inv.locator('[data-recovery="0"]'));await press(inv.locator('[data-equipment="chest"]'));
    expect((await observe(page)).equipment).toEqual(retained);await close();await expect(inv).toBeHidden();
    expect((await observe(page)).loadErrors).toEqual([]);await snap(page,info,"leather-fullbag-pending-worn-tunic-cold-recovered");
    evidence.final=await observe(page);expect(errors).toEqual([]);evidence.status="ROUTE_ASSERTIONS_COMPLETED";
  }finally{
    evidence.errors=errors;await fs.writeFile(info.outputPath("leather-browser-coverage.json"),JSON.stringify(evidence,null,2));
    await touch?.detach();
  }
}
