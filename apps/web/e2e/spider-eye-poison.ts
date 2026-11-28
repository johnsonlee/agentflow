import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { bringMob, collectWorldDrops, command, countStack, createWorld, look, parkMouse, snap, trackMob } from "./helpers";

/** Fixtures: bedrock pad, preowned sword/armor and idle starting mob pose. Eye rolls, player kills,
 * pickup, held eating, Poison, pause, save/reload and backup are actual production interactions.
 * After acquisition a disclosed health2/food16 fixture isolates nonlethal Poison, never injects an effect. */
export async function spiderEyePoisonRoute(page: Page, info: TestInfo, mobile: boolean) {
  let stage = "create", failure: string | null = null, errors: string[] = [];
  const observations: unknown[] = [], kills: { id: number; acquired: number }[] = [];
  try {
    errors = await createWorld(page, { mode: "survival" });
    const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
    const finger = mobile ? await page.context().newCDPSession(page) : null;
    const read = () => page.evaluate(() => {
      const g = window.__craft.game!;
      return { playerStatus: structuredClone(g.playerStatus), health: g.health, hunger: { ...g.hunger }, inventory: g.inventory.toJSON(),
        position: { ...g.body.position }, dead: g.dead, errors: [...g.loadErrors] };
    });
    const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
    const pause = async () => {
      if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
      await expect(page.locator(".pause-screen")).toBeVisible();
    };
    const quitPaused = async () => {
      await press(page.getByRole("button", { name: "Save & Quit to Title" }));
      await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
      return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!));
    };
    const select = async (name: string) => {
      const slot = await page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
      expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
      if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`)); else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
      await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
    };
    const hold = async (until: () => Promise<unknown>, breaking = false) => {
      const vp = page.viewportSize()!;
      try {
        if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .42, id: 115 }] });
        else await page.mouse.down({ button: breaking ? "left" : "right" });
        await until();
      } finally {
        if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        else await page.mouse.up({ button: breaking ? "left" : "right" });
      }
    };
    await command(page, "/time set day"); await command(page, "/gamerule doDaylightCycle false");
    const origin = await page.evaluate(() => {
      const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
      for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
        g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("bedrock"));
        for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
      }
      g.inventory.slots.fill(null); g.inventory.slots[0] = { id: window.__craft.stackId("diamond_sword"), count: 1 };
      for (const [i, name] of ["diamond_helmet", "diamond_chestplate", "diamond_leggings", "diamond_boots"].entries()) g.inventory.slots[i + 2] = { id: window.__craft.stackId(name), count: 1 };
      return { x: x + .5, y: floor + 1, z: z + .5 };
    });
    await command(page, `/tp ${origin.x} ${origin.y} ${origin.z}`);
    if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
    const inv = page.locator(".inventory-screen");
    for (const [i, name] of ["head", "chest", "legs", "feet"].entries()) {
      await press(inv.locator(`[data-slot="${i + 2}"]`)); await press(inv.locator(`[data-equipment="${name}"]`)); await expect(inv.locator(`[data-equipment="${name}"] img`)).toHaveCount(1);
    }
    await press(page.getByRole("button", { name: "Close inventory" }));
    stage = "actual-player-acquisition";
    for (let attempt = 0; attempt < 24 && await countStack(page, "spider_eye") < 1; attempt++) {
      const before = await countStack(page, "spider_eye"); await command(page, "/summon spider");
      const id = await page.evaluate(() => {
        const g = window.__craft.game!, mob = g.mobs.mobs.at(-1)!, p = g.body.position;
        if (mob.kind !== "spider") throw Error("Expected actual chat Spider summon");
        mob.position = { x: p.x, y: p.y, z: p.z - 1.3 }; mob.velocity = { x: 0, y: 0, z: 0 }; mob.walking = false; mob.thinkTimer = 60;
        return mob.id;
      });
      for (let swing = 0; swing < 4 && await page.evaluate(i => window.__craft.game!.mobs.mobs.some(m => m.id === i), id); swing++) {
        await select("diamond_sword"); await look(page, 0, 0); await bringMob(page, id); const stop = await trackMob(page, id);
        try {
          await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(id);
          const hp = await page.evaluate(i => window.__craft.game!.mobs.mobs.find(m => m.id === i)!.health, id);
          await hold(() => page.waitForFunction(({ id, hp }) => { const m = window.__craft.game!.mobs.mobs.find(m => m.id === id); return !m || m.health < hp; }, { id, hp }, { timeout: 15_000 }), true);
        } finally { await stop(); }
      }
      expect(await page.evaluate(i => window.__craft.game!.mobs.mobs.some(m => m.id === i), id)).toBe(false);
      await collectWorldDrops(page); const acquired = await countStack(page, "spider_eye") - before;
      expect(acquired).toBeGreaterThanOrEqual(0); expect(acquired).toBeLessThanOrEqual(1); kills.push({ id, acquired });
    }
    expect(await countStack(page, "spider_eye")).toBeGreaterThanOrEqual(1); await select("spider_eye"); await look(page, 0, 1.2);
    await record("actual-kill-eye-picked-up"); await snap(page, info, "spider-eye-acquired-by-player-kill-and-ground-pickup");
    stage = "full-hunger-refusal";
    // Fullness is a disclosed input fixture; the acquired item remains the only meal source.
    await page.evaluate(() => { const g = window.__craft.game!; g.hunger.food = 20; g.hunger.saturation = 5; g.hunger.exhaustion = 0; g.hunger.timer = 0; });
    const fullBefore = await read(); await hold(() => page.waitForTimeout(1900)); const fullAfter = await record("full-meal-refused");
    expect(fullAfter.inventory).toEqual(fullBefore.inventory); expect(fullAfter.playerStatus).toEqual({});
    stage = "actual-poison-meal";
    await page.evaluate(() => { const g = window.__craft.game!; g.health = 2; g.hunger.food = 16; g.hunger.saturation = 0; g.hunger.exhaustion = 0; g.hunger.timer = 0; });
    const beforeMeal = await countStack(page, "spider_eye"), armorBefore = await page.evaluate(() => structuredClone(window.__craft.game!.inventory.equipment));
    await hold(() => page.waitForFunction(() => Boolean(window.__craft.game!.playerStatus.poison), undefined, { timeout: 15_000 }));
    expect(await countStack(page, "spider_eye")).toBe(beforeMeal - 1); await expect(page.locator(".hud .hunger")).toHaveAttribute("data-food", "18");
    await expect(page.locator(".player-status")).toContainText("Poison"); await pause();
    const paused = await record("poison-paused-before-save"); expect(paused.playerStatus.poison!.remaining).toBeGreaterThan(0);
    await page.waitForTimeout(1500); expect((await read()).playerStatus).toEqual(paused.playerStatus); expect((await read()).health).toBe(paused.health);
    const saved = await quitPaused(); expect(saved.playerStatus).toEqual(paused.playerStatus);
    stage = "actual-cold-poison-restore";
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await page.waitForFunction(() => Boolean(window.__craft.game)); await pause();
    await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
    const cold = await record("cold-paused-poison"); expect(cold.playerStatus.poison!.remaining).toBeLessThanOrEqual(saved.playerStatus.poison.remaining);
    expect(cold.playerStatus.poison!.remaining).toBeGreaterThan(saved.playerStatus.poison.remaining - 1); expect(cold.errors).toEqual([]);
    await page.waitForTimeout(1000); expect((await read()).playerStatus).toEqual(cold.playerStatus);
    await press(page.getByRole("button", { name: "Back to Game", exact: true })); await snap(page, info, "poison-visible-after-cold-restore-pc-mobile-hud");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.health), { timeout: 10_000 }).toBe(1);
    await page.waitForFunction(() => !window.__craft.game!.playerStatus.poison, undefined, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__craft.game!.health)).toBe(1); expect(await page.evaluate(() => window.__craft.game!.dead)).toBe(false);
    expect(await page.evaluate(() => window.__craft.game!.inventory.equipment)).toEqual(armorBefore); await expect(page.locator(".player-status")).toBeHidden();
    await record("expired-nonlethal-no-armor-wear"); await snap(page, info, "poison-expires-at-half-heart-without-armor-wear");
    await pause(); const expiredSave = await quitPaused(); expect(expiredSave.playerStatus).toBeUndefined();
    stage = "malformed-status-original-recovery";
    const corrupt = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("craft.save.v1")!); data.playerStatus = { poison: { remaining: 5, elapsed: 1.25 } };
      const raw = `\n${JSON.stringify(data, null, 2)}\n`; localStorage.setItem("craft.save.v1", raw); return raw;
    });
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
    await expect(page.locator(".chat-log")).toContainText("Damaged player status");
    await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
    const recoveryBefore = await record("raw-malformed-status-frozen");
    await command(page, "/tp 0 100 0"); await expect(page.locator(".chat-log")).toContainText("Damaged player status. Export a backup before using commands");
    // Wait through the actual production30s autosave interval, no manual save call/timer mutation.
    await page.waitForTimeout(31_000); const recoveryAfter = await record("natural-autosave-refused");
    expect(recoveryAfter.position).toEqual(recoveryBefore.position); expect(recoveryAfter.health).toBe(recoveryBefore.health); expect(recoveryAfter.inventory).toEqual(recoveryBefore.inventory);
    expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("player status");
    const download = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" }));
    const backup = info.outputPath("invalid-poison-phase-original.json"); await (await download).saveAs(backup);
    expect(JSON.parse(await fs.readFile(backup, "utf8")).recoveryOriginalSave).toBe(corrupt); expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
    await snap(page, info, "invalid-poison-phase-preserves-original-save-and-download");
    await fs.writeFile(info.outputPath("spider-eye-poison-coverage.json"), JSON.stringify({ kills, observations, saved, expiredSave, errors,
      fixtures: "Bedrockpad, preowned sword/armor actually UIequipped, actualchat Spider summon and idlepose, helpers bringnear/track camera/teleport pickup. Fullfood20 fixture, then health2/food16/saturation0 input fixture after genuineEye acquisition. Only after realExpiry/SaveQuit storedstatusphase corrupted to1.25 with preservedwhitespace.",
      actual: ["playerinput kills with natural RNG0..1 Eye", "groundpickup", "fullfood refusal", "actualheld meal oneEye debit", "Poison HUD", "pause timer freeze", "actualSaveQuit/coldrestore", "nonlethal expiry/noarmorwear", "naturalautosave+quit refusal", "exactoriginalrawbackup"],
      notCovered: ["native Education numeric calibration/exactgraphics", "Agent/environment negative loot cases (engineunitonly)", "browser death/respawn clearing (actualhandlerunitonly)", "brewing/medicine completeSurvival acquisition", "performance", "physicalphone"] }, null, 2));
    expect(errors).toEqual([]); stage = "complete";
  } catch (error) { failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error); throw error; }
  finally {
    const state = await page.evaluate(() => { const g = window.__craft?.game; return { status: g?.playerStatus, health: g?.health, paused: g?.paused, dead: g?.dead, position: g?.body.position, loadErrors: g?.loadErrors, saveError: g?.saveError, rawStorage: localStorage.getItem("craft.save.v1") }; }).catch(error => ({ readbackFailure: String(error) }));
    await fs.writeFile(info.outputPath("spider-eye-poison-final.json"), JSON.stringify({ stage, failure, kills, observations, state, errors }, null, 2)).catch((error: unknown) => console.error(String(error)));
  }
}
