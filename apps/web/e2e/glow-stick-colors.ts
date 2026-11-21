import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, countStack, createWorld, look, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Raw ingredients/environment are fixtures; the two claimed colored products are crafted by real input. */
export async function glowStickColorsRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const inv = page.locator(".inventory-screen");
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const vp = page.viewportSize()!;
    await finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
    await page.waitForTimeout(60);
    await finger!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z) };
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      g.world.setBlock(at.x + x, at.y, at.z + z, window.__craft.blockId("bedrock"));
      for (let y = 1; y <= 5; y++) g.world.setBlock(at.x + x, at.y + y, at.z + z, 0);
    }
    g.inventory.slots.fill(null);
    for (const [i, name, count] of [[0, "crafting_table", 1], [1, "polyethylene", 12], [2, "hydrogen_peroxide", 2], [3, "luminol", 2], [4, "red_dye", 1], [5, "blue_dye", 1], [6, "black_dye", 1], [7, "light_gray_dye", 1], [8, "cobblestone", 1], [9, "glow_stick", 1]] as const) {
      g.inventory.slots[i] = { id: window.__craft.stackId(name), count };
    }
    return { red: window.__craft.stackId("red_glow_stick"), blue: window.__craft.stackId("blue_glow_stick"), green: window.__craft.stackId("glow_stick") };
  });
  expect(fixture.red).toBe(793); expect(fixture.blue).toBe(795);
  if (mobile) await press(page.locator('.hotbar [data-slot="0"]')); else { await page.keyboard.press("Digit1"); await parkMouse(page); }
  await look(page, 0, -1.2); await target(page); await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await page.waitForTimeout(300); await use();
  await expect(page.getByRole("heading", { name: "Crafting Table", exact: true })).toBeVisible();
  const put = async (name: string, cells: number[]) => {
    const slot = await slotOf(name); expect(slot).toBeGreaterThanOrEqual(0);
    const count = await countStack(page, name);
    await press(inv.locator(`[data-slot="${slot}"]`));
    for (const cell of cells) await press(inv.locator(`[data-craft="${cell}"]`));
    if (count > cells.length) await press(inv.locator(`[data-slot="${slot}"]`));
  };
  const remove = async (cell: number) => { await press(inv.locator(`[data-craft="${cell}"]`)); await press(inv.locator(`[data-slot="${await empty()}"]`)); };
  const result = inv.locator("[data-craft-result] img");
  await put("polyethylene", [0, 2, 3, 5, 6]); await put("hydrogen_peroxide", [1]); await put("luminol", [7]); await put("red_dye", [4]);
  await expect(result).toHaveCount(0); // One missing polyethylene must refuse the complete-looking grid.
  await put("polyethylene", [8]); await expect(result).toHaveAttribute("alt", "Red Glow Stick");
  await remove(4); await put("black_dye", [4]); await expect(result).toHaveCount(0); await remove(4);
  await put("light_gray_dye", [4]); await expect(result).toHaveCount(0); await remove(4);
  await put("red_dye", [4]); await expect(result).toHaveAttribute("alt", "Red Glow Stick");
  const redIcon = await result.getAttribute("src");
  expect(await result.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const heldSlot = await slotOf("cobblestone"); await press(inv.locator(`[data-slot="${heldSlot}"]`));
  const pending = () => page.evaluate(() => (window.__craft.game! as unknown as { inventoryScreen: { pendingItems(): { id: number; count: number }[] } }).inventoryScreen.pendingItems());
  const refusedBefore = await pending(); await press(inv.locator("[data-craft-result]"));
  expect(await pending()).toEqual(refusedBefore); await expect(result).toHaveAttribute("alt", "Red Glow Stick");
  expect(await countStack(page, "red_glow_stick")).toBe(0);
  await press(inv.locator(`[data-slot="${heldSlot}"]`));
  await snap(page, info, "red-color-preview-after-missing-input-and-excluded-dye-refusals");
  await press(inv.locator("[data-craft-result]")); await press(inv.locator(`[data-slot="${await empty()}"]`));
  expect(await countStack(page, "red_glow_stick")).toBe(1);
  await put("polyethylene", [0, 2, 3, 5, 6, 8]); await put("hydrogen_peroxide", [1]); await put("luminol", [7]); await put("blue_dye", [4]);
  await expect(result).toHaveAttribute("alt", "Blue Glow Stick");
  const blueIcon = await result.getAttribute("src"); expect(blueIcon).not.toBe(redIcon);
  expect(await result.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await snap(page, info, "blue-matching-dye-preview-distinct-original-icon");
  await press(inv.locator("[data-craft-result]")); await press(inv.locator(`[data-slot="${await empty()}"]`));
  for (const name of ["polyethylene", "hydrogen_peroxide", "luminol", "red_dye", "blue_dye"]) expect(await countStack(page, name)).toBe(0);
  for (const name of ["red_glow_stick", "blue_glow_stick", "glow_stick", "black_dye", "light_gray_dye"]) expect(await countStack(page, name)).toBe(1);
  await press(page.getByRole("button", { name: "Close inventory" }));
  const saveReload = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
    await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  };
  await saveReload();
  for (const name of ["red_glow_stick", "blue_glow_stick", "glow_stick"]) expect(await countStack(page, name)).toBe(1);
  // The crafted item is activated by the real HUD action; only readbacks inspect its state.
  if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
  const redSlot = await slotOf("red_glow_stick");
  expect(await page.evaluate(i => window.__craft.game!.inventory.slots[i], redSlot)).toEqual({ id: fixture.red, count: 1, glow: { state: "inactive" } });
  if (redSlot !== 0) {
    await press(inv.locator(`[data-slot="${redSlot}"]`)); await press(inv.locator('[data-slot="0"]'));
    // Swapping an occupied cell leaves its former owner on the cursor.
    if ((await pending()).length) await press(inv.locator(`[data-slot="${redSlot}"]`));
  }
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) await press(page.locator('.hotbar [data-slot="0"]')); else await page.keyboard.press("Digit1");
  await expect(page.getByRole("button", { name: "Shake selected glow stick", exact: true })).toBeEnabled();
  await expect(page.locator('.held-glow-stick')).toHaveAttribute("data-glow-state", "ready");
  await press(page.getByRole("button", { name: "Shake selected glow stick", exact: true }));
  await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selectedStack())).toEqual({ id: fixture.red, count: 1, glow: { state: "active" } });
  await expect(page.locator('.held-glow-stick')).toHaveAttribute("data-glow-state", "active");
  await expect(page.getByRole("button", { name: "Shake selected glow stick", exact: true })).toBeDisabled();
  await snap(page, info, "crafted-red-shaken-once-active-singleton");
  await saveReload();
  expect(await page.evaluate(i => window.__craft.game!.inventory.slots[i], 0)).toEqual({ id: fixture.red, count: 1, glow: { state: "active" } });
  if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
  await expect(inv).toBeVisible();
  await press(inv.locator(`[data-slot="${await slotOf("red_glow_stick")}"]`));
  // Only empty bag cells receive raw filler while the legitimately crafted red item remains cursor-owned.
  await page.evaluate(() => {
    const g = window.__craft.game!;
    for (let i = 0; i < g.inventory.slots.length; i++) if (g.inventory.slots[i] === null) g.inventory.slots[i] = { id: window.__craft.stackId("cobblestone"), count: 1 };
  });
  expect(await page.evaluate(id => window.__craft.game!.inventory.spaceFor(id), fixture.red)).toBe(0);
  await press(page.getByRole("button", { name: "Drop held item", exact: true }));
  const ground = () => page.evaluate(id => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === id), fixture.red);
  await expect.poll(async () => (await ground()).reduce((n, r) => n + r.stack.count, 0)).toBe(1);
  await press(page.getByRole("button", { name: "Close inventory" })); await saveReload();
  expect(await countStack(page, "red_glow_stick")).toBe(0);
  const restoredGround = await ground(); expect(restoredGround).toHaveLength(1); expect(restoredGround[0].stack).toEqual({ id: fixture.red, count: 1, glow: { state: "active" } });
  await snap(page, info, "crafted-red-ground-owner-restored-with-full-bag");
  if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
  const fillerSlot = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId("cobblestone") && s.count === 1));
  expect(fillerSlot).toBeGreaterThanOrEqual(0);
  // Single-item raw filler stacks can merge on repickup, leaving this vacated slot for the distinct red item.
  await press(inv.locator(`[data-slot="${fillerSlot}"]`)); await press(page.getByRole("button", { name: "Drop held item", exact: true }));
  await press(page.getByRole("button", { name: "Close inventory" })); await collectWorldDrops(page);
  expect(await countStack(page, "red_glow_stick")).toBe(1); expect(await ground()).toEqual([]);
  await saveReload();
  for (const name of ["red_glow_stick", "blue_glow_stick", "glow_stick"]) expect(await countStack(page, name)).toBe(1);
  expect(await page.evaluate(id => window.__craft.game!.inventory.slots.filter(s => s?.id === id), fixture.red)).toEqual([{ id: fixture.red, count: 1, glow: { state: "active" } }]);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "two-crafted-colors-legacy-green-and-ground-pickup-restored");
  await fs.writeFile(info.outputPath("glow-stick-colors-coverage.json"), JSON.stringify({ fixture: "Bedrock pad, raw table/12 polyethylene/2 peroxide/2 luminol/red and blue dyes/excluded black and light-gray dyes/cobblestone, and one preowned legacy green item; green was not crafted in this route. Later empty bag cells receive raw cobblestone only to force ground ownership.", controls: mobile ? "CDP touch and real UI taps" : "mouse and real UI clicks", crafted: { red: 1, blue: 1 }, preservedLegacyGreenId: fixture.green, ids: fixture, refusals: ["missing sixth polyethylene", "excluded black dye", "excluded light-gray dye", "incompatible cobblestone cursor with unchanged pending owners"], pickup: "actual automatic pickup after real UI filler drop, with helper chat teleport to settled owner; physical movement is not claimed", originalIconSourcesDistinct: redIcon !== blueIcon, restoredGround, activation: "Actual HUD Shake activates the crafted red singleton; disabled repeat, cold restore, full-bag active ground restore and automatic pickup are checked. No direct activation/outcome assignments.", excluded: ["native pixels", "native output count calibration", "native activation calibration", "lifetime", "colored illumination", "performance"] }, null, 2));
  expect(errors).toEqual([]);
}
