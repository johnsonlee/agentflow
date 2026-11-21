import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, aimAtTop, blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Raw redstone/glowstone and the world pad are setup; every atom/Unknown output is actually reduced. */
export async function nativeReductionRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const touch = (type: "touchStart" | "touchEnd") => {
    const vp = page.viewportSize()!;
    return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
  };
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const down = touch("touchStart"); await new Promise((r) => setTimeout(r, 60)); await Promise.all([down, touch("touchEnd")]);
  };
  const slotOf = (name: string) => page.evaluate((n) => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId(n)), name);
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z) };
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      g.world.setBlock(at.x + x, at.y, at.z + z, window.__craft.blockId("stone"));
      for (let y = 1; y <= 3; y++) g.world.setBlock(at.x + x, at.y + y, at.z + z, 0);
    }
    return at;
  });
  for (const ingredient of ["material_reducer", "redstone", "glowstone"]) await command(page, `/give ${ingredient}`);
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2); await target(page); await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("material_reducer")));
  await page.waitForTimeout(300); await use();
  await expect(page.getByRole("heading", { name: "Material Reducer", exact: true })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  for (const [name, expected] of [["redstone", 3], ["glowstone", 5]] as const) {
    await press(inv.locator(`[data-slot="${await slotOf(name)}"]`)); await press(inv.locator('[data-chem-input="0"]'));
    await expect(inv.locator(".reducer-output img")).toHaveCount(expected);
    await inv.locator('[data-chem-input="0"]').scrollIntoViewIfNeeded();
    await snap(page, info, `${name}-native-reduction-preview`);
    await press(inv.locator('[data-chem-action="reduce"]'));
    expect(await countStack(page, name)).toBe(0);
    await expect(inv.locator('[data-chem-input="0"] img')).toHaveCount(0);
    if (name === "redstone") {
      for (const [item, count] of [["carbon", 31], ["uranium", 31], ["element_0", 38]] as const) expect(await countStack(page, item)).toBe(count);
    }
  }
  const totals = [["carbon", 31], ["uranium", 31], ["argon", 20], ["boron", 20], ["krypton", 20], ["neon", 20], ["element_0", 58]] as const;
  for (const [name, count] of totals) expect(await countStack(page, name)).toBe(count);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.reduce((n, s) => n + (s?.count ?? 0), 0))).toBe(200);
  await snap(page, info, "two-hundred-native-elements-and-unknown-acquired");
  await press(page.getByRole("button", { name: "Close inventory" }));
  const slot = await slotOf("element_0"); expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
  if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`)); else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
  const at = { x: pad.x + 2, y: pad.y + 1, z: pad.z + 2 };
  await aimAtTop(page, at.x, at.y - 1, at.z); await target(page); await use();
  await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(32768);
  expect(await countStack(page, "element_0")).toBe(57);
  await snap(page, info, "reduced-unknown-element-placed");
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  expect(await blockAt(page, at.x, at.y, at.z)).toBe(32768);
  expect(await countStack(page, "element_0")).toBe(57);
  if (!mobile) await parkMouse(page);
  await lookAtCell(page, at.x, at.y, at.z); await expect.poll(() => target(page)).toMatchObject(at);
  if (mobile) await touch("touchStart"); else await page.mouse.down();
  await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(0);
  if (mobile) await touch("touchEnd"); else await page.mouse.up();
  await collectWorldDrops(page); // Actual ground pickup through the chat/teleport fixture, then restore the pose.
  for (const [name, count] of totals) expect(await countStack(page, name)).toBe(count);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.reduce((n, s) => n + (s?.count ?? 0), 0))).toBe(200);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "native-reduction-totals-and-unknown-restored");
  expect(errors).toEqual([]);
}
