import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aimAtTop, blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

export async function coloredTorchRoute(page: Page, info: TestInfo, mobile: boolean) {
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
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y + .01) - 1, z0 = Math.floor(p.z);
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      g.world.setBlock(x0 + x, y0, z0 + z, window.__craft.blockId("stone"));
      for (let y = 1; y <= 3; y++) g.world.setBlock(x0 + x, y0 + y, z0 + z, 0);
    }
    return { x: x0, y: y0, z: z0 };
  });
  const recipes = [
    ["cerium_chloride", "blue_torch", "Blue Torch"],
    ["mercuric_chloride", "red_torch", "Red Torch"],
    ["potassium_chloride", "purple_torch", "Purple Torch"],
    ["tungsten_chloride", "green_torch", "Green Torch"],
  ];
  const inv = page.locator(".inventory-screen");
  // Build the blue torch's chloride through the real chemistry UI; stage other compounds as ingredients.
  for (const item of ["compound_creator", "cerium", "chlorine 3"]) await command(page, `/give ${item}`);
  if (!mobile) await parkMouse(page);
  await look(page, Math.PI / 2, -1.2);
  await target(page);
  await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("compound_creator")));
  const creatorAt = (await target(page))!;
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Compound Creator" })).toBeVisible();
  await press(inv.locator('[data-slot="1"]'));
  await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-slot="2"]'));
  for (let i = 0; i < 3; i++) await press(inv.locator('[data-chem-input="1"]'));
  await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", "Cerium Chloride");
  await press(inv.locator('[data-chem-result]'));
  await press(inv.locator('[data-slot="1"]'));
  expect(await countStack(page, "cerium_chloride")).toBe(1);
  expect(await countStack(page, "cerium")).toBe(0);
  expect(await countStack(page, "chlorine")).toBe(0);
  await snap(page, info, "cerium-chloride-created-from-elements");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await command(page, "/give crafting_table");
  for (const [compound] of recipes.slice(1)) await command(page, `/give ${compound}`);
  await command(page, "/give torch 5");
  await command(page, "/give magnesium");
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  const hit = (await target(page))!;
  const tableAt = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  await use();
  await expect.poll(() => blockAt(page, tableAt.x, tableAt.y, tableAt.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
  for (const [i, [compound, name, label]] of recipes.entries()) {
    await press(inv.locator(`[data-slot="${i + 1}"]`));
    await press(inv.locator('[data-craft="0"]'));
    await press(inv.locator('[data-slot="5"]'));
    await press(inv.locator('[data-craft="8"]'));
    await press(inv.locator('[data-slot="5"]'));
    await expect(inv.locator('[data-craft-result] img')).toHaveCount(0);
    await press(inv.locator('[data-craft="8"]'));
    await press(inv.locator('[data-craft="3"]')); // Journal: the chemical goes directly above the torch.
    await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", label);
    await press(inv.locator('[data-craft-result]'));
    await press(inv.locator(`[data-slot="${i + 1}"]`));
    expect(await countStack(page, compound)).toBe(0);
    expect(await countStack(page, name)).toBe(1);
  }
  await press(inv.locator('[data-slot="6"]'));
  await press(inv.locator('[data-craft="0"]'));
  await press(inv.locator('[data-slot="5"]'));
  await press(inv.locator('[data-craft="3"]'));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Underwater Torch");
  await press(inv.locator('[data-craft-result]'));
  await press(inv.locator('[data-slot="6"]'));
  expect(await countStack(page, "torch")).toBe(0);
  expect(await countStack(page, "magnesium")).toBe(0);
  expect(await countStack(page, "underwater_torch")).toBe(1);
  await snap(page, info, "four-colored-torches-crafted");
  await press(page.getByRole("button", { name: "Close inventory" }));
  // Reclaim the stations so they cannot occlude later torch placement and harvesting.
  for (const p of [creatorAt, tableAt]) {
    if (!mobile) await parkMouse(page);
    await lookAtCell(page, p.x, p.y, p.z);
    await expect.poll(() => target(page)).toMatchObject({ x: p.x, y: p.y, z: p.z });
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, p.x, p.y, p.z)).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
  }
  await command(page, "/time set night");
  const placed = [[-2, 2], [2, 2], [-2, -2], [2, -2]].map(([dx, dz]) => ({ x: pad.x + dx, y: pad.y + 1, z: pad.z + dz }));
  for (const [i, [, name]] of recipes.entries()) {
    if (mobile) await press(page.locator(`.hotbar [data-slot="${i + 1}"]`));
    else { await page.keyboard.press(`Digit${i + 2}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i + 1);
    const p = placed[i];
    await aimAtTop(page, p.x, p.y - 1, p.z);
    await target(page);
    await use();
    await expect.poll(() => blockAt(page, p.x, p.y, p.z)).toBe(await page.evaluate((n) => window.__craft.blockId(n), name));
    expect(await countStack(page, name)).toBe(0);
    expect(await page.evaluate((at) => window.__craft.game!.world.getLight(at.x, at.y, at.z) & 15, p)).toBe(14);
    await page.waitForTimeout(300);
  }
  const wet = { x: pad.x + 3, y: pad.y + 1, z: pad.z };
  await page.evaluate((p) => window.__craft.game!.world.setBlock(p.x, p.y, p.z, window.__craft.blockId("water")), wet);
  if (mobile) await press(page.locator('.hotbar [data-slot="6"]'));
  else { await page.keyboard.press("Digit7"); await parkMouse(page); }
  await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(6);
  await aimAtTop(page, wet.x, wet.y - 1, wet.z);
  await target(page);
  await use();
  await expect.poll(() => blockAt(page, wet.x, wet.y, wet.z)).toBe(await page.evaluate(() => window.__craft.blockId("placed_underwater_torch")));
  expect(await countStack(page, "underwater_torch")).toBe(0);
  await snap(page, info, "four-colored-torches-placed-at-night");
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
  else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  expect(await blockAt(page, wet.x, wet.y, wet.z)).toBe(await page.evaluate(() => window.__craft.blockId("placed_underwater_torch")));
  for (const [i, [, name]] of recipes.entries()) {
    const p = placed[i];
    expect(await blockAt(page, p.x, p.y, p.z)).toBe(await page.evaluate((n) => window.__craft.blockId(n), name));
    if (!mobile) await parkMouse(page);
    await lookAtCell(page, p.x, p.y, p.z);
    await expect.poll(() => target(page)).toMatchObject(p);
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, p.x, p.y, p.z)).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
    expect(await countStack(page, name)).toBe(1);
  }
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "colored-torches-restored-and-harvested");
  expect(errors).toEqual([]);
}
