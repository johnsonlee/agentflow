import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { blockAt, command, countStack, createWorld, look, parkMouse, pressMouse, snap, target } from "./helpers";

export async function furnaceCapacityRoute(page: Page, info: TestInfo, mobile: boolean) {
  await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const touch = (type: "touchStart" | "touchEnd") => {
    const vp = page.viewportSize()!;
    return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
  };
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const down = touch("touchStart");
    await new Promise((r) => setTimeout(r, 60));
    await Promise.all([down, touch("touchEnd")]);
  };
  for (const item of ["furnace", "iron_chestplate", "iron_pickaxe"]) await command(page, `/give ${item}`);
  // Fixture: pre-worn gear. The armor route separately proves wear from actual zombie hits.
  await page.evaluate(() => { window.__craft.game!.inventory.slots[1]!.damage = 17; });
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  const hit = (await target(page))!;
  const at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  const furnaceId = await page.evaluate(() => window.__craft.blockId("furnace"));
  await use();
  await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(furnaceId);
  await page.waitForTimeout(300);
  await use();
  const inv = page.locator(".inventory-screen");
  await expect(page.getByRole("heading", { name: "Furnace", exact: true })).toBeVisible();
  await press(inv.locator('[data-slot="1"]'));
  await press(inv.locator('[data-furnace="input"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  await command(page, "/give cobblestone 2304");
  const fullCount = await countStack(page, "cobblestone");
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.filter((s) => s === null).length)).toBe(0);
  if (mobile) await press(page.locator('.hotbar [data-slot="2"]'));
  else { await page.keyboard.press("Digit3"); await parkMouse(page); }
  await look(page, 0, -1.2);
  await target(page);
  if (mobile) await touch("touchStart"); else await page.mouse.down();
  await expect(page.locator(".chat-line", { hasText: "Inventory full: make room before breaking this furnace" }).first()).toBeVisible();
  if (mobile) await touch("touchEnd"); else await page.mouse.up();
  expect(await blockAt(page, at.x, at.y, at.z)).toBe(furnaceId);
  // Position is a test fixture; the attempted destroy action runs through Code Builder UI.
  await page.evaluate((p) => Object.assign(window.__craft.game!.agent, { x: p.x, y: p.y + 1, z: p.z }), at);
  if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true }));
  else await page.keyboard.press("k");
  await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
  await press(page.locator('[data-palette="destroy"]'));
  await page.locator('.cb-block[data-type="destroy"] select[aria-label="Direction"]').selectOption("down");
  await press(page.getByRole("button", { name: "▶ Run" }));
  await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  await expect(page.locator(".chat-line", { hasText: "Agent: Block contents do not fit" }).first()).toBeVisible();
  expect(await blockAt(page, at.x, at.y, at.z)).toBe(furnaceId);
  expect(await page.evaluate(() => window.__craft.game!.agent.slots.filter(Boolean))).toEqual([]);
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  await target(page);
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Furnace", exact: true })).toBeVisible();
  await expect(inv.locator('[data-furnace="input"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await press(inv.locator('[data-furnace="input"]'));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await expect(inv.locator('[data-recovery="0"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await press(inv.locator('[data-recovery="0"]'));
  await press(inv.locator('[data-equipment="chest"]'));
  expect(await page.evaluate(() => window.__craft.game!.inventory.equipment.chest?.damage)).toBe(17);
  expect(await countStack(page, "cobblestone")).toBe(fullCount);
  await snap(page, info, "full-furnace-preserves-worn-armor");
}
