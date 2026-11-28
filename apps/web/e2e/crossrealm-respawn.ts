import fs from "node:fs/promises";
import {expect,type JSHandle,type Locator,type Page,type TestInfo} from "@playwright/test";
import {Inventory,blockId,stackId,createAgent,serializeSave,type SaveData} from "@craft/engine";
import {snap,waitForTerrain} from "./helpers";
import type {Game} from "../src/application/game";

const SAVE_KEY="craft.save.v1";
/** Disclosed raw fixture only: preowned Nether pad/bag/Agent and inactive Overworld owners.
 * /tp is navigation; actual void simulation, death transfer and Main Respawn UI do all transitions.
 * No source acquisition, native bed spawning, direct hurt/respawn or live owner/timer mutation. */
export function crossrealmRespawnFixture(keepInventory:boolean):{raw:string;initial:SaveData}{
  const inventory=new Inventory();
  inventory.slots[0]={id:blockId("stone"),count:3};
  inventory.slots[1]={id:stackId("blaze_rod"),count:2};inventory.slots[2]={id:stackId("bread"),count:1};
  const agent=createAgent(2,80,0);agent.slots[0]={id:stackId("diamond"),count:5};agent.slots[26]={id:stackId("silver"),count:2};
  const initial:SaveData={version:1,name:`Nether respawn keep ${keepInventory}`,seed:7,generatorVersion:1,mode:"survival",timeOfDay:.25,
    player:{position:{x:.5,y:80,z:.5},yaw:.3,pitch:0,flying:false},inventory:inventory.toJSON(),playerState:{health:20},hunger:{food:8,saturation:0,exhaustion:1,timer:0},
    edits:[],agent,programs:[],gamerules:{keepInventory,doMobSpawning:false,doDaylightCycle:false},
    farming:{version:1,tick:7,accumulator:.21,cursor:0},fluids:{version:1,contactSeconds:.3},
    mobs:{nextId:9,records:[]},worldDrops:{nextKey:41,records:[]},snowballProjectiles:{version:1,nextKey:11,records:[]},
    blazeFireballs:{version:1,nextKey:13,records:[{key:12,originMobId:7,position:{x:512.5,y:80.9,z:512.5},velocity:{x:8,y:0,z:0},ageSeconds:.25}]},
    dimensions:{version:1,active:"nether",inactive:{overworld:{seed:17,generatorVersion:2,
      player:{position:{x:1024.5,y:-30,z:-1024.5},yaw:0,pitch:0,flying:false},edits:[[48,70,48,blockId("obsidian")]],
      farming:{version:1,tick:41,accumulator:.37,cursor:0},fluids:{version:1,contactSeconds:.42},
      mobs:{nextId:23,records:[]},worldDrops:{nextKey:17,records:[]},snowballProjectiles:{version:1,nextKey:19,records:[]}}},links:[]}};
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
    initial.edits.push([x,79,z,blockId("obsidian")]);for(let y=80;y<=83;y++)initial.edits.push([x,y,z,0]);
  }
  return{raw:serializeSave(initial),initial};
}

// Validate both complete raw fixtures during Playwright discovery as well as execution.
const fixtures={drop:crossrealmRespawnFixture(false),keep:crossrealmRespawnFixture(true)};

type OwnedStack={id:number;count:number};
const totals=(stacks:readonly OwnedStack[])=>Object.fromEntries([...stacks.reduce((m,s)=>m.set(s.id,(m.get(s.id)??0)+s.count),new Map<number,number>())].sort(([a],[b])=>a-b));

