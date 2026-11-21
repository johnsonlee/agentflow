import { expect, test } from "@playwright/test";
import { collectWorldDrops,
  blockAt, blockLight, buildDarkRoom, command, countStack, craftTorches, createWorld, health, look, mobExists, newestMob, parkMouse,
  buildWallAhead, player, pressMouse, settle, snap, target, trackMob,
} from "./helpers";

test.describe("PC browser: light and hostile mobs", () => {
  test("survival: craft a torch and light up a dark room", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give coal");
    await command(page, "/give stick");
    await page.keyboard.press("e");
    await craftTorches(page, (l) => l.click());
    await page.keyboard.press("e");
    await expect(page.locator(".inventory-screen")).toBeHidden();
    expect(await countStack(page, "torch")).toBe(4);

    const p = await player(page);
    const room = await buildDarkRoom(page, Math.floor(p.x), Math.floor(p.z));
    await command(page, `/tp ${room.x + 0.5} ${room.y} ${room.z + 0.5}`);
    await settle(page);
    await page.keyboard.press("Digit1");
    await parkMouse(page);
    await look(page, 0, -1.2);
    const floor = (await target(page))!;
    const at = { x: floor.x + floor.normal.x, y: floor.y + floor.normal.y, z: floor.z + floor.normal.z };
    // Sealed underground: no sky light, no block light.
    expect(await page.evaluate(([x, y, z]) => window.__craft.game!.world.getLight(x, y, z), [at.x, at.y, at.z] as const)).toBe(0);
    await snap(page, testInfo, "17-dark-room");

    await pressMouse(page, "right");
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate(() => window.__craft.blockId("torch")));
    expect(await blockLight(page, at.x, at.y, at.z)).toBe(14);
    expect(await blockLight(page, at.x + 1, at.y, at.z)).toBe(13);
    expect(await blockLight(page, at.x, at.y + 2, at.z + 1)).toBe(11);
    expect(await countStack(page, "torch")).toBe(3);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "18-torch-lit-room");
  });

  test("survival: a zombie at night hurts the player, is killed with a sword, and can kill the player", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give iron_sword");
    // Night, so the zombie doesn't burn in the sun.
    await command(page, "/time set night");
    // Finish real weapon/cursor preparation before a living target can attack during UI waits.
    await page.keyboard.press("Digit1");
    await page.waitForFunction(() => window.__craft.game!.inventory.selected === 0 &&
      window.__craft.game!.inventory.selectedStack()?.id === window.__craft.stackId("iron_sword"));
    await parkMouse(page);
    await command(page, "/summon zombie");
    const id = (await newestMob(page, "zombie"))!;
    expect(id).not.toBeNull();
    const observations: unknown[] = [];
    const combatState = () => page.evaluate(mobId => {
      const g = window.__craft.game, mob = g?.mobs.mobs.find(m => m.id === mobId);
      return { at: performance.now(), exists: !!g, health: g?.health ?? 0, yaw: g?.body.yaw ?? null,
        pitch: g?.body.pitch ?? null, target: g?.targetMob?.id ?? null, mobHealth: mob?.health ?? null,
        mobPosition: mob ? { ...mob.position } : null, selected: g?.inventory.selected ?? null,
        selectedStack: g?.inventory.selectedStack() ? { ...g.inventory.selectedStack()! } : null,
        dead: g?.dead ?? null, paused: g?.paused ?? null };
    }, id);
    // Camera-only tracking starts before the first real hit; neither actor nor health is changed.
    const stop = await trackMob(page, id);
    let combatFailed = false;
    try {
      // It walks up and hits: health drops (3 per hit).
      await expect.poll(() => health(page), { timeout: 30_000 }).toBeLessThan(20);
      await expect(page.locator(".chat-line", { hasText: "Zombie hit you" }).first()).toBeVisible();

      // Fight back with the iron sword (7 damage; a zombie has 20 HP).
      for (let i = 0; i < 30 && (await mobExists(page, id)); i++) {
        // Refuse a stale combat action instead of accidentally clicking a newly opened death menu.
        const state = await combatState(); observations.push({ phase: "before-real-attack", attempt: i, ...state });
        const ready = state.exists && state.health > 0 && Number.isFinite(state.yaw) && Number.isFinite(state.pitch) && state.target === id;
        expect(ready, "Living player with a finite camera and the actual zombie under the crosshair").toBe(true);
        await expect(page.getByRole("heading", { name: "You died!" })).toHaveCount(0);
        await pressMouse(page, "left");
        await page.waitForTimeout(450);
      }
    } catch (error) {
      combatFailed = true;
      throw error;
    } finally {
      // Preserve the combat failure even if a crashed page cannot supply final diagnostics.
      const cleanupErrors: string[] = [];
      try { observations.push({ phase: "after-combat-or-refusal", ...await combatState() }); }
      catch (error) { const message = String(error); cleanupErrors.push(message); observations.push({ phase: "final-readback-failed", message }); }
      try { await stop(); }
      catch (error) { const message = String(error); cleanupErrors.push(message); observations.push({ phase: "tracker-cleanup-failed", message }); }
      try {
        await testInfo.attach("actual-night-combat-observations", { body: JSON.stringify({ observations, cleanupErrors,
          fixture: "Preowned sword and existing camera-only tracker; real cursor/tool preparation precedes summon. First combat assigns no health, mob, damage, RNG or clock outcome. The later health3 death setup is retained separately." }), contentType: "application/json" });
      } catch (error) { cleanupErrors.push(String(error)); console.error("Night combat diagnostics attachment failed", String(error)); }
      if (!combatFailed && cleanupErrors.length > 0) throw new Error(`Night combat diagnostics failed: ${cleanupErrors.join("; ")}`);
    }
    expect(await mobExists(page, id)).toBe(false);
    await expect(page.locator(".chat-line", { hasText: "Zombie was defeated" })).toHaveCount(1);
    await snap(page, testInfo, "19-zombie-defeated-after-real-combat");
    await collectWorldDrops(page); // Ground pickup happens after combat and its real feedback.
    const rolledFlesh = await countStack(page, "rotten_flesh");
    expect(Number.isInteger(rolledFlesh)).toBe(true); expect(rolledFlesh).toBeGreaterThanOrEqual(0); expect(rolledFlesh).toBeLessThanOrEqual(2);
    await testInfo.attach("actual-zombie-base-loot-roll", { body: JSON.stringify({ rotten_flesh: rolledFlesh, range: [0, 2], rng: "uncontrolled session roll" }), contentType: "application/json" });

    // A zombie can kill the player; respawning restores health.
    // Wherever the fight left the player facing: /summon picks reachable ground and zombies path-find.
    await page.evaluate(() => {
      window.__craft.game!.health = 3; // test setup: one hit from death
    });
    await command(page, "/summon zombie");
    await expect(page.getByRole("heading", { name: "You died!" })).toBeVisible({ timeout: 30_000 });
    await snap(page, testInfo, "20-killed-by-zombie");
    await page.getByRole("button", { name: "Respawn" }).click();
    await expect(page.getByRole("heading", { name: "You died!" })).toBeHidden();
    expect(await health(page)).toBe(20);
  });

  test("survival: a zombie behind a wall walks around it and reaches the player (path-finding)", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/time set night");
    await look(page, 0, 0);
    const wall = await buildWallAhead(page);
    await command(page, "/summon zombie");
    const id = (await newestMob(page, "zombie"))!;
    // Summoned 3 blocks ahead: behind the 2-high wall.
    const z0 = await page.evaluate((mid) => window.__craft.game!.mobs.mobs.find((m) => m.id === mid)!.position.z, id);
    expect(z0).toBeLessThan(wall.z);
    await page.waitForTimeout(500);
    await snap(page, testInfo, "21-zombie-behind-wall");
    await expect.poll(() => health(page), { timeout: 60_000 }).toBeLessThan(20);
    await expect(page.locator(".chat-line", { hasText: "Zombie hit you" }).first()).toBeVisible();
    // It came around the wall, not through it.
    expect(await blockAt(page, wall.x0, wall.y0, wall.z)).toBe(await page.evaluate(() => window.__craft.blockId("stone")));
  });
});
