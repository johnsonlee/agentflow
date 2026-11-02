import { expect, test } from "@playwright/test";
import { blockAt, bringMob, command, countItem, createWorld, look, lookAtMob, mobExists, newestMob, settle, snap, target, waitForTerrain } from "./helpers";

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
    await look(page, 0, -1.2);
    const hit = await target(page);
    const at = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    await page.locator(".game-canvas").click({ button: "right" });
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
    await page.waitForTimeout(300);
    await page.locator(".game-canvas").click({ button: "right" });
    await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
    await expect(inv.locator("[data-craft]")).toHaveCount(9);
    await snap(page, testInfo, "08-crafting-table");
  });

  test("animals can be summoned, wander, and are defeated by attacks; sheep drop wool", async ({ page }, testInfo) => {
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/summon sheep");
    const id = (await newestMob(page, "sheep"))!;
    expect(id).not.toBeNull();
    await page.waitForTimeout(400);
    await lookAtMob(page, id);
    await page.waitForTimeout(200);
    await snap(page, testInfo, "09-sheep");
    for (let i = 0; i < 20 && (await mobExists(page, id)); i++) {
      // A hurt sheep panics and runs, as in Minecraft; keep it within reach for the test.
      await bringMob(page, id);
      await lookAtMob(page, id);
      await page.waitForTimeout(80);
      await page.locator(".game-canvas").click({ button: "left" });
      await page.waitForTimeout(450);
    }
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
    await lookAtMob(page, id);
    await page.waitForTimeout(150);
    await page.locator(".game-canvas").click({ button: "right" });
    await expect(page.locator(".npc-screen h2")).toHaveText("Guide");
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
