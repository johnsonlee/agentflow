import { expect, test, type Page } from "@playwright/test";
import {
  approachMob, blockAt, command, countStack, createWorld, look, mobExists, newestMob, parkMouse, pressMouse, settle, snap, target, trackMob,
} from "./helpers";

/** Inventory slot index holding a block or item. */
const slotOf = (page: Page, name: string) =>
  page.evaluate((n) => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId(n)), name);
const firstEmpty = (page: Page) => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s === null));

test.describe("PC browser: the survival route to a Book and Quill (review c7d91dcd)", () => {
  test("bookshelf -> books, chicken -> feather, coal -> ink sac, then craft a Book and Quill", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give bookshelf");
    await command(page, "/give iron_sword");
    await command(page, "/give coal");

    // Place the bookshelf and break it by hand: Minecraft drops 3 books.
    await page.keyboard.press("Digit1");
    await parkMouse(page);
    await look(page, 0, -1.2);
    const hit = (await target(page))!;
    const at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
    await pressMouse(page, "right");
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate(() => window.__craft.blockId("bookshelf")));
    await page.waitForTimeout(300);
    await page.mouse.down();
    await expect.poll(() => blockAt(page, at.x, at.y, at.z), { timeout: 30_000 }).toBe(0);
    await page.mouse.up();
    await expect.poll(() => countStack(page, "book")).toBe(3);

    // Defeat a chicken with the sword: raw chicken plus a feather.
    await page.keyboard.press("Digit2");
    await look(page, 0, 0);
    await command(page, "/summon chicken");
    const id = (await newestMob(page, "chicken"))!;
    await page.waitForTimeout(400);
    await parkMouse(page);
    const stop = await trackMob(page, id);
    for (let i = 0; i < 10 && (await mobExists(page, id)); i++) {
      expect(await approachMob(page, id)).toBe(true);
      await pressMouse(page, "left");
      await page.waitForTimeout(500);
    }
    await stop();
    await expect.poll(() => countStack(page, "feather")).toBe(1);

    // Craft in the survival 2x2 grid.
    await page.keyboard.press("e");
    const inv = page.locator(".inventory-screen");
    const click = async (sel: string) => inv.locator(sel).click();
    await click(`[data-slot="${await slotOf(page, "coal")}"]`);
    await click('[data-craft="0"]');
    await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Ink Sac");
    await click("[data-craft-result]");
    await click(`[data-slot="${await firstEmpty(page)}"]`);
    expect(await countStack(page, "ink_sac")).toBe(1);

    await click(`[data-slot="${await slotOf(page, "book")}"]`);
    await click('[data-craft="0"]');
    await click(`[data-slot="${await firstEmpty(page)}"]`); // put the other 2 books down
    await click(`[data-slot="${await slotOf(page, "ink_sac")}"]`);
    await click('[data-craft="1"]');
    await click(`[data-slot="${await slotOf(page, "feather")}"]`);
    await click('[data-craft="2"]');
    await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Book and Quill");
    await snap(page, testInfo, "28-craft-book-and-quill");
    await click("[data-craft-result]");
    await click(`[data-slot="${await firstEmpty(page)}"]`);
    await page.keyboard.press("e");
    await expect(inv).toBeHidden();
    expect(await countStack(page, "book_and_quill")).toBe(1);
    expect(await countStack(page, "book")).toBe(2);
  });
});
