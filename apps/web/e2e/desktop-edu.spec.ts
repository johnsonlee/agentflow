import { expect, test } from "@playwright/test";
import { blockAt, bringMob, command, countItem, createWorld, look, mobExists, newestMob, parkMouse, pressMouse, settle, snap, target, trackMob, waitForTerrain } from "./helpers";

test.describe("PC browser: crafting, mobs and Education Edition features", () => {
  test("survival crafting: planks in the 2x2 grid, then a crafting table that opens a 3x3 grid", async ({ page }, testInfo) => {
    await createWorld(page, { mode: "survival" });
    await command(page, "/give oak_log 2");
    expect(await countItem(page, "oak_log")).toBe(2);

    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    const inv = page.locator(".inventory-screen");
    await expect(inv.locator("[data-craft]")).toHaveCount(4);

    // Log -> 4 planks.
    await inv.locator('[data-slot="0"]').click(); // pick up both logs
    await inv.locator('[data-craft="0"]').click(); // drop one into the grid
    await inv.locator('[data-slot="0"]').click(); // put the remaining log back
    await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Oak Planks");
    await snap(page, testInfo, "07-crafting-planks");
    await inv.locator("[data-craft-result]").click();
    // 4 planks -> crafting table.
    for (let i = 0; i < 4; i++) await inv.locator(`[data-craft="${i}"]`).click();
    await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Crafting Table");
    await inv.locator("[data-craft-result]").click();
    await inv.locator('[data-slot="1"]').click();
    await page.keyboard.press("e");
    await expect(inv).toBeHidden();
    expect(await countItem(page, "crafting_table")).toBe(1);
    expect(await countItem(page, "oak_log")).toBe(1);

    // Place the table and use it.
    await page.keyboard.press("Digit2");
    await parkMouse(page);
    await look(page, 0, -1.2);
    const hit = await target(page);
    const at = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    await pressMouse(page, "right");
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
    await page.waitForTimeout(300);
    await pressMouse(page, "right");
    await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
    await expect(inv.locator("[data-craft]")).toHaveCount(9);
    await snap(page, testInfo, "08-crafting-table");
  });

  test("animals spawn naturally on grassland and wander (doMobSpawning on by default)", async ({ page }, testInfo) => {
    await createWorld(page, { animals: true });
    await expect.poll(() => page.evaluate(() => window.__craft.game!.mobs.animalCount()), { timeout: 30_000 }).toBeGreaterThan(0);
    // Wander AI alternates idling and walking at random, so allow some time for a walk to start.
    const before = await page.evaluate(() => window.__craft.game!.mobs.mobs.map((m) => ({ id: m.id, x: m.position.x, z: m.position.z })));
    await expect
      .poll(
        () =>
          page.evaluate((list) => {
            const mobs = window.__craft.game!.mobs.mobs;
            return list.some((b) => {
              const m = mobs.find((x) => x.id === b.id);
              return m !== undefined && Math.hypot(m.position.x - b.x, m.position.z - b.z) > 0.3;
            });
          }, before),
        { timeout: 20_000 },
      )
      .toBe(true);
    await command(page, "/gamerule doMobSpawning false");
    await expect(page.locator(".chat-line", { hasText: "doMobSpawning is now set to: false" })).toHaveCount(1);
  });

  test("combat: a summoned chicken is targeted and defeated by a real click (no repositioning)", async ({ page }) => {
    await createWorld(page);
    await settle(page);
    await command(page, "/summon chicken");
    const id = (await newestMob(page, "chicken"))!;
    // Let it land, keep the camera on it, and attack with real clicks: creative hand damage (4)
    // defeats a chicken (4 HP) in one hit. The chicken is never moved by the test.
    await page.waitForTimeout(400);
    await parkMouse(page);
    const stopTracking = await trackMob(page, id);
    await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.kind ?? null)).toBe("chicken");
    // It keeps wandering, so a click can land between frames where it slipped off the crosshair.
    for (let i = 0; i < 10 && (await mobExists(page, id)); i++) {
      await pressMouse(page, "left");
      await page.waitForTimeout(500);
    }
    await stopTracking();
    expect(await mobExists(page, id)).toBe(false);
    await expect(page.locator(".chat-line", { hasText: "Chicken was defeated" })).toHaveCount(1);
  });

  test("survival drops: a sheep defeated over several hits drops wool", async ({ page }, testInfo) => {
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/summon sheep");
    const id = (await newestMob(page, "sheep"))!;
    expect(id).not.toBeNull();
    await page.waitForTimeout(400);
    await parkMouse(page);
    const stopTracking = await trackMob(page, id);
    await page.waitForTimeout(200);
    await snap(page, testInfo, "09-sheep");
    for (let i = 0; i < 20 && (await mobExists(page, id)); i++) {
      // A hurt sheep panics and runs out of reach, as in Minecraft. This test covers the multi-hit
      // damage and drop path, so it keeps the sheep in reach; real targeting is covered by the chicken test.
      await bringMob(page, id);
      await page.waitForTimeout(150);
      await pressMouse(page, "left");
      await page.waitForTimeout(450);
    }
    await stopTracking();
    expect(await mobExists(page, id)).toBe(false);
    await expect(page.locator(".chat-line", { hasText: "Sheep was defeated" })).toHaveCount(1);
    expect(await countItem(page, "white_wool")).toBe(1);
  });

  test("Education Edition NPC: talk, edit name and dialogue in creative, and it is saved", async ({ page }, testInfo) => {
    await createWorld(page);
    await settle(page);
    await command(page, "/summon npc Guide");
    const id = (await newestMob(page, "npc"))!;
    await page.waitForTimeout(500);
    await parkMouse(page);
    const stopTracking = await trackMob(page, id);
    await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.kind ?? null)).toBe("npc");
    await pressMouse(page, "right");
    await expect(page.locator(".npc-screen h2")).toHaveText("Guide");
    await stopTracking();
    await snap(page, testInfo, "10-npc-dialog");
    await page.getByLabel("NPC name").fill("Teacher");
    await page.getByLabel("NPC dialogue").fill("Build a house using three different blocks.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".npc-screen")).toBeHidden();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save & Quit to Title" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Continue/ }).click();
    await waitForTerrain(page);
    const npcs = await page.evaluate(() => window.__craft.game!.mobs.mobs.filter((m) => m.kind === "npc").map((m) => [m.name, m.dialogue]));
    expect(npcs).toEqual([["Teacher", "Build a house using three different blocks."]]);
  });

  test("Education Edition Camera & Portfolio: take, caption and delete photos", async ({ page }, testInfo) => {
    await createWorld(page);
    await look(page, 0.4, -0.1);
    await page.keyboard.press("c");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.portfolio.photos.length)).toBe(1);
    await page.keyboard.press("p");
    await expect(page.getByRole("heading", { name: "Portfolio (1)" })).toBeVisible();
    const img = page.locator(".photo-card img");
    await expect(img).toHaveCount(1);
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(480);
    await page.getByLabel("Photo caption").fill("Our forest biome");
    await page.getByLabel("Photo caption").press("Tab");
    expect(await page.evaluate(() => window.__craft.game!.portfolio.photos[0].caption)).toBe("Our forest biome");
    await snap(page, testInfo, "11-portfolio");
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Portfolio (0)" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".portfolio-screen")).toBeHidden();
  });
});
