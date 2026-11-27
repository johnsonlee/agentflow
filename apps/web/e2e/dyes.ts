import { nativePageWorldTap } from './native-world-tap';
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, aimAtTop, blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Ingredients/environment are staged; flowers are harvested and all claimed outputs are crafted. */
export async function dyeRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const touch = (type: "touchStart" | "touchEnd") => {
    const vp = page.viewportSize()!;
    return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
  };
  const use = async () => { if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
  const slotOf = (name: string) => page.evaluate((n) => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s === null));
  const select = async (slot: number) => {
    expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`));
    else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
  };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z) };
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      g.world.setBlock(at.x + x, at.y, at.z + z, window.__craft.blockId("stone"));
      for (let y = 1; y <= 3; y++) g.world.setBlock(at.x + x, at.y + y, at.z + z, 0);
    }
    for (const [dx, dz, name] of [[-2, 1, "poppy"], [0, 2, "poppy"], [2, 1, "dandelion"]] as const) {
      g.world.setBlock(at.x + dx, at.y, at.z + dz, window.__craft.blockId("grass"));
      g.world.setBlock(at.x + dx, at.y + 1, at.z + dz, window.__craft.blockId(name));
    }
    return at;
  });
  for (const [dx, dz] of [[-2, 1], [0, 2], [2, 1]]) {
    const at = { x: pad.x + dx, y: pad.y + 1, z: pad.z + dz };
    if (!mobile) await parkMouse(page);
    await lookAtCell(page, at.x, at.y, at.z);
    await expect.poll(() => target(page)).toMatchObject(at);
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
    await collectWorldDrops(page); // Actual ground pickup through the chat/teleport fixture, then restore the pose.
  }
  expect(await countStack(page, "poppy")).toBe(2);
  expect(await countStack(page, "dandelion")).toBe(1);
  await snap(page, info, "dye-flowers-harvested");
  for (const ingredient of ["crafting_table", "white_wool 2", "white_dye", "green_dye", "black_dye", "polyethylene 6", "hydrogen_peroxide", "luminol"]) await command(page, `/give ${ingredient}`);
  await select(await slotOf("crafting_table"));
  await look(page, 0, -1.2);
  await target(page); await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await page.waitForTimeout(300); await use();
  await expect(page.getByRole("heading", { name: "Crafting Table", exact: true })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  const put = async (name: string, cells: number[]) => {
    const slot = await slotOf(name); expect(slot).toBeGreaterThanOrEqual(0);
    const count = await countStack(page, name);
    await press(inv.locator(`[data-slot="${slot}"]`));
    for (const cell of cells) await press(inv.locator(`[data-craft="${cell}"]`));
    if (count > cells.length) await press(inv.locator(`[data-slot="${slot}"]`));
  };
  const take = async (label: string) => {
    await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", label);
    await press(inv.locator("[data-craft-result]"));
    await press(inv.locator(`[data-slot="${await empty()}"]`));
  };
  // The removed direct-flower shortcut must not remain accepted.
  await put("poppy", [0]); await put("white_wool", [1]);
  await expect(inv.locator("[data-craft-result] img")).toHaveCount(0);
  for (const cell of [0, 1]) { await press(inv.locator(`[data-craft="${cell}"]`)); await press(inv.locator(`[data-slot="${await empty()}"]`)); }
  // Two flower stacks may now occupy separate slots; consume one flower per recipe.
  await put("poppy", [0]); await take("Red Dye");
  await put("poppy", [0]); await take("Red Dye");
  await put("dandelion", [0]); await take("Yellow Dye");
  await put("red_dye", [0]); await put("yellow_dye", [1]); await take("Orange Dye");
  expect(await countStack(page, "orange_dye")).toBe(2);
  await put("white_wool", [0]); await put("orange_dye", [1]); await take("Orange Wool");
  await put("red_dye", [0]); await put("white_dye", [1]); await take("Pink Dye");
  expect(await countStack(page, "pink_dye")).toBe(2);
  await put("white_wool", [0]); await put("pink_dye", [1]); await take("Pink Wool");
  await snap(page, info, "orange-pink-dyes-and-wool-crafted");
  await put("polyethylene", [0, 2, 3, 5, 6]);
  await put("hydrogen_peroxide", [1]); await put("green_dye", [4]); await put("luminol", [7]);
  await expect(inv.locator("[data-craft-result] img")).toHaveCount(0);
  await put("polyethylene", [8]);
  await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Glow Stick");
  await press(inv.locator('[data-craft="4"]')); await press(inv.locator(`[data-slot="${await empty()}"]`));
  await put("orange_dye", [4]);
  await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Orange Glow Stick");
  await press(inv.locator('[data-craft="4"]')); await press(inv.locator(`[data-slot="${await empty()}"]`));
  // Black is a native catalog placeholder, not one of the fourteen supported products.
  await put("black_dye", [4]); await expect(inv.locator("[data-craft-result] img")).toHaveCount(0);
  await press(inv.locator('[data-craft="4"]')); await press(inv.locator(`[data-slot="${await empty()}"]`));
  await put("green_dye", [4]);
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded();
  await snap(page, info, "green-glow-stick-complete-ingredient-grid");
  await take("Glow Stick");
  expect(await countStack(page, "polyethylene")).toBe(0);
  expect(await countStack(page, "green_dye")).toBe(0);
  expect(await countStack(page, "glow_stick")).toBe(1);
  await snap(page, info, "green-glow-stick-crafted");
  await press(page.getByRole("button", { name: "Close inventory" }));
  const placed = ["orange_wool", "pink_wool"].map((name, i) => ({ name, x: pad.x + (i ? 2 : -2), y: pad.y + 1, z: pad.z - 2 }));
  for (const at of placed) {
    await select(await slotOf(at.name));
    await aimAtTop(page, at.x, at.y - 1, at.z); await target(page); await use();
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate((n) => window.__craft.blockId(n), at.name));
    await page.waitForTimeout(300);
  }
  await snap(page, info, "orange-and-new-pink-wool-placed");
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  for (const at of placed) {
    expect(await blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate((n) => window.__craft.blockId(n), at.name));
    if (!mobile) await parkMouse(page);
    await lookAtCell(page, at.x, at.y, at.z); await expect.poll(() => target(page)).toMatchObject({ x: at.x, y: at.y, z: at.z });
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
    await collectWorldDrops(page); // Actual ground pickup through the chat/teleport fixture, then restore the pose.
    expect(await countStack(page, at.name)).toBe(1);
  }
  expect(await countStack(page, "glow_stick")).toBe(1);
  expect(await countStack(page, "orange_dye")).toBe(1); expect(await countStack(page, "pink_dye")).toBe(1);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "dyes-glow-stick-and-wool-restored");
  expect(errors).toEqual([]);
}
