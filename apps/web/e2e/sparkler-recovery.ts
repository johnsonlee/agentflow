import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createWorld, snap } from "./helpers";

/** An inactive preowned kit is disclosed; the active owner is produced solely by the real offhand Light button.
 * Only after actual Save & Quit do we deliberately corrupt its stored count to exercise recovery. */
export async function sparklerRecoveryRoute(page: Page, info: TestInfo, mobile: boolean) {
  let stage = "create-world", failure: string | null = null, expectedCorruptRaw: string | null = null;
  let errors: string[] = [];
  const owners = () => page.evaluate(() => {
    const g = window.__craft.game;
    if (!g) return null;
    const screen = (g as unknown as { inventoryScreen: { pendingItems(): unknown[] } }).inventoryScreen;
    return { inventory: g.inventory.toJSON(), drops: g.worldDrops.records, pending: screen.pendingItems() };
  });
  try {
    errors = await createWorld(page, { mode: "survival" });
    stage = "inactive-kit-and-real-offhand-light";
    const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
    const pause = async () => {
      if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
      else await page.keyboard.press("Escape");
      await expect(page.locator(".pause-screen")).toBeVisible();
    };
    const resumeCold = async () => {
      await page.reload();
      await press(page.getByRole("button", { name: /Continue/ }));
      await expect(page.locator(".chat-log")).toContainText("Saved data needs attention");
      // Recovery intentionally suspends player physics, so onGround is not a readiness condition.
      await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
    };
    const storage = () => page.evaluate(() => localStorage.getItem("craft.save.v1"));
    const fixture = await page.evaluate(() => {
      const g = window.__craft.game!;
      g.inventory.slots.fill(null);
      const red = window.__craft.stackId("red_sparkler"), blue = window.__craft.stackId("blue_sparkler");
      g.inventory.slots[0] = { id: red, count: 2, sparkler: { state: "inactive" } };
      g.inventory.slots[1] = { id: blue, count: 1, sparkler: { state: "inactive" } };
      return { red, blue };
    });
    if (mobile) await press(page.locator('.hotbar [data-slot="0"]'));
    else await page.keyboard.press("Digit1");
    await press(page.getByRole("button", { name: "Swap selected item with offhand", exact: true }));
    const shake = page.getByRole("button", { name: "Light offhand sparkler", exact: true });
    await expect(shake).toBeEnabled(); await press(shake);
    const actualActive = { id: fixture.red, count: 1, sparkler: { state: "active" } };
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.offhand)).toEqual(actualActive);
    await expect(shake).toBeDisabled();
    await snap(page, info, "legitimately-lit-singleton-before-save-corruption");
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
    stage = "valid-save-before-storage-corruption";
    const validRaw = (await storage())!;
    expect(JSON.parse(validRaw).inventory.offhand).toEqual(actualActive);
    // Corruption is the explicit recovery fixture, not a manufactured gameplay outcome.
    // Keep whitespace and an unknown marker so equality proves byte-exact preservation, not reserialization.
    const corrupt = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("craft.save.v1")!);
      if (data.inventory.offhand?.sparkler?.state !== "active" || data.inventory.offhand.count !== 1) throw new Error("Expected actual saved active singleton before corruption");
      data.inventory.offhand.count = 2;
      data.recoveryFixtureNote = " Deliberately invalid active count; retain original whitespace. ";
      const raw = `\n${JSON.stringify(data, null, 2)}\n`;
      localStorage.setItem("craft.save.v1", raw); return raw;
    });
    expectedCorruptRaw = corrupt;
    stage = "corrupt-continue-full-constructor";
    await resumeCold();
    const diagnostics = await page.evaluate(() => window.__craft.game!.loadErrors);
    expect(diagnostics.some(line => line.includes("inventory.offhand") && line.includes("original save preserved"))).toBe(true);
    expect(await storage()).toBe(corrupt);
    // The sanitized visible owner is not sufficient evidence of preservation: retain and compare the raw envelope too.
    expect(await page.evaluate(() => window.__craft.game!.inventory.offhand)).toBeNull();
    // Tick-driven number-key selection is suspended in recovery; the actual HUD selector remains available.
    await press(page.locator('.hotbar [data-slot="1"]'));
    const selectedLight = page.getByRole("button", { name: "Light selected sparkler", exact: true });
    await expect(selectedLight).toBeVisible(); await expect(selectedLight).toBeDisabled();
    stage = "recovery-control-refusals";
    const beforeControls = await owners();
    if (mobile) await press(page.getByRole("button", { name: "Open inventory", exact: true }));
    else await page.keyboard.press("KeyE");
    await expect(page.locator(".inventory-screen")).toBeVisible();
    await press(page.locator('.inventory-screen [data-slot="1"]'));
    await expect(page.locator(".inventory-screen")).toContainText("Saved items need repair");
    expect(await owners()).toEqual(beforeControls);
    await press(page.getByRole("button", { name: "Close inventory", exact: true }));
    if (!mobile) await page.keyboard.press("KeyQ"); // Actual drop edge is refused during recovery.
    expect(await owners()).toEqual(beforeControls); expect(await storage()).toBe(corrupt);
    await snap(page, info, "constructor-diagnostic-disabled-light-and-refused-owner-transfer");
    stage = "natural-autosave-refusal";
    // Wait for the real 30-second tick autosave; do not move its timer or call save directly.
    await expect.poll(() => page.evaluate(() => window.__craft.game!.saveError), { timeout: 60_000, intervals: [500] }).toContain("Damaged saved items");
    const autosaveError = await page.evaluate(() => window.__craft.game!.saveError);
    expect(await storage()).toBe(corrupt); expect(await owners()).toEqual(beforeControls);
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.locator(".pause-screen")).toBeVisible();
    await expect(page.locator(".save-status")).toContainText("Damaged saved items");
    expect(await storage()).toBe(corrupt);
    stage = "actual-backup-download";
    const downloadEvent = page.waitForEvent("download");
    await press(page.getByRole("button", { name: "Export world backup" }));
    const backupPath = info.outputPath("sparkler-invalid-count-original-backup.json");
    await (await downloadEvent).saveAs(backupPath);
    const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
    expect(backup.recoveryOriginalSave).toBe(corrupt); expect(JSON.parse(backup.recoveryOriginalSave).inventory.offhand.count).toBe(2);
    expect(await storage()).toBe(corrupt);
    await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.locator(".pause-screen")).toBeVisible(); expect(await storage()).toBe(corrupt);
    await snap(page, info, "actual-download-preserves-exact-original-and-does-not-unlock-saving");
    stage = "pagehide-and-second-constructor";
    // Actual navigation runs pagehide; a second full constructor must still diagnose the original envelope.
    await resumeCold();
    expect(await storage()).toBe(corrupt);
    const secondDiagnostics = await page.evaluate(() => window.__craft.game!.loadErrors);
    expect(secondDiagnostics.some(line => line.includes("inventory.offhand") && line.includes("original save preserved"))).toBe(true);
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.locator(".save-status")).toContainText("Damaged saved items"); expect(await storage()).toBe(corrupt);
    await fs.writeFile(info.outputPath("sparkler-recovery-coverage.json"), JSON.stringify({ fixture: "Preowned inactive red2/blue1 only; real HUD swap moves red2 into offhand before lighting. Real HUD offhand Light created one active red owner; actual Save & Quit persisted it. Storage corruption changes only its offhand count to2 and adds an unknown marker/whitespace. No direct active/product outcome assignment.", controls: mobile ? "actual UI taps; no physical phone claim" : "actual UI clicks/keyboard", fixtureIds: fixture, actualActive, diagnostics, secondDiagnostics, autosave: { wait: "natural 30-second Game tick, no timer acceleration or save invocation", error: autosaveError }, exercised: ["full constructor raw diagnostic before owner repair", "disabled activation", "actual inventory click refusal", ...(mobile ? [] : ["actual Q drop refusal"]), "natural autosave refusal", "actual Save & Quit refusal before and after download", "actual browser download exact recoveryOriginalSave", "navigation pagehide and second constructor raw preservation"], excluded: ["duplicate furnace raw case", "repair/import workflow", "native state/lifetime fidelity", "performance", "physical phone"], exactOriginalLength: corrupt.length, errors }, null, 2));
    stage = "complete";
    expect(errors).toEqual([]);
  } catch (error) {
    failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw error;
  } finally {
    // Failure evidence is best-effort and never replaces the original assertion failure.
    const diagnostics = await page.evaluate(() => {
      const g = window.__craft?.game;
      return { rawStorage: localStorage.getItem("craft.save.v1"), loadErrors: g?.loadErrors ?? null, saveError: g?.saveError ?? null,
        paused: g?.paused ?? null, selected: g?.inventory.selected ?? null };
    }).catch(error => ({ readbackFailure: String(error) }));
    const finalOwners = await owners().catch(error => ({ readbackFailure: String(error) }));
    await fs.writeFile(info.outputPath("sparkler-recovery-final-diagnostics.json"), JSON.stringify({ stage, failure, expectedCorruptRaw, diagnostics, owners: finalOwners, errors }, null, 2))
      .catch((error: unknown) => console.error(`Could not retain sparkler recovery diagnostics: ${String(error)}`));
  }
}
