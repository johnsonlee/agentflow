import { nativePageWorldTap } from './native-world-tap';
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { aimAtTop, blockAt, command, countStack, createWorld, lookAtCell, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Setup only: bedrock pad, three raw snow blocks, reducer, pre-owned tools and full-bag filler.
 * No snowball, crafted block, atom, hit or mining-time result is injected. Numeric harvest/stack rules
 * are this application's model; this route does not prove current Education runtime equivalence. */
export async function snowballRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const touch = (type: "touchStart" | "touchEnd") => {
    const vp = page.viewportSize()!;
    return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .45, id: 96 }] });
  };
  const use = async () => { if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
  const inv = page.locator(".inventory-screen");
  const openInventory = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
    await expect(inv).toBeVisible();
  };
  const closeInventory = () => press(page.getByRole("button", { name: "Close inventory" }));
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const select = async (i: number) => {
    expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${i}"]`)); else { await page.keyboard.press(`Digit${i + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i);
  };
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z), origin: { ...p } };
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      g.world.setBlock(at.x + x, at.y, at.z + z, window.__craft.blockId("bedrock"));
      for (let y = 1; y <= 5; y++) g.world.setBlock(at.x + x, at.y + y, at.z + z, 0);
    }
    const cells = [-2, 0, 2].map(dx => ({ x: at.x + dx, y: at.y + 1, z: at.z - 2 }));
    for (const c of cells) g.world.setBlock(c.x, c.y, c.z, window.__craft.blockId("snow"));
    const reducer = { x: at.x - 2, y: at.y + 1, z: at.z + 2 };
    g.world.setBlock(reducer.x, reducer.y, reducer.z, window.__craft.blockId("material_reducer"));
    g.inventory.slots.fill(null);
    g.inventory.slots[0] = { id: window.__craft.stackId("iron_shovel"), count: 1 };
    g.inventory.slots[1] = { id: window.__craft.stackId("iron_axe"), count: 1 };
    return { ...at, cells, reducer, ballId: window.__craft.stackId("snowball") };
  });
  expect(fixture.ballId).toBe(792);
  const groundBalls = () => page.evaluate(id => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === id).reduce((n, r) => n + r.stack.count, 0), fixture.ballId);
  const mine = async (cell: { x: number; y: number; z: number }, slot: number) => {
    await select(slot); await lookAtCell(page, cell.x, cell.y, cell.z); await expect.poll(() => target(page)).toMatchObject(cell);
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    try { await expect.poll(() => blockAt(page, cell.x, cell.y, cell.z), { timeout: 30_000 }).toBe(0); }
    finally { if (mobile) await touch("touchEnd"); else await page.mouse.up(); }
  };
  await mine(fixture.cells[0], 8); // Empty hand really breaks the block but cannot harvest a snowball.
  expect(await groundBalls()).toBe(0); expect(await countStack(page, "snowball")).toBe(0);
  await mine(fixture.cells[1], 1);
  expect(await groundBalls()).toBe(0); expect(await countStack(page, "snowball")).toBe(0);
  await page.evaluate(() => {
    const g = window.__craft.game!;
    for (let i = 2; i < g.inventory.slots.length; i++) g.inventory.slots[i] = { id: window.__craft.stackId("cobblestone"), count: 64 };
  }); // Full bag is input setup, before the actual shovel harvest.
  await mine(fixture.cells[2], 0);
  expect(await groundBalls()).toBe(4); expect(await countStack(page, "snowball")).toBe(0);
  const shovelWear = () => page.evaluate(() => window.__craft.game!.inventory.slots[0]?.damage ?? 0);
  expect(await shovelWear()).toBe(1);
  await snap(page, info, "shovel-full-bag-four-ground-owned-snowballs");
  const saveReload = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
    await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  };
  await saveReload(); expect(await groundBalls()).toBe(4); expect(await countStack(page, "snowball")).toBe(0); expect(await shovelWear()).toBe(1);
  // Drop input filler through real cursor controls away from the harvested stack; no inventory capacity is injected.
  await command(page, `/tp ${fixture.origin.x + 4} ${fixture.origin.y} ${fixture.origin.z + 4}`);
  await openInventory();
  for (const i of [2, 3, 4, 5, 6, 7]) {
    await press(inv.locator(`[data-slot="${i}"]`)); await press(page.getByRole("button", { name: "Drop held item", exact: true }));
    await expect(page.getByRole("button", { name: "Drop held item", exact: true })).toBeDisabled();
  }
  await closeInventory();
  const pickup = async () => {
    await page.waitForFunction(id => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === id).every(r => r.velocity.y === 0 && r.pickupDelaySeconds === 0), fixture.ballId);
    const p = await page.evaluate(id => window.__craft.game!.worldDrops.records.find(r => r.stack.id === id)!.position, fixture.ballId);
    await command(page, `/tp ${p.x} ${p.y + .1} ${p.z}`); // Disclosed pickup-position fixture; game's real automatic transfer executes.
    await expect.poll(groundBalls).toBe(0);
    await command(page, `/tp ${fixture.origin.x} ${fixture.origin.y} ${fixture.origin.z}`);
  };
  await pickup(); expect(await countStack(page, "snowball")).toBe(4);
  await openInventory();
  const ballSlot = await slotOf("snowball"); await press(inv.locator(`[data-slot="${ballSlot}"]`));
  for (const cell of [0, 1, 2, 3]) await press(inv.locator(`[data-craft="${cell}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Snow Block");
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "four-harvested-snowballs-real-two-by-two-snow-recipe");
  await press(inv.locator('[data-craft-result]')); await press(inv.locator(`[data-slot="${ballSlot}"]`));
  expect(await countStack(page, "snowball")).toBe(0); expect(await countStack(page, "snow")).toBe(1);
  await closeInventory();
  const rebuilt = { x: fixture.x, y: fixture.y + 1, z: fixture.z - 2 };
  await select(await slotOf("snow")); await aimAtTop(page, rebuilt.x, rebuilt.y - 1, rebuilt.z); await target(page); await use();
  await expect.poll(() => blockAt(page, rebuilt.x, rebuilt.y, rebuilt.z)).toBe(await page.evaluate(() => window.__craft.blockId("snow")));
  await mine(rebuilt, 0); expect(await groundBalls()).toBe(4); await pickup();
  expect(await countStack(page, "snowball")).toBe(4); expect(await shovelWear()).toBe(2);
  await select(0); await lookAtCell(page, fixture.reducer.x, fixture.reducer.y, fixture.reducer.z); await target(page); await use();
  await expect(page.getByRole("heading", { name: "Material Reducer", exact: true })).toBeVisible();
  const remainingSlot = await slotOf("snowball"); await press(inv.locator(`[data-slot="${remainingSlot}"]`));
  await press(inv.locator('[data-chem-input="0"]')); await press(inv.locator(`[data-slot="${remainingSlot}"]`));
  expect(await inv.locator('.reducer-output img').evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).alt))).toEqual(["Hydrogen", "Hydrogen", "Oxygen"]);
  expect(await inv.locator('.reducer-output .count').allTextContents()).toEqual(["64", "3", "33"]);
  await inv.locator('[data-chem-input="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "snowball-native-ordered-hydrogen-hydrogen-oxygen-preview");
  await press(inv.locator('[data-chem-action="reduce"]'));
  expect(await countStack(page, "snowball")).toBe(3); expect(await countStack(page, "hydrogen")).toBe(67); expect(await countStack(page, "oxygen")).toBe(33);
  await closeInventory(); await saveReload();
  expect(await countStack(page, "snowball")).toBe(3); expect(await countStack(page, "hydrogen")).toBe(67); expect(await countStack(page, "oxygen")).toBe(33); expect(await shovelWear()).toBe(2);
  expect(await groundBalls()).toBe(0); expect(await countStack(page, "snow")).toBe(0);
  await fs.writeFile(info.outputPath("snowball-material-coverage.json"), JSON.stringify({ fixture: "Bedrock pad, three raw snow blocks, reducer, shovel/axe, full-bag cobblestone; no snowball/atom/output injection", controls: mobile ? "actual CDP touch + UI taps" : "actual mouse + UI clicks", pickup: "chat teleport to settled ground-owned snowball, real automatic pickup; not physical movement acceptance", handAndWrongToolDrops: 0, shovelHarvest: 4, craftConsumes: 4, reharvest: 4, reduced: 1, remaining: 3, atoms: { hydrogen: 67, oxygen: 33 }, shovelWear: 2, applicationRulesPendingNativeRuntimeProof: { harvest: 4, maxStack: 16 }, excluded: ["projectile throwing", "snow layers", "golems", "enchantments", "weather", "native graphic equivalence", "performance"] }, null, 2));
  await snap(page, info, "snowballs-native-atoms-and-shovel-wear-restored");
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]); expect(errors).toEqual([]);
}
