import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aimAtTop, blockAt, bringMob, command, countStack, createWorld, look, lookAtCell, newestMob, parkMouse, pressMouse, snap, target, trackMob, waitForTerrain } from "./helpers";

/** Stage only terrain, ingredients and hunger; all farming outputs come from gameplay. */
export async function farmingRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
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
  const select = async (slot: number) => {
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`));
    else await page.keyboard.press(`Digit${slot + 1}`);
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
  };
  const holding = (name: string) => page.evaluate((n) => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId(n)), name);
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!;
    const p = g.body.position;
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y + .01) - 1, z0 = Math.floor(p.z);
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      g.world.setBlock(x0 + x, y0, z0 + z, window.__craft.blockId("grass"));
      for (let y = 1; y <= 3; y++) g.world.setBlock(x0 + x, y0 + y, z0 + z, 0);
    }
    g.world.setBlock(x0 + 3, y0, z0 + 2, window.__craft.blockId("water"));
    return { x: x0, y: y0, z: z0 };
  });
  for (const item of ["crafting_table", "oak_planks 2", "stick 2", "wheat_seeds 3", "super_fertilizer 3"]) await command(page, `/give ${item}`);
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  const hit = (await target(page))!;
  const table = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  await use();
  await expect.poll(() => blockAt(page, table.x, table.y, table.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  await press(inv.locator('[data-slot="1"]'));
  for (const i of [0, 1]) await press(inv.locator(`[data-craft="${i}"]`));
  await press(inv.locator('[data-slot="2"]'));
  for (const i of [4, 7]) await press(inv.locator(`[data-craft="${i}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Wooden Hoe");
  await press(inv.locator('[data-craft-result]'));
  await press(inv.locator('[data-slot="5"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  const crops = [-1, 0, 1].map((dx) => ({ x: pad.x + dx, y: pad.y, z: pad.z + 2 }));
  await select(5);
  if (!mobile) await parkMouse(page);
  for (const p of crops) {
    await aimAtTop(page, p.x, p.y, p.z);
    await expect.poll(() => target(page)).toMatchObject(p);
    await use();
    await expect.poll(() => page.evaluate((at) => window.__craft.blockName(window.__craft.game!.world.getBlock(at.x, at.y, at.z)), p)).toMatch(/^farmland_/);
    await page.waitForTimeout(300);
  }
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots[5]?.damage)).toBe(3);
  await select(3);
  for (const p of crops) {
    await aimAtTop(page, p.x, p.y, p.z);
    await target(page);
    await use();
    await expect.poll(() => page.evaluate((at) => window.__craft.blockName(window.__craft.game!.world.getBlock(at.x, at.y + 1, at.z)), p)).toBe("wheat_0");
    await page.waitForTimeout(300);
  }
  expect(await countStack(page, "wheat_seeds")).toBe(0);
  await expect.poll(() => page.evaluate((at) => window.__craft.blockName(window.__craft.game!.world.getBlock(at.x, at.y, at.z)), crops[0])).toBe("farmland_7");
  await snap(page, info, "farming-planted-hydrated");
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
  else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  for (const p of crops) expect(await page.evaluate((at) => window.__craft.blockName(window.__craft.game!.world.getBlock(at.x, at.y + 1, at.z)), p)).toBe("wheat_0");
  await select(4);
  if (!mobile) await parkMouse(page);
  for (const p of crops) {
    await lookAtCell(page, p.x, p.y + 1, p.z);
    await target(page);
    await use();
    await expect.poll(() => page.evaluate((at) => window.__craft.blockName(window.__craft.game!.world.getBlock(at.x, at.y + 1, at.z)), p)).toBe("wheat_7");
    await page.waitForTimeout(300);
  }
  expect(await countStack(page, "super_fertilizer")).toBe(0);
  await snap(page, info, "farming-fertilized-mature-wheat");
  for (const p of crops) {
    await lookAtCell(page, p.x, p.y + 1, p.z);
    await target(page);
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, p.x, p.y + 1, p.z)).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
  }
  expect(await countStack(page, "wheat")).toBe(3);
  const harvestedSeeds = await countStack(page, "wheat_seeds");
  expect(harvestedSeeds).toBeLessThanOrEqual(9); // Three random seed trials per mature crop; zero is valid.
  await info.attach("harvest-counts", { body: JSON.stringify({ wheat: 3, seeds: harvestedSeeds }), contentType: "application/json" });
  if (!mobile) await parkMouse(page);
  await lookAtCell(page, table.x, table.y, table.z);
  await target(page);
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
  await press(inv.locator(`[data-slot="${await holding("wheat")}"]`));
  for (const i of [0, 1, 2]) await press(inv.locator(`[data-craft="${i}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Bread");
  await press(inv.locator('[data-craft-result]'));
  await press(inv.locator('[data-slot="6"]'));
  await snap(page, info, "farming-harvest-crafted-bread");
  await press(page.getByRole("button", { name: "Close inventory" }));
  expect(await countStack(page, "wheat")).toBe(0);
  expect(await countStack(page, "bread")).toBe(1);
  await page.evaluate(() => { window.__craft.game!.hunger.food = 10; });
  await select(6);
  if (!mobile) await parkMouse(page);
  await look(page, Math.PI, .8); // Eat without targeting a station.
  if (mobile) await touch("touchStart"); else await page.mouse.down({ button: "right" });
  await expect.poll(() => countStack(page, "bread"), { timeout: 15_000 }).toBe(0);
  if (mobile) await touch("touchEnd"); else await page.mouse.up({ button: "right" });
  expect(await page.evaluate(() => window.__craft.game!.hunger.food)).toBe(15);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "farming-bread-eaten");
  // Stage a pig within reach; the hit and hoe wear still run through actual mouse/touch input.
  await command(page, "/summon pig");
  const pig = (await newestMob(page, "pig"))!;
  await select(5);
  if (!mobile) await parkMouse(page);
  await bringMob(page, pig);
  const stop = await trackMob(page, pig);
  await expect.poll(() => page.evaluate((id) => window.__craft.game!.targetMob?.id === id, pig)).toBe(true);
  const beforeWear = await page.evaluate(() => window.__craft.game!.inventory.slots[5]!.damage ?? 0);
  if (mobile) await touch("touchStart"); else await page.mouse.down();
  await expect.poll(() => page.evaluate((id) => window.__craft.game!.mobs.mobs.find((m) => m.id === id)?.health ?? 0, pig)).toBeLessThan(10);
  if (mobile) await touch("touchEnd"); else await page.mouse.up();
  await stop();
  const combat = await page.evaluate((id) => ({
    health: window.__craft.game!.mobs.mobs.find((m) => m.id === id)!.health,
    wear: window.__craft.game!.inventory.slots[5]!.damage!,
  }), pig);
  expect(10 - combat.health).toBe((combat.wear - beforeWear) / 2);
  expect(errors).toEqual([]);
}
