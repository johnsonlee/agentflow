import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aimAtTop, blockAt, collectWorldDrops, command, countStack, createWorld, look, lookAtCell, parkMouse, snap, target, waitForTerrain } from "./helpers";

/** Terrain, three raw logs and a starter axe are fixtures, never finished fences.
 * Harvest, recipes, placement, walking/jumping, drop owners and Agent destruction use real input. */
export async function oakFenceRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const inv = page.locator(".inventory-screen"), finger = mobile ? await page.context().newCDPSession(page) : null;
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
  const open = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE"); await expect(inv).toBeVisible(); };
  const close = () => press(page.getByRole("button", { name: "Close inventory" }));
  const select = async (name: string) => {
    const i = await slotOf(name); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${i}"]`)); else { await page.keyboard.press(`Digit${i + 1}`); await parkMouse(page); }
  };
  const use = async () => {
    const vp = page.viewportSize()!;
    if (finger) { await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 117 }] }); await page.waitForTimeout(60); await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
    else { await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); }
  };
  const holdBreak = async (done: () => Promise<void>) => {
    const vp = page.viewportSize()!;
    if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 118 }] }); else await page.mouse.down();
    try { await done(); }
    finally { if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up(); }
  };
  const saveReload = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("bedrock"));
      for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    g.inventory.slots.fill(null); g.inventory.slots[0] = { id: window.__craft.stackId("iron_axe"), count: 1 };
    const logs = [-1, 0, 1].map(dx => ({ x: x + dx, y: floor + 1, z: z + 3 }));
    for (const at of logs) g.world.setBlock(at.x, at.y, at.z, window.__craft.blockId("oak_log"));
    return { x, z, floor, logs };
  });
  const start = { x: pad.x + .5, y: pad.floor + 1, z: pad.z + .5 };
  await command(page, `/tp ${start.x} ${start.y} ${start.z}`);
  const mine = async (at: { x: number; y: number; z: number }) => {
    await select("iron_axe"); await lookAtCell(page, at.x, at.y, at.z); await expect.poll(() => target(page)).toMatchObject(at);
    await holdBreak(async () => { await expect.poll(() => blockAt(page, at.x, at.y, at.z), { timeout: 30_000 }).toBe(0); });
  };
  for (const log of pad.logs) { await mine(log); await collectWorldDrops(page); }
  expect(await countStack(page, "oak_log")).toBe(3);
  await open();
  const put = async (name: string, cells: number[]) => {
    const slot = await slotOf(name), count = await countStack(page, name); expect(slot).toBeGreaterThanOrEqual(0);
    await press(inv.locator(`[data-slot="${slot}"]`));
    for (const cell of cells) await press(inv.locator(`[data-craft="${cell}"]`));
    if (count > cells.length) await press(inv.locator(`[data-slot="${slot}"]`));
  };
  const take = async (name: string, count = 1) => {
    await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", name);
    for (let i = 0; i < count; i++) await press(inv.locator("[data-craft-result]"));
    await press(inv.locator(`[data-slot="${await empty()}"]`));
  };
  await put("oak_log", [0, 0, 0]); await take("Oak Planks", 3); expect(await countStack(page, "oak_planks")).toBe(12);
  await put("oak_planks", [0, 1, 2, 3]); await take("Crafting Table");
  await put("oak_planks", [0, 2]); await take("Stick"); expect(await countStack(page, "stick")).toBe(4);
  // The compact two-by-two grid cannot express either three-wide fence row.
  await put("oak_planks", [0, 2]); await put("stick", [1, 3]); await expect(inv.locator("[data-craft-result] img")).toHaveCount(0);
  await close(); expect(await countStack(page, "oak_planks")).toBe(6); expect(await countStack(page, "stick")).toBe(4);
  const table = { x: pad.x + 3, y: pad.floor + 1, z: pad.z - 3 };
  await select("crafting_table"); await aimAtTop(page, table.x, table.y - 1, table.z); await use();
  await expect.poll(() => blockAt(page, table.x, table.y, table.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await page.waitForTimeout(300); await lookAtCell(page, table.x, table.y, table.z); await use();
  await expect(page.getByRole("heading", { name: "Crafting Table", exact: true })).toBeVisible();
  await put("oak_planks", [0, 2, 3]); await put("stick", [1, 4]); await expect(inv.locator("[data-craft-result] img")).toHaveCount(0);
  await put("oak_planks", [5]); await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Oak Fence");
  // A genuinely owned spare plank on the cursor must not consume recipe ingredients.
  const spare = await slotOf("oak_planks"); await press(inv.locator(`[data-slot="${spare}"]`));
  const pending = () => page.evaluate(() => (window.__craft.game! as unknown as { inventoryScreen: { pendingItems(): unknown[] } }).inventoryScreen.pendingItems());
  const before = await pending(); await press(inv.locator("[data-craft-result]")); expect(await pending()).toEqual(before);
  expect(await countStack(page, "oak_fence")).toBe(0); await press(inv.locator(`[data-slot="${spare}"]`));
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "harvested-wood-three-fence-preview-and-cursor-refusal");
  await take("Oak Fence"); expect(await countStack(page, "oak_fence")).toBe(3); await close();
  const fences = [{ x: pad.x, y: pad.floor + 1, z: pad.z - 3 }, { x: pad.x + 1, y: pad.floor + 1, z: pad.z - 3 }];
  await select("oak_fence");
  for (const at of fences) { await aimAtTop(page, at.x, at.y - 1, at.z); await use(); await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(188); await page.waitForTimeout(300); }
  expect(await countStack(page, "oak_fence")).toBe(1);
  await aimAtTop(page, pad.x, pad.floor, pad.z); await use(); await page.waitForTimeout(300);
  expect(await blockAt(page, pad.x, pad.floor + 1, pad.z)).toBe(0); expect(await countStack(page, "oak_fence")).toBe(1);
  await lookAtCell(page, fences[0].x, fences[0].y, fences[0].z); await expect.poll(() => target(page)).toMatchObject(fences[0]);
  await snap(page, info, "actual-connected-post-rails-and-shape-outline");
  const walkEvidence: unknown[] = [];
  for (const manualJump of [false, true]) {
    await command(page, `/tp ${start.x} ${start.y} ${start.z}`); await look(page, 0, -.15);
    await page.evaluate(() => {
      const w = window as unknown as { __fenceWalk?: { active: boolean; points: unknown[] } }, state = { active: true, points: [] as unknown[] }; w.__fenceWalk = state;
      const frame = () => { if (!state.active) return; const g = window.__craft.game!; state.points.push({ ...g.body.position, onGround: g.body.onGround }); requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    });
    const base = mobile ? (await page.locator(".touch-stick-base").boundingBox())! : null;
    const jump = mobile ? (await page.locator(".touch-jump").boundingBox())! : null;
    const points = base ? [{ x: base.x + base.width / 2, y: base.y + base.height / 2 - 72, id: 119 }, ...(manualJump ? [{ x: jump!.x + jump!.width / 2, y: jump!.y + jump!.height / 2, id: 120 }] : [])] : [];
    try {
      if (finger) { await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...points[0], y: base!.y + base!.height / 2 }, ...points.slice(1)] }); await finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points }); }
      else { await page.keyboard.down("KeyW"); if (manualJump) await page.keyboard.down("Space"); }
      await page.waitForFunction(z => window.__craft.game!.body.position.z < z, fences[0].z + 1.1, { timeout: 20_000 }); await page.waitForTimeout(1800);
    } finally {
      if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else { await page.keyboard.up("KeyW"); await page.keyboard.up("Space"); }
    }
    const sampled = await page.evaluate(() => { const s = (window as unknown as { __fenceWalk: { active: boolean; points: { x: number; y: number; z: number }[] } }).__fenceWalk; s.active = false; return s.points; });
    expect(sampled.length).toBeGreaterThan(2); expect(Math.min(...sampled.map(p => p.z))).toBeGreaterThanOrEqual(fences[0].z + .925 - .03);
    expect(Math.min(...sampled.map(p => p.z))).toBeLessThan(start.z - .5);
    if (manualJump) expect(Math.max(...sampled.map(p => p.y))).toBeGreaterThan(start.y + .5);
    walkEvidence.push({ manualJump, controls: mobile ? "actualjoystick plusactualjumpbutton; autoJump remainsactive" : "actualW plusSpace", sampled });
  }
  await command(page, `/tp ${start.x} ${start.y} ${start.z}`); await saveReload();
  for (const at of fences) expect(await blockAt(page, at.x, at.y, at.z)).toBe(188);
  // The third genuinely crafted fence becomes a ground owner while raw filler fills only empty bag cells.
  await open(); await press(inv.locator(`[data-slot="${await slotOf("oak_fence")}"]`));
  await page.evaluate(() => { const g = window.__craft.game!; for (let i = 0; i < g.inventory.slots.length; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { id: window.__craft.stackId("cobblestone"), count: 1 }; });
  await press(page.getByRole("button", { name: "Drop held item", exact: true })); await close(); await saveReload();
  expect(await countStack(page, "oak_fence")).toBe(0);
  const ground = await page.evaluate(() => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === 188)); expect(ground).toHaveLength(1); expect(ground[0].stack.count).toBe(1);
  await open(); const filler = await slotOf("cobblestone"); await press(inv.locator(`[data-slot="${filler}"]`)); await press(page.getByRole("button", { name: "Drop held item", exact: true })); await close(); await collectWorldDrops(page);
  expect(await countStack(page, "oak_fence")).toBe(1);
  await command(page, `/tp ${start.x} ${start.y} ${start.z}`); await mine(fences[0]); await collectWorldDrops(page); expect(await countStack(page, "oak_fence")).toBe(2);
  await lookAtCell(page, fences[1].x, fences[1].y, fences[1].z); await expect.poll(() => target(page)).toMatchObject(fences[1]);
  await snap(page, info, "harvest-remeshes-surviving-fence-to-isolated-post");
  // Disclosed initial Agent pose; the actual editor/run/destroy commits its world-owned fence drop.
  await page.evaluate(at => { Object.assign(window.__craft.game!.agent, { x: at.x, y: at.y, z: at.z + 1, facing: 2 }); }, fences[1]);
  if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("KeyK");
  await expect(page.locator(".code-screen")).toBeVisible(); await press(page.locator('[data-palette="destroy"]')); await press(page.getByRole("button", { name: "▶ Run" }));
  await expect.poll(() => blockAt(page, fences[1].x, fences[1].y, fences[1].z)).toBe(0); await collectWorldDrops(page); expect(await countStack(page, "oak_fence")).toBe(3);
  await saveReload(); expect(await countStack(page, "oak_fence")).toBe(3); expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await fs.writeFile(info.outputPath("oak-fence-coverage.json"), JSON.stringify({ fixture: "Bedrock pad/three raw log blocks/starter ironaxe; later raw single-cobblestone fills only empty bag cells while crafted fence cursor ownsone; initial Agent pose. No finishedfence/recipeoutcome/collision/physics injection.", acquired: "Three real log harvests ->12planks ->crafted table/sticks ->3fences; real PC/mobiledamage/placement/harvest/Agentdestroy", refusals: ["compact2x2","one missingplank","incompatibleplankcursor","ownbodyplacement"], fences, ground, walkEvidence, pickup: "Geometry-aware chatteleport helper for harvest/drop pickup, notclaimednaturalwalkingpickup; barrier movement separatelyactualW/joystick", limits: ["1.5collisionheight/connection/shape/hardness are explicitapplicationmodel, nativecalibrationunverified","noLead/leash","chunkboundary andgapray/projectile exhaustivechecksunitseparate","no fullticket orperformanceacceptance"], errors }, null, 2));
  expect(errors).toEqual([]);
}
