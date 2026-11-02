import { expect, test } from "@playwright/test";
import {
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
    await command(page, "/summon zombie");
    const id = (await newestMob(page, "zombie"))!;
    expect(id).not.toBeNull();

    // It walks up and hits: health drops (3 per hit).
    await expect.poll(() => health(page), { timeout: 30_000 }).toBeLessThan(20);
    await expect(page.locator(".chat-line", { hasText: "Zombie hit you" }).first()).toBeVisible();

    // Fight back with the iron sword (7 damage; a zombie has 20 HP).
    await page.keyboard.press("Digit1");
    await parkMouse(page);
    const stop = await trackMob(page, id);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "19-zombie-attack");
    for (let i = 0; i < 30 && (await mobExists(page, id)); i++) {
      await pressMouse(page, "left");
      await page.waitForTimeout(450);
    }
    await stop();
    expect(await mobExists(page, id)).toBe(false);
    await expect(page.locator(".chat-line", { hasText: "Zombie was defeated" })).toHaveCount(1);
    expect(await countStack(page, "rotten_flesh")).toBe(1);

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
