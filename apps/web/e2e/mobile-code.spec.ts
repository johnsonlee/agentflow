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

test.describe("Mobile Code Builder layout (operator finding at 89461b5)", () => {
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 320, height: 568 }]) {
    test(`no Code Builder element overflows at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize(size);
      await createWorld(page);
      await settle(page);
      await page.getByRole("button", { name: "Code Builder" }).tap();
      await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
      await page.getByLabel("Program name").fill("A fairly long program name for a phone");
      await page.getByLabel("Chat command").fill("buildsomething");
      // A nested program fills the zones: repeat > if > repeat-until > command.
      await page.locator('[data-palette="repeat"]').tap();
      await page.locator('[data-drop="do"] .cb-empty').tap();
      await page.locator('[data-palette="if"]').tap();
      await page.locator('[data-drop="then"] .cb-empty').tap();
      await page.locator('[data-palette="until"]').tap();
      await page.locator('[data-drop="then"] [data-drop="do"] .cb-empty').tap();
      await page.locator('[data-palette="drop"]').tap();
      await page.locator('[data-palette="turn"]').tap();
      await page.locator('[data-palette="move"]').tap();
      const report = await page.evaluate(() => {
        const vw = window.innerWidth;
        const panel = document.querySelector(".code-panel")!;
        const outside: string[] = [];
        const overflowing: string[] = [];
        for (const el of [panel, ...Array.from(panel.querySelectorAll("*"))] as HTMLElement[]) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const name = `${el.tagName.toLowerCase()}.${el.className || ""}[${el.getAttribute("aria-label") ?? el.dataset.palette ?? el.dataset.drop ?? ""}]`;
          if (r.left < -0.5 || r.right > vw + 0.5) outside.push(`${name} ${r.left.toFixed(1)}..${r.right.toFixed(1)}`);
          // Horizontal overflow inside any scrolling container (a text field scrolling its own long
          // text is normal, so form controls are only checked for their box, above).
          const control = el.matches("input, textarea, select");
          if (!control && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") overflowing.push(`${name} ${el.scrollWidth}>${el.clientWidth}`);
          if (el.matches(".cb-meta, .cb-row, .cb-actions, .cb-palette, .cb-zone, .panel-header") && el.scrollWidth > el.clientWidth + 1) {
            overflowing.push(`${name} ${el.scrollWidth}>${el.clientWidth}`);
          }
        }
        const chat = document.querySelector('[aria-label="Chat command"]')!.getBoundingClientRect();
        return { vw, outside, overflowing, chat: { left: chat.left, right: chat.right } };
      });
      await snap(page, testInfo, `18-code-builder-${size.width}x${size.height}`);
      expect(report.outside).toEqual([]);
      expect(report.overflowing).toEqual([]);
      expect(report.chat.right).toBeLessThanOrEqual(report.vw);
    });
  }
});
