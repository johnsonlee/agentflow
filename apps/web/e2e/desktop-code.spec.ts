import { expect, test, type Page } from "@playwright/test";
import { blockAt, buildWallAhead, createWorld, look, settle, snap } from "./helpers";

const agent = (page: Page) => page.evaluate(() => ({ ...window.__craft.game!.agent, slots: undefined }));
const facingDir = (facing: number) => [[0, 1], [-1, 0], [0, -1], [1, 0]][facing];

async function openCodeBuilder(page: Page) {
  await page.keyboard.press("k");
  await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
}

test.describe("PC browser: Education Edition Code Builder and Agent", () => {
  test("drag blocks into a program: move up; repeat 4 [place down; move forward]; Run builds a line", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await look(page, 0, 0);
    await page.keyboard.press("Digit5"); // Oak Planks
    await openCodeBuilder(page);
    await page.getByRole("button", { name: "Give held stack to Agent" }).click();
    await expect(page.locator(".cb-status")).toContainText("Gave the Agent 64 Oak Planks");

    const root = page.locator('[data-drop="on run / chat"]');
    await page.locator('[data-palette="move"]').dragTo(root);
    await root.locator('.cb-block[data-type="move"] select[aria-label="Direction"]').selectOption("up");
    await page.locator('[data-palette="repeat"]').dragTo(root);
    const loop = page.locator('[data-drop="do"]');
    await page.locator('[data-palette="place"]').dragTo(loop);
    await page.locator('[data-palette="move"]').dragTo(loop);
    await loop.locator('.cb-block[data-type="place"] select[aria-label="Direction"]').selectOption("down");
    await expect(root.locator(":scope > .cb-block")).toHaveCount(2);
    await expect(loop.locator(":scope > .cb-block")).toHaveCount(2);
    await snap(page, testInfo, "26-code-builder");

    const start = await agent(page);
    await page.getByRole("button", { name: "▶ Run" }).click();
    await expect(page.locator(".code-screen")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning), { timeout: 30_000 }).toBe(false);
    await expect(page.locator(".chat-line", { hasText: "finished" }).first()).toBeVisible();

    const [fx, fz] = facingDir(start.facing);
    const planks = await page.evaluate(() => window.__craft.blockId("oak_planks"));
    for (let i = 0; i < 4; i++) expect(await blockAt(page, start.x + fx * i, start.y, start.z + fz * i)).toBe(planks);
    const end = await agent(page);
    expect([end.x, end.y, end.z]).toEqual([start.x + fx * 4, start.y + 1, start.z + fz * 4]);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "27-agent-built-line");
  });

  test("conditional: repeat until the Agent detects a block ahead [move forward] stops at a wall", async ({ page }) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await look(page, 0, 0);
    await page.evaluate(() => window.__craft.game!.teleportAgent());
    const wall = await buildWallAhead(page, 5);
    await openCodeBuilder(page);
    const root = page.locator('[data-drop="on run / chat"]');
    await page.locator('[data-palette="until"]').dragTo(root);
    await page.locator('[data-palette="move"]').dragTo(page.locator('[data-drop="do"]'));
    await page.getByRole("button", { name: "▶ Run" }).click();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning), { timeout: 30_000 }).toBe(false);
    const end = await agent(page);
    // Facing north (-Z): it stops in the cell just in front of the wall.
    expect(end.z).toBe(wall.z + 1);
    await expect(page.locator(".chat-line", { hasText: "finished" }).first()).toBeVisible();
  });
});
