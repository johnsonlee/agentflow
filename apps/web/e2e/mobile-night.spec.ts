import { expect, test, type Page } from "@playwright/test";
import {
  blockAt, blockLight, buildDarkRoom, buildWallAhead, command, countStack, craftTorches, createWorld, health, look, mobExists, newestMob, player, settle,
  snap, target, trackMob,
} from "./helpers";

/** Real touch through CDP; the release is sent without waiting for the press to be handled. */
async function finger(page: Page) {
  const session = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchEnd", x = 0, y = 0) =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 11 }] });
  return {
    async tap(x: number, y: number) {
      const down = send("touchStart", x, y);
      await new Promise((r) => setTimeout(r, 60));
      await Promise.all([down, send("touchEnd")]);
    },
  };
}

test.describe("Mobile browser (touch): light and hostile mobs", () => {
  test("survival: craft a torch with taps and light up a dark room", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give coal");
    await command(page, "/give stick");
    await page.getByRole("button", { name: "Open inventory" }).tap();
    await craftTorches(page, (l) => l.tap());
    await page.getByRole("button", { name: "Close inventory" }).tap();
    await expect(page.locator(".inventory-screen")).toBeHidden();

    const p = await player(page);
    const room = await buildDarkRoom(page, Math.floor(p.x), Math.floor(p.z));
    await command(page, `/tp ${room.x + 0.5} ${room.y} ${room.z + 0.5}`);
    await settle(page);
    await page.locator('.hotbar .slot[data-slot="0"]').tap();
    await look(page, 0, -1.2);
    const floor = (await target(page))!;
    const at = { x: floor.x + floor.normal.x, y: floor.y + floor.normal.y, z: floor.z + floor.normal.z };
    expect(await blockLight(page, at.x, at.y, at.z)).toBe(0);
    const vp = page.viewportSize()!;
    await (await finger(page)).tap(vp.width * 0.65, vp.height * 0.45);
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate(() => window.__craft.blockId("torch")));
    expect(await blockLight(page, at.x, at.y, at.z)).toBe(14);
    expect(await blockLight(page, at.x + 1, at.y, at.z)).toBe(13);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "12-touch-torch-lit-room");
  });

  test("survival: a zombie hurts the player and is killed by holding a finger on it with a sword", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give iron_sword");
    await command(page, "/time set night");
    // Face the open beach so the zombie is summoned onto open ground.
    await look(page, 0, 0);
    await command(page, "/summon zombie");
    const id = (await newestMob(page, "zombie"))!;
    await expect.poll(() => health(page), { timeout: 30_000 }).toBeLessThan(20);

    await page.locator('.hotbar .slot[data-slot="0"]').tap();
    const stop = await trackMob(page, id);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "13-touch-zombie");
    // On touch, attacking is press-and-hold on the view (break gesture); the sword hits every 0.4 s.
    const vp = page.viewportSize()!;
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * 0.65, y: vp.height * 0.45, id: 12 }] });
    await expect.poll(() => mobExists(page, id), { timeout: 30_000 }).toBe(false);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await stop();
    await expect(page.locator(".chat-line", { hasText: "Zombie was defeated" })).toHaveCount(1);
    expect(await countStack(page, "rotten_flesh")).toBe(1);
  });

  test("survival: a zombie behind a wall walks around it and reaches the player", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/time set night");
    await look(page, 0, 0);
    const wall = await buildWallAhead(page);
    await command(page, "/summon zombie");
    const id = (await newestMob(page, "zombie"))!;
    expect(await page.evaluate((mid) => window.__craft.game!.mobs.mobs.find((m) => m.id === mid)!.position.z, id)).toBeLessThan(wall.z);
    await expect.poll(() => health(page), { timeout: 60_000 }).toBeLessThan(20);
    await snap(page, testInfo, "14-touch-zombie-around-wall");
  });
});
