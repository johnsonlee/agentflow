import { nativePageWorldTap } from './native-world-tap';
import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aimAtTop, blockAt, collectWorldDrops, command, countStack, createWorld, look, lookAtCell, parkMouse, pressMouse, snap, target, trackMob, waitForTerrain } from "./helpers";

/** Disclosed kit: tools and Furnace/Table only; workpad and navigation are fixtures.
 * Natural Birch/Iron/cover blocks are actually mined, ingots smelted and the Bucket crafted.
 * Fluid source outcomes are real game input; no fluid/Obsidian/health/timer grants. */
export async function fluidAcquisitionRoute(page: Page, info: TestInfo, mobile: boolean) {
  let stage = "create", failure: string | null = null, errors: string[] = [];
  const observations: unknown[] = [];
  const ironSites = [
    { x: -62, y: 28, z: -60, stand: { x: -59.5, y: 33, z: -59.5 } },
    { x: -61, y: 28, z: -64, stand: { x: -58.5, y: 33, z: -63.5 } },
    { x: -58, y: 28, z: -59, stand: { x: -55.5, y: 33, z: -58.5 } },
  ];
  let finger: import("@playwright/test").CDPSession | null = null;
  try {
    errors = await createWorld(page, { mode: "survival", seed: "12345" });
    const press = (l: Locator) => mobile ? l.tap() : l.click(), inv = page.locator(".inventory-screen");
    finger = mobile ? await page.context().newCDPSession(page) : null;
    const touch = (type: "touchStart" | "touchEnd") => { const vp = page.viewportSize()!; return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .42, id: 124 }] }); };
    const use = async () => { await page.waitForFunction(()=>((window.__craft.game! as unknown as {placeCooldown:number}).placeCooldown)===0); if (mobile) { const vp = page.viewportSize()!; await nativePageWorldTap(page, vp.width * .65, vp.height * .42); } else await pressMouse(page, "right"); };
    const hold = async (until: () => Promise<unknown>, breaking = false) => { try { if (mobile) await touch("touchStart"); else await page.mouse.down({ button: breaking ? "left" : "right" }); await until(); } finally { if (mobile) await touch("touchEnd"); else await page.mouse.up({ button: breaking ? "left" : "right" }); } };
    const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
    const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
    const select = async (name: string) => { const i = await slotOf(name); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9); if (mobile) await press(page.locator(`.hotbar [data-slot="${i}"]`)); else { await page.keyboard.press(`Digit${i + 1}`); await parkMouse(page); } await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i); };
    const teleport = async (p: { x: number; y: number; z: number }) => { await command(page, `/tp ${p.x} ${p.y} ${p.z}`); await waitForTerrain(page); };
    const open = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE"); await expect(inv).toBeVisible(); };
    const close = async () => { await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden(); };
    const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
    const quitPaused = async () => { await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible(); return page.evaluate(() => localStorage.getItem("craft.save.v1")!); };
    const read = () => page.evaluate(() => { const g = window.__craft.game!; return { inventory: g.inventory.toJSON(), health: g.health, hunger: { ...g.hunger }, status: structuredClone(g.playerStatus), cows: g.mobs.mobs.filter(m => m.kind === "cow").map(m => ({ id: m.id, kind: m.kind, cowState: m.cowState, health: m.health, position: { ...m.position } })), drops: structuredClone(g.worldDrops.records), position: { ...g.body.position }, errors: [...g.loadErrors], generatorVersion:g.world.generatorVersion, fluids:g.world.fluids.exportState(),rawStorage:localStorage.getItem("craft.save.v1") }; });
    const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
    await command(page, "/time set noon"); await command(page, "/gamerule doDaylightCycle false");
    const pad = await page.evaluate(() => {
      const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), y = Math.floor(p.y + .01) - 1, z = Math.floor(p.z);
      for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { g.world.setBlock(x + dx, y, z + dz, window.__craft.blockId("bedrock")); for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, y + dy, z + dz, 0); }
      g.inventory.slots.fill(null); for (const [i, name] of ["iron_shovel", "iron_axe", "iron_pickaxe", "furnace", "crafting_table"].entries()) g.inventory.slots[i] = { id: window.__craft.stackId(name), count: 1 };
      return { x, y, z, origin: { x: x + .5, y: y + 1, z: z + .5 } };
    });
    const mine = async (p: { x: number; y: number; z: number }, tool: string) => { await select(tool); await lookAtCell(page, p.x, p.y, p.z); await expect.poll(() => target(page)).toMatchObject(p); await hold(() => page.waitForFunction(c => window.__craft.game!.world.getBlock(c.x, c.y, c.z) === 0, p, { timeout: 30_000 }), true); };
    stage = "natural-birch-fuel"; await teleport({ x: -59.5, y: 32, z: -53.5 });
    for (const y of [32, 33, 34]) { expect(await blockAt(page, -62, y, -54)).toBe(await page.evaluate(() => window.__craft.blockId("birch_log"))); await mine({ x: -62, y, z: -54 }, "iron_axe"); }
    await collectWorldDrops(page); expect(await countStack(page, "birch_log")).toBeGreaterThanOrEqual(3); await record("natural-fuel-acquired-after-clearing-trunk-body-space");
    stage = "natural-iron-excavation";
    for (const site of ironSites) {
      await teleport(site.stand); const before = await countStack(page, "iron_ore");
      // One real grass break opens body space above Dirt31; enter it before aiming deeper.
      // This avoids nearer surface plants/terrain without removing them or creating a test shaft.
      expect(await blockAt(page, site.x, 32, site.z)).toBe(await page.evaluate(() => window.__craft.blockId("grass"))); await mine({ x: site.x, y: 32, z: site.z }, "iron_shovel");
      await teleport({ x: site.x + .5, y: 32, z: site.z + .5 });
      for (const y of [31, 30, 29]) { expect(await blockAt(page, site.x, y, site.z)).toBe(await page.evaluate(() => window.__craft.blockId("dirt"))); await mine({ x: site.x, y, z: site.z }, "iron_shovel"); await page.waitForFunction(() => window.__craft.game!.body.onGround); }
      expect(await blockAt(page, site.x, site.y, site.z)).toBe(await page.evaluate(() => window.__craft.blockId("iron_ore"))); await mine({ x: site.x, y: site.y, z: site.z }, "iron_pickaxe");
      await expect.poll(() => countStack(page, "iron_ore"), { timeout: 20_000 }).toBe(before + 1);
    }
    expect(await countStack(page, "iron_ore")).toBe(3); await record("three-natural-iron-ores-after-actual-cover-mining"); await snap(page, info, "natural-iron-actually-excavated-and-picked-up");
    stage = "actual-iron-smelting"; await teleport(pad.origin);
    const isolate = async (name: string) => { await open(); const source = await slotOf(name); await press(inv.locator(`[data-slot="${source}"]`)); for (let i = 0; i < 3; i++) await press(inv.locator('[data-craft="0"]')); if (await inv.locator('[data-testid="cursor"]').textContent()) await press(inv.locator(`[data-slot="${source}"]`)); await press(inv.locator('[data-craft="0"]')); const destination = await empty(); await press(inv.locator(`[data-slot="${destination}"]`)); await close(); return destination; };
    const oreSlot = await isolate("iron_ore"), fuelSlot = await isolate("birch_log");
    const station = async (name: string, title: string, p: { x: number; y: number; z: number }) => { await select(name); await aimAtTop(page, p.x, p.y - 1, p.z); await target(page); await use(); await expect.poll(() => blockAt(page, p.x, p.y, p.z)).toBe(await page.evaluate(n => window.__craft.blockId(n), name)); await page.waitForTimeout(300); await lookAtCell(page, p.x, p.y, p.z); await use(); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible(); };
    await station("furnace", "Furnace", { x: pad.x, y: pad.y + 1, z: pad.z - 3 });
    await press(inv.locator(`[data-slot="${oreSlot}"]`)); await press(inv.locator('[data-furnace="input"]')); await press(inv.locator(`[data-slot="${fuelSlot}"]`)); await press(inv.locator('[data-furnace="fuel"]'));
    await page.waitForFunction(() => [...window.__craft.game!.furnaces.values()].some(f => f.output?.id === window.__craft.stackId("iron_ingot") && f.output.count === 3 && f.input === null), undefined, { timeout: 100_000 });
    await press(inv.locator('[data-furnace="output"]')); await press(inv.locator(`[data-slot="${await empty()}"]`)); expect(await countStack(page, "iron_ingot")).toBe(3); await snap(page, info, "natural-iron-ore-and-tree-fuel-smelt-three-ingots"); await close();
    stage = "bucket-iron-V-craft"; await station("crafting_table", "Crafting Table", { x: pad.x + 3, y: pad.y + 1, z: pad.z });
    await press(inv.locator(`[data-slot="${await slotOf("iron_ingot")}"]`)); await press(inv.locator('[data-craft="0"]')); await press(inv.locator('[data-craft="2"]')); await expect(inv.locator('[data-craft-result] img')).toHaveCount(0); await press(inv.locator('[data-craft="4"]')); await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Bucket"); await snap(page, info, "three-actual-ingots-V-recipe-one-bucket");
    await press(inv.locator('[data-craft-result]')); await press(inv.locator(`[data-slot="${await empty()}"]`)); expect(await countStack(page, "bucket")).toBe(1); expect(await countStack(page, "iron_ingot")).toBe(0); await close();

    stage = "natural-fluid-sites";
    const sites = await page.evaluate(() => {
      const g = window.__craft.game!, gen = g.world.generator;
      if (!("lavaBasinAt" in gen)) throw Error("This source-acquisition fixture requires the Overworld generator");
      let water: {x:number;y:number;z:number;stand:{x:number;y:number;z:number}} | null = null;
      for (let x=-192; x<=192 && !water; x+=2) for (let z=-192; z<=192; z+=2) {
        if (gen.heightAt(x,z)>=30) continue;
        const h=gen.heightAt(x+1,z);
        if (h<30 || h>32 || g.world.getBlock(x,30,z)!==window.__craft.blockId("water")) continue;
        if (g.world.exportEdits().some(e=>e[0]===x && e[1]===30 && e[2]===z)) continue;
        water={x,y:30,z,stand:{x:x+1.5,y:h+1,z:z+.5}};break;
      }
      const basins=[];
      for(let x=-496;x<=496;x+=32)for(let z=-496;z<=496;z+=32){const b=gen.lavaBasinAt(x,z);if(b)basins.push(b);}
      basins.sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));
      const lava=basins[0];
      if(!water || !lava) throw Error("No bounded natural source sites found");
      return {water,lava:{...lava,stand:{x:lava.x+2.5,y:lava.rimY+1,z:lava.z+.5}},generatorVersion:g.world.generatorVersion};
    });
    expect(sites.generatorVersion).toBe(3);
    observations.push({stage,label:"read-only-generated-source-sites",value:sites});
    const useCell = async (p:{x:number;y:number;z:number}) => {
      await lookAtCell(page,p.x,p.y,p.z);
      await page.waitForFunction(()=>((window.__craft.game! as unknown as {placeCooldown:number}).placeCooldown)===0);
      await use();
    };
    stage = "natural-water-collect";
    await teleport(sites.water.stand); await select("bucket");
    expect(await blockAt(page,sites.water.x,sites.water.y,sites.water.z)).toBe(await page.evaluate(()=>window.__craft.blockId("water")));
    await useCell(sites.water);
    await expect.poll(()=>blockAt(page,sites.water.x,sites.water.y,sites.water.z)).toBe(0);
    expect(await countStack(page,"water_bucket")).toBe(1);expect(await countStack(page,"bucket")).toBe(0);
    await record("natural-water-source-consumed-exact-one-full-owner");
    await snap(page,info,"natural-water-actually-collected");
    await teleport(pad.origin); await select("water_bucket");
    const waterPlaced={x:pad.x+2,y:pad.y+1,z:pad.z};
    await aimAtTop(page,waterPlaced.x,pad.y,waterPlaced.z);await use();
    await expect.poll(()=>blockAt(page,waterPlaced.x,waterPlaced.y,waterPlaced.z)).toBe(await page.evaluate(()=>window.__craft.blockId("water")));
    expect(await countStack(page,"bucket")).toBe(1);expect(await countStack(page,"water_bucket")).toBe(0);
    await record("real-water-pour-empty-vessel-return");

    stage = "natural-lava-collect";
    await teleport(sites.lava.stand);await select("bucket");
    expect(await blockAt(page,sites.lava.x,sites.lava.y,sites.lava.z)).toBe(await page.evaluate(()=>window.__craft.blockId("lava")));
    expect(await page.evaluate(p=>window.__craft.game!.world.exportEdits().some(e=>e[0]===p.x&&e[1]===p.y&&e[2]===p.z),sites.lava)).toBe(false);
    await useCell(sites.lava);
    await expect.poll(()=>blockAt(page,sites.lava.x,sites.lava.y,sites.lava.z)).toBe(0);
    expect(await countStack(page,"lava_bucket")).toBe(1);expect(await countStack(page,"bucket")).toBe(0);
    await record("natural-generated-lava-source-consumed");
    await snap(page,info,"natural-lava-basin-and-held-vessel");
    await teleport(pad.origin);await select("lava_bucket");
    const hot={x:pad.x-3,y:pad.y+1,z:pad.z};
    await aimAtTop(page,hot.x,pad.y,hot.z);await use();
    await expect.poll(()=>blockAt(page,hot.x,hot.y,hot.z)).toBe(await page.evaluate(()=>window.__craft.blockId("lava")));
    const light=await page.evaluate(p=>window.__craft.game!.world.getLight(p.x,p.y,p.z)&15,hot);expect(light).toBe(15);
    expect(await countStack(page,"bucket")).toBe(1);
    const health=(await read()).health;
    await teleport({x:hot.x+.5,y:hot.y,z:hot.z+.5});
    await page.waitForFunction(before=>window.__craft.game!.health<before,health,{timeout:8000});
    expect((await read()).health).toBeGreaterThan(0);await record("real-lava-contact-health-loss-and-light15");
    await teleport(pad.origin);await select("bucket");await useCell(hot);
    await expect.poll(()=>blockAt(page,hot.x,hot.y,hot.z)).toBe(0);expect(await countStack(page,"lava_bucket")).toBe(1);
    await page.waitForFunction(()=>window.__craft.game!.world.fluids.exportState().contactSeconds===0);

    stage = "actual-water-lava-cooling";
    const cast={x:pad.x+1,y:pad.y+1,z:pad.z};
    await select("lava_bucket");await aimAtTop(page,cast.x,pad.y,cast.z);await use();
    await expect.poll(()=>blockAt(page,cast.x,cast.y,cast.z)).toBe(await page.evaluate(()=>window.__craft.blockId("obsidian")));
    expect(await blockAt(page,waterPlaced.x,waterPlaced.y,waterPlaced.z)).toBe(await page.evaluate(()=>window.__craft.blockId("water")));
    expect(await countStack(page,"bucket")).toBe(1);expect(await countStack(page,"lava_bucket")).toBe(0);
    await record("real-cast-one-obsidian-water-preserved-empty-vessel");await snap(page,info,"real-water-lava-obsidian-cast");
    await pause();const validRaw=await quitPaused(),validSave=JSON.parse(validRaw);
    expect(validSave.generatorVersion).toBe(3);
    await page.reload();await press(page.getByRole("button",{name:/Continue/}));await waitForTerrain(page);
    expect(await blockAt(page,cast.x,cast.y,cast.z)).toBe(await page.evaluate(()=>window.__craft.blockId("obsidian")));
    expect(await countStack(page,"bucket")).toBe(1);expect((await read()).errors).toEqual([]);
    await record("cold-versioned-world-cast-and-vessel-retained");await snap(page,info,"cold-obsidian-and-empty-bucket");
    await pause();await quitPaused();

    for(const kind of ["fluids","generator","bucket"] as const){
      stage=`invalid-${kind}-recovery`;
      const corrupt=await page.evaluate(({raw,kind})=>{
        const d=JSON.parse(raw);
        if(kind==="fluids")d.fluids={version:1,contactSeconds:2};
        else if(kind==="generator")d.generatorVersion=99;
        else{const s=d.inventory.slots.find((s:{id:number}|null)=>s?.id===window.__craft.stackId("bucket"));s.id=window.__craft.stackId("lava_bucket");s.count=2;}
        const bad=`\n${JSON.stringify(d,null,2)}\n`;localStorage.setItem("craft.save.v1",bad);return bad;
      },{raw:validRaw,kind});
      await page.reload();await press(page.getByRole("button",{name:/Continue/}));
      await page.waitForFunction(()=>window.__craft.game?.renderer.isAreaReady(2)===true,undefined,{timeout:60_000});
      const frozen=await record(`${kind}-original-frozen`);
      await command(page,"/give bucket");await expect(page.locator(".chat-log")).toContainText("Export a backup");
      await page.waitForTimeout(31_000);const after=await read();expect(after.rawStorage).toBe(corrupt);expect(after.position).toEqual(frozen.position);expect(after.inventory).toEqual(frozen.inventory);
      await pause();await press(page.getByRole("button",{name:"Save & Quit to Title"}));await expect(page.locator(".pause-screen")).toBeVisible();
      const download=page.waitForEvent("download");await press(page.getByRole("button",{name:"Export world backup"}));
      const path=info.outputPath(`invalid-${kind}-original.json`);await(await download).saveAs(path);expect(JSON.parse(await fs.readFile(path,"utf8")).recoveryOriginalSave).toBe(corrupt);
      await snap(page,info,`${kind}-raw-original-recovery`);await page.goto("/");
    }
    await fs.writeFile(info.outputPath("fluid-coverage.json"),JSON.stringify({sites,observations,validRaw,errors,
      fixtures:"PreownedIronShovel/Axe/Pickaxe/Furnace/Table; initialbedrockpad; chatteleport/camera/read-onlysitequeries. NaturalBirch3/cover/Iron3mined, Iron3smelted, Bucketcrafted. No Water/Lava/Bucket/Obsidian/health/timer resultgrants. Storedcorruption rounds separate.",
      notCovered:["primitive tool/station acquisition","natural Diamond route and browser Obsidian harvest","all owner/death/Agent/Creative UI edgecases","nativeflow/cooling/damage/generator calibration","portals/Nether/brewing/fullEducation/exactgraphics/performance/physicalphone"]},null,2));
    expect(errors).toEqual([]);stage="complete";
  }catch(error){failure=String(error);throw error;}
  finally{
    await finger?.detach().catch(error=>{errors.push(`detach: ${String(error)}`);});
    const state=await page.evaluate(()=>{const g=window.__craft?.game;return{inventory:g?.inventory.toJSON(),fluids:g?.world.fluids.exportState(),generatorVersion:g?.world.generatorVersion,health:g?.health,errors:g?.loadErrors,position:g?.body.position,rawStorage:localStorage.getItem("craft.save.v1")};}).catch(error=>({readbackFailure:String(error)}));
    await fs.writeFile(info.outputPath("fluid-final.json"),JSON.stringify({stage,failure,observations,state,errors},null,2));
  }
}
