import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { aimAtTop, blockAt, countStack, createWorld, lookAtCell, parkMouse, pressMouse, snap, target } from "./helpers";

/** Raw furnace/iron/diamond ore/coal and flat support are fixtures; cooking and ownership use real UI. */
export async function furnaceProgressRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const cdp = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => {
    if (!cdp) return pressMouse(page, "right");
    const vp = page.viewportSize()!;
    const down = cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 91 }] });
    await new Promise((resolve) => setTimeout(resolve, 60));
    await Promise.all([down, cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })]);
  };
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("stone"));
      for (let dy = 1; dy <= 4; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    const furnace = window.__craft.blockId("furnace"), iron = window.__craft.stackId("iron_ore"), diamond = window.__craft.stackId("diamond_ore"), coal = window.__craft.stackId("coal");
    g.inventory.slots.fill(null);
    g.inventory.slots[0] = { id: furnace, count: 1 };
    g.inventory.slots[1] = { id: iron, count: 1 }; g.inventory.slots[2] = { id: iron, count: 1 };
    g.inventory.slots[3] = { id: diamond, count: 1 }; g.inventory.slots[4] = { id: coal, count: 2 };
    g.inventory.select(0);
    return { x, y: floor + 1, z: z - 2, furnace, iron, diamond, coal };
  });
  if (!mobile) await parkMouse(page);
  await aimAtTop(page, fixture.x, fixture.y - 1, fixture.z); await target(page); await use();
  await expect.poll(() => blockAt(page, fixture.x, fixture.y, fixture.z)).toBe(fixture.furnace);
  await page.waitForTimeout(300);
  const open = async () => {
    await lookAtCell(page, fixture.x, fixture.y, fixture.z); await target(page); await use();
    await expect(page.getByRole("heading", { name: "Furnace", exact: true })).toBeVisible();
  };
  await open();
  const inv = page.locator(".inventory-screen"), input = inv.locator('[data-furnace="input"]'), output = inv.locator('[data-furnace="output"]');
  const read = () => page.evaluate(() => structuredClone([...window.__craft.game!.furnaces.values()][0]));
  await press(inv.locator('[data-slot="4"]')); await press(inv.locator('[data-furnace="fuel"]'));
  await press(inv.locator('[data-slot="1"]')); await press(input);
  await expect.poll(async () => (await read()).progress).toBeGreaterThanOrEqual(.25);
  const beforeTopup = await read();
  await press(inv.locator('[data-slot="2"]')); await press(input);
  const afterTopup = await read();
  expect(afterTopup.input).toEqual({ id: fixture.iron, count: 2 });
  expect(afterTopup.progress).toBeGreaterThanOrEqual(beforeTopup.progress);
  expect(afterTopup.progressInputId).toBe(fixture.iron);
  await expect.poll(async () => (await read()).progress).toBeGreaterThanOrEqual(.45);
  const ironPartial = await read(); expect(ironPartial.output).toBeNull();
  await press(inv.locator('[data-slot="3"]')); await press(input);
  const swapped = await read();
  expect(swapped.input).toEqual({ id: fixture.diamond, count: 1 });
  expect(swapped.progress).toBeLessThan(.15); // Only new model frames may accrue after the actual click.
  await expect(inv.getByTestId("cursor")).toContainText("Iron Ore ×2");
  await press(inv.locator('[data-slot="5"]'));
  expect(await countStack(page, "iron_ore")).toBe(2);
  await input.scrollIntoViewIfNeeded();
  await snap(page, info, "ore-identity-swap-resets-progress-keeps-returned-iron");
  // Read the app's game-frame clock only; never inject ticks or completed outputs.
  await expect.poll(async () => (await read()).progress).toBeGreaterThanOrEqual(.48);
  const diamondHalf = await read();
  expect(diamondHalf.progress).toBeLessThan(.7); expect(diamondHalf.output).toBeNull();
  expect(diamondHalf.input).toEqual({ id: fixture.diamond, count: 1 });
  expect(diamondHalf.progressInputId).toBe(fixture.diamond);
  expect(diamondHalf.fuel).toEqual({ id: fixture.coal, count: 1 });
  await input.scrollIntoViewIfNeeded();
  await snap(page, info, "new-ore-still-unfinished-after-own-half-cook");
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!).furnaces[0].state);
  expect(saved.progress).toBeGreaterThanOrEqual(.48); expect(saved.progress).toBeLessThan(.8); expect(saved.progressInputId).toBe(fixture.diamond);
  await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
  await page.waitForFunction(() => window.__craft.game !== null);
  // Pause using the real menu immediately so loading/meshing does not silently finish the recipe.
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
  const restored = await read();
  expect(restored.progressInputId).toBe(fixture.diamond);
  expect(restored.progress).toBeGreaterThanOrEqual(saved.progress); expect(restored.progress).toBeLessThan(saved.progress + .15);
  expect(restored.input).toEqual({ id: fixture.diamond, count: 1 }); expect(restored.output).toBeNull();
  await page.waitForFunction(() => window.__craft.game!.renderer.isAreaReady(2), undefined, { timeout: 60_000 });
  await press(page.getByRole("button", { name: "Back to Game" }));
  await open();
  await expect(output.locator("img")).toHaveAttribute("alt", "Diamond", { timeout: 60_000 });
  const completed = await read();
  expect(completed.input).toBeNull(); expect(completed.progress).toBe(0); expect(completed.progressInputId).toBeUndefined();
  expect(completed.output?.count).toBe(1); expect(completed.fuel).toEqual({ id: fixture.coal, count: 1 });
  // Fuel burn is the independent game-time clock: the diamond needed a full ten seconds after swap.
  expect(swapped.burnLeft - completed.burnLeft).toBeGreaterThanOrEqual((1 - swapped.progress) * 10 - .05);
  await output.scrollIntoViewIfNeeded(); await snap(page, info, "actual-diamond-result-after-own-full-cook");
  await press(output); await press(inv.locator('[data-slot="6"]'));
  expect(await countStack(page, "diamond")).toBe(1); expect(await countStack(page, "diamond_ore")).toBe(0);
  expect(await countStack(page, "iron_ore")).toBe(2); expect(await countStack(page, "iron_ingot")).toBe(0);
  await fs.writeFile(info.outputPath("observed-model-progress.json"), JSON.stringify({ model: "existing application ten-second cook; no measured Education timing claim", beforeTopup, afterTopup, ironPartial, swapped, diamondHalf, saved, restored, completed }, null, 2));
  await snap(page, info, "diamond-only-after-own-full-cook-and-midpoint-reload");
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]); expect(errors).toEqual([]);
}
