import { nativePageWorldTap } from './native-world-tap';
import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aimAtTop, blockAt, collectWorldDrops, command, countStack, createWorld, look, lookAtCell, parkMouse, pressMouse, snap, target, trackMob, waitForTerrain } from "./helpers";

/** Disclosed kit: tools, Furnace/Table and raw Eye only; workpad and navigation are fixtures.
 * Natural Birch/Iron/cover blocks are actually mined, ingots smelted and the Bucket crafted.
 * Cow acquisition uses only the production natural scheduler, never a summon/pose/RNG/clock grant. */
export async function milkCureRoute(page: Page, info: TestInfo, mobile: boolean) {
  let stage = "create", failure: string | null = null, errors: string[] = [];
  const observations: unknown[] = [];
  const ironSites = [
    { x: -62, y: 28, z: -60, stand: { x: -59.5, y: 33, z: -59.5 } },
    { x: -61, y: 28, z: -64, stand: { x: -58.5, y: 33, z: -63.5 } },
    { x: -58, y: 28, z: -59, stand: { x: -55.5, y: 33, z: -58.5 } },
  ];
  try {
    errors = await createWorld(page, { mode: "survival", seed: "12345" });
    const press = (l: Locator) => mobile ? l.tap() : l.click(), inv = page.locator(".inventory-screen");
    const finger = mobile ? await page.context().newCDPSession(page) : null;
    const touch = (type: "touchStart" | "touchEnd") => { const vp = page.viewportSize()!; return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .42, id: 124 }] }); };
    const use = async () => { if (mobile) { const vp = page.viewportSize()!; await nativePageWorldTap(page, vp.width * .65, vp.height * .42); } else await pressMouse(page, "right"); };
    const hold = async (until: () => Promise<unknown>, breaking = false) => { try { if (mobile) await touch("touchStart"); else await page.mouse.down({ button: breaking ? "left" : "right" }); await until(); } finally { if (mobile) await touch("touchEnd"); else await page.mouse.up({ button: breaking ? "left" : "right" }); } };
    const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
    const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
    const select = async (name: string) => { const i = await slotOf(name); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9); if (mobile) await press(page.locator(`.hotbar [data-slot="${i}"]`)); else { await page.keyboard.press(`Digit${i + 1}`); await parkMouse(page); } await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i); };
    const teleport = async (p: { x: number; y: number; z: number }) => { await command(page, `/tp ${p.x} ${p.y} ${p.z}`); await waitForTerrain(page); };
    const open = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE"); await expect(inv).toBeVisible(); };
    const close = async () => { await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden(); };
    const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
    const quitPaused = async () => { await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible(); return page.evaluate(() => localStorage.getItem("craft.save.v1")!); };
    const read = () => page.evaluate(() => { const g = window.__craft.game!; return { inventory: g.inventory.toJSON(), health: g.health, hunger: { ...g.hunger }, status: structuredClone(g.playerStatus), cows: g.mobs.mobs.filter(m => m.kind === "cow").map(m => ({ id: m.id, kind: m.kind, cowState: m.cowState, health: m.health, position: { ...m.position } })), drops: structuredClone(g.worldDrops.records), position: { ...g.body.position }, errors: [...g.loadErrors] }; });
    const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
    await command(page, "/time set noon"); await command(page, "/gamerule doDaylightCycle false");
    const pad = await page.evaluate(() => {
      const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), y = Math.floor(p.y + .01) - 1, z = Math.floor(p.z);
      for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { g.world.setBlock(x + dx, y, z + dz, window.__craft.blockId("bedrock")); for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, y + dy, z + dz, 0); }
      g.inventory.slots.fill(null); for (const [i, name] of ["iron_shovel", "iron_axe", "iron_pickaxe", "furnace", "crafting_table", "spider_eye"].entries()) g.inventory.slots[i] = { id: window.__craft.stackId(name), count: 1 };
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
    stage = "production-natural-adult-cow";
    expect(await page.evaluate(() => window.__craft.game!.mobs.mobs.filter(m => m.kind === "cow").length)).toBe(0); await command(page, "/gamerule doMobSpawning true");
    // Finite production wait; failure is preserved, with no summoned/RNG/clock fallback relabeled natural.
    await page.waitForFunction(() => window.__craft.game!.mobs.mobs.some(m => m.kind === "cow" && m.cowState?.lifeStage === "adult" && m.health > 0), undefined, { timeout: 90_000 });
    const natural = await record("production-scheduler-created-adult-cows"); let naturalIds = natural.cows.map(c => c.id); expect(naturalIds.length).toBeGreaterThan(0); await command(page, "/gamerule doMobSpawning false");
    naturalIds = (await record("natural-population-after-disabling-scheduler")).cows.map(c => c.id);
    let cowId = naturalIds[0];
    const approachCow = async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const pose = await page.evaluate(({ id, attempt }) => {
          const g = window.__craft.game!, cow = g.mobs.mobs.find(m => m.id === id && m.kind === "cow"); if (!cow) return null;
          const offsets = [[-2, 0], [0, 2], [0, -2], [2, 0], [-2, 2], [-2, -2]], [dx, dz] = offsets[attempt];
          const x = Math.floor(cow.position.x) + dx, z = Math.floor(cow.position.z) + dz, h = g.world.generator.heightAt(x, z), ground = g.world.getBlock(x, h, z);
          if (Math.abs(h + 1 - cow.position.y) > 1.5 || !["grass", "dirt", "stone", "sand", "bedrock"].some(n => ground === window.__craft.blockId(n)) || g.world.getBlock(x, h + 1, z) !== 0 || g.world.getBlock(x, h + 2, z) !== 0) return null;
          return { x: x + .5, y: h + 1, z: z + .5 };
        }, { id: cowId, attempt });
        if (!pose) continue; await teleport(pose); const stop = await trackMob(page, cowId);
        try { await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.kind), { timeout: 5000 }).toBe("cow"); const hit = await page.evaluate(() => window.__craft.game!.targetMob!.id); expect(naturalIds).toContain(hit); cowId = hit; return stop; } catch { await stop(); }
      }
      throw Error("No unobstructed nearby body pose for the actual naturally spawned Cow");
    };
    stage = "actual-natural-cow-milking"; await select("bucket"); const stop = await approachCow();
    try { const hp = await page.evaluate(id => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, cowId); await use(); await expect.poll(() => countStack(page, "milk_bucket")).toBe(1); expect(await countStack(page, "bucket")).toBe(0); expect(await page.evaluate(id => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, cowId)).toBe(hp); await snap(page, info, "original-adult-natural-cow-actually-milked-with-crafted-bucket"); } finally { await stop(); }
    await look(page, 0, 1.2); await hold(() => page.waitForFunction(() => ((window.__craft.game! as unknown as { drinkOwner: { elapsed: number } | null }).drinkOwner?.elapsed ?? 0) >= .5)); expect(await countStack(page, "milk_bucket")).toBe(1); await record("actual-released-partial-milk-keeps-container");
    stage = "actual-eye-poison-and-milk-cure";
    await page.evaluate(() => { const g = window.__craft.game!; g.hunger.food = 16; g.hunger.saturation = 0; g.hunger.exhaustion = 0; g.hunger.timer = 0; }); await select("spider_eye"); await look(page, 0, 1.2); await hold(() => page.waitForFunction(() => Boolean(window.__craft.game!.playerStatus.poison), undefined, { timeout: 20_000 })); expect(await countStack(page, "spider_eye")).toBe(0);
    await select("milk_bucket"); const poisoned = await record("genuine-eye-poison-before-milk"); expect(poisoned.status.poison!.remaining).toBeGreaterThan(2.2);
    let preCompletionHealth: number | null = null;
    await hold(async () => { await page.waitForFunction(() => ((window.__craft.game! as unknown as { drinkOwner: { elapsed: number } | null }).drinkOwner?.elapsed ?? 0) >= 1.1, undefined, { timeout: 20_000 }); const mid = await record("real-milk-hold-before-completion-poison-still-active"); expect(mid.status.poison!.remaining).toBeGreaterThan(1); preCompletionHealth = mid.health; await page.waitForFunction(() => window.__craft.game!.inventory.selectedStack()?.id === window.__craft.stackId("bucket"), undefined, { timeout: 20_000 }); });
    const cured = await record("actual-milk-cleared-poison-and-returned-bucket"); expect(cured.status).toEqual({}); expect({ food: cured.hunger.food, saturation: cured.hunger.saturation, exhaustion: cured.hunger.exhaustion }).toEqual({ food: poisoned.hunger.food, saturation: poisoned.hunger.saturation, exhaustion: poisoned.hunger.exhaustion }); expect(cured.health).toBeLessThanOrEqual(preCompletionHealth!); expect(await countStack(page, "milk_bucket")).toBe(0); expect(await countStack(page, "bucket")).toBe(1); await expect(page.locator(".player-status")).toBeHidden(); await snap(page, info, "milk-clears-genuine-poison-before-natural-expiry-and-returns-bucket");
    stage = "cow-refill-and-cold"; const stopAgain = await approachCow(); try { await use(); await expect.poll(() => countStack(page, "milk_bucket")).toBe(1); } finally { await stopAgain(); }
    await pause(); const validRaw = await quitPaused(); const validSave = JSON.parse(validRaw); expect(validSave.mobs.records.find((m: { id: number }) => m.id === cowId).cowState).toEqual({ lifeStage: "adult" });
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); expect(await countStack(page, "milk_bucket")).toBe(1); expect(await page.evaluate(id => window.__craft.game!.mobs.mobs.filter(m => m.id === id && m.kind === "cow").length, cowId)).toBe(1); expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]); await record("actual-adult-cow-and-refilled-container-cold-restored");
    await pause(); const restoredValidRaw = await quitPaused();
    const corruptAndOpen = async (kind: "cow" | "milk") => {
      const corrupt = await page.evaluate(({ valid, kind, id }) => { const data = JSON.parse(valid); if (kind === "cow") data.mobs.records.find((m: { id: number }) => m.id === id).cowState = { lifeStage: "baby" }; else { const owner = data.inventory.slots.find((s: { id: number } | null) => s?.id === window.__craft.stackId("milk_bucket")); if (!owner) throw Error("Expected actuallyrefilled Milkowner"); owner.count = 2; } const raw = `\n${JSON.stringify(data, null, 2)}\n`; localStorage.setItem("craft.save.v1", raw); return raw; }, { valid: restoredValidRaw, kind, id: cowId });
      await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await expect(page.locator(".chat-log")).toContainText(kind === "cow" ? "Damaged adult cows" : "Saved data needs attention"); await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 }); return corrupt;
    };
    const backup = async (kind: "cow" | "milk", corrupt: string) => { await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText(kind === "cow" ? "adult cows" : "saved items"); const download = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" })); const file = info.outputPath(`invalid-${kind}-original.json`); await (await download).saveAs(file); expect(JSON.parse(await fs.readFile(file, "utf8")).recoveryOriginalSave).toBe(corrupt); expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt); await snap(page, info, `invalid-${kind}-preserves-exact-original-and-refuses-quit`); };
    stage = "malformed-cow-adult-original"; const cowCorrupt = await corruptAndOpen("cow"), frozen = await record("invalid-cow-adult-stage-frozen"); await command(page, "/give bucket"); await expect(page.locator(".chat-log")).toContainText("Damaged adult cows. Export a backup before using commands");
    await page.waitForTimeout(31_000); expect((await read()).position).toEqual(frozen.position); expect((await read()).inventory).toEqual(frozen.inventory); expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(cowCorrupt); await backup("cow", cowCorrupt);
    // Restore the retained valid bytes only as the setup for a separate corruption case; no product repair is claimed.
    stage = "malformed-milk-owner-original"; const milkCorrupt = await corruptAndOpen("milk"); await command(page, "/give bucket"); await expect(page.locator(".chat-log")).toContainText("Saved items need repair. Export a backup before using commands"); await backup("milk", milkCorrupt);
    await fs.writeFile(info.outputPath("milk-cure-coverage.json"), JSON.stringify({ ironSites, observations, naturalIds, cowId, validSave, errors,
      fixtures: "PreownedIronShovel/Axe/Pickaxe/Furnace/Table/rawEye1; initialworkpadonly, sourcequery siteselection/chatteleport/cameratracking/navigation; food16 inputfixture. NaturalBirch3/Grass+Dirtcover12/Iron3 allreallymined; rawEyeactuallyeaten. No ingot/bucket/Milk/Cow/Poison/cure/RNG/spawntime outcomes granted. SeparatestoredCowbaby/Milkcount2 corruption resetsfromactualvalidretainedsave betweenrounds.",
      actual: ["natural-logfuel", "actualcoverexcavation/naturalIronpickup", "realFurnaceIron3", "realIronVBucket", "productionnaturalCowdoMobSpawning wait≤90s withoutfallback", "liveadultCowactualmilking/healthunchanged", "partialMilkactualreleasecancel", "genuineEyePoison thenMilkclearsbeforeexpiry", "emptyBucketreturn/actualrefill", "CowIDadultstate/Milkowner coldrestore", "rawCownewgate natural31sautosave/command/quitrefusal/exactoriginaldownload", "rawMilkcount owner command/quitrefusal/exactoriginaldownload"],
      notCovered: ["primitive tool/station acquisition orcompleteSurvivalmedicine", "Cowbaby/breeding/climate/nativeweights/lootdistribution", "browserCowdeath/Agent/LeadBalloonjointrefund (engineunitonly)", "nativeEducationgraphics/timing/fullhunger/stack/Creativecalibration", "performance/physicalphone"] }, null, 2));
    expect(errors).toEqual([]); stage = "complete";
  } catch (error) { failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error); throw error; }
  finally { const state = await page.evaluate(() => { const g = window.__craft?.game; return { inventory: g?.inventory.toJSON(), cows: g?.mobs.mobs.filter(m => m.kind === "cow"), status: g?.playerStatus, health: g?.health, loadErrors: g?.loadErrors, saveError: g?.saveError, paused: g?.paused, dead: g?.dead, rawStorage: localStorage.getItem("craft.save.v1") }; }).catch(error => ({ readbackFailure: String(error) })); await fs.writeFile(info.outputPath("milk-cure-final.json"), JSON.stringify({ stage, failure, observations, state, errors }, null, 2)).catch((error: unknown) => console.error(String(error))); }
}
