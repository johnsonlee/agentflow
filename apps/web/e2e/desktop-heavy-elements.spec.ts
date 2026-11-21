import { expect, test } from "@playwright/test";
import { createWorld, snap } from "./helpers";
import { constructHeavyElements } from "./heavy-elements";

test("PC: construct heavy elements, mix an ice bomb, refuse ions, and restore the save", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await constructHeavyElements(page, testInfo, false);
});

test("PC: creative catalogue contains all 118 elements with readable heavy-element cards", async ({ page }, testInfo) => {
  await createWorld(page);
  await page.keyboard.press("e");
  const inv = page.locator(".inventory-screen");
  await inv.locator('[data-tab="elements"]').click();
  const atoms = inv.locator('[data-block][title*="atomic number"][title*="mass"]');
  await expect(atoms).toHaveCount(118);
  await expect(inv.locator('[data-block="uranium"]')).toHaveAttribute("title", "Uranium (U): atomic number 92, mass 238");
  await expect(inv.locator('[data-block="oganesson"]')).toHaveAttribute("title", "Oganesson (Og): atomic number 118, mass 294");
  await inv.locator('[data-block="oganesson"]').scrollIntoViewIfNeeded();
  await snap(page, testInfo, "catalogue-118-elements");
});
