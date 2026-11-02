import { expect, test, type Page } from "@playwright/test";
import { buildWallAhead, command, createWorld, firstBoard, look, lookAtCell, parkMouse, pressMouse, settle, snap, waitForTerrain } from "./helpers";

/** Saves through the pause menu, reloads the page and continues the world. */
async function saveAndReload(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save & Quit to Title" }).click();
  await page.reload();
  await page.getByRole("button", { name: /Continue/ }).click();
  await waitForTerrain(page);
}

const boards = (page: Page) =>
  page.evaluate(() => [...window.__craft.game!.chalkboards.values()].map((b) => ({ size: b.size, text: b.text, locked: b.locked, standing: b.standing })));

test.describe("PC browser: Education Edition chalkboards and Book & Quill", () => {
  test("creative: hang a Board on a wall, write locked text on it, and it is still there after reload", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    // Pick the Board from the creative palette into the selected hotbar slot.
    await page.keyboard.press("e");
    await page.locator('.inventory-screen .item-cell[data-block="chalkboard_board"]').click();
    await page.keyboard.press("e");
    await expect(page.locator(".inventory-screen")).toBeHidden();

    // A 2-high, 5-wide wall two blocks ahead (test setup); aim at its bottom row and place against it.
    await look(page, 0, 0);
    const wall = await buildWallAhead(page);
    await parkMouse(page);
    await lookAtCell(page, wall.x0, wall.y0, wall.z);
    await pressMouse(page, "right");
    await expect.poll(() => boards(page)).toEqual([{ size: "board", text: "", locked: false, standing: false }]);

    // Look at it and use it to open the editor.
    const anchor = await firstBoard(page);
    await lookAtCell(page, anchor.x, anchor.y, anchor.z);
    await page.waitForTimeout(200);
    await pressMouse(page, "right");
    await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
    await page.getByLabel("Chalkboard text").fill("Welcome, class!\nToday: build a house.");
    await page.getByLabel("Lock chalkboard").check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".chalkboard-screen")).toBeHidden();
    await expect.poll(() => boards(page)).toEqual([{ size: "board", text: "Welcome, class!\nToday: build a house.", locked: true, standing: false }]);
    // The text is drawn on the board's face in the 3D world (a textured plane in the scene).
    expect(await page.evaluate(() => window.__craft.game!.renderer.scene.children.some((o) => o.userData.chalkboard !== undefined))).toBe(true);
    await lookAtCell(page, anchor.x + 1, anchor.y + 0.5, anchor.z);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "22-chalkboard-text");

    await saveAndReload(page);
    await expect.poll(() => boards(page)).toEqual([{ size: "board", text: "Welcome, class!\nToday: build a house.", locked: true, standing: false }]);
    expect(await page.evaluate(() => window.__craft.game!.renderer.scene.children.some((o) => o.userData.chalkboard !== undefined))).toBe(true);
    await lookAtCell(page, anchor.x + 1, anchor.y + 0.5, anchor.z);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "23-chalkboard-after-reload");
  });

  test("survival: write a two-page Book and Quill, sign it, read it back, and it survives reload", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give book_and_quill");
    await page.keyboard.press("Digit1");
    await parkMouse(page);
    await look(page, 0, 0.6); // at the sky: using the book needs no target
    await pressMouse(page, "right");
    await expect(page.getByRole("heading", { name: "Book and Quill" })).toBeVisible();
    await page.getByLabel("Book page").fill("Once upon a time, a student built a castle.");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.locator(".book-page-number")).toHaveText("Page 2 of 2");
    await page.getByLabel("Book page").fill("The end.");
    await snap(page, testInfo, "24-book-writing");
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await page.getByLabel("Book title").fill("My Story");
    await page.getByRole("button", { name: "Sign and Close" }).click();
    await expect(page.locator(".book-screen")).toBeHidden();
    const book = () => page.evaluate(() => window.__craft.game!.inventory.slots[0]);
    expect(await book()).toMatchObject({ id: await page.evaluate(() => window.__craft.stackId("written_book")), book: { title: "My Story", author: "Player" } });

    // Read it back with page turning.
    await pressMouse(page, "right");
    await expect(page.getByRole("heading", { name: "My Story" })).toBeVisible();
    await expect(page.locator(".book-text")).toHaveText("Once upon a time, a student built a castle.");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.locator(".book-text")).toHaveText("The end.");
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
    await snap(page, testInfo, "25-book-reading");
    await page.getByRole("button", { name: "Done" }).click();

    await saveAndReload(page);
    expect((await book())!.book).toEqual({ pages: ["Once upon a time, a student built a castle.", "The end."], title: "My Story", author: "Player" });
  });
});
