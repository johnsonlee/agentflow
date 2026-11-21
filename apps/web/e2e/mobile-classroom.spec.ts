import { expect, test, type Page } from "@playwright/test";
import { command, createWorld, firstBoard, look, lookAtCell, settle, snap } from "./helpers";

/** Real touch tap through CDP (the release doesn't wait for the press to be handled). */
async function tapView(page: Page) {
  const vp = page.viewportSize()!;
  const session = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchEnd") =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * 0.65, y: vp.height * 0.45, id: 21 }] });
  const down = send("touchStart");
  await new Promise((r) => setTimeout(r, 60));
  await Promise.all([down, send("touchEnd")]);
}

test.describe("Mobile browser (touch): chalkboards and Book & Quill", () => {
  test("creative: tap to place a Slate, tap it to write, text is kept", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await page.getByRole("button", { name: "Open inventory" }).tap();
    await page.locator('.inventory-screen .item-cell[data-block="chalkboard_slate"]').tap();
    await page.getByRole("button", { name: "Close inventory" }).tap();
    await look(page, 0, -1.2);
    await page.waitForTimeout(150);
    await tapView(page);
    await expect.poll(() => page.evaluate(() => window.__craft.game!.chalkboards.size)).toBe(1);
    const anchor = await firstBoard(page);
    await lookAtCell(page, anchor.x, anchor.y, anchor.z);
    await page.waitForTimeout(150);
    await tapView(page);
    await expect(page.getByRole("heading", { name: "Slate" })).toBeVisible();
    await page.getByLabel("Chalkboard text").fill("Hi!");
    await page.getByRole("button", { name: "Save", exact: true }).tap();
    await expect(page.locator(".chalkboard-screen")).toBeHidden();
    expect(await page.evaluate(() => [...window.__craft.game!.chalkboards.values()][0].text)).toBe("Hi!");
    await page.waitForTimeout(300);
    await snap(page, testInfo, "15-touch-chalkboard");
  });

  test("survival: tap to write a book, sign it and read it", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give book_and_quill");
    await page.locator('.hotbar .slot[data-slot="0"]').tap();
    await look(page, 0, 0.6);
    await tapView(page);
    await expect(page.getByRole("heading", { name: "Book and Quill" })).toBeVisible();
    await page.getByLabel("Book page").fill("Notes from class.");
    await page.getByRole("button", { name: "Sign", exact: true }).tap();
    await page.getByLabel("Book title").fill("Notes");
    await page.getByRole("button", { name: "Sign and Close" }).tap();
    await expect(page.locator(".book-screen")).toBeHidden();
    await tapView(page);
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await expect(page.locator(".book-text")).toHaveText("Notes from class.");
    await snap(page, testInfo, "16-touch-book-reading");
    await page.getByRole("button", { name: "Done" }).tap();
  });
});
