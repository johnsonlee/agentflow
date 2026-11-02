import { expect, test } from "@playwright/test";
import { command, createWorld, lookAtMob, newestMob, settle, snap } from "./helpers";

test.describe("Mobile browser (touch): Education Edition features", () => {
  test("camera and portfolio buttons, and tapping an NPC to talk", async ({ page }, testInfo) => {
    await createWorld(page);
    await settle(page);
    await page.getByRole("button", { name: "Take photo" }).tap();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.portfolio.photos.length)).toBe(1);
    await page.getByRole("button", { name: "Portfolio" }).tap();
    await expect(page.getByRole("heading", { name: "Portfolio (1)" })).toBeVisible();
    await snap(page, testInfo, "06-touch-portfolio");
    await page.getByRole("button", { name: "Close portfolio" }).tap();
    await expect(page.locator(".portfolio-screen")).toBeHidden();

    await command(page, "/summon npc Guide");
    const id = (await newestMob(page, "npc"))!;
    await page.waitForTimeout(500);
    await lookAtMob(page, id);
    await page.waitForTimeout(150);
    const vp = page.viewportSize()!;
    await page.touchscreen.tap(vp.width * 0.65, vp.height * 0.45);
    await expect(page.locator(".npc-screen h2")).toHaveText("Guide");
    await snap(page, testInfo, "07-touch-npc");
    await page.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(page.locator(".npc-screen")).toBeHidden();
  });
});
