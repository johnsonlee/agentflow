import { expect, test, type Page } from "@playwright/test";
import {
  blockAt, buildHydrogenAndOxygen, createWater, createWorld, giveChemistryKit, look, mixSuperFertilizer, parkMouse, pressMouse, reduceSand,
  settle, snap, target,
} from "./helpers";

/** Selects a hotbar slot with its number key, aims down at `yaw`, right-clicks to place, then right-clicks it to open. */
async function placeAndOpen(page: Page, key: string, yaw: number, block: string) {
  await page.keyboard.press(key);
  await parkMouse(page);
  await look(page, yaw, -1.2);
  const hit = (await target(page))!;
  const at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  await pressMouse(page, "right");
  await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate((b) => window.__craft.blockId(b), block));
  await page.waitForTimeout(300);
  await pressMouse(page, "right");
  await expect(page.locator(".inventory-screen")).toBeVisible();
}

async function close(page: Page) {
  await page.keyboard.press("e");
  await expect(page.locator(".inventory-screen")).toBeHidden();
}

test.describe("PC browser: Education Edition chemistry", () => {
  test("survival: build hydrogen and oxygen, create water, reduce sand, mix super fertilizer", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await giveChemistryKit(page);

    await placeAndOpen(page, "Digit1", 0, "element_constructor");
    await buildHydrogenAndOxygen(page, (l) => l.click(), true);
    await snap(page, testInfo, "60-element-constructor");
    await close(page);

    await placeAndOpen(page, "Digit2", Math.PI / 2, "compound_creator");
    await createWater(page, (l) => l.click());
    await snap(page, testInfo, "61-compound-creator-water");
    await close(page);

    await placeAndOpen(page, "Digit3", Math.PI, "material_reducer");
    await reduceSand(page, (l) => l.click());
    await snap(page, testInfo, "62-material-reducer-sand");
    await close(page);

    await placeAndOpen(page, "Digit4", -Math.PI / 2, "lab_table");
    await mixSuperFertilizer(page, (l) => l.click());
    await snap(page, testInfo, "63-lab-table-fertilizer");
    await close(page);

    // Chemistry items survive Save & Quit and Continue.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save & Quit to Title" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect.poll(() => page.evaluate(() => window.__craft.game?.inventory.slots.some((s) => s?.id === window.__craft.stackId("water_compound")))).toBe(true);
    const counts = await page.evaluate(() =>
      ["water_compound", "super_fertilizer", "silicon", "oxygen"].map((n) =>
        window.__craft.game!.inventory.slots.reduce((sum, s) => sum + (s?.id === window.__craft.stackId(n) ? s.count : 0), 0)),
    );
    expect(counts).toEqual([1, 1, 1, 2]);
    expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  });

  test("creative: the Elements tab lists elements with tooltips", async ({ page }, testInfo) => {
    await createWorld(page);
    await settle(page);
    await page.keyboard.press("e");
    const inv = page.locator(".inventory-screen");
    await expect(inv.locator('[data-block="oxygen"]')).toHaveCount(0);
    await inv.locator('[data-tab="elements"]').click();
    await expect(inv.locator('[data-block="oxygen"]')).toHaveAttribute("title", "Oxygen (O): atomic number 8, mass 16");
    await expect(inv.locator('[data-block="krypton"]')).toHaveAttribute("title", "Krypton (Kr): atomic number 36, mass 84");
    await expect(inv.locator('[data-block="dirt"]')).toHaveCount(0);
    await inv.locator('[data-tab="compounds"]').click();
    await expect(inv.locator('[data-block="water_compound"]')).toHaveAttribute("title", "Water (H₂O)");
    await snap(page, testInfo, "64-creative-compounds-tab");
    await inv.locator('[data-block="water_compound"]').click();
    await inv.locator('[data-tab="blocks"]').click();
    await expect(inv.locator('[data-block="element_constructor"]')).toHaveCount(1);
    await close(page);
    await expect(page.locator(".hotbar .slot.selected img")).toHaveAttribute("alt", "Water");
  });
});
