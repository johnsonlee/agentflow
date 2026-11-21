import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, command, countStack, createWorld, look, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Ingredients are staged with commands; crafting, equipment, combat and saving use player UI. */
export async function armorRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  await command(page, "/give crafting_table");
  await command(page, "/give iron_ingot 8");
  const touch = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => {
    if (!touch) return pressMouse(page, "right");
    const vp = page.viewportSize()!;
    const down = touch.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 8 }],
    });
    await new Promise((r) => setTimeout(r, 60));
    await Promise.all([down, touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })]);
  };
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  expect(await target(page)).not.toBeNull();
  await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  await press(inv.locator('[data-slot="1"]'));
  for (const i of [0, 2, 3, 4, 5, 6, 7, 8]) await press(inv.locator(`[data-craft="${i}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Iron Chestplate");
  await press(inv.locator('[data-craft-result]'));
  await press(inv.locator('[data-slot="2"]'));
  expect(await countStack(page, "iron_ingot")).toBe(0);
  expect(await countStack(page, "iron_chestplate")).toBe(1);
  await press(page.getByRole("button", { name: "Close inventory" }));
  const open = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Open inventory" }));
    else await page.keyboard.press("e");
    await expect(inv).toBeVisible();
  };
  await open();
  await press(inv.locator('[data-slot="2"]'));
  // Invalid slot must preserve the cursor and leave all equipment untouched.
  await press(inv.locator('[data-equipment="head"]'));
  await expect(inv.locator('[data-equipment="head"] img')).toHaveCount(0);
  await press(inv.locator('[data-equipment="chest"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  // Unequip to the bag, then put the same piece back on.
  await press(inv.locator('[data-equipment="chest"]'));
  await press(inv.locator('[data-slot="3"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveCount(0);
  await press(inv.locator('[data-slot="3"]'));
  await press(inv.locator('[data-equipment="chest"]'));
  await snap(page, info, "armor-crafted-equipped");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await expect(page.locator('[data-armor-points]')).toHaveAttribute("data-armor-points", "6");
  // Disable natural regeneration through hunger setup, leaving actual zombie attacks unchanged.
  await page.evaluate(() => { const g = window.__craft.game!; g.health = 20; g.hunger.food = 17; });
  await command(page, "/time set night");
  await command(page, "/summon zombie");
  await expect.poll(() => page.evaluate(() => window.__craft.game!.health), { timeout: 30_000 }).toBeLessThan(20);
  await open(); // Pauses mob simulation so both measurements describe the same hit count.
  const hit = await page.evaluate(() => {
    const g = window.__craft.game!;
    return { health: g.health, wear: g.inventory.equipment.chest?.damage ?? 0 };
  });
  expect(hit.wear).toBeGreaterThanOrEqual(1);
  expect(20 - hit.health).toBeCloseTo(hit.wear * 3 * (1 - 6 * .04), 5);
  await expect(inv.locator('[data-equipment="chest"] .durability')).toHaveAttribute("data-durability", String(240 - hit.wear));
  await snap(page, info, "armor-reduced-zombie-damage-and-wear");
  await press(page.getByRole("button", { name: "Close inventory" }));
  // Creative mode prevents further attacks while saving; it does not repair the worn piece.
  await command(page, "/gamemode creative");
  const saved = await page.evaluate(() => window.__craft.game!.inventory.equipment.chest);
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
  else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  expect(await page.evaluate(() => window.__craft.game!.inventory.equipment.chest)).toEqual(saved);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await open();
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await snap(page, info, "armor-worn-equipment-restored");
  await press(inv.locator('[data-equipment="chest"]'));
  await press(inv.locator('[data-slot="2"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  await command(page, "/gamemode survival");
  await command(page, "/give material_reducer");
  if (mobile) await press(page.locator('.hotbar [data-slot="0"]'));
  else { await page.keyboard.press("Digit1"); await parkMouse(page); }
  await look(page, Math.PI / 2, -1.2);
  await target(page);
  await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("material_reducer")));
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Material Reducer" })).toBeVisible();
  await press(inv.locator('[data-slot="2"]'));
  await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-slot="2"]'));
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots[2])).toEqual(saved);
  await snap(page, info, "armor-station-input-preserves-wear");
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) {
    await press(page.locator('.hotbar [data-slot="2"]'));
    await press(page.getByRole("button", { name: "Code Builder", exact: true }));
  } else {
    await page.keyboard.press("Digit3");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(2);
    await page.keyboard.press("k");
  }
  await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
  await press(page.getByRole("button", { name: "Give held stack to Agent" }));
  await expect(page.locator(".cb-status")).toContainText("Gave the Agent 1 Iron Chestplate");
  expect(await page.evaluate(() => window.__craft.game!.agent.slots[0])).toEqual(saved);
  await press(page.locator('[data-palette="drop"]'));
  await press(page.getByRole("button", { name: "▶ Run" }));
  await expect(page.locator(".code-screen")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  await collectWorldDrops(page); // The Agent drops this owned armor on the ground.
  await expect.poll(() => countStack(page, "iron_chestplate")).toBe(1);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots[0])).toEqual(saved);
  await open();
  await press(inv.locator('[data-slot="0"]'));
  await press(inv.locator('[data-equipment="chest"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  const capacity = await page.evaluate(() => {
    const g = window.__craft.game!;
    return g.inventory.spaceFor(window.__craft.blockId("cobblestone"));
  });
  await command(page, "/give cobblestone 2304");
  expect(await countStack(page, "cobblestone")).toBe(capacity);
  await open();
  await expect(inv.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await expect(inv.getByTestId("cursor")).toBeEmpty();
  await press(inv.locator('[data-equipment="chest"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveCount(0);
  await expect(inv.getByTestId("cursor")).toContainText("Iron Chestplate");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await expect(inv).toBeVisible();
  await expect(inv.getByRole("status")).toContainText("Inventory full");
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveCount(0);
  await snap(page, info, "armor-full-bag-close-refused");
  // pagehide uses the real save path while the item is held and no bag slot is available.
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await expect(inv).toBeVisible();
  await expect(inv.locator('[data-recovery="0"] img')).toHaveAttribute("alt", "Iron Chestplate");
  expect(await countStack(page, "cobblestone")).toBe(capacity);
  await press(inv.locator('[data-recovery="0"]'));
  await press(inv.locator('[data-equipment="chest"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await expect(inv).toBeHidden();
  expect(await countStack(page, "cobblestone")).toBe(capacity);
  expect(await page.evaluate(() => window.__craft.game!.inventory.equipment.chest?.id)).toBe(saved?.id);
  await snap(page, info, "armor-held-full-bag-reload-recovered");
  expect(errors).toEqual([]);
}
