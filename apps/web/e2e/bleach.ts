import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { command, countStack, createWorld, look, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

export async function bleachRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const vp = page.viewportSize()!;
    const down = finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
    await new Promise((r) => setTimeout(r, 60));
    await Promise.all([down, finger!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })]);
  };
  const station = async (slot: number, yaw: number, name: string, title: string) => {
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`));
    else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
    await look(page, yaw, -1.2);
    await target(page);
    await use();
    await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate((n) => window.__craft.blockId(n), name));
    await page.waitForTimeout(300);
    await use();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  };
  const saveReload = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
    else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await page.reload();
    await press(page.getByRole("button", { name: /Continue/ }));
    await waitForTerrain(page);
  };
  for (const item of ["compound_creator", "sodium 4", "chlorine 4", "oxygen 4"]) await command(page, `/give ${item}`);
  await station(0, 0, "compound_creator", "Compound Creator");
  const inv = page.locator(".inventory-screen");
  for (let batch = 0; batch < 4; batch++) {
    for (let i = 0; i < 3; i++) {
      await press(inv.locator(`[data-slot="${i + 1}"]`));
      await press(inv.locator(`[data-chem-input="${i}"]`));
      if (batch < 3) await press(inv.locator(`[data-slot="${i + 1}"]`));
    }
    await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", "Sodium Hypochlorite");
    await press(inv.locator('[data-chem-result]'));
    await press(inv.locator('[data-slot="0"]'));
  }
  await press(inv.locator('[data-slot="0"]'));
  await press(inv.locator('[data-slot="1"]'));
  expect(await countStack(page, "sodium_hypochlorite")).toBe(4);
  await snap(page, info, "sodium-hypochlorite-created");
  await press(page.getByRole("button", { name: "Close inventory" }));
  for (const item of ["lab_table", "water_compound 3", "crafting_table", "red_wool"]) await command(page, `/give ${item}`);
  await station(0, Math.PI / 2, "lab_table", "Lab Table");
  await press(inv.locator('[data-slot="1"]'));
  for (let i = 0; i < 3; i++) await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-slot="1"]')); // Keep one unused NaClO compound for a distinction/save check.
  await press(inv.locator('[data-slot="2"]'));
  for (let i = 0; i < 3; i++) await press(inv.locator('[data-chem-input="1"]'));
  await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", "Bleach");
  await press(inv.locator('[data-chem-result]'));
  await press(inv.locator('[data-slot="2"]'));
  expect(await countStack(page, "sodium_hypochlorite")).toBe(1);
  expect(await countStack(page, "water_compound")).toBe(0);
  expect(await countStack(page, "bleach")).toBe(1);
  await snap(page, info, "bleach-made-from-three-water-three-hypochlorite");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await saveReload();
  expect(await countStack(page, "sodium_hypochlorite")).toBe(1);
  expect(await countStack(page, "bleach")).toBe(1);
  const ids = await page.evaluate(() => [window.__craft.stackId("sodium_hypochlorite"), window.__craft.stackId("bleach")]);
  expect(ids[0]).not.toBe(ids[1]);
  await station(3, Math.PI, "crafting_table", "Crafting Table");
  await press(inv.locator('[data-slot="1"]'));
  await press(inv.locator('[data-craft="0"]'));
  await press(inv.locator('[data-slot="4"]'));
  await press(inv.locator('[data-craft="1"]'));
  await expect(inv.locator('[data-craft-result] img')).toHaveCount(0);
  // The raw compound cannot replace the manufactured bleach product.
  await press(inv.locator('[data-craft="0"]'));
  await press(inv.locator('[data-slot="1"]'));
  await press(inv.locator('[data-craft="1"]'));
  await press(inv.locator('[data-slot="4"]'));
  await press(inv.locator('[data-slot="2"]'));
  await press(inv.locator('[data-craft="0"]'));
  await press(inv.locator('[data-slot="4"]'));
  await press(inv.locator('[data-craft="1"]'));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "White Wool");
  await press(inv.locator('[data-craft-result]'));
  await press(inv.locator('[data-slot="4"]'));
  expect(await countStack(page, "bleach")).toBe(0);
  expect(await countStack(page, "red_wool")).toBe(0);
  expect(await countStack(page, "white_wool")).toBe(1);
  expect(await countStack(page, "sodium_hypochlorite")).toBe(1);
  await snap(page, info, "bleach-whitens-wool-compound-refused");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await saveReload();
  expect(await countStack(page, "white_wool")).toBe(1);
  expect(await countStack(page, "sodium_hypochlorite")).toBe(1);
  expect(await countStack(page, "bleach")).toBe(0);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "bleached-wool-and-compound-restored");
  expect(errors).toEqual([]);
}
