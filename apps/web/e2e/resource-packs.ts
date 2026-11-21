import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { command, createWorld, snap, waitForTerrain } from "./helpers";

function tile(key: string, size: 16 | 32, seed: number) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4;
    rgba[at] = (seed + x * 7) % 256; rgba[at + 1] = (seed * 2 + y * 9) % 256; rgba[at + 2] = (x < size / 2 ? 220 : 30); rgba[at + 3] = 255;
  }
  rgba[0] = 91; rgba[1] = 73; rgba[2] = 55; rgba[3] = 0; // Authored hidden RGB must survive import.
  return { key, width: size, height: size, rgbaBase64: rgba.toString("base64") };
}

/** Only original synthetic pixel fixtures are imported. No native assets or output-item injection. */
export async function resourcePacksRoute(page: Page, info: TestInfo, mobile: boolean) {
  await page.addInitScript(() => { Object.defineProperty(window.crypto, "subtle", { value: undefined, configurable: true }); });
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  await command(page, "/give iron_ingot 2");
  await page.evaluate(() => {
    const g = window.__craft.game!;
    g.inventory.slots[7] = { id: window.__craft.stackId("diamond_pickaxe"), count: 1, damage: 11 };
    g.inventory.slots[8] = { id: window.__craft.stackId("written_book"), count: 1, book: { title: "Keep this world", author: "Player", pages: ["Pack choice does not own my world."] } };
  });
  if (mobile) await press(page.getByRole("button", { name: "Take photo", exact: true })); else await page.keyboard.press("c");
  const saveQuit = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  };
  await saveQuit();
  let untouched = await page.evaluate(() => ({ world: localStorage.getItem("craft.save.v1"), portfolio: localStorage.getItem("craft.portfolio.v1") }));
  expect(JSON.parse(untouched.portfolio!)).toHaveLength(1);
  const checkUntouched = async () => expect(await page.evaluate(() => ({ world: localStorage.getItem("craft.save.v1"), portfolio: localStorage.getItem("craft.portfolio.v1") }))).toEqual(untouched);
  const open = async () => { await press(page.getByRole("button", { name: "Resource Packs", exact: true })); await expect(page.locator(".resource-packs-screen")).toBeVisible(); };
  const choose = async (name: string, buffer: Buffer) => {
    const chooserEvent = page.waitForEvent("filechooser"); await press(page.getByRole("button", { name: "Import texture pack", exact: true }));
    await (await chooserEvent).setFiles({ name, mimeType: "application/json", buffer });
  };
  const pixels = (key: string) => page.evaluate(k => { const t = window.__craft.atlas.sourceTile(k); return { width: t.width, height: t.height, rgba: [...t.rgba] }; }, key);
  const state = () => page.evaluate(() => ({ selected: window.__craft.texturePack, tileSize: window.__craft.atlas.tileSize, report: window.__craft.atlas.report }));
  const original = { stone: await pixels("stone"), iron: await pixels("item_iron_ingot") };
  const touchScrollEvidence: unknown[] = [];
  const fingerScroll = async (locator: Locator) => {
    const before = await locator.evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, extent: el.scrollHeight }));
    expect(before.extent).toBeGreaterThan(before.height);
    const box = (await locator.boundingBox())!, viewport = page.viewportSize()!;
    const x = Math.min(box.x + box.width * .65, viewport.width - 30), start = Math.min(box.y + box.height - 35, viewport.height - 35), end = Math.max(box.y + 30, start - 220);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: start, id: 73 }] });
    for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: start + (end - start) * i / 8, id: 73 }] }); await page.waitForTimeout(25); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach();
    await expect.poll(() => locator.evaluate(el => el.scrollTop)).toBeGreaterThan(before.top + 20);
    touchScrollEvidence.push({ before, after: await locator.evaluate(el => el.scrollTop) });
  };
  if (mobile) await fingerScroll(page.locator(".title-screen"));
  await open();
  if (mobile) {
    await fingerScroll(page.locator(".resource-packs-screen .panel"));
    const back = await page.getByRole("button", { name: "Back", exact: true }).boundingBox();
    expect(back!.y).toBeGreaterThanOrEqual(0); expect(back!.y + back!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await press(page.getByRole("button", { name: "Back", exact: true })); await open();
  }
  const defaultIcon = await page.getByAltText("iron ingot", { exact: true }).getAttribute("src");
  const a = { version: 1, name: "Authored Corners A", tiles: [tile("stone", 16, 35), tile("item_iron_ingot", 32, 99)] };
  const b = { version: 1, name: "B".repeat(80), tiles: [tile("stone", 16, 170), tile("item_iron_ingot", 16, 190)] };
  const bytesA = Buffer.from(JSON.stringify(a)), bytesB = Buffer.from(JSON.stringify(b));
  await choose("authored-a.json", bytesA); await expect(page.getByRole("button", { name: "Use pack", exact: true })).toBeVisible();
  expect((await state()).selected).toBeNull(); await checkUntouched();
  await press(page.getByRole("button", { name: "Use pack", exact: true }));
  await expect(page.locator(".pack-current")).toHaveText("Current: Authored Corners A"); await expect(page.locator(".pack-coverage")).toContainText("2 of 809 textures replaced; 807 use original");
  const selectedA = await state(); expect(selectedA.selected?.contentSha256).toBe(createHash("sha256").update(bytesA).digest("hex")); expect(selectedA.tileSize).toBe(32);
  expect(await pixels("stone")).toEqual({ width: 16, height: 16, rgba: [...Buffer.from(a.tiles[0].rgbaBase64, "base64")] });
  expect(await pixels("item_iron_ingot")).toEqual({ width: 32, height: 32, rgba: [...Buffer.from(a.tiles[1].rgbaBase64, "base64")] });
  const iconA = await page.getByAltText("iron ingot", { exact: true }).getAttribute("src"); expect(iconA).not.toBe(defaultIcon);
  expect(await page.getByAltText("iron ingot", { exact: true }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(48);
  await checkUntouched(); await snap(page, info, "local-pack-applied-exact-source-16-and-32-coverage");
  if (mobile) {
    for (const size of [{ width: 915, height: 412 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size); await page.locator(".pack-status").scrollIntoViewIfNeeded();
      const bounds = await page.locator(".pack-status").evaluate(el => { const a = el.getBoundingClientRect(), p = el.closest(".panel")!.getBoundingClientRect(); return { top: a.top, bottom: a.bottom, ptop: p.top, pbottom: p.bottom, h: innerHeight }; });
      expect(bounds.top).toBeGreaterThanOrEqual(bounds.ptop); expect(bounds.bottom).toBeLessThanOrEqual(Math.min(bounds.pbottom, bounds.h));
      await snap(page, info, `texture-choice-reachable-${size.width}x${size.height}`);
    }
    await page.setViewportSize({ width: 915, height: 412 });
  }
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  expect((await state()).selected).toEqual(selectedA.selected); await checkUntouched(); await open();
  for (const buffer of [Buffer.from("{bad json"), Buffer.from(JSON.stringify({ ...a, tiles: [a.tiles[0], a.tiles[0]] })), Buffer.from(JSON.stringify({ ...a, tiles: [{ ...a.tiles[0], key: "unsupported_texture_key" }] })), Buffer.from(JSON.stringify({ ...a, tiles: [{ ...a.tiles[0], rgbaBase64: "AAAA" }] }))]) {
    await choose("invalid.json", buffer); await expect(page.locator(".pack-status")).toContainText("could not be opened"); expect((await state()).selected).toEqual(selectedA.selected); await checkUntouched();
  }
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    (window as unknown as { __restorePackRead: () => void }).__restorePackRead = () => { File.prototype.arrayBuffer = read; };
    (window as unknown as { __packReadFinished: boolean }).__packReadFinished = false;
    File.prototype.arrayBuffer = function() { return new Promise((resolve, reject) => setTimeout(() => { read.call(this).then(value => { (window as unknown as { __packReadFinished: boolean }).__packReadFinished = true; resolve(value); }, reject); }, 150)); };
  });
  await choose("cancelled-read.json", bytesB); await press(page.getByRole("button", { name: "Back", exact: true }));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __packReadFinished: boolean }).__packReadFinished)).toBe(true);
  await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  expect((await state()).selected).toEqual(selectedA.selected); await checkUntouched();
  await page.evaluate(() => (window as unknown as { __restorePackRead: () => void }).__restorePackRead()); await open();
  await choose("authored-b.json", bytesB); await expect(page.getByRole("button", { name: "Use pack", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as unknown as { __restorePackPut: () => void }).__restorePackPut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function(value, key) { const request = put.call(this, value, key); if (this.name === "selection") this.transaction.abort(); return request; };
  });
  await press(page.getByRole("button", { name: "Use pack", exact: true })); await expect(page.locator(".pack-status")).toContainText("could not be saved");
  expect((await state()).selected).toEqual(selectedA.selected); await checkUntouched(); await snap(page, info, "aborted-pack-storage-preserves-current-pack-and-world");
  await page.evaluate(() => (window as unknown as { __restorePackPut: () => void }).__restorePackPut());
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); expect((await state()).selected).toEqual(selectedA.selected); await checkUntouched();

  // A blocked open rejects first; its delayed success must be closed, never applied late.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("pack-late-open-fixture")) return;
    sessionStorage.setItem("pack-late-open-fixture", "once");
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, version) {
      IDBFactory.prototype.open = open;
      const real = open.call(this, name, version), fake = { result: null as IDBDatabase | null, error: null, onblocked: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
      real.onerror = () => fake.onerror?.();
      real.onsuccess = () => {
        fake.result = real.result; const close = real.result.close.bind(real.result);
        real.result.close = () => { (window as unknown as { __latePackClosed: boolean }).__latePackClosed = true; close(); };
        fake.onblocked?.(); setTimeout(() => fake.onsuccess?.(), 30);
      };
      return fake as unknown as IDBOpenDBRequest;
    };
  });
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); await expect(page.locator(".pack-status")).toContainText("could not be loaded");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __latePackClosed?: boolean }).__latePackClosed)).toBe(true);
  expect((await state()).selected).toBeNull(); expect(await pixels("stone")).toEqual(original.stone); await checkUntouched();
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); expect((await state()).selected).toEqual(selectedA.selected);
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots[7]?.damage)).toBe(11);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots[8]?.book?.title)).toBe("Keep this world");
  await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    g.world.setBlock(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z) - 3, window.__craft.blockId("stone"));
  });
  if (mobile) await press(page.getByRole("button", { name: "Open inventory", exact: true })); else await page.keyboard.press("e");
  const ironSlot = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId("iron_ingot")));
  const inventory = page.locator(".inventory-screen");
  await expect(inventory.locator(`[data-slot="${ironSlot}"] img`)).toHaveJSProperty("naturalWidth", 64);
  await snap(page, info, "custom-32-source-inventory-icon-at-64-display-pixels");
  await press(inventory.locator(`[data-slot="${ironSlot}"]`)); await press(page.getByRole("button", { name: "Drop held item", exact: true }));
  await press(page.getByRole("button", { name: "Close inventory", exact: true }));
  await expect.poll(() => page.evaluate(() => window.__craft.game!.worldDrops.records.reduce((n, r) => n + (r.stack.id === window.__craft.stackId("iron_ingot") ? r.stack.count : 0), 0))).toBe(2);
  await expect.poll(() => page.evaluate(() => {
    const g = window.__craft.game!, a = window.__craft.atlas;
    const world = g.renderer as unknown as { atlasTexture: { image: { data: unknown; width: number } } };
    const drops = (g as unknown as { worldDropsView: { texture: { image: { data: unknown; width: number } }; meshes: Map<number, unknown> } }).worldDropsView;
    return world.atlasTexture.image.data === a.data && drops.texture.image.data === a.data && world.atlasTexture.image.width === a.width && drops.meshes.size > 0;
  })).toBe(true);
  await snap(page, info, "custom-atlas-inventory-world-and-real-ground-item");
  const groundView = await page.evaluate(() => {
    const g = window.__craft.game!, drop = g.worldDrops.records.find(r => r.stack.id === window.__craft.stackId("iron_ingot"))!;
    const view = (g as unknown as { worldDropsView: { meshes: Map<number, { position: { x: number; y: number; z: number } }> } }).worldDropsView;
    const mesh = view.meshes.get(drop.key)!, eye = g.renderer.camera.position;
    const dx = mesh.position.x - eye.x, dz = mesh.position.z - eye.z;
    g.body.yaw = Math.atan2(-dx, -dz); g.body.pitch = Math.atan2(mesh.position.y - eye.y, Math.hypot(dx, dz));
    return { key: drop.key, stack: structuredClone(drop.stack), eye: { x: eye.x, y: eye.y, z: eye.z }, position: { ...mesh.position } };
  });
  await expect.poll(() => page.evaluate(key => {
    const g = window.__craft.game!, mesh = (g as unknown as { worldDropsView: { meshes: Map<number, { position: { clone(): { project(camera: unknown): { x: number; y: number; z: number } } } }> } }).worldDropsView.meshes.get(key);
    if (!mesh) return false; const p = mesh.position.clone().project(g.renderer.camera);
    return Math.abs(p.x) < .8 && Math.abs(p.y) < .8 && p.z > -1 && p.z < 1;
  }, groundView.key)).toBe(true);
  await snap(page, info, "real-ground-item-custom-32-source-visible-in-camera");
  await saveQuit(); untouched = await page.evaluate(() => ({ world: localStorage.getItem("craft.save.v1"), portfolio: localStorage.getItem("craft.portfolio.v1") }));
  await open(); await choose("authored-b.json", bytesB); await expect(page.getByRole("button", { name: "Use pack", exact: true })).toBeVisible(); await press(page.getByRole("button", { name: "Use pack", exact: true }));
  await expect(page.locator(".pack-current")).toContainText(b.name); expect((await state()).tileSize).toBe(16);
  if (mobile) {
    await page.setViewportSize({ width: 375, height: 667 });
    for (const selector of [".pack-current", ".resource-packs-screen h3", ".pack-status"]) {
      const fits = await page.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1; }); expect(fits).toBe(true);
    }
    await snap(page, info, "eighty-character-pack-name-wraps-within-narrow-screen");
    await page.setViewportSize({ width: 915, height: 412 });
  }
  const iconB = await page.getByAltText("iron ingot", { exact: true }).getAttribute("src"); expect(iconB).not.toBe(iconA); expect(iconB).not.toBe(defaultIcon); await checkUntouched();
  await press(page.getByRole("button", { name: "Use original textures", exact: true }));
  await expect(page.locator(".pack-current")).toHaveText("Current: Original textures");
  expect(await pixels("stone")).toEqual(original.stone); expect(await pixels("item_iron_ingot")).toEqual(original.iron);
  expect(await page.getByAltText("iron ingot", { exact: true }).getAttribute("src")).toBe(defaultIcon); await checkUntouched();
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); expect((await state()).selected).toBeNull(); await checkUntouched();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("craft.local-textures.v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, transaction = db.transaction("selection", "readwrite"); transaction.objectStore("selection").put({ version: 1, bytes: new TextEncoder().encode("damaged stored pack").buffer }, "active"); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onabort = () => { db.close(); reject(transaction.error); }; };
  }));
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  await expect(page.locator(".pack-status")).toContainText("could not be loaded"); expect((await state()).selected).toBeNull(); await checkUntouched();
  await open(); await press(page.getByRole("button", { name: "Use original textures", exact: true }));
  await expect(page.locator(".pack-status")).toHaveText("Using original textures.");
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); await expect(page.locator(".pack-status")).toHaveCount(0); await checkUntouched();
  let nonsecureHttp: unknown = null;
  if (process.env.RESOURCE_PACK_HTTP_ORIGIN) {
    const context = await page.context().browser()!.newContext({ viewport: mobile ? { width: 915, height: 412 } : { width: 1280, height: 720 }, hasTouch: mobile, isMobile: mobile });
    try {
      const local = await context.newPage(); await local.goto(process.env.RESOURCE_PACK_HTTP_ORIGIN);
      await expect(local.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
      const capabilities = await local.evaluate(() => ({ origin: location.origin, secure: isSecureContext, subtleAvailable: !!globalThis.crypto?.subtle }));
      expect(capabilities.secure).toBe(false); expect(capabilities.subtleAvailable).toBe(false);
      await (mobile ? local.getByRole("button", { name: "Resource Packs", exact: true }).tap() : local.getByRole("button", { name: "Resource Packs", exact: true }).click());
      const chooser = local.waitForEvent("filechooser"); await (mobile ? local.getByRole("button", { name: "Import texture pack", exact: true }).tap() : local.getByRole("button", { name: "Import texture pack", exact: true }).click());
      await (await chooser).setFiles({ name: "nonsecure-original-art.json", mimeType: "application/json", buffer: bytesA });
      await expect(local.getByRole("button", { name: "Use pack", exact: true })).toBeVisible();
      await (mobile ? local.getByRole("button", { name: "Use pack", exact: true }).tap() : local.getByRole("button", { name: "Use pack", exact: true }).click());
      await expect(local.locator(".pack-current")).toHaveText("Current: Authored Corners A");
      await local.reload(); await expect(local.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
      expect(await local.evaluate(() => window.__craft.texturePack?.contentSha256)).toBe(createHash("sha256").update(bytesA).digest("hex"));
      nonsecureHttp = { ...capabilities, selected: await local.evaluate(() => window.__craft.texturePack) };
      await snap(local, info, "actual-nonsecure-http-origin-import-and-reload-without-webcrypto");
    } finally { await context.close(); }
  }
  await fs.writeFile(info.outputPath("resource-pack-evidence.json"), JSON.stringify({ fixtures: "Original synthetic16/32corner rasters inclhiddenRGB; raw tool/book metadata; actualphoto. Realfilechooser, apply/reload/reset/invalidfiles, actualIDBabort and delayed-open fault, inventorydrop. crypto.subtle absent throughout. Nativepixeldata neverused.", selectedA, groundView, touchScrollEvidence, nonsecureHttp, final: await state(), original, bytesASha256: createHash("sha256").update(bytesA).digest("hex"), bytesBSha256: createHash("sha256").update(bytesB).digest("hex"), unchangedKeys: untouched, errors }, null, 2));
  expect(errors).toEqual([]);
}
