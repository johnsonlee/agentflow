import { expect, test } from "@playwright/test";
import { blockAt, command, countStack, craftWoodenPickaxe, createWorld, look, settle, snap, target } from "./helpers";

/** Real touch through CDP, released without waiting for the press to be handled (see mobile.spec.ts). */
async function touch(page: import("@playwright/test").Page) {
  const session = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchEnd", x = 0, y = 0) =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 7 }] });
  return {
    async tap(x: number, y: number) {
      const down = send("touchStart", x, y);
      await new Promise((r) => setTimeout(r, 60));
      await Promise.all([down, send("touchEnd")]);
    },
    down: (x: number, y: number) => send("touchStart", x, y),
    up: () => send("touchEnd"),
  };
}

test.describe("Mobile browser (touch): items, tools and tool-based mining", () => {
  test("survival: craft a wooden pickaxe with taps, then hold to mine stone into cobblestone", async ({ page }, testInfo) => {
    // About 25 UI steps; GitHub runners take over a second per click (software rendering).
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give oak_log 2");
    await command(page, "/give crafting_table");
    await command(page, "/give stone");
    const finger = await touch(page);
    const vp = page.viewportSize()!;
    const view = { x: vp.width * 0.65, y: vp.height * 0.45 };

    // Tap the table in the hotbar, tap the ground to place it, tap the table to open it.
    await page.locator('.hotbar .slot[data-slot="1"]').tap();
    await look(page, 0, -1.2);
    const hit = await target(page);
    const tableAt = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    await finger.tap(view.x, view.y);
    await expect.poll(() => blockAt(page, tableAt.x, tableAt.y, tableAt.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
    await page.waitForTimeout(300);
    await finger.tap(view.x, view.y);
    await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();

    await craftWoodenPickaxe(page, (l) => l.tap());
    await snap(page, testInfo, "08-touch-crafted-pickaxe");
    await page.getByRole("button", { name: "Close inventory" }).tap();
    await expect(page.locator(".inventory-screen")).toBeHidden();
    expect(await countStack(page, "wooden_pickaxe")).toBe(1);

    // Place the stone behind the player and mine it by holding a finger on it.
    await page.locator('.hotbar .slot[data-slot="2"]').tap();
    await look(page, Math.PI, -1.2);
    const ground = await target(page);
    const stoneAt = { x: ground!.x + ground!.normal.x, y: ground!.y + ground!.normal.y, z: ground!.z + ground!.normal.z };
    await finger.tap(view.x, view.y);
    await expect.poll(() => blockAt(page, stoneAt.x, stoneAt.y, stoneAt.z)).toBe(await page.evaluate(() => window.__craft.blockId("stone")));

    await page.locator('.hotbar .slot[data-slot="3"]').tap();
    await page.waitForTimeout(200);
    expect(await target(page)).toMatchObject(stoneAt);
    await finger.down(view.x, view.y);
    await expect.poll(() => blockAt(page, stoneAt.x, stoneAt.y, stoneAt.z), { timeout: 20_000 }).toBe(0);
    await finger.up();
    await expect.poll(() => countStack(page, "cobblestone")).toBe(1);
    // The pickaxe wore (exactly one use per block is unit-tested; a slow release may start on the block below).
    const pickaxe = (await page.evaluate(() => window.__craft.game!.inventory.slots[3]))!;
    expect(pickaxe).toMatchObject({ id: await page.evaluate(() => window.__craft.stackId("wooden_pickaxe")), count: 1 });
    expect(pickaxe.damage).toBeGreaterThanOrEqual(1);
    await snap(page, testInfo, "09-touch-mined-cobblestone");
  });
});
