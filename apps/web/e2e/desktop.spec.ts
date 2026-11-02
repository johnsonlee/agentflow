import { expect, test } from "@playwright/test";
import { blockAt, createWorld, expectRenderedScene, look, player, settle, snap, target, trackRise, waitForTerrain } from "./helpers";

test.describe("PC browser", () => {
  test("title screen, world creation and rendered terrain", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
    await snap(page, testInfo, "01-title");
    const errors = await createWorld(page);
    expect(await page.locator(".touch-controls").count()).toBe(0);
    await expect(page.locator(".hotbar .slot")).toHaveCount(9);
    await expect(page.locator(".hotbar .slot.selected")).toHaveCount(1);
    await expectRenderedScene(page);
    await look(page, 0.6, -0.25);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "02-world");
    expect(errors).toEqual([]);
  });

  test("WASD movement, jumping and flying", async ({ page }) => {
    await createWorld(page);
    await look(page, 0, 0);
    const start = await player(page);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(800);
    await page.keyboard.up("KeyW");
    const moved = await player(page);
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(0.8);

    await settle(page);
    const rise = await trackRise(page);
    await page.keyboard.down("Space");
    await page.waitForTimeout(300);
    await page.keyboard.up("Space");
    expect(await rise()).toBeGreaterThan(0.8);

    // Double-tap Space toggles creative flight; Space rises.
    await settle(page);
    await page.keyboard.press("Space");
    await page.waitForTimeout(60);
    await page.keyboard.press("Space");
    await expect.poll(async () => (await player(page)).flying).toBe(true);
    const flyStart = await player(page);
    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    await page.keyboard.up("Space");
    expect((await player(page)).y).toBeGreaterThan(flyStart.y + 2);
  });

  test("mouse breaks and places blocks; number keys select the hotbar", async ({ page }, testInfo) => {
    await createWorld(page);
    await look(page, 0, -1.2);
    const hit = await target(page);
    expect(hit).not.toBeNull();
    const canvas = page.locator(".game-canvas");

    // Hotbar slot 3 holds stone in the creative starter kit.
    await page.keyboard.press("Digit3");
    await expect(page.locator('.hotbar .slot[data-slot="2"]')).toHaveClass(/selected/);
    const stone = await page.evaluate(() => window.__craft.game!.inventory.selectedStack()!.id);

    // Right click places against the targeted face.
    const placeAt = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    await canvas.click({ button: "right" });
    await expect.poll(() => blockAt(page, placeAt.x, placeAt.y, placeAt.z)).toBe(stone);

    // Left click breaks it again (creative = instant).
    await page.waitForTimeout(100);
    const t2 = await target(page);
    await canvas.click({ button: "left" });
    await expect.poll(() => blockAt(page, t2!.x, t2!.y, t2!.z)).toBe(0);
    await snap(page, testInfo, "03-after-break");
  });

  test("inventory, building with Education blocks and commands", async ({ page }, testInfo) => {
    await createWorld(page);
    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Creative Inventory" })).toBeVisible();
    const cells = page.locator(".inventory-screen .item-cell[data-block]");
    expect(await cells.count()).toBeGreaterThan(30);
    await snap(page, testInfo, "04-inventory");
    await page.locator('.inventory-screen .item-cell[data-block="allow"]').click();
    await page.keyboard.press("e");
    await expect(page.locator(".inventory-screen")).toBeHidden();
    const selected = await page.evaluate(() => window.__craft.game!.inventory.selectedStack()!.id);
    expect(selected).toBe(await page.evaluate(() => window.__craft.blockId("allow")));

    await page.keyboard.press("Slash");
    await expect(page.getByLabel("Chat")).toBeFocused();
    await page.keyboard.type("time set midnight");
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.timeOfDay)).toBeCloseTo(0.75, 2);
    await expect(page.locator(".chat-line").last()).toContainText("Set the time to 18000");
    await page.waitForTimeout(300);
    await snap(page, testInfo, "05-night");

    await page.keyboard.press("Slash");
    await page.keyboard.type("gamemode survival");
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.mode)).toBe("survival");
    await expect(page.locator(".hearts .heart")).toHaveCount(10);
  });

  test("survival: timed breaking collects drops", async ({ page }, testInfo) => {
    await createWorld(page, { mode: "survival" });
    await look(page, 0, -Math.PI / 2 + 0.02);
    const hit = await target(page);
    expect(hit).not.toBeNull();
    const canvas = page.locator(".game-canvas");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    // Still intact part-way through.
    expect(await blockAt(page, hit!.x, hit!.y, hit!.z)).toBe(hit!.id);
    await snap(page, testInfo, "06-breaking");
    await expect.poll(() => blockAt(page, hit!.x, hit!.y, hit!.z), { timeout: 10_000 }).toBe(0);
    await page.mouse.up();
    const count = await page.evaluate(() => window.__craft.game!.inventory.slots.filter(Boolean).length);
    expect(count).toBe(1);
    await expect(page.locator(".hotbar .slot img")).toHaveCount(1);
  });

  test("world is saved and can be continued", async ({ page }) => {
    await createWorld(page);
    await look(page, 0, -1.2);
    const hit = await target(page);
    const placeAt = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    await page.keyboard.press("Digit8");
    await page.locator(".game-canvas").click({ button: "right" });
    const bricks = await page.evaluate(() => window.__craft.game!.inventory.selectedStack()!.id);
    await expect.poll(() => blockAt(page, placeAt.x, placeAt.y, placeAt.z)).toBe(bricks);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
    await page.getByRole("button", { name: "Save & Quit to Title" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Continue/ }).click();
    await waitForTerrain(page);
    expect(await blockAt(page, placeAt.x, placeAt.y, placeAt.z)).toBe(bricks);
  });
});
