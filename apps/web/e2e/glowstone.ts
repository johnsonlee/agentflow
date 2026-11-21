import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { collectWorldDrops, aimAtTop, blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Raw three glowstone blocks/ore/pickaxe/reducer and bedrock support are fixtures, not Nether generation. */
export async function glowstoneRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const touch = (type: "touchStart" | "touchEnd") => {
    const vp = page.viewportSize()!;
    return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .45, id: 94 }] });
  };
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const down = touch("touchStart"); await new Promise(resolve => setTimeout(resolve, 60));
    await Promise.all([down, touch("touchEnd")]);
  };
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const select = async (name: string) => {
    const i = await slotOf(name); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${i}"]`)); else { await page.keyboard.press(`Digit${i + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i);
  };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z), origin: { ...p } };
    // Unbreakable support prevents a delayed release from harvesting another block below a fixture.
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      g.world.setBlock(at.x + x, at.y, at.z + z, window.__craft.blockId("bedrock"));
      for (let y = 1; y <= 6; y++) g.world.setBlock(at.x + x, at.y + y, at.z + z, 0);
    }
    return at;
  });
  for (const raw of ["glowstone 3", "redstone_ore", "iron_pickaxe", "material_reducer"]) await command(page, `/give ${raw}`);
  const ids = await page.evaluate(() => ({ dust: window.__craft.stackId("glowstone_dust"), redstone: window.__craft.stackId("redstone"), glowstone: window.__craft.blockId("glowstone") }));
  expect(ids.dust).toBe(791);
  const groundCount = (id: number) => page.evaluate(n => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === n).reduce((sum, r) => sum + r.stack.count, 0), id);
  const place = async (name: string, p: { x: number; y: number; z: number }) => {
    await select(name); await aimAtTop(page, p.x, p.y - 1, p.z); await target(page); await use();
    await expect.poll(() => blockAt(page, p.x, p.y, p.z)).toBe(await page.evaluate(n => window.__craft.blockId(n), name));
    await page.waitForTimeout(300);
  };
  const mine = async (p: { x: number; y: number; z: number }) => {
    await select("iron_pickaxe"); await lookAtCell(page, p.x, p.y, p.z); await expect.poll(() => target(page)).toMatchObject(p);
    const down = mobile ? touch("touchStart") : page.mouse.down();
    try { await expect.poll(() => blockAt(page, p.x, p.y, p.z), { timeout: 30_000 }).toBe(0); }
    finally { if (mobile) await Promise.all([down, touch("touchEnd")]); else { await down; await page.mouse.up(); } }
  };
  const positions = [{ x: pad.x, y: pad.y + 1, z: pad.z - 3 }, { x: pad.x + 2, y: pad.y + 1, z: pad.z - 2 }, { x: pad.x - 2, y: pad.y + 1, z: pad.z - 2 }];
  const rolls: number[] = [];
  for (let i = 0; i < positions.length; i++) {
    const before = await countStack(page, "glowstone_dust"); await place("glowstone", positions[i]); await mine(positions[i]);
    const rolled = await groundCount(ids.dust); expect(Number.isInteger(rolled)).toBe(true); expect(rolled).toBeGreaterThanOrEqual(2); expect(rolled).toBeLessThanOrEqual(4);
    rolls.push(rolled); expect(await countStack(page, "glowstone_dust")).toBe(before);
    const stacks = await page.evaluate(id => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === id).map(r => r.stack), ids.dust);
    expect(stacks).toEqual([{ id: ids.dust, count: rolled }]); // Ordinary dust has no invented book/wear/chem metadata.
    if (i === 0) {
      await expect.poll(() => page.evaluate(() => window.__craft.game!.renderer.scene.children.filter(c => c.userData.worldDropKey !== undefined && (c as unknown as { geometry?: { type: string } }).geometry?.type === "PlaneGeometry").length)).toBeGreaterThan(0);
      await page.waitForFunction(id => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === id).every(r => r.velocity.y === 0 && r.pickupDelaySeconds === 0), ids.dust);
      await page.evaluate(id => {
        const g = window.__craft.game!, r = g.worldDrops.records.find(r => r.stack.id === id)!, eye = g.renderer.camera.position;
        const dx = r.position.x - eye.x, dz = r.position.z - eye.z;
        g.body.yaw = Math.atan2(-dx, -dz); g.body.pitch = Math.atan2(r.position.y + .12 - eye.y, Math.hypot(dx, dz));
      }, ids.dust);
      // Wait for the naturally rotating planar sprite to face the camera instead of capturing its edge.
      await page.waitForFunction(id => {
        const g = window.__craft.game!, key = g.worldDrops.records.find(r => r.stack.id === id)?.key;
        const mesh = g.renderer.scene.children.find(c => c.userData.worldDropKey === key);
        return mesh !== undefined && Math.abs(Math.cos(mesh.rotation.y - g.body.yaw)) > .9;
      }, ids.dust);
      await snap(page, info, "actual-original-dust-sprite-from-glowstone-harvest");
      await look(page, 0, -.2);
      // The first actual harvest is picked up with W / the real mobile joystick, never a teleport.
      if (mobile) {
        const box = (await page.locator(".touch-stick-base").boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
        await finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 95 }] });
        for (let step = 1; step <= 6; step++) await finger!.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 12, id: 95 }] });
        try { await expect.poll(() => countStack(page, "glowstone_dust")).toBe(rolled); }
        finally { await finger!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      } else {
        await page.keyboard.down("KeyW");
        try { await expect.poll(() => countStack(page, "glowstone_dust")).toBe(rolled); }
        finally { await page.keyboard.up("KeyW"); }
      }
      expect(await page.evaluate(() => window.__craft.game!.body.position.z)).toBeLessThan(pad.origin.z - 1);
      await command(page, `/tp ${pad.origin.x} ${pad.origin.y} ${pad.origin.z}`); // Return only after proven natural pickup.
    } else await collectWorldDrops(page); // Disclosed geometry-aware pickup fixture for later harvests.
    expect(await countStack(page, "glowstone_dust")).toBe(before + rolled); expect(await groundCount(ids.dust)).toBe(0);
  }
  const total = rolls.reduce((n, r) => n + r, 0); expect(total).toBeGreaterThanOrEqual(6); expect(total).toBeLessThanOrEqual(12);
  const ore = { x: pad.x + 2, y: pad.y + 1, z: pad.z + 2 };
  await place("redstone_ore", ore); await mine(ore);
  const redstone = await groundCount(ids.redstone); expect(Number.isInteger(redstone)).toBe(true); expect(redstone).toBeGreaterThanOrEqual(4); expect(redstone).toBeLessThanOrEqual(5);
  await collectWorldDrops(page); expect(await countStack(page, "redstone")).toBe(redstone);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.find(s => s?.id === window.__craft.stackId("iron_pickaxe"))?.damage)).toBe(4);
  const saveReload = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
    await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  };
  await saveReload(); expect(await countStack(page, "glowstone_dust")).toBe(total); expect(await countStack(page, "redstone")).toBe(redstone);
  const inv = page.locator(".inventory-screen");
  const openInventory = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("e"); await expect(inv).toBeVisible(); };
  // A separate raw-gold negative fixture proves the former provisional recipe no longer crafts glowstone.
  await command(page, "/give gold_ore 4"); await openInventory();
  const goldSlot = await slotOf("gold_ore"); await press(inv.locator(`[data-slot="${goldSlot}"]`));
  for (const cell of [0, 1, 2, 3]) await press(inv.locator(`[data-craft="${cell}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveCount(0);
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "old-provisional-four-gold-ore-recipe-refused");
  for (const cell of [0, 1, 2, 3]) { await press(inv.locator(`[data-craft="${cell}"]`)); await press(inv.locator(`[data-slot="${goldSlot}"]`)); }
  expect(await countStack(page, "gold_ore")).toBe(4); expect(await countStack(page, "glowstone")).toBe(0);
  const dustSlot = await slotOf("glowstone_dust");
  await press(inv.locator(`[data-slot="${dustSlot}"]`)); for (const cell of [0, 1, 2, 3]) await press(inv.locator(`[data-craft="${cell}"]`));
  await press(inv.locator(`[data-slot="${dustSlot}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Glowstone");
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "four-harvested-dust-craft-original-glowstone");
  await press(inv.locator('[data-craft-result]'));
  const empty = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null)); await press(inv.locator(`[data-slot="${empty}"]`));
  expect(await countStack(page, "glowstone_dust")).toBe(total - 4); expect(await countStack(page, "glowstone")).toBe(1);
  await press(page.getByRole("button", { name: "Close inventory" }));
  const rebuilt = { x: pad.x, y: pad.y + 1, z: pad.z + 2 }; await command(page, "/time set night"); await place("glowstone", rebuilt);
  expect(await blockAt(page, rebuilt.x, rebuilt.y, rebuilt.z)).toBe(ids.glowstone);
  await expect.poll(() => page.evaluate(p => window.__craft.game!.world.getLight(p.x, p.y, p.z) & 15, rebuilt)).toBe(15);
  await snap(page, info, "reconstructed-old-glowstone-block-emits-light-fifteen");
  // Ordinary powder cannot place a block or consume itself when used on the world.
  await select("glowstone_dust"); const blank = { x: pad.x + 3, y: pad.y + 1, z: pad.z };
  await aimAtTop(page, blank.x, blank.y - 1, blank.z); await target(page); await use();
  expect(await blockAt(page, blank.x, blank.y, blank.z)).toBe(0); expect(await countStack(page, "glowstone_dust")).toBe(total - 4);
  const reducer = { x: pad.x - 2, y: pad.y + 1, z: pad.z + 2 }; await place("material_reducer", reducer);
  await lookAtCell(page, reducer.x, reducer.y, reducer.z); await target(page); await use();
  await expect(page.getByRole("heading", { name: "Material Reducer", exact: true })).toBeVisible();
  const remainderSlot = await slotOf("glowstone_dust"); await press(inv.locator(`[data-slot="${remainderSlot}"]`));
  await press(inv.locator('[data-chem-input="0"]')); await press(inv.locator(`[data-slot="${remainderSlot}"]`));
  expect(await inv.locator('.reducer-output img').evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).alt))).toEqual(["Argon", "Boron", "Krypton", "Neon", "Unknown Element"]);
  expect(await inv.locator('.reducer-output .count').allTextContents()).toEqual(["20", "20", "20", "20", "20"]);
  await inv.locator('[data-chem-input="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "ordinary-dust-native-five-element-preview");
  await press(inv.locator('[data-chem-action="reduce"]'));
  for (const name of ["argon", "boron", "krypton", "neon", "element_0"]) expect(await countStack(page, name)).toBe(20);
  expect(await countStack(page, "glowstone_dust")).toBe(total - 5); expect(await countStack(page, "redstone")).toBe(redstone);
  await press(page.getByRole("button", { name: "Close inventory" }));
  // Inspect the derived creative palette only; never pick/inject a new stack from it.
  await command(page, "/gamemode creative"); await openInventory();
  const icon = inv.locator('[data-block="glowstone_dust"] img'); await expect(icon).toHaveAttribute("alt", "Glowstone Dust");
  expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await icon.scrollIntoViewIfNeeded(); await snap(page, info, "appended-original-dust-icon-in-creative-palette");
  await press(page.getByRole("button", { name: "Close inventory" })); await command(page, "/gamemode survival");
  await saveReload(); expect(await countStack(page, "glowstone_dust")).toBe(total - 5); expect(await countStack(page, "redstone")).toBe(redstone);
  for (const name of ["argon", "boron", "krypton", "neon", "element_0"]) expect(await countStack(page, name)).toBe(20);
  expect(await blockAt(page, rebuilt.x, rebuilt.y, rebuilt.z)).toBe(ids.glowstone);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.reduce((sum, s) => sum + (s?.count ?? 0), 0))).toBe(105 + redstone + total - 5);
  expect(await countStack(page, "gold_ore")).toBe(4);
  await fs.writeFile(info.outputPath("actual-glowstone-redstone-rolls.json"), JSON.stringify({ rng: "uncontrolled Math.random; uniform sampling is app model, not native probability measurement", rawFixture: "three glowstone blocks, one redstone ore, iron pickaxe, reducer, four raw gold ore for negative recipe check; no dust or atom injection; no Nether-generation claim", rolls, totalDust: total, redstone, craftedDust: 4, reducedDust: 1, remainingDust: total - 5, reduction: ["Ar20", "B20", "Kr20", "Ne20", "Unknown20"], firstPickup: mobile ? "real touch joystick" : "real W movement", laterPickups: "real geometry-aware chat teleport + automatic pickup fixture" }, null, 2));
  await snap(page, info, "harvested-dust-redstone-native-atoms-and-lit-block-restored");
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]); expect(errors).toEqual([]);
}
