import { expect, test, type Page } from "@playwright/test";
import { blockAt, createWorld, look, settle, snap } from "./helpers";

const agent = (page: Page) => page.evaluate(() => ({ ...window.__craft.game!.agent, slots: undefined }));

test.describe("Mobile browser (touch): Code Builder and Agent", () => {
  test("tap blocks into a program and Run it: the Agent builds a line", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await look(page, 0, 0);
    await page.locator('.hotbar .slot[data-slot="4"]').tap(); // Oak Planks
    await page.getByRole("button", { name: "Code Builder" }).tap();
    await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
    await page.getByRole("button", { name: "Give held stack to Agent" }).tap();
    // Taps add to the selected zone (the program itself at first).
    await page.locator('[data-palette="move"]').tap();
    await page.locator('.cb-block[data-type="move"] select[aria-label="Direction"]').selectOption("up");
    await page.locator('[data-palette="repeat"]').tap();
    await page.locator('[data-drop="do"] .cb-empty').tap(); // select the loop body as the target
    await page.locator('[data-palette="place"]').tap();
    await page.locator('[data-palette="move"]').tap();
    await page.locator('[data-drop="do"] .cb-block[data-type="place"] select[aria-label="Direction"]').selectOption("down");
    // Reorder with the arrows: move "move" above "place", then back.
    await page.locator('[data-drop="do"] .cb-block[data-type="move"]').getByRole("button", { name: "Move block up" }).tap();
    await expect(page.locator('[data-drop="do"] > .cb-block').first()).toHaveAttribute("data-type", "move");
    await page.locator('[data-drop="do"] .cb-block[data-type="move"]').getByRole("button", { name: "Move block down" }).tap();
    await expect(page.locator('[data-drop="do"] > .cb-block').first()).toHaveAttribute("data-type", "place");
    await snap(page, testInfo, "17-touch-code-builder");

    const start = await agent(page);
    await page.getByRole("button", { name: "▶ Run" }).tap();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning), { timeout: 30_000 }).toBe(false);
    const [fx, fz] = [[0, 1], [-1, 0], [0, -1], [1, 0]][start.facing];
    const planks = await page.evaluate(() => window.__craft.blockId("oak_planks"));
    for (let i = 0; i < 4; i++) expect(await blockAt(page, start.x + fx * i, start.y, start.z + fz * i)).toBe(planks);
    const end = await agent(page);
    expect([end.x, end.y, end.z]).toEqual([start.x + fx * 4, start.y + 1, start.z + fz * 4]);
  });
});
