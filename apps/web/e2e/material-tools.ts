import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { command, countStack, createWorld, look, parkMouse, pressMouse, settle, snap, target, waitForTerrain } from "./helpers";

/** Real inventory interactions on both layouts; /give supplies only recipe ingredients. */
export async function craftMaterialTools(page: Page, testInfo: TestInfo, mobile: boolean) {
  await createWorld(page, { mode: "survival" });
  await settle(page);
  for (const kit of ["crafting_table", "gold_ingot 3", "diamond 3", "stick 4"]) await command(page, `/give ${kit}`);
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const touch = mobile ? await page.context().newCDPSession(page) : null;
  const useTable = async () => {
    if (!touch) return pressMouse(page, "right");
    const vp = page.viewportSize()!;
    // Send release independently of a slow touchStart acknowledgement, as in mobile.spec.ts.
    const down = touch.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: vp.width * 0.65, y: vp.height * 0.45, id: 7 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    await Promise.all([down, touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })]);
  };
  if (mobile) await page.locator('.hotbar [data-slot="0"]').tap();
  else await page.keyboard.press("Digit1");
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  expect(await target(page)).not.toBeNull();
  await useTable();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  // The placement/use action has a 250 ms repeat cooldown. Let it expire before opening the table.
  await page.waitForTimeout(300);
  await useTable();
  await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  for (const tool of [
    { materialSlot: 1, outputSlot: 4, name: "Golden Pickaxe", id: "golden_pickaxe" },
    { materialSlot: 2, outputSlot: 5, name: "Diamond Pickaxe", id: "diamond_pickaxe" },
  ]) {
    await press(inv.locator(`[data-slot="${tool.materialSlot}"]`));
    for (const cell of [0, 1, 2]) await press(inv.locator(`[data-craft="${cell}"]`));
    await press(inv.locator('[data-slot="3"]'));
    for (const cell of [4, 7]) await press(inv.locator(`[data-craft="${cell}"]`));
    // Store any remaining sticks before taking the non-stackable tool result.
    if (tool.materialSlot === 1) await press(inv.locator('[data-slot="3"]'));
    await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", tool.name);
    await press(inv.locator("[data-craft-result]"));
    await press(inv.locator(`[data-slot="${tool.outputSlot}"]`));
    expect(await countStack(page, tool.id)).toBe(1);
  }
  expect(await countStack(page, "gold_ingot")).toBe(0);
  expect(await countStack(page, "diamond")).toBe(0);
  expect(await countStack(page, "stick")).toBe(0);
  await snap(page, testInfo, "material-pickaxes-crafted");
  await press(page.getByRole("button", { name: "Close inventory" }));
  for (const [slot, name] of [[4, "Golden Pickaxe"], [5, "Diamond Pickaxe"]] as const) {
    const icon = page.locator(`.hotbar [data-slot="${slot}"] img`);
    await expect(icon).toHaveAttribute("alt", name);
    expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  if (mobile) await page.getByRole("button", { name: "Pause", exact: true }).tap();
  else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  expect(await countStack(page, "golden_pickaxe")).toBe(1);
  expect(await countStack(page, "diamond_pickaxe")).toBe(1);
  await snap(page, testInfo, "material-pickaxes-restored");
}
