import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, blockAt, command, countStack, createWorld, look, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

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
  // An unbreakable fixture support keeps slow polling/release from mining another block underneath.
  await page.evaluate((p) => window.__craft.game!.world.setBlock(p.x, p.y - 1, p.z, window.__craft.blockId("bedrock")), at);
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
  await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(0);
  if (mobile) await touch("touchEnd"); else await page.mouse.up();
  const drops = () => page.evaluate(() => window.__craft.game!.worldDrops.records.map((r) => r.stack));
  await expect.poll(drops).toEqual([{ id: furnaceId, count: 1 }, { id: await page.evaluate(() => window.__craft.stackId("iron_chestplate")), count: 1, damage: 17 }]);
  expect(await countStack(page, "cobblestone")).toBe(fullCount);
  expect(await countStack(page, "iron_chestplate")).toBe(0);
  expect(await page.evaluate(() => window.__craft.game!.furnaces.size)).toBe(0);
  // A second pre-owned furnace/armor pair is a fixture for the separate Agent destruction route.
  // The claimed drops are created only by the real player and Agent break actions.
  await page.evaluate((p) => {
    const g = window.__craft.game!;
    g.world.setBlock(p.x, p.y, p.z, window.__craft.blockId("furnace"));
    g.furnaces.set(`${p.x},${p.y},${p.z}`, { input: { id: window.__craft.stackId("iron_chestplate"), count: 1, damage: 29 }, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 });
  }, at);
  // Position is a test fixture; the attempted destroy action runs through Code Builder UI.
  await page.evaluate((p) => Object.assign(window.__craft.game!.agent, { x: p.x, y: p.y + 1, z: p.z }), at);
  if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true }));
  else await page.keyboard.press("k");
  await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
  await press(page.locator('[data-palette="destroy"]'));
  await page.locator('.cb-block[data-type="destroy"] select[aria-label="Direction"]').selectOption("down");
  await press(page.getByRole("button", { name: "▶ Run" }));
  await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(0);
  expect(await page.evaluate(() => window.__craft.game!.agent.slots.filter(Boolean))).toEqual([]);
  expect(await countStack(page, "iron_chestplate")).toBe(0);
  expect(await countStack(page, "cobblestone")).toBe(fullCount);
  expect(await page.evaluate(() => window.__craft.game!.furnaces.size)).toBe(0);
  const owned = await drops();
  expect(owned.filter((s) => s.id === furnaceId).reduce((n, s) => n + s.count, 0)).toBe(2);
  expect(owned.filter((s) => s.damage !== undefined).map((s) => s.damage).sort()).toEqual([17, 29]);
  await page.evaluate(() => window.__craft.game!.save());
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  expect((await drops()).filter((s) => s.damage !== undefined).map((s) => s.damage).sort()).toEqual([17, 29]);
  // Remove only fixture filler to make space; never inject or directly transfer claimed outputs.
  await page.evaluate(() => { const g = window.__craft.game!; for (const i of [0, 1, 3]) g.inventory.slots[i] = null; });
  await collectWorldDrops(page);
  expect(await countStack(page, "furnace")).toBe(2);
  expect(await countStack(page, "iron_chestplate")).toBe(2);
  expect(await countStack(page, "cobblestone")).toBe(fullCount - 192);
  const armorSlot = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s?.damage === 17));
  if (mobile) await press(page.getByRole("button", { name: "Open inventory", exact: true })); else await page.keyboard.press("e");
  await press(inv.locator(`[data-slot="${armorSlot}"]`));
  await press(inv.locator('[data-equipment="chest"]'));
  expect(await page.evaluate(() => window.__craft.game!.inventory.equipment.chest?.damage)).toBe(17);
  await snap(page, info, "full-furnace-ground-drops-preserve-worn-armor");
}
