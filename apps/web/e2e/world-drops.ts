import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { createWorld, look, snap, waitForTerrain } from "./helpers";

/** Fixture: a flat pad and pre-owned book/worn helmet/stone. All ownership transfers use real controls. */
export async function worldDropsRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, floor = Math.floor(p.y + .01) - 1;
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      g.world.setBlock(Math.floor(p.x) + x, floor, Math.floor(p.z) + z, window.__craft.blockId("stone"));
      for (let y = 1; y <= 4; y++) g.world.setBlock(Math.floor(p.x) + x, floor + y, Math.floor(p.z) + z, 0);
    }
    const book = { id: window.__craft.stackId("written_book"), count: 1, book: { pages: ["Owned before dropping", "Page two"], title: "Ground ownership", author: "Browser test" } };
    const helmet = { id: window.__craft.stackId("iron_helmet"), count: 1, damage: 7 };
    g.inventory.slots.fill(null); g.inventory.slots[0] = book; g.inventory.slots[1] = helmet;
    g.inventory.slots[2] = { id: window.__craft.stackId("stone"), count: 64 }; g.inventory.select(0);
    return { book, helmet, stoneId: window.__craft.blockId("stone"), start: { ...p } };
  });
  await look(page, 0, -.2);
  const openInventory = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
    await expect(page.locator(".inventory-screen")).toBeVisible();
  };
  // Inventory cursor is the source owner on both platforms; the button must empty it once.
  for (const slot of [0, 1]) {
    await openInventory();
    await press(page.locator(`.inventory-screen [data-slot="${slot}"]`));
    await press(page.getByRole("button", { name: "Drop held item", exact: true }));
    await expect(page.getByRole("button", { name: "Drop held item", exact: true })).toBeDisabled();
    await press(page.getByRole("button", { name: "Close inventory" }));
  }
  if (!mobile) {
    await page.keyboard.press("Digit3");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(2);
    await page.keyboard.press("KeyQ");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.slots[2]?.count)).toBe(63);
    await page.keyboard.press("Control+KeyQ");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.slots[2])).toBeNull();
  }
  await expect.poll(() => page.evaluate(() => window.__craft.game!.worldDrops.records.filter(r => r.stack.book || r.stack.damage).length)).toBe(2);
  await page.waitForTimeout(1200);
  const owned = await page.evaluate(() => {
    const g = window.__craft.game!;
    return { records: g.worldDrops.records, visible: g.renderer.scene.children.filter(c => c.userData.worldDropKey !== undefined).length };
  });
  expect(owned.visible).toBeGreaterThanOrEqual(2);
  expect(owned.records.find(r => r.stack.book)?.stack).toEqual(fixture.book);
  expect(owned.records.find(r => r.stack.damage)?.stack).toEqual(fixture.helmet);
  // Aim at the real ground records and prove their meshes change actual rendered pixels.
  await page.evaluate(() => {
    const g = window.__craft.game!, r = g.worldDrops.records.find(r => r.stack.book)!;
    const dx = r.position.x - g.body.position.x, dz = r.position.z - g.body.position.z;
    g.body.yaw = Math.atan2(-dx, -dz);
    g.body.pitch = Math.atan2(r.position.y + .12 - (g.body.position.y + 1.62), Math.hypot(dx, dz));
  });
  await page.waitForTimeout(150);
  const renderedPixels = await page.evaluate(() => {
    const g = window.__craft.game!, r = g.renderer, drops = r.scene.children.filter(c => c.userData.worldDropKey !== undefined);
    const c = document.createElement("canvas"); c.width = r.canvas.width; c.height = r.canvas.height; const ctx = c.getContext("2d")!;
    const read = () => { r.renderer.render(r.scene, r.camera); ctx.drawImage(r.canvas, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
    for (const d of drops) d.visible = false; const absent = read();
    for (const d of drops) d.visible = true; const visible = read();
    let changed = 0; for (let i = 0; i < visible.length; i += 4) if (Math.abs(visible[i] - absent[i]) + Math.abs(visible[i + 1] - absent[i + 1]) + Math.abs(visible[i + 2] - absent[i + 2]) > 15) changed++;
    return changed;
  });
  expect(renderedPixels).toBeGreaterThan(5);
  await fs.writeFile(info.outputPath("ground-render-pixels.json"), JSON.stringify({ changedPixels: renderedPixels, profile: "same-frame drop meshes visible vs hidden; correctness only" }));
  await snap(page, info, "owned-book-worn-helmet-rendered-on-ground");
  // Inject only a storage failure, never a claimed output or ownership transfer.
  await page.evaluate(() => {
    const w = window as unknown as { __restoreStorage: () => void };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === "craft.save.v1") throw new DOMException("Test quota", "QuotaExceededError"); return original.call(this, key, value); };
    w.__restoreStorage = () => { Storage.prototype.setItem = original; };
  });
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  const quit = page.getByRole("button", { name: "Save & Quit to Title" });
  await press(quit); await expect(page.locator(".save-status")).toContainText("could not be saved");
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records.length)).toBe(owned.records.length);
  const downloadEvent = page.waitForEvent("download");
  await press(page.getByRole("button", { name: "Export world backup", exact: true }));
  const download = await downloadEvent, backupPath = info.outputPath("downloaded-world-backup.json");
  await download.saveAs(backupPath); const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  expect(backup.worldDrops.records.map((r: { stack: unknown }) => r.stack)).toEqual(owned.records.map(r => r.stack));
  await press(quit); await expect(page.locator(".save-status")).toContainText("could not be saved");
  await snap(page, info, "quota-error-still-retains-world-after-backup-download");
  await page.evaluate(() => (window as unknown as { __restoreStorage: () => void }).__restoreStorage());
  await press(quit); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!).worldDrops);
  expect(saved.records.map((r: { stack: unknown }) => r.stack)).toEqual(owned.records.map(r => r.stack));
  await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  const restoredRecords = await page.evaluate(() => window.__craft.game!.worldDrops.records);
  expect(restoredRecords.map(r => r.key)).toEqual(saved.records.map((r: { key: number }) => r.key));
  for (const r of restoredRecords) {
    const old = saved.records.find((o: { key: number }) => o.key === r.key);
    expect(Math.hypot(r.position.x - old.position.x, r.position.y - old.position.y, r.position.z - old.position.z)).toBeLessThan(.02);
    expect(r.ageSeconds).toBeGreaterThanOrEqual(old.ageSeconds);
    expect(r.ageSeconds - old.ageSeconds).toBeLessThan(10);
  }
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records.map(r => r.stack))).toEqual(owned.records.map(r => r.stack));
  await look(page, 0, -.2);
  // Natural movement, no teleport/pickup mutation: desktop W or real touch joystick.
  if (mobile) {
    const cdp = await page.context().newCDPSession(page), box = (await page.locator(".touch-stick-base").boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 77 }] });
    for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 12, id: 77 }] });
    try { await expect.poll(() => page.evaluate(() => window.__craft.game!.worldDrops.records.length)).toBe(0); }
    finally { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
  } else {
    await page.keyboard.down("KeyW");
    try { await expect.poll(() => page.evaluate(() => window.__craft.game!.worldDrops.records.length)).toBe(0); }
    finally { await page.keyboard.up("KeyW"); }
  }
  const bag = await page.evaluate(() => window.__craft.game!.inventory.slots);
  expect(bag.find(s => s?.book)).toEqual(fixture.book); expect(bag.find(s => s?.damage)).toEqual(fixture.helmet);
  if (!mobile) expect(bag.filter(s => s?.id === fixture.stoneId).reduce((n, s) => n + s!.count, 0)).toBe(64);
  expect(await page.evaluate(() => window.__craft.game!.body.position.z)).toBeLessThan(fixture.start.z);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "natural-movement-pickup-preserves-book-and-wear");
  // Keep a test-only reference: stopped sessions must never overwrite a later world's save.
  await page.evaluate(() => { (window as unknown as { __stoppedGame: unknown }).__stoppedGame = window.__craft.game; });
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await press(page.getByRole("button", { name: "Create New World" }));
  await page.getByLabel("Seed").fill("879222");
  await press(page.getByRole("button", { name: "Spawn Animals: On" }));
  await press(page.getByRole("button", { name: "Create", exact: true })); await waitForTerrain(page);
  const lifecycle = await page.evaluate(() => {
    const old = (window as unknown as { __stoppedGame: typeof window.__craft.game }).__stoppedGame!;
    const current = window.__craft.game!;
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    const afterPageHide = localStorage.getItem("craft.save.v1")!;
    const oldSaveResult = old.save();
    return { currentSeed: current.world.seed, oldSeed: old.world.seed, savedSeed: JSON.parse(afterPageHide).seed, oldSaveResult, unchanged: localStorage.getItem("craft.save.v1") === afterPageHide };
  });
  expect(lifecycle.currentSeed).not.toBe(lifecycle.oldSeed);
  expect(lifecycle.savedSeed).toBe(lifecycle.currentSeed);
  expect(lifecycle.oldSaveResult).toBe(false); expect(lifecycle.unchanged).toBe(true);
  await fs.writeFile(info.outputPath("two-world-save-lifecycle.json"), JSON.stringify({ ...lifecycle, pagehide: "synthetic browser event; not a physical browser shutdown" }));
  await snap(page, info, "second-world-owns-save-after-pagehide");
  expect(errors).toEqual([]);
}
