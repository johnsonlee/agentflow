import { nativePageWorldTap } from './native-world-tap';
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { command, countStack, createWorld, look, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Fixture filler controls capacity; all asserted chemical outputs come from the real Reduce button. */
export async function reducerCapacityRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => { if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
  const inventory = () => page.evaluate(() => window.__craft.game!.inventory.toJSON());
  const fill = async (free: number) => { await page.evaluate((n) => {
    const inv = window.__craft.game!.inventory;
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = i < n ? null : { id: window.__craft.stackId("stone"), count: 64 };
    inv.slots[7] = { id: window.__craft.stackId("iron_helmet"), count: 1, damage: 17 };
    inv.slots[8] = { id: window.__craft.stackId("written_book"), count: 1, book: { pages: ["Keep this page", "材料"], title: "Reducer notes", author: "Tester" } };
    inv.equipment.chest = { id: window.__craft.stackId("iron_chestplate"), count: 1, damage: 13 };
  }, free);
    // This slot is empty before/after fixture setup; a real click refreshes the displayed inventory.
    await press(page.locator('.inventory-screen [data-slot="0"]'));
  };
  const metadata = () => page.evaluate(() => {
    const inv = window.__craft.game!.inventory;
    return { helmet: inv.slots[7], book: inv.slots[8], chest: inv.equipment.chest };
  });
  const inv = page.locator(".inventory-screen");
  const reduce = page.locator('[data-chem-action="reduce"]');
  const input = inv.locator('[data-chem-input="0"]');
  await command(page, "/give material_reducer"); await command(page, "/give sand");
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2); await target(page); await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("material_reducer")));
  await page.waitForTimeout(300); await use();
  await expect(page.getByRole("heading", { name: "Material Reducer", exact: true })).toBeVisible();
  const sandSlot = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId("sand")));
  await press(inv.locator(`[data-slot="${sandSlot}"]`)); await press(input);
  await fill(1);
  const beforeSand = await inventory();
  await press(reduce);
  expect(await inventory()).toEqual(beforeSand);
  await expect(input.locator("img")).toHaveAttribute("alt", "Sand");
  expect(await countStack(page, "silicon")).toBe(0); expect(await countStack(page, "oxygen")).toBe(0);
  await expect(page.locator('[data-chem-status]')).toContainText(/room|space|fit/i);
  await snap(page, info, "sand-combined-output-refused-without-loss");
  await fill(3); const meta = await metadata();
  await press(reduce);
  expect(await countStack(page, "silicon")).toBe(33); expect(await countStack(page, "oxygen")).toBe(67);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.filter((s) => s?.id === window.__craft.stackId("oxygen")).map((s) => s!.count).sort((a, b) => b - a))).toEqual([64, 3]);
  await expect(input.locator("img")).toHaveCount(0);
  expect(await metadata()).toEqual(meta);
  await snap(page, info, "sand-all-outputs-committed-together");
  await press(page.getByRole("button", { name: "Close inventory" }));
  // Start a separate capacity fixture; earlier sand outputs were asserted before replacing filler.
  await page.evaluate(() => window.__craft.game!.inventory.slots.fill(null));
  await command(page, "/give grass 2");
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2); await target(page); await use();
  await expect(page.getByRole("heading", { name: "Material Reducer", exact: true })).toBeVisible();
  await press(inv.locator('[data-slot="0"]')); await press(input); await press(input);
  await fill(4);
  const beforeGrass = await inventory();
  await press(reduce);
  expect(await inventory()).toEqual(beforeGrass);
  await expect(input.locator("img")).toHaveAttribute("alt", "Grass Block");
  for (const name of ["carbon", "oxygen", "nitrogen", "phosphorus"]) expect(await countStack(page, name)).toBe(0);
  await expect(page.locator('[data-chem-status]')).toContainText(/room|space|fit/i);
  await snap(page, info, "grass-five-output-stacks-refused-with-four-spaces");
  // Save while both untouched inputs still belong to the open station, rather than closing first.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
  await expect(inv.locator('[data-recovery="0"] img')).toHaveAttribute("alt", "Grass Block");
  await press(inv.locator('[data-recovery="0"]')); await press(inv.locator('[data-slot="0"]'));
  await press(page.getByRole("button", { name: "Close inventory" })); await waitForTerrain(page);
  expect(await countStack(page, "grass")).toBe(2);
  for (const name of ["carbon", "oxygen", "nitrogen", "phosphorus"]) expect(await countStack(page, name)).toBe(0);
  expect(await metadata()).toEqual(meta);
  await snap(page, info, "refused-reducer-inputs-recovered-after-open-station-pagehide");
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2); await target(page); await use();
  await expect(page.getByRole("heading", { name: "Material Reducer", exact: true })).toBeVisible();
  const grassSlot = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId("grass")));
  await press(inv.locator(`[data-slot="${grassSlot}"]`)); await press(input); await press(input);
  await fill(5);
  await press(reduce);
  for (const [name, count] of [["carbon", 15], ["oxygen", 70], ["nitrogen", 8], ["phosphorus", 7]] as const) expect(await countStack(page, name)).toBe(count);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.filter((s) => s?.id === window.__craft.stackId("oxygen")).map((s) => s!.count).sort((a, b) => b - a))).toEqual([64, 6]);
  expect(await metadata()).toEqual(meta);
  await expect(input.locator("img")).toHaveAttribute("alt", "Grass Block");
  await snap(page, info, "grass-hundred-elements-committed-in-valid-stacks");
  // Remove one fixture filler stack so the untouched second grass input can return to the bag.
  await page.evaluate(() => { window.__craft.game!.inventory.slots[35] = null; });
  await press(page.getByRole("button", { name: "Close inventory" }));
  expect(await countStack(page, "grass")).toBe(1);
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  for (const [name, count] of [["grass", 1], ["carbon", 15], ["oxygen", 70], ["nitrogen", 8], ["phosphorus", 7]] as const) expect(await countStack(page, name)).toBe(count);
  expect(await metadata()).toEqual(meta);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "reducer-elements-and-book-armor-metadata-restored");
  expect(errors).toEqual([]);
}