export async function crossrealmRespawnRoute(page:Page,info:TestInfo,mobile:boolean,keepInventory:boolean):Promise<void>{
  const errors:string[]=[],observations:unknown[]=[];let stage="fixture",failure:string|null=null;
  const press=(locator:Locator)=>mobile?locator.tap():locator.click();
  const fixture=keepInventory?fixtures.keep:fixtures.drop;
  let sourceHandle:JSHandle<Game|null>|null=null;
  const read=()=>page.evaluate(()=>{
    const g=window.__craft.game;if(!g)return null;
    return{realm:g.world.dimension,seed:g.world.seed,generatorVersion:g.world.generatorVersion,dead:g.dead,health:g.health,hunger:{...g.hunger},status:structuredClone(g.playerStatus),body:structuredClone(g.body),inventory:g.inventory.toJSON(),agent:structuredClone(g.agent),
      drops:g.worldDrops.toJSON(),fireballs:g.mobs.exportFireballs(),farming:g.farming.toJSON(),fluids:g.world.fluids.exportState(),edits:g.world.exportEdits(),loadErrors:[...g.loadErrors],cleanupErrors:g.lifecycleCleanupErrors,rawStorage:localStorage.getItem("craft.save.v1")};
  });
  const record=async(label:string)=>{const state=await read();observations.push({stage,label,state});return state;};
  const jsonAttachment=async(name:string,value:unknown)=>{const path=info.outputPath(`${name}.json`);await fs.writeFile(path,JSON.stringify(value,null,2));await info.attach(name,{path,contentType:"application/json"});};
  const pause=async()=>{if(mobile)await press(page.getByRole("button",{name:"Pause",exact:true}));else await page.keyboard.press("Escape");await expect(page.locator(".pause-screen")).toBeVisible();};
  const quit=async()=>{await press(page.getByRole("button",{name:"Save & Quit to Title",exact:true}));await expect(page.getByRole("heading",{name:"AgentFlow Craft",exact:true})).toBeVisible();return page.evaluate(()=>localStorage.getItem("craft.save.v1")!);};
  page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  try{
    await page.goto("/");await expect(page.getByRole("heading",{name:"AgentFlow Craft",exact:true})).toBeVisible();
    await page.evaluate(raw=>{localStorage.clear();localStorage.setItem("craft.save.v1",raw);},fixture.raw);await page.reload();
    const sources=await Promise.all(["crossrealm-respawn.ts","desktop-crossrealm-respawn.spec.ts","mobile-crossrealm-respawn.spec.ts"].map(async name=>({name,text:await fs.readFile(new URL(name,import.meta.url),"utf8")})));
    const provenance=await page.evaluate(async({sources,raw})=>{
      const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",Uint8Array.from(bytes).buffer))).map(v=>v.toString(16).padStart(2,"0")).join("");
      const source=await Promise.all(sources.map(async s=>({name:s.name,sha256:await sha(new TextEncoder().encode(s.text))})));
      const urls=[...new Set([...Array.from(document.scripts).map(s=>s.src),...performance.getEntriesByType("resource").map(e=>e.name).filter(url=>/\.js(?:\?|$)/.test(url))].filter(Boolean))];
      const bundles=await Promise.all(urls.map(async url=>{const response=await fetch(url);if(!response.ok)throw Error(`Cannot read tested bundle ${response.status}:${url}`);const bytes=new Uint8Array(await response.arrayBuffer());return{url,bytes:bytes.length,sha256:await sha(bytes)};}));
      return{fixtureSHA256:await sha(new TextEncoder().encode(raw)),testSources:source,bundles,url:location.href,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}};
    },{sources,raw:fixture.raw});
    await jsonAttachment("tested-source-and-bundle",{...provenance,runnerSourceRevision:process.env.TESTED_SOURCE_SHA??process.env.SOURCE_SHA??null,qualification:"Runtime bundle and exact3test-source hashes; runner source manifest required to identify an uncommitted application tree."});
    stage="load-owned-nether";await press(page.getByRole("button",{name:/Continue/}));await waitForTerrain(page);
    const before=await record("actual-loaded-Nether-owned-pad-and-preowned-inventories");expect(before).not.toBeNull();expect(before!.realm).toBe("nether");expect(before!.health).toBe(20);expect(before!.hunger.food).toBe(8);expect(before!.inventory).toEqual(fixture.initial.inventory);expect(before!.agent.slots).toEqual(fixture.initial.agent!.slots);expect(before!.agent.slots).toHaveLength(27);expect(before!.loadErrors).toEqual([]);expect(before!.fireballs).toEqual(fixture.initial.blazeFireballs);
    stage="actual-source-save-proves-inactive-Overworld-clock";await pause();
    const sourceSaved=JSON.parse((await read())!.rawStorage!) as SaveData;
    expect(sourceSaved.dimensions!.inactive.overworld).toEqual(fixture.initial.dimensions!.inactive.overworld);
    expect(sourceSaved.blazeFireballs).toEqual(before!.fireballs);
    observations.push({stage,label:"real-Nether-menu-save-keeps-entire-inactive-Overworld-owner-snapshot",sourceSaved});
    await press(page.getByRole("button",{name:"Back to Game",exact:true}));await expect(page.locator(".pause-screen")).toHaveCount(0);
    sourceHandle=await page.evaluateHandle(()=>window.__craft.game);
    stage="real-ui-void-death";
    if(mobile)await press(page.getByRole("button",{name:"Chat and commands",exact:true}));else await page.keyboard.press("Slash");
    const chat=page.getByRole("textbox",{name:"Chat",exact:true});await expect(chat).toBeVisible();await chat.fill("/tp 0.5 -30 0.5");await chat.press("Enter");await expect(chat).toBeHidden();
    await expect(page.locator(".death-screen")).toHaveCount(1);await expect(page.locator(".death-screen")).toBeVisible({timeout:20_000});
    const dead=await record("actual-void-health0-and-one-death-transfer");expect(dead!.dead).toBe(true);expect(dead!.health).toBe(0);expect(dead!.realm).toBe("nether");expect(dead!.agent.slots).toEqual(before!.agent.slots);expect(dead!.fireballs).toEqual(before!.fireballs);
    const expectedStacks=fixture.initial.inventory.slots.filter((s):s is OwnedStack=>s!==null);
    expect(totals(dead!.inventory.slots.filter((s):s is OwnedStack=>s!==null))).toEqual(keepInventory?totals(expectedStacks):{});
    expect(totals(dead!.drops.records.map(r=>r.stack))).toEqual(keepInventory?{}:totals(expectedStacks));expect(dead!.drops.nextKey).toBe(keepInventory?41:44);
    await snap(page,info,`Nether-void-death-keep-${keepInventory}`);
    stage="actual-respawn-button-main-handoff";await press(page.locator(".death-screen").getByRole("button",{name:"Respawn",exact:true}));
    await page.waitForFunction(()=>window.__craft.game?.world.dimension==="overworld"&&!window.__craft.game.dead,undefined,{timeout:45_000});await expect(page.locator(".death-screen")).toHaveCount(0);await waitForTerrain(page);
    const alive=await record("actual-safe-Overworld-respawn-after-Main-writer-handoff");expect(alive!.realm).toBe("overworld");expect(alive!.seed).toBe(17);expect(alive!.generatorVersion).toBe(2);expect(alive!.health).toBe(20);expect(alive!.hunger.food).toBe(20);expect(alive!.hunger.saturation).toBe(5);expect(alive!.body.flying).toBe(false);expect(alive!.body.onGround).toBe(true);expect(alive!.body.position.y).toBeGreaterThan(0);expect(Math.abs(alive!.body.position.x)).toBeLessThan(11);expect(Math.abs(alive!.body.position.z)).toBeLessThan(11);expect(alive!.agent.slots).toEqual(before!.agent.slots);expect(alive!.agent.slots).toHaveLength(27);expect(alive!.agent).not.toMatchObject({x:before!.agent.x,y:before!.agent.y,z:before!.agent.z});expect(alive!.drops.records).toEqual([]);expect(alive!.drops.nextKey).toBe(17);expect(alive!.edits).toContainEqual([48,70,48,blockId("obsidian")]);expect(alive!.inventory).toEqual(dead!.inventory);expect(alive!.status).toEqual({});expect(alive!.loadErrors).toEqual([]);expect(alive!.cleanupErrors).toEqual([]);
    const sourceCleanup=await sourceHandle.evaluate(g=>g?.lifecycleCleanupErrors);expect(sourceCleanup).toEqual([]);
    await snap(page,info,`safe-Overworld-respawn-keep-${keepInventory}`);
    const committed=JSON.parse(alive!.rawStorage!) as SaveData;expect(committed.dimensions?.active).toBe("overworld");expect(committed.playerState).toEqual({health:20});
    const archived=committed.dimensions!.inactive.nether!;expect(totals(archived.worldDrops!.records.map(r=>r.stack))).toEqual(keepInventory?{}:totals(expectedStacks));expect(archived.worldDrops!.nextKey).toBe(keepInventory?41:44);expect(archived.blazeFireballs).toEqual(before!.fireballs);expect(archived.mobs!.nextId).toBe(9);expect(archived.snowballProjectiles!.nextKey).toBe(11);
    stage="inactive-Nether-pause-observation";await page.waitForTimeout(1200);const waited=await record("active-Overworld-time-does-not-age-inactive-Nether");expect((JSON.parse(waited!.rawStorage!) as SaveData).dimensions!.inactive.nether).toEqual(archived);
    stage="save-quit-and-cold-continue";await pause();const savedRaw=await quit(),saved=JSON.parse(savedRaw) as SaveData;expect(saved.dimensions!.inactive.nether).toEqual(archived);expect(saved.inventory).toEqual(alive!.inventory);await press(page.getByRole("button",{name:/Continue/}));await waitForTerrain(page);
    const cold=await record("cold-Overworld-player-Agent-and-separate-Nether-death-owners");expect(cold!.realm).toBe("overworld");expect(cold!.health).toBe(20);expect(cold!.inventory).toEqual(saved.inventory);expect(cold!.agent.slots).toEqual(before!.agent.slots);expect(cold!.drops.records).toEqual([]);expect(cold!.drops.nextKey).toBe(17);expect(cold!.loadErrors).toEqual([]);await snap(page,info,`cold-Overworld-and-Nether-receipts-keep-${keepInventory}`);
    await pause();const coldSaved=JSON.parse(await quit()) as SaveData;expect(coldSaved.dimensions!.inactive.nether).toEqual(archived);expect(coldSaved.agent!.slots).toEqual(before!.agent.slots);expect(coldSaved.worldDrops!.records).toEqual([]);expect(coldSaved.inventory).toEqual(saved.inventory);
    await jsonAttachment("crossrealm-respawn-coverage",{keepInventory,mobile,fixtureRaw:fixture.raw,provenance,committed,saved,coldSaved,archivedNether:archived,observations,sourceCleanup,errors,notCovered:["native bed/spawn selection or height parity","primitive Survival resource acquisition","pending cursor/grid death transfer (separate Game tests)","native status/medicine semantics","full Education graphics/functionality"]});expect(errors).toEqual([]);stage="complete";
  }catch(error){failure=String(error);throw error;}
  finally{await sourceHandle?.dispose().catch(error=>errors.push(`source handle cleanup:${String(error)}`));const finalState=await read().catch(error=>({readbackFailure:String(error)}));await jsonAttachment("crossrealm-respawn-final",{stage,failure,keepInventory,mobile,observations,errors,finalState});if(failure===null&&errors.length)throw Error(errors.join("; "));}
}
