import { expect, type Page, type Locator, type TestInfo } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const original = readFileSync(new URL("../../../packages/engine/test/fixtures/world-save-import-v1.json", import.meta.url), "utf8");
const expected = JSON.parse(original), KEY = "craft.save.v1", BACKUP = "craft.save.import.previous.v1";
const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const activate = async (locator: Locator, touch: boolean) => { if (touch) await locator.tap(); else await locator.click(); };
async function activateKeyboard(page: Page, control: Locator) {
  for (let n = 0; n < 12 && !await control.evaluate(el => el === document.activeElement); n++) await page.keyboard.press("Tab");
  await expect(control).toBeFocused(); await page.keyboard.press("Enter");
}
type Witness = { name: string; at: string; viewport: unknown; activeElement: unknown; rawSHA256: string | null; game: unknown };
function recorder(page: Page, info: TestInfo, label: string) {
  const phases: Witness[] = [];
  return {
    phases,
    async phase(name: string) {
      const witness = await page.evaluate(key => {
        const g = window.__craft.game, raw = localStorage.getItem(key);
        return { raw, activeElement: { tag: document.activeElement?.tagName, text: document.activeElement?.textContent }, game: g ? {
          seed: g.world.seed, mode: g.mode, position: { ...g.body.position }, flying: g.body.flying, inventory: g.inventory.toJSON(), agent: structuredClone(g.agent), edits: g.world.exportEdits(),
          composters: g.world.composters.toJSON(), drops: g.worldDrops.toJSON(), loadErrors: [...g.loadErrors], saveError: g.saveError,
          recovery: (g as unknown as { recoverySections: string[] }).recoverySections.slice(),
          actionsNeedRecovery: (g as unknown as { readonly actionsNeedRecovery: boolean }).actionsNeedRecovery,
        } : null };
      }, KEY);
      const { raw, ...rest } = witness;
      phases.push({ name, at: new Date().toISOString(), viewport: page.viewportSize(), rawSHA256: raw === null ? null : hash(raw), ...rest });
      writeFileSync(info.outputPath(`${label}-phase-witnesses.json`), JSON.stringify({ devBinding: process.env.WORLD_IMPORT_DEV_BINDING, importedInputRevision: "397097b6784c59ff2b64f527b21ebdb21a5a1e26", importedRawSHA256: hash(original), coverage: label, phases }, null, 2));
      await page.screenshot({ path: info.outputPath(`${label}-${String(phases.length).padStart(2, "0")}-${name}.png`) });
      return witness;
    },
  };
}
async function raw(page: Page) { return page.evaluate(key => localStorage.getItem(key), KEY); }
async function freshSavedWorld(page: Page, touch: boolean, width: number, height: number) {
  await page.setViewportSize({ width, height }); await page.goto(`/?touch=${touch ? "1" : "0"}`);
  // Isolated author test origin reset only. All actual worlds are then created through UI.
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await activate(page.getByRole("button", { name: "Create New World", exact: true }), touch);
  await page.getByLabel("World name", { exact: true }).fill(`Before import ${width}`);
  await page.getByLabel("Seed", { exact: true }).fill("2468");
  await activate(page.getByRole("button", { name: "Game Mode: Creative", exact: true }), touch);
  await activate(page.getByRole("button", { name: "Spawn Animals: On", exact: true }), touch);
  await activate(page.getByRole("button", { name: "Create", exact: true }), touch);
  await ready(page); await saveQuit(page, touch);
  const before = await raw(page); expect(before).toBeTruthy(); return before!;
}
async function ready(page: Page) {
  await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, {}, { timeout: 60_000 });
}
async function saveQuit(page: Page, touch: boolean) {
  if (touch) await page.getByRole("button", { name: "Pause", exact: true }).tap(); else await page.keyboard.press("Escape");
  await activate(page.getByRole("button", { name: "Save & Quit to Title", exact: true }), touch);
  await expect(page.getByRole("button", { name: "Import world / backup", exact: true })).toBeVisible();
}
async function openImport(page: Page, touch: boolean) {
  await activate(page.getByRole("button", { name: "Import world / backup", exact: true }), touch);
  await expect(page.getByRole("heading", { name: "Import world / backup", exact: true })).toBeVisible();
}
async function choose(page: Page, touch: boolean, data: string | Buffer = original, name = "actual-segment002.json", keyboard = false) {
  const chooser = page.waitForEvent("filechooser");
  const control = page.getByRole("button", { name: "Choose world backup", exact: true });
  if (keyboard) {
    for (let n = 0; n < 8 && !await control.evaluate(el => el === document.activeElement); n++) await page.keyboard.press("Tab");
    await expect(control).toBeFocused(); await page.keyboard.press("Enter");
  } else await activate(control, touch);
  await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8") });
}
async function noHorizontalClip(page: Page) {
  const metrics = await page.locator(".world-import-screen .panel").evaluate(panel => {
    const p = panel.getBoundingClientRect();
    return { left: p.left, right: p.right, viewport: innerWidth, scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth,
      buttons: [...panel.querySelectorAll("button")].filter(b => !b.hidden).map(b => { const r = b.getBoundingClientRect(); return { width: r.width, height: r.height }; }),
      bodyFont: getComputedStyle(panel.querySelector(".hint")!).fontSize };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(0); expect(metrics.right).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1); expect(Number.parseFloat(metrics.bodyFont)).toBeGreaterThanOrEqual(16);
  expect(metrics.buttons.every(b => b.width >= 44 && b.height >= 44)).toBe(true);
  return metrics;
}
async function download(page: Page, info: TestInfo, touch: boolean, button: string, filename: string, expectedRaw: string) {
  const pending = page.waitForEvent("download"); await activate(page.getByRole("button", { name: button, exact: true }), touch);
  const d = await pending; const destination = info.outputPath(filename); await d.saveAs(destination);
  expect(readFileSync(destination, "utf8")).toBe(expectedRaw);
  return { filename: destination, SHA256: hash(expectedRaw), suggestedFilename: d.suggestedFilename() };
}
function canonicalEdits(edits: unknown[]) { return edits.map(x => JSON.stringify(x)).sort(); }
async function importedOwners(page: Page, baseline: typeof expected, coldStartedAt: number) {
  const s = await page.evaluate(() => {
    const g = window.__craft.game!;
    return { mode: g.mode, seed: g.world.seed, inventory: g.inventory.toJSON(), agent: structuredClone(g.agent), edits: g.world.exportEdits(), composters: g.world.composters.toJSON(), drops: g.worldDrops.toJSON(), flying: g.body.flying, actionsNeedRecovery: (g as unknown as { readonly actionsNeedRecovery: boolean }).actionsNeedRecovery, loadErrors: g.loadErrors,
      recovery: (g as unknown as { recoverySections: string[] }).recoverySections, saveError: g.saveError };
  });
  expect(s.mode).toBe("survival"); expect(s.seed).toBe(2468); expect(s.inventory).toEqual(expected.inventory); expect(s.agent).toEqual(expected.agent);
  expect(canonicalEdits(s.edits)).toEqual(canonicalEdits(expected.edits)); expect(s.composters).toEqual(expected.composters);
  expect(s.recovery).toEqual([]); expect(s.actionsNeedRecovery).toBe(false); expect(s.flying).toBe(false); expect(s.loadErrors).toEqual([]); expect(s.saveError).toBe("");
  expect(s.drops.nextKey).toBe(baseline.worldDrops.nextKey);
  expect(s.drops.records.map(r => r.key).sort()).toEqual(baseline.worldDrops.records.map((r: any) => r.key).sort());
  for (const saved of baseline.worldDrops.records) {
    const actual = s.drops.records.find(r => r.key === saved.key)!; expect(actual.stack).toEqual(saved.stack);
    expect(actual.position.x).toBe(saved.position.x); expect(actual.position.z).toBe(saved.position.z); expect(actual.position.y).toBeCloseTo(saved.position.y, 5);
    for (const axis of ["x", "y", "z"] as const) expect(actual.velocity[axis]).toBeCloseTo(saved.velocity[axis], 8);
    expect(actual.pickupDelaySeconds).toBe(saved.pickupDelaySeconds);
    expect(actual.ageSeconds).toBeGreaterThanOrEqual(saved.ageSeconds);
    expect(actual.ageSeconds).toBeLessThanOrEqual(saved.ageSeconds + (Date.now() - coldStartedAt) / 1000 + 2);
  }
  return s;
}
export async function validWorldImport(page: Page, info: TestInfo, touch: boolean) {
  const receipts: unknown[] = [];
  for (const viewport of touch ? [{ width: 390, height: 844 }, { width: 915, height: 412 }] : [{ width: 1280, height: 720 }]) {
    const label = `valid-${viewport.width}`, record = recorder(page, info, label);
    const before = await freshSavedWorld(page, touch, viewport.width, viewport.height); await openImport(page, touch);
    await record.phase("real-old-world-saved-import-empty"); const initialBounds = await noHorizontalClip(page);
    await choose(page, touch, original, "actual-segment002.json", !touch);
    await expect(page.getByRole("button", { name: "Replace current world", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Selected world backup" })).toContainText("My World");
    expect(await raw(page)).toBe(before); expect(await page.evaluate(() => window.__craft.game)).toBeNull();
    const previewBounds = await noHorizontalClip(page); await record.phase("actual-filechooser-preview-no-game-no-write");
    const originalDownload = await download(page, info, touch, "Download original world backup", `${label}-original-backup.json`, before);
    if (touch) await page.getByRole("button", { name: "Cancel", exact: true }).tap(); else await activateKeyboard(page, page.getByRole("button", { name: "Cancel", exact: true })); expect(await raw(page)).toBe(before);
    await record.phase("real-cancel-retains-world"); await openImport(page, touch); await choose(page, touch);
    if (touch) await page.getByRole("button", { name: "Replace current world", exact: true }).tap(); else await activateKeyboard(page, page.getByRole("button", { name: "Replace current world", exact: true }));
    await expect(page.getByRole("button", { name: "Continue “My World”", exact: true })).toBeVisible();
    expect(await raw(page)).toBe(original); expect(await page.evaluate(() => window.__craft.game)).toBeNull();
    expect(await page.evaluate(key => localStorage.getItem(key), BACKUP)).toBe(before);
    await record.phase("explicit-replace-exact-input-no-auto-game");
    const previousDownload = await download(page, info, touch, "Download previous world backup", `${label}-previous-backup.json`, before);
    const firstColdStartedAt = Date.now(); await page.reload(); await activate(page.getByRole("button", { name: "Continue “My World”", exact: true }), touch); await ready(page); const first = await importedOwners(page, expected, firstColdStartedAt);
    await record.phase("actual-cold-Continue-original-owned-items-and-stations");
    await saveQuit(page, touch); const coldRaw = await raw(page); writeFileSync(info.outputPath(`${label}-new-runtime-save-quit.json`), coldRaw!, "utf8");
    const secondColdStartedAt = Date.now(); await page.reload(); await activate(page.getByRole("button", { name: "Continue “My World”", exact: true }), touch); await ready(page); const second = await importedOwners(page, JSON.parse(coldRaw!), secondColdStartedAt);
    await record.phase("new-runtime-savequit-reload-Continue-owned-state"); await saveQuit(page, touch);
    receipts.push({ viewport, initialBounds, previewBounds, originalDownload, previousDownload, actualInputSHA256: hash(original), beforeSHA256: hash(before), newRuntimeColdRawSHA256: hash(coldRaw!), first, second });
  }
  writeFileSync(info.outputPath("valid-import-receipts.json"), JSON.stringify({ devBinding: process.env.WORLD_IMPORT_DEV_BINDING, inputHistoric397: true, inputRawSHA256: hash(original), actualNewRuntimeColdVerification: true, naturalAcquisitionRerun: false, receipts }, null, 2));
}
export async function refusedWorldImports(page: Page, info: TestInfo, touch: boolean) {
  const receipts: unknown[] = [];
  for (const viewport of touch ? [{ width: 390, height: 844 }, { width: 915, height: 412 }] : [{ width: 1280, height: 720 }]) {
    const label = `refuse-${viewport.width}`, record = recorder(page, info, label), before = await freshSavedWorld(page, touch, viewport.width, viewport.height);
    await openImport(page, touch);
    for (const [name, buffer, text] of [["bad.json", Buffer.from("{"), "JSON"], ["native.mcworld", Buffer.from(original), "not supported"], ["invalid-utf8.json", Buffer.from([0xc3, 0x28]), "UTF-8"], ["too-large.json", Buffer.alloc(8 * 1024 * 1024 + 1), "8 MiB"]] as const) {
      await choose(page, touch, buffer, name); await expect(page.getByRole("alert")).toContainText(text); expect(await raw(page)).toBe(before); await noHorizontalClip(page); await record.phase(`refused-${name}`);
    }
    // File/storage failure fixtures affect only environment APIs, never Game/world/camera/cargo/RNG.
    await page.evaluate(() => { const original = File.prototype.arrayBuffer; (window as any).__restoreFile = () => { File.prototype.arrayBuffer = original; }; File.prototype.arrayBuffer = () => Promise.reject(Error("Fixture file read denied")); });
    await choose(page, touch); await expect(page.getByRole("alert")).toContainText("Fixture file read denied"); expect(await raw(page)).toBe(before); await record.phase("actual-file-read-refusal-preserves-current-raw"); await page.evaluate(() => (window as any).__restoreFile());
    await choose(page, touch); await expect(page.getByRole("button", { name: "Replace current world", exact: true })).toBeVisible();
    await page.evaluate(key => { const original = Storage.prototype.setItem; (window as any).__restoreStorage = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function (k: string, v: string) { if (k === key) throw new DOMException("Fixture quota", "QuotaExceededError"); original.call(this, k, v); }; }, KEY);
    await activate(page.getByRole("button", { name: "Replace current world", exact: true }), touch); await expect(page.getByRole("alert")).toContainText("current world is unchanged"); expect(await raw(page)).toBe(before);
    const rotated = await page.evaluate(key => localStorage.getItem(key), BACKUP); expect(rotated).toBe(before); await record.phase("actual-quota-failure-retains-current-backup-rotation-disclosed"); await page.evaluate(() => (window as any).__restoreStorage());
    await page.evaluate(() => { const original = File.prototype.arrayBuffer; (window as any).__releaseFile = null; (window as any).__restoreFile = () => { File.prototype.arrayBuffer = original; }; File.prototype.arrayBuffer = function () { const file = this; return new Promise<ArrayBuffer>((resolve, reject) => { (window as any).__releaseFile = () => original.call(file).then(resolve, reject); }); }; });
    await choose(page, touch); await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseFile)).toBe("function");
    await activate(page.getByRole("button", { name: "Cancel", exact: true }), touch); await page.evaluate(() => (window as any).__releaseFile()); await page.waitForTimeout(100);
    expect(await raw(page)).toBe(before); expect(await page.evaluate(() => window.__craft.game)).toBeNull(); await expect(page.getByRole("heading", { name: "Import world / backup", exact: true })).toHaveCount(0);
    await record.phase("real-Cancel-before-late-file-read-no-replace-no-game");
    receipts.push({ viewport, beforeSHA256: hash(before), finalSHA256: hash((await raw(page))!), failureFixtures: ["File.arrayBuffer rejection/delay", "Storage.setItem quota on active key"], syntheticWorldOrCargoSetup: false });
  }
  writeFileSync(info.outputPath("refusal-receipts.json"), JSON.stringify({ devBinding: process.env.WORLD_IMPORT_DEV_BINDING, receipts }, null, 2));
}
export async function staleOtherTabImport(page: Page, info: TestInfo, touch: boolean) {
  const width = touch ? 915 : 1280, height = touch ? 412 : 720, record = recorder(page, info, `stale-${width}`);
  const before = await freshSavedWorld(page, touch, width, height); await openImport(page, touch); await choose(page, touch);
  await expect(page.getByRole("button", { name: "Replace current world", exact: true })).toBeVisible(); await record.phase("first-tab-file-preview-current-old-world");
  const other = await page.context().newPage();
  try {
    await other.goto(`/?touch=${touch ? "1" : "0"}`); await openImport(other, touch); await choose(other, touch);
    await activate(other.getByRole("button", { name: "Replace current world", exact: true }), touch);
    await expect(other.getByRole("button", { name: "Continue “My World”", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("world changed"); await expect(page.getByRole("button", { name: "Replace current world", exact: true })).toBeHidden();
    expect(await raw(page)).toBe(original); expect(await page.evaluate(() => window.__craft.game)).toBeNull();
    const backup = await download(page, info, touch, "Download original world backup", `stale-${width}-original-screen-backup.json`, before);
    await expect(page.getByRole("status")).toContainText("when this screen opened"); await noHorizontalClip(page); await record.phase("real-second-tab-import-invalidates-first-preview-original-snapshot-download-exact");
    writeFileSync(info.outputPath("stale-other-tab-receipt.json"), JSON.stringify({ viewport: page.viewportSize(), changedByActualOtherTabUIImport: true, currentRawSHA256: hash(original), originalOpeningSnapshotBackup: backup, noCurrentWorldOverwriteByStaleTab: true }, null, 2));
  } finally { await other.close(); }
}
