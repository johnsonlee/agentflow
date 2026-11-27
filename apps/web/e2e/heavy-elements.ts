import { nativePageWorldTap } from './native-world-tap';
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { command, countStack, createWorld, look, parkMouse, pressMouse, settle, snap, target, waitForTerrain } from "./helpers";

export async function constructHeavyElements(page: Page, testInfo: TestInfo, mobile: boolean) {
  await createWorld(page, { mode: "survival" });
  await settle(page);
  await command(page, "/give element_constructor");
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const touch = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => { if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  expect(await target(page)).not.toBeNull();
  await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("element_constructor")));
  await page.waitForTimeout(300); // Existing placement cooldown.
  await use();
  await expect(page.getByRole("heading", { name: "Element Constructor" })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  const set = async (particle: string, value: number) => {
    const field = inv.getByRole("spinbutton", { name: particle, exact: true });
    await field.fill(String(value));
    await field.blur();
    await expect(field).toHaveValue(String(value));
  };
  for (const atom of [
    { z: 92, n: 146, name: "Uranium", id: "uranium", mass: 238, slot: 0 },
    { z: 118, n: 176, name: "Oganesson", id: "oganesson", mass: 294, slot: 1 },
  ]) {
    await set("protons", atom.z);
    await set("neutrons", atom.n);
    await set("electrons", atom.z - 1);
    await expect(inv.locator("[data-chem-status]")).toHaveAttribute("data-chem-status", "error");
    await expect(inv.locator("[data-chem-result] img")).toHaveCount(0);
    await set("electrons", atom.z);
    await expect(inv.locator("[data-chem-status]")).toContainText(`atomic number ${atom.z}, mass ${atom.mass}`);
    await expect(inv.locator("[data-chem-result] img")).toHaveAttribute("alt", atom.name);
    await snap(page, testInfo, `constructor-${atom.id}`);
    await press(inv.locator("[data-chem-result]"));
    await press(inv.locator(`[data-slot="${atom.slot}"]`));
    expect(await countStack(page, atom.id)).toBe(1);
  }
  await press(page.getByRole("button", { name: "Close inventory" }));
  // Exercise the corrected Journal recipe through the Lab Table rather than giving its product.
  await command(page, "/give lab_table");
  await command(page, "/give sodium_acetate 4");
  if (mobile) await page.locator('.hotbar [data-slot="2"]').tap();
  else {
    await page.keyboard.press("Digit3");
    await parkMouse(page);
  }
  await look(page, Math.PI / 2, -1.2);
  await target(page);
  await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("lab_table")));
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Lab Table" })).toBeVisible();
  await press(inv.locator('[data-slot="3"]'));
  for (let i = 0; i < 4; i++) await press(inv.locator('[data-chem-input="0"]'));
  await expect(inv.locator("[data-chem-result] img")).toHaveAttribute("alt", "Ice Bomb");
  await press(inv.locator("[data-chem-result]"));
  await press(inv.locator('[data-slot="2"]'));
  expect(await countStack(page, "ice_bomb")).toBe(1);
  expect(await countStack(page, "sodium_acetate")).toBe(0);
  await snap(page, testInfo, "lab-ice-bomb-four-acetates");
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) await page.getByRole("button", { name: "Pause", exact: true }).tap();
  else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  expect(await countStack(page, "uranium")).toBe(1);
  expect(await countStack(page, "oganesson")).toBe(1);
  expect(await countStack(page, "ice_bomb")).toBe(1);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, testInfo, "heavy-elements-restored");
}
