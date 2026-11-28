import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { bringMob, collectWorldDrops, command, countStack, createWorld, look, parkMouse, snap, trackMob, waitForTerrain } from "./helpers";

/** Flat terrain, idle starting poses, a sword, diamond armor and one refused receiver are fixtures.
 * Every Spider is summoned through chat; damage, random loot, pickup, crafting and saves are real.
 * The bounded loop acquires four strings from actual kills, including legitimate zero rolls. */
export async function spiderStringRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const inv = page.locator(".inventory-screen");
  const observations: unknown[] = [];
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
  const pause = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await expect(page.locator(".pause-screen")).toBeVisible();
  };
  const saveQuit = async () => {
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
    return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!));
  };
  const resume = async (paused = false) => {
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
    await page.waitForFunction(() => Boolean(window.__craft.game));
    if (paused) {
      await pause();
      await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
    } else await waitForTerrain(page);
  };
  await command(page, "/time set day"); await command(page, "/gamerule doDaylightCycle false");
  const origin = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("bedrock"));
      for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    g.inventory.slots.fill(null);
    g.inventory.slots[0] = { id: window.__craft.stackId("diamond_sword"), count: 1 };
    g.inventory.slots[1] = { id: window.__craft.stackId("cobblestone"), count: 1 };
    for (const [i, name] of ["diamond_helmet", "diamond_chestplate", "diamond_leggings", "diamond_boots"].entries())
      g.inventory.slots[i + 2] = { id: window.__craft.stackId(name), count: 1 };
    return { x: x + .5, y: floor + 1, z: z + .5 };
  });
  await command(page, `/tp ${origin.x} ${origin.y} ${origin.z}`);
  // Preowned starter armor is equipped through the actual UI; real damage and durability remain active.
  if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
  for (const [i, slot] of ["head", "chest", "legs", "feet"].entries()) {
    await press(inv.locator(`[data-slot="${i + 2}"]`)); await press(inv.locator(`[data-equipment="${slot}"]`));
    await expect(inv.locator(`[data-equipment="${slot}"] img`)).toHaveCount(1);
  }
  await press(page.getByRole("button", { name: "Close inventory" }));
  const selectSword = async () => {
    const slot = await slotOf("diamond_sword"); expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`)); else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
  };
  const summon = async () => {
    await command(page, "/summon spider");
    return page.evaluate(() => {
      const g = window.__craft.game!, m = g.mobs.mobs.at(-1)!;
      if (m.kind !== "spider") throw Error("Chat did not summon a Spider");
      return m.id;
    });
  };
  const alive = (id: number) => page.evaluate(i => window.__craft.game!.mobs.mobs.some(m => m.id === i), id);
  const hit = async (id: number) => {
    await selectSword(); await look(page, 0, 0); await bringMob(page, id);
    const stop = await trackMob(page, id);
    try {
      await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(id);
      const before = await page.evaluate(i => ({ health: window.__craft.game!.mobs.mobs.find(m => m.id === i)!.health, attempts: (window as unknown as { __spiderRefusal?: { attempts: unknown[][] } }).__spiderRefusal?.attempts.length ?? 0 }), id);
      const vp = page.viewportSize()!;
      try {
        if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 113 }] });
        else await page.mouse.down({ button: "left" });
        await page.waitForFunction(({ id, before }) => {
          const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id);
          const attempts = (window as unknown as { __spiderRefusal?: { attempts: unknown[][] } }).__spiderRefusal?.attempts.length ?? 0;
          return !m || m.health < before.health || attempts > before.attempts;
        }, { id, before }, { polling: "raf", timeout: 15_000 });
      } finally {
        // Release before any result RPC; a refused fatal hit legitimately restores health to1.
        if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        else await page.mouse.up({ button: "left" });
      }
      observations.push(await page.evaluate(i => {
        const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === i);
        return { id: i, health: m?.health ?? null, anger: m?.spiderAngerSeconds ?? null, playerHealth: g.health, equipment: structuredClone(g.inventory.equipment), dead: g.dead, position: { ...g.body.position }, yaw: g.body.yaw, pitch: g.body.pitch };
      }, id));
    } finally { await stop(); }
  };
  const firstId = await summon();
  await page.evaluate(id => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!, p = g.body.position;
    m.position = { x: p.x, y: p.y, z: p.z - 1.3 }; m.velocity = { x: 0, y: 0, z: 0 };
    m.walking = false; m.thinkTimer = 60; // Initial idle pose only, ordinary simulation remains active.
  }, firstId);
  await expect.poll(() => page.evaluate(id => { const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!; return g.mobs.effectiveLight(m, 1); }, firstId)).toBeGreaterThanOrEqual(8);
  const neutralHealth = await page.evaluate(() => window.__craft.game!.health);
  await page.waitForTimeout(1250);
  expect(await page.evaluate(() => window.__craft.game!.health)).toBe(neutralHealth);
  expect(await page.evaluate(id => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, firstId)).toBe(16);
  // Step the viewing position back with real chat input after the neutrality observations.
  await command(page, `/tp ${origin.x} ${origin.y} ${origin.z + 2}`);
  await look(page, 0, -.34); // Full low body and legs; the next hit resets camera and reach fixture.
  await snap(page, info, "original-eight-leg-spider-neutral-in-daylight");
  await hit(firstId);
  const angerSave = await saveQuit();
  const savedSpider = angerSave.mobs.records.find((m: { id: number }) => m.id === firstId);
  expect(savedSpider.health).toBeGreaterThan(0); expect(savedSpider.health).toBeLessThan(16);
  expect(savedSpider.spiderAngerSeconds).toBeGreaterThan(0); expect(savedSpider.spiderAngerSeconds).toBeLessThanOrEqual(10);
  await resume(true);
  const restored = await page.evaluate(id => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!;
    return { id: m.id, kind: m.kind, health: m.health, anger: m.spiderAngerSeconds, model: (g.mobs as unknown as { models: Map<number, { children: unknown[] }> }).models.get(id)?.children.length };
  }, firstId);
  expect(restored.kind).toBe("spider"); expect(restored.health).toBe(savedSpider.health);
  expect(restored.anger).toBeGreaterThan(0); expect(restored.anger).toBeLessThanOrEqual(savedSpider.spiderAngerSeconds);
  expect(restored.model).toBe(11);
  await press(page.getByRole("button", { name: "Back to Game", exact: true }));
  await page.evaluate(() => {
    const store = window.__craft.game!.worldDrops, original = store.planSpawnBatch.bind(store);
    const w = window as unknown as { __spiderRefusal: { attempts: unknown[][]; restore: () => void } };
    w.__spiderRefusal = { attempts: [], restore: () => { store.planSpawnBatch = original; } };
    store.planSpawnBatch = stacks => { w.__spiderRefusal.attempts.push([...structuredClone(stacks)]); return null; };
  });
  for (let i = 0; i < 4; i++) {
    if (await page.evaluate(() => (window as unknown as { __spiderRefusal: { attempts: unknown[][] } }).__spiderRefusal.attempts.length)) break;
    await hit(firstId);
  }
  const refused = await page.evaluate(id => ({ health: window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, attempts: (window as unknown as { __spiderRefusal: { attempts: unknown[][] } }).__spiderRefusal.attempts, ground: window.__craft.game!.worldDrops.records }), firstId);
  expect(refused.health).toBe(1); expect(refused.attempts).toHaveLength(1); expect(refused.ground).toEqual([]);
  const rolled = refused.attempts[0] as { id: number; count: number }[];
  expect(rolled.length).toBeLessThanOrEqual(2);
  const stringId = 806, eyeId = 829;
  expect(rolled.map(s => s.id)).toEqual([stringId, eyeId].filter(id => rolled.some(s => s.id === id)));
  for (const stack of rolled) { expect([stringId, eyeId]).toContain(stack.id); expect(stack.count).toBeGreaterThanOrEqual(1); expect(stack.count).toBeLessThanOrEqual(stack.id === stringId ? 2 : 1); }
  const pendingSave = await saveQuit(); expect(pendingSave.mobs.records.find((m: { id: number }) => m.id === firstId).pendingLoot).toEqual(rolled);
  await resume(); await hit(firstId); expect(await alive(firstId)).toBe(false);
  const firstGround = await page.evaluate(() => window.__craft.game!.worldDrops.records.map(r => r.stack));
  expect(firstGround).toEqual(rolled); await collectWorldDrops(page);
  // At most24additional genuine kills; zero is valid loot, this is an acquisition loop, not a test retry.
  const kills: { id: number; count: number }[] = [{ id: firstId, count: rolled.filter(s => s.id === stringId).reduce((n, s) => n + s.count, 0) }];
  for (let i = 0; i < 24 && await countStack(page, "string") < 4; i++) {
    const before = await countStack(page, "string"), id = await summon();
    for (let swing = 0; swing < 4 && await alive(id); swing++) await hit(id);
    expect(await alive(id)).toBe(false); await collectWorldDrops(page);
    const count = await countStack(page, "string") - before;
    expect(count).toBeGreaterThanOrEqual(0); expect(count).toBeLessThanOrEqual(2); kills.push({ id, count });
  }
  const strings = await countStack(page, "string"); expect(strings).toBeGreaterThanOrEqual(4);
  expect(await page.evaluate(() => window.__craft.game!.dead)).toBe(false);
  await snap(page, info, "actual-spider-kills-produce-range-bounded-strings");
  if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
  await expect(inv.locator("[data-craft]")).toHaveCount(4);
  const stringSlot = await slotOf("string"); await press(inv.locator(`[data-slot="${stringSlot}"]`));
  for (const cell of [0, 1, 2]) await press(inv.locator(`[data-craft="${cell}"]`));
  await expect(inv.locator("[data-craft-result] img")).toHaveCount(0);
  await press(inv.locator('[data-craft="3"]'));
  if (strings > 4) await press(inv.locator(`[data-slot="${stringSlot}"]`));
  const result = inv.locator("[data-craft-result] img"); await expect(result).toHaveAttribute("alt", "White Wool");
  const filler = await slotOf("cobblestone"); await press(inv.locator(`[data-slot="${filler}"]`));
  const pending = () => page.evaluate(() => (window.__craft.game! as unknown as { inventoryScreen: { pendingItems(): unknown[] } }).inventoryScreen.pendingItems());
  const beforeRefusal = await pending(); await press(inv.locator("[data-craft-result]")); expect(await pending()).toEqual(beforeRefusal);
  expect(await countStack(page, "white_wool")).toBe(0); await press(inv.locator(`[data-slot="${filler}"]`));
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded();
  await snap(page, info, "four-acquired-strings-white-wool-preview-refuses-incompatible-cursor");
  await press(inv.locator("[data-craft-result]")); await press(inv.locator(`[data-slot="${await empty()}"]`));
  expect(await countStack(page, "white_wool")).toBe(1); expect(await countStack(page, "string")).toBe(strings - 4);
  await press(page.getByRole("button", { name: "Close inventory" }));
  const craftedSave = await saveQuit(); await resume();
  expect(await countStack(page, "white_wool")).toBe(1); expect(await countStack(page, "string")).toBe(strings - 4);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  // Retain a new living actor, then damage only the stored timer to exercise original-save protection.
  const corruptId = await summon(); const beforeCorruption = await saveQuit();
  const corrupt = await page.evaluate(id => {
    const data = JSON.parse(localStorage.getItem("craft.save.v1")!); data.mobs.records.find((m: { id: number }) => m.id === id).spiderAngerSeconds = 11;
    const raw = JSON.stringify(data); localStorage.setItem("craft.save.v1", raw); return raw;
  }, corruptId);
  await resume(); await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("creatures");
  expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
  const downloaded = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" }));
  const backup = info.outputPath("invalid-spider-anger-original.json"); await (await downloaded).saveAs(backup);
  expect(JSON.parse(await fs.readFile(backup, "utf8")).recoveryOriginalSave).toBe(corrupt);
  await snap(page, info, "invalid-spider-timer-preserves-original-save-and-backup");
  await fs.writeFile(info.outputPath("spider-string-coverage.json"), JSON.stringify({ fixtures: "Bedrock pad, preowned sword/cobblestone/diamondarmor (actually equipped through UI), initial idle pose and helper bring-near/camera tracking; real chat summons; one refused sink; final stored invalidtimer11. No injected string/wool/health/damage/loot rolls and no RNG replacement.", controls: mobile ? "Actual acknowledged CDP touch combat and UI taps" : "Mouse combat and UI clicks", neutralHealth, savedSpider, restored, refused, rolled, pendingSave, firstGround, kills, stringsBeforeCraft: strings, craftedSave, beforeCorruption, corruptId, observations, limits: ["ground-walking summon-only Spider", "no native climb/leap/natural spawn/looting; optional player Eye is range-checked, separate Eye route tests consumption", "brightness/anger/speed/damage difficulty calibration remain application model", "wool quantity1 app default, native recipe count omitted", "exact graphics and full ticket remain open", "no performance acceptance"], errors }, null, 2));
  expect(errors).toEqual([]);
}
