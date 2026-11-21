import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, aimAtTop, blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Raw shelf/logs/ores/stations are setup; books/planks/new shelf/coal/diamond use real gameplay UI. */
export async function craftingCorrectionsRoute(page: Page, info: TestInfo, mobile: boolean) {
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
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s === null));
  const select = async (name: string) => {
    const slot = await slotOf(name); expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`)); else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
  };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z) };
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      g.world.setBlock(at.x + x, at.y, at.z + z, window.__craft.blockId("stone"));
      for (let y = 1; y <= 3; y++) g.world.setBlock(at.x + x, at.y + y, at.z + z, 0);
    }
    return at;
  });
  for (const ingredient of ["crafting_table", "furnace", "bookshelf", "oak_log 5", "coal_ore", "diamond_ore"]) await command(page, `/give ${ingredient}`);
  const shelf = { x: pad.x + 2, y: pad.y + 1, z: pad.z + 2 };
  await select("bookshelf"); await aimAtTop(page, shelf.x, shelf.y - 1, shelf.z); await target(page); await use();
  await expect.poll(() => blockAt(page, shelf.x, shelf.y, shelf.z)).toBe(await page.evaluate(() => window.__craft.blockId("bookshelf")));
  await page.waitForTimeout(300);
  const breakShelf = async () => {
    if (!mobile) await parkMouse(page);
    await lookAtCell(page, shelf.x, shelf.y, shelf.z); await expect.poll(() => target(page)).toMatchObject(shelf);
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, shelf.x, shelf.y, shelf.z)).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
    await collectWorldDrops(page); // Actual ground pickup through the chat/teleport fixture, then restore the pose.
  };
  await breakShelf();
  expect(await countStack(page, "bookshelf")).toBe(0); expect(await countStack(page, "book")).toBe(3);
  await snap(page, info, "raw-bookshelf-harvested-as-three-books");
  const open = async (name: string, title: string, yaw: number) => {
    await select(name); await look(page, yaw, -1.2); await target(page); await use();
    await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate((n) => window.__craft.blockId(n), name));
    await page.waitForTimeout(300); await use();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  };
  await open("crafting_table", "Crafting Table", 0);
  const inv = page.locator(".inventory-screen");
  const put = async (name: string, cells: number[]) => {
    const slot = await slotOf(name), count = await countStack(page, name); expect(slot).toBeGreaterThanOrEqual(0);
    await press(inv.locator(`[data-slot="${slot}"]`));
    for (const cell of cells) await press(inv.locator(`[data-craft="${cell}"]`));
    if (count > cells.length) await press(inv.locator(`[data-slot="${slot}"]`));
  };
  const toBag = async (name: string) => {
    const slot = await slotOf(name); await press(inv.locator(`[data-slot="${slot >= 0 ? slot : await empty()}"]`));
  };
  const take = async (label: string, name: string) => {
    await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", label);
    await press(inv.locator('[data-craft-result]')); await toBag(name);
  };
  for (let i = 0; i < 2; i++) { await put("oak_log", [0]); await take("Oak Planks", "oak_planks"); }
  expect(await countStack(page, "oak_planks")).toBe(8); expect(await countStack(page, "oak_log")).toBe(3);
  await put("oak_planks", [0, 1, 2, 6, 7, 8]); await put("oak_log", [3, 4, 5]);
  await expect(inv.locator('[data-craft-result] img')).toHaveCount(0);
  for (const cell of [3, 4, 5]) { await press(inv.locator(`[data-craft="${cell}"]`)); await toBag("oak_log"); }
  await put("book", [3, 4, 5]);
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Bookshelf");
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "bookshelf-needs-six-planks-three-books");
  await take("Bookshelf", "bookshelf");
  expect(await countStack(page, "bookshelf")).toBe(1); expect(await countStack(page, "book")).toBe(0);
  expect(await countStack(page, "oak_planks")).toBe(2); expect(await countStack(page, "oak_log")).toBe(3);
  await press(page.getByRole("button", { name: "Close inventory" }));
  await select("bookshelf"); await aimAtTop(page, shelf.x, shelf.y - 1, shelf.z); await target(page); await use();
  await expect.poll(() => blockAt(page, shelf.x, shelf.y, shelf.z)).toBe(await page.evaluate(() => window.__craft.blockId("bookshelf")));
  expect(await countStack(page, "bookshelf")).toBe(0);
  await open("furnace", "Furnace", Math.PI / 2);
  await press(inv.locator(`[data-slot="${await slotOf("oak_planks")}"]`)); await press(inv.locator('[data-furnace="fuel"]'));
  for (const [input, output, label] of [["coal_ore", "coal", "Coal"], ["diamond_ore", "diamond", "Diamond"]] as const) {
    await press(inv.locator(`[data-slot="${await slotOf(input)}"]`)); await press(inv.locator('[data-furnace="input"]'));
    await expect(inv.locator('[data-furnace="output"] img')).toHaveAttribute("alt", label, { timeout: 60_000 });
    await expect(inv.locator('[data-furnace="input"] img')).toHaveCount(0);
    await snap(page, info, `${output}-ore-smelted-with-leftover-planks`);
    await press(inv.locator('[data-furnace="output"]')); await toBag(output);
    expect(await countStack(page, output)).toBe(1); expect(await countStack(page, input)).toBe(0);
  }
  expect(await countStack(page, "oak_planks")).toBe(0);
  await expect(inv.locator('[data-furnace="fuel"] img')).toHaveCount(0);
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  expect(await blockAt(page, shelf.x, shelf.y, shelf.z)).toBe(await page.evaluate(() => window.__craft.blockId("bookshelf")));
  for (const [name, count] of [["coal", 1], ["diamond", 1], ["oak_log", 3], ["book", 0], ["oak_planks", 0], ["coal_ore", 0], ["diamond_ore", 0]] as const) expect(await countStack(page, name)).toBe(count);
  await breakShelf(); expect(await countStack(page, "book")).toBe(3); expect(await countStack(page, "bookshelf")).toBe(0);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "crafted-shelf-coal-diamond-and-unused-logs-restored");
  expect(errors).toEqual([]);
}
