import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import { collectWorldDrops, aimAtTop, blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, player, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Eight clear-glass ingredients and dye are staged; smelting and all stained outputs use UI. */
export async function stainedGlassRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const touch = (type: "touchStart" | "touchEnd") => {
    const vp = page.viewportSize()!;
    return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
  };
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const down = touch("touchStart"); await new Promise((r) => setTimeout(r, 60));
    await Promise.all([down, touch("touchEnd")]);
  };
  const slotOf = (name: string) => page.evaluate((n) => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId(n)), name);
  const select = async (name: string) => {
    const slot = await slotOf(name); expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`));
    else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
  };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z) };
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      g.world.setBlock(at.x + x, at.y, at.z + z, window.__craft.blockId("stone"));
      for (let y = 1; y <= 4; y++) g.world.setBlock(at.x + x, at.y + y, at.z + z, 0);
    }
    // Eye-height transparent specimen, with an opaque background whose color can be changed.
    g.world.setBlock(at.x + 2, at.y + 1, at.z, window.__craft.blockId("stone"));
    g.world.setBlock(at.x + 3, at.y + 2, at.z, window.__craft.blockId("white_wool"));
    return at;
  });
  for (const ingredient of ["furnace", "sand", "coal", "glass 8", "red_dye", "crafting_table"]) await command(page, `/give ${ingredient}`);
  const openPlaced = async (name: string, title: string, yaw: number) => {
    await select(name); await look(page, yaw, -1.2); await target(page); await use();
    await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate((n) => window.__craft.blockId(n), name));
    await page.waitForTimeout(300); await use();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  };
  const inv = page.locator(".inventory-screen");
  await openPlaced("furnace", "Furnace", 0);
  await press(inv.locator(`[data-slot="${await slotOf("sand")}"]`)); await press(inv.locator('[data-furnace="input"]'));
  await press(inv.locator(`[data-slot="${await slotOf("coal")}"]`)); await press(inv.locator('[data-furnace="fuel"]'));
  await expect(inv.locator('[data-furnace="output"] img')).toHaveAttribute("alt", "Glass", { timeout: 60_000 });
  await press(inv.locator('[data-furnace="output"]')); await press(inv.locator(`[data-slot="${await slotOf("glass")}"]`));
  expect(await countStack(page, "glass")).toBe(9); expect(await countStack(page, "sand")).toBe(0);
  await snap(page, info, "glass-smelted-from-sand");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await openPlaced("crafting_table", "Crafting Table", Math.PI / 2);
  const glassSlot = await slotOf("glass");
  await press(inv.locator(`[data-slot="${glassSlot}"]`));
  for (const cell of [0, 1, 2, 3, 5, 6, 7]) await press(inv.locator(`[data-craft="${cell}"]`));
  await press(inv.locator(`[data-slot="${glassSlot}"]`));
  await press(inv.locator(`[data-slot="${await slotOf("red_dye")}"]`)); await press(inv.locator('[data-craft="4"]'));
  await expect(inv.locator('[data-craft-result] img')).toHaveCount(0);
  await press(inv.locator(`[data-slot="${glassSlot}"]`)); await press(inv.locator('[data-craft="8"]')); await press(inv.locator(`[data-slot="${glassSlot}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Red Stained Glass");
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded();
  await snap(page, info, "eight-glass-ring-and-red-dye");
  await press(inv.locator('[data-craft-result]'));
  const empty = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s === null));
  await press(inv.locator(`[data-slot="${empty}"]`));
  expect(await countStack(page, "red_stained_glass")).toBe(8); expect(await countStack(page, "glass")).toBe(1); expect(await countStack(page, "red_dye")).toBe(0);
  await press(page.getByRole("button", { name: "Close inventory" }));
  const wall = { x: pad.x, y: pad.y + 1, z: pad.z + 2 };
  const upper = { ...wall, y: wall.y + 1 };
  const specimen = { x: pad.x + 2, y: pad.y + 2, z: pad.z };
  const clear = { x: pad.x - 2, y: pad.y + 1, z: pad.z + 2 };
  for (const at of [wall, upper, specimen, clear]) {
    await select(at === clear ? "glass" : "red_stained_glass");
    await aimAtTop(page, at.x, at.y - 1, at.z); await target(page); await use();
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate((n) => window.__craft.blockId(n), at === clear ? "glass" : "red_stained_glass"));
    await page.waitForTimeout(300);
  }
  expect(await countStack(page, "red_stained_glass")).toBe(5); expect(await countStack(page, "glass")).toBe(0);
  if (!mobile) await parkMouse(page);
  await lookAtCell(page, specimen.x, specimen.y, specimen.z);
  await expect.poll(() => target(page)).toMatchObject(specimen);
  const pixels = () => page.evaluate(() => {
    const r = window.__craft.game!.renderer; r.renderer.render(r.scene, r.camera);
    const canvas = r.canvas, sample = document.createElement("canvas"); sample.width = sample.height = 9;
    const ctx = sample.getContext("2d")!; ctx.drawImage(canvas, canvas.width / 2 - 4, canvas.height / 2 - 4, 9, 9, 0, 0, 9, 9);
    const d = ctx.getImageData(0, 0, 9, 9).data, rgb = [0, 0, 0], samples: number[][] = [];
    for (let i = 0; i < d.length; i += 4) {
      samples.push([d[i], d[i + 1], d[i + 2]]);
      for (let c = 0; c < 3; c++) rgb[c] += d[i + c] / 81;
    }
    return { rgb, samples };
  });
  const white = await pixels();
  // A cutout hole also reveals its background; requiring red tint distinguishes actual blending.
  expect(white.rgb[0] - Math.max(white.rgb[1], white.rgb[2])).toBeGreaterThan(12);
  await snap(page, info, "red-glass-with-white-background-visible");
  await page.evaluate((p) => window.__craft.game!.world.setBlock(p.x + 3, p.y + 2, p.z, window.__craft.blockId("black_wool")), pad);
  // The SAME pixels must show tint and background transmission, excluding a red/cutout mosaic.
  const transmittedPixels = (dark: Awaited<ReturnType<typeof pixels>>) => dark.samples.filter((sample, i) => {
    const original = white.samples[i];
    return original[0] - Math.max(original[1], original[2]) > 12 && Math.hypot(...sample.map((v, c) => v - original[c])) > 35;
  }).length;
  await expect.poll(async () => transmittedPixels(await pixels()), { timeout: 20_000 }).toBeGreaterThan(8);
  const dark = await pixels();
  const pixelFile = info.outputPath("translucent-glass-pixels.json");
  fs.writeFileSync(pixelFile, JSON.stringify({ whiteBackground: white.rgb, blackBackground: dark.rgb, transmittedPixels: transmittedPixels(dark), sampledPixels: 81 }, null, 2));
  await info.attach("translucent-glass-pixels", { path: pixelFile, contentType: "application/json" });
  await expect.poll(() => target(page)).toMatchObject(specimen);
  await snap(page, info, "red-glass-with-black-background-visible");
  // No tool/enchantment is supplied. Full bags must not prevent a zero-drop clear-glass break.
  await page.evaluate(() => { const inv = window.__craft.game!.inventory; for (let i = 0; i < inv.slots.length; i++) if (!inv.slots[i]) inv.slots[i] = { id: window.__craft.stackId("stone"), count: 64 }; });
  const shatter = async (at: { x: number; y: number; z: number }) => {
    if (!mobile) await parkMouse(page);
    await lookAtCell(page, at.x, at.y, at.z); await expect.poll(() => target(page)).toMatchObject(at);
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
    await collectWorldDrops(page); // Actual ground pickup through the chat/teleport fixture, then restore the pose.
    expect(await countStack(page, "glass")).toBe(0); expect(await countStack(page, "red_stained_glass")).toBe(5);
  };
  await shatter(clear);
  // Two-high wall prevents mobile auto-jump, exercising solidity despite transparent rendering.
  if (!mobile) await parkMouse(page);
  await look(page, Math.PI, 0);
  if (mobile) {
    const box = (await page.locator(".touch-stick-base").boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    await finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 20 }] });
    for (let i = 1; i <= 6; i++) await finger!.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 12, id: 20 }] });
  } else await page.keyboard.down("KeyW");
  await expect.poll(async () => (await player(page)).z).toBeGreaterThan(pad.z + 1.5);
  await page.waitForTimeout(300);
  if (mobile) await touch("touchEnd"); else await page.keyboard.up("KeyW");
  expect((await player(page)).z).toBeLessThan(pad.z + 1.71);
  await snap(page, info, "transparent-glass-wall-blocks-movement");
  await shatter(upper); await shatter(wall);
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  expect(await blockAt(page, specimen.x, specimen.y, specimen.z)).toBe(await page.evaluate(() => window.__craft.blockId("red_stained_glass")));
  expect(await countStack(page, "red_stained_glass")).toBe(5); expect(await countStack(page, "glass")).toBe(0);
  await shatter(specimen);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "stained-glass-save-and-no-drop-break-restored");
  expect(errors).toEqual([]);
}
