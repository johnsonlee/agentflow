import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aimAtTop, blockAt, collectWorldDrops, command, countStack, createWorld, lookAtCell, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Seed12345 sites were selected by read-only generator search, then every source block is checked.
 * Only preowned tools/stations, a work pad and later full-bag filler are fixtures. No sand, fuel,
 * glass, bottle or fill outcome is granted. Teleports/camera positioning are disclosed navigation. */
export async function bottleWaterRoute(page: Page, info: TestInfo, mobile: boolean) {
  let errors: string[] = [], stage = "create", failure: string | null = null;
  const observations: unknown[] = [];
  const tree = { x: -62, y: 32, z: -54, stand: { x: -59.5, y: 32, z: -53.5 } };
  const shore = { stand: { x: -127.5, y: 31, z: -101.5 }, water: { x: -130, y: 30, z: -100 }, sand: [{ x: -130, y: 30, z: -104 }, { x: -130, y: 30, z: -103 }, { x: -130, y: 30, z: -102 }] };
  try {
    errors = await createWorld(page, { mode: "survival", seed: "12345" });
    const press = (locator: Locator) => mobile ? locator.tap() : locator.click(), inv = page.locator(".inventory-screen");
    const finger = mobile ? await page.context().newCDPSession(page) : null;
    const touch = (type: "touchStart" | "touchEnd") => {
      const vp = page.viewportSize()!;
      return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .42, id: 117 }] });
    };
    const use = async () => {
      if (mobile) { const vp = page.viewportSize()!; await page.touchscreen.tap(vp.width * .65, vp.height * .42); }
      else await pressMouse(page, "right");
    };
    const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
    const emptySlot = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
    const select = async (name: string) => {
      const i = await slotOf(name); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9);
      if (mobile) await press(page.locator(`.hotbar [data-slot="${i}"]`)); else { await page.keyboard.press(`Digit${i + 1}`); await parkMouse(page); }
      await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i);
    };
    const teleport = async (p: { x: number; y: number; z: number }) => { await command(page, `/tp ${p.x} ${p.y} ${p.z}`); await waitForTerrain(page); };
    const open = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE"); await expect(inv).toBeVisible(); };
    const close = async () => { await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden(); };
    const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
    const saveQuit = async () => { await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible(); return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!)); };
    const read = () => page.evaluate(() => {
      const g = window.__craft.game!;
      return { inventory: g.inventory.toJSON(), ground: structuredClone(g.worldDrops.records), hunger: { ...g.hunger }, status: structuredClone(g.playerStatus), errors: [...g.loadErrors], position: { ...g.body.position } };
    });
    const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
    const bottleCounts = () => page.evaluate(() => {
      const g = window.__craft.game!, empty = window.__craft.stackId("glass_bottle"), water = window.__craft.stackId("water_bottle");
      const stacks = [...g.inventory.slots.filter(s => s !== null), ...g.worldDrops.records.map(r => r.stack)];
      return { empty: stacks.filter(s => s.id === empty).reduce((n, s) => n + s.count, 0), water: stacks.filter(s => s.id === water).reduce((n, s) => n + s.count, 0) };
    });
    const pad = await page.evaluate(() => {
      const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), y = Math.floor(p.y + .01) - 1, z = Math.floor(p.z);
      for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
        g.world.setBlock(x + dx, y, z + dz, window.__craft.blockId("bedrock"));
        for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, y + dy, z + dz, 0);
      }
      g.inventory.slots.fill(null);
      for (const [i, name] of ["iron_shovel", "iron_axe", "furnace", "crafting_table"].entries()) g.inventory.slots[i] = { id: window.__craft.stackId(name), count: 1 };
      return { x, y, z, origin: { x: x + .5, y: y + 1, z: z + .5 } };
    });
    const mine = async (p: { x: number; y: number; z: number }, tool: string, collect = true) => {
      await select(tool); await lookAtCell(page, p.x, p.y, p.z); await expect.poll(() => target(page)).toMatchObject(p);
      try { if (mobile) await touch("touchStart"); else await page.mouse.down(); await page.waitForFunction(c => window.__craft.game!.world.getBlock(c.x, c.y, c.z) === 0, p, { timeout: 30_000 }); }
      finally { if (mobile) await touch("touchEnd"); else await page.mouse.up(); }
      if (collect) await collectWorldDrops(page);
    };
    stage = "natural-log-fuel"; await teleport(tree.stand);
    const naturalLogs = [0, 1, 2].map(dy => ({ x: tree.x, y: tree.y + dy, z: tree.z }));
    for (const cell of naturalLogs) { expect(await blockAt(page, cell.x, cell.y, cell.z)).toBe(await page.evaluate(() => window.__craft.blockId("birch_log"))); await mine(cell, "iron_axe", false); }
    // Clear the whole three-log body volume through actual mining before seeking a supported pickup pose.
    // The original dirt beneath the trunk remains; no terrain or item outcome is injected.
    await collectWorldDrops(page);
    expect(await countStack(page, "birch_log")).toBeGreaterThanOrEqual(3); await record("three-natural-logs-for-fuel");
    stage = "natural-sand"; await teleport(shore.stand);
    for (const cell of shore.sand) { expect(await blockAt(page, cell.x, cell.y, cell.z)).toBe(await page.evaluate(() => window.__craft.blockId("sand"))); await mine(cell, "iron_shovel"); }
    expect(await countStack(page, "sand")).toBeGreaterThanOrEqual(3); await snap(page, info, "natural-shore-sand-and-tree-fuel-actually-harvested"); await record("natural-sand-and-fuel-acquired");
    stage = "actual-furnace-glass"; await teleport(pad.origin);
    // Work-area taps split exact3 from the actually acquired sources; any collateral harvest stays owned.
    const isolateThree = async (name: string) => {
      await open(); const source = await slotOf(name); await press(inv.locator(`[data-slot="${source}"]`));
      for (let i = 0; i < 3; i++) await press(inv.locator('[data-craft="0"]'));
      if (await inv.locator('[data-testid="cursor"]').textContent()) await press(inv.locator(`[data-slot="${source}"]`));
      await press(inv.locator('[data-craft="0"]')); const destination = await emptySlot(); await press(inv.locator(`[data-slot="${destination}"]`)); await close();
      return destination;
    };
    const sandSlot = await isolateThree("sand"), logSlot = await isolateThree("birch_log");
    const placeStation = async (name: string, title: string, p: { x: number; y: number; z: number }) => {
      await select(name); await aimAtTop(page, p.x, p.y - 1, p.z); await target(page); await use(); await expect.poll(() => blockAt(page, p.x, p.y, p.z)).toBe(await page.evaluate(n => window.__craft.blockId(n), name));
      await page.waitForTimeout(300); await lookAtCell(page, p.x, p.y, p.z); await use(); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    };
    await placeStation("furnace", "Furnace", { x: pad.x, y: pad.y + 1, z: pad.z - 3 });
    await press(inv.locator(`[data-slot="${sandSlot}"]`)); await press(inv.locator('[data-furnace="input"]'));
    await press(inv.locator(`[data-slot="${logSlot}"]`)); await press(inv.locator('[data-furnace="fuel"]'));
    await page.waitForFunction(() => [...window.__craft.game!.furnaces.values()].some(f => f.output?.id === window.__craft.stackId("glass") && f.output.count === 3 && f.input === null), undefined, { timeout: 100_000 });
    await expect(inv.locator('[data-furnace="output"] img')).toHaveAttribute("alt", "Glass");
    await press(inv.locator('[data-furnace="output"]')); await press(inv.locator(`[data-slot="${await emptySlot()}"]`)); expect(await countStack(page, "glass")).toBe(3); await snap(page, info, "three-glass-smelted-from-natural-sand-with-natural-log-fuel"); await close();
    stage = "three-bottle-V-craft"; await placeStation("crafting_table", "Crafting Table", { x: pad.x + 3, y: pad.y + 1, z: pad.z });
    await press(inv.locator(`[data-slot="${await slotOf("glass")}"]`)); await press(inv.locator('[data-craft="0"]')); await press(inv.locator('[data-craft="2"]'));
    await expect(inv.locator('[data-craft-result] img')).toHaveCount(0); await press(inv.locator('[data-craft="4"]'));
    await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Glass Bottle"); await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "three-glass-V-recipe-produces-three-empty-bottles");
    await press(inv.locator('[data-craft-result]')); await press(inv.locator(`[data-slot="${await emptySlot()}"]`)); expect(await countStack(page, "glass_bottle")).toBe(3); expect(await countStack(page, "glass")).toBe(0); await close();
    stage = "natural-water-capacity-refusal";
    await page.evaluate(() => { const g = window.__craft.game!; for (let i = 0; i < 36; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { id: window.__craft.stackId("cobblestone"), count: 64 }; });
    await teleport(shore.stand); await select("glass_bottle"); await lookAtCell(page, shore.water.x, shore.water.y, shore.water.z);
    const waterId = await blockAt(page, shore.water.x, shore.water.y, shore.water.z); expect(waterId).toBe(await page.evaluate(() => window.__craft.blockId("water")));
    const refusedBefore = await read(); await use(); await expect(page.locator(".chat-log")).toContainText("Make room for a Water Bottle before filling one."); const refusedAfter = await record("stacked-full-bag-refused"); expect(refusedAfter.inventory).toEqual(refusedBefore.inventory); expect(await bottleCounts()).toEqual({ empty: 3, water: 0 });
    // Free exactly one bag cell by actually dropping filler far from the natural shore.
    await teleport(pad.origin); await open(); const filler = await slotOf("cobblestone"); await press(inv.locator(`[data-slot="${filler}"]`)); await press(page.getByRole("button", { name: "Drop held item", exact: true })); await close();
    await teleport(shore.stand); await select("glass_bottle"); await lookAtCell(page, shore.water.x, shore.water.y, shore.water.z); await use();
    await expect.poll(() => countStack(page, "water_bottle")).toBe(1); expect(await countStack(page, "glass_bottle")).toBe(2); expect(await bottleCounts()).toEqual({ empty: 2, water: 1 }); expect(await blockAt(page, shore.water.x, shore.water.y, shore.water.z)).toBe(waterId); await snap(page, info, "actual-water-fill-preserves-empty-remainder-and-water-source");
    stage = "full-bag-singleton-fill"; await teleport(pad.origin); await open();
    const emptyBottleSlot = await slotOf("glass_bottle"); await press(inv.locator(`[data-slot="${emptyBottleSlot}"]`)); await press(inv.locator('[data-craft="0"]')); await press(page.getByRole("button", { name: "Drop held item", exact: true }));
    await press(inv.locator('[data-craft="0"]')); await press(inv.locator(`[data-slot="${emptyBottleSlot}"]`)); await close();
    await teleport(shore.stand); await select("glass_bottle"); expect(await page.evaluate(() => window.__craft.game!.inventory.slots.every(Boolean))).toBe(true); await lookAtCell(page, shore.water.x, shore.water.y, shore.water.z); await use();
    await expect.poll(() => countStack(page, "water_bottle")).toBe(2); expect(await countStack(page, "glass_bottle")).toBe(0); expect(await bottleCounts()).toEqual({ empty: 1, water: 2 }); expect(await blockAt(page, shore.water.x, shore.water.y, shore.water.z)).toBe(waterId); await record("singleton-full-bag-filled"); await snap(page, info, "singleton-water-bottle-succeeds-in-full-bag");
    stage = "filled-drop-and-cold-save"; await teleport({ x: pad.origin.x + 3, y: pad.origin.y, z: pad.origin.z + 3 }); await open();
    await press(inv.locator(`[data-slot="${await slotOf("water_bottle")}"]`)); await press(page.getByRole("button", { name: "Drop held item", exact: true })); await close(); await teleport(shore.stand);
    expect(await countStack(page, "water_bottle")).toBe(1); expect(await bottleCounts()).toEqual({ empty: 1, water: 2 }); const saved = await saveQuit();
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); expect(await bottleCounts()).toEqual({ empty: 1, water: 2 }); expect(await countStack(page, "water_bottle")).toBe(1); expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]); await record("filled-ground-and-bag-cold-restored");
    const validFinal = await saveQuit();
    stage = "malformed-filled-original-recovery";
    const corrupt = await page.evaluate(() => { const data = JSON.parse(localStorage.getItem("craft.save.v1")!); const water = window.__craft.stackId("water_bottle"), owner = data.inventory.slots.find((s: { id: number } | null) => s?.id === water); if (!owner) throw Error("Expected actualfilled bagowner"); owner.count = 2; const raw = `\n${JSON.stringify(data, null, 2)}\n`; localStorage.setItem("craft.save.v1", raw); return raw; });
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await expect(page.locator(".chat-log")).toContainText("Saved data needs attention"); await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
    const recovery = await record("malformed-filled-count-frozen"); await command(page, "/tp 0 100 0"); await expect(page.locator(".chat-log")).toContainText("Saved items need repair. Export a backup before using commands");
    await page.waitForTimeout(31_000); expect((await read()).inventory).toEqual(recovery.inventory); expect((await read()).position).toEqual(recovery.position); expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("saved items");
    const download = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" })); const backup = info.outputPath("invalid-water-bottle-count-original.json"); await (await download).saveAs(backup); expect(JSON.parse(await fs.readFile(backup, "utf8")).recoveryOriginalSave).toBe(corrupt); expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt); await snap(page, info, "invalid-filled-bottle-count-preserves-original-and-backup");
    await fs.writeFile(info.outputPath("bottle-water-coverage.json"), JSON.stringify({ tree, shore, observations, saved, validFinal, errors,
      fixtures: "PreownedIronShovel/Axe/Furnace/CraftingTable, initialbedrockworkpad, latercobblestonefullbagfiller; generatorseed12345 read-onlysiteselection andchatteleports/camera/pickuphelpers. NaturalLog3/Sand3 actuallyharvested; no sand/fuel/glass/bottle/filleffect injected.",
      actual: ["natural-logfuel andSandharvest", "realplacedFurnace30sGlass3", "realV3Glass→3bottles", "naturalWater actualPCrightuse/mobilequicktap", "stackfullbagrefusal", "fillerrealDrop frees1space", "onefill retains2empty", "realUIemptybottlesplit/drop", "singletonfullbagfill", "filledrealDrop/coldbaggroundrestore", "naturalautosave/quitrefusal", "exactoriginalwhitespacerawbackup"],
      notCovered: ["primitive tool/station acquisition orcompleteSurvivalmedicine", "cauldrons/drinking/brewing/Antidote", "source/flowwaterlevel distinctions", "nativeEducation bounds/creativeownership/exactgraphics", "browserActor/fenceocclusion (actualhandlerunitonly)", "performance/physicalphone"] }, null, 2));
    expect(errors).toEqual([]); stage = "complete";
  } catch (error) { failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error); throw error; }
  finally { const state = await page.evaluate(() => { const g = window.__craft?.game; return { inventory: g?.inventory.toJSON(), ground: g?.worldDrops.records, loadErrors: g?.loadErrors, saveError: g?.saveError, paused: g?.paused, dead: g?.dead, rawStorage: localStorage.getItem("craft.save.v1") }; }).catch(error => ({ readbackFailure: String(error) })); await fs.writeFile(info.outputPath("bottle-water-final.json"), JSON.stringify({ stage, failure, observations, state, errors }, null, 2)).catch((error: unknown) => console.error(String(error))); }
}
