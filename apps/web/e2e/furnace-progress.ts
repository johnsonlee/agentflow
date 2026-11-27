import { nativePageWorldTap } from './native-world-tap';
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { aimAtTop, blockAt, countStack, createWorld, lookAtCell, parkMouse, pressMouse, snap, target } from "./helpers";

/** Raw furnace/iron/diamond ore/coal and flat support are fixtures; cooking and ownership use real UI. */
export async function furnaceProgressRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const cdp = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => { if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("stone"));
      for (let dy = 1; dy <= 4; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    const furnace = window.__craft.blockId("furnace"), iron = window.__craft.stackId("iron_ore"), diamond = window.__craft.stackId("diamond_ore"), coal = window.__craft.stackId("coal");
    g.inventory.slots.fill(null);
    g.inventory.slots[0] = { id: furnace, count: 1 };
    g.inventory.slots[1] = { id: iron, count: 1 }; g.inventory.slots[2] = { id: iron, count: 1 };
    g.inventory.slots[3] = { id: diamond, count: 1 }; g.inventory.slots[4] = { id: coal, count: 2 };
    g.inventory.select(0);
    return { x, y: floor + 1, z: z - 2, furnace, iron, diamond, coal };
  });
  if (!mobile) await parkMouse(page);
  await aimAtTop(page, fixture.x, fixture.y - 1, fixture.z); await target(page); await use();
  await expect.poll(() => blockAt(page, fixture.x, fixture.y, fixture.z)).toBe(fixture.furnace);
  await page.waitForTimeout(300);
  const open = async () => {
    await lookAtCell(page, fixture.x, fixture.y, fixture.z); await target(page); await use();
    await expect(page.getByRole("heading", { name: "Furnace", exact: true })).toBeVisible();
  };
  await open();
  const inv = page.locator(".inventory-screen"), input = inv.locator('[data-furnace="input"]'), output = inv.locator('[data-furnace="output"]');
  const read = () => page.evaluate(() => structuredClone([...window.__craft.game!.furnaces.values()][0]));
  // Read-only listeners bracket the same synchronous input event; no simulation work can occur between them.
  const inputClick = async () => {
    await page.evaluate(() => {
      const snapshot = () => ({ state: structuredClone([...window.__craft.game!.furnaces.values()][0]), now: performance.now() });
      const sample: { before?: ReturnType<typeof snapshot>; after?: ReturnType<typeof snapshot>; stop?: () => void } = {};
      const capture = (event: Event) => { if ((event.target as Element)?.closest('[data-furnace="input"]')) sample.before = snapshot(); };
      const bubble = (event: Event) => { if ((event.target as Element)?.closest('[data-furnace="input"]')) sample.after = snapshot(); };
      document.addEventListener("click", capture, true); document.addEventListener("click", bubble);
      sample.stop = () => { document.removeEventListener("click", capture, true); document.removeEventListener("click", bubble); };
      (window as unknown as { __furnaceInputSample: typeof sample }).__furnaceInputSample = sample;
    });
    try { await press(input); }
    finally { await page.evaluate(() => (window as unknown as { __furnaceInputSample: { stop(): void } }).__furnaceInputSample.stop()); }
    return page.evaluate(() => {
      const sample = (window as unknown as { __furnaceInputSample: { before?: unknown; after?: unknown } }).__furnaceInputSample;
      if (!sample.before || !sample.after) throw new Error("The actual furnace input click was not observed");
      return structuredClone({ before: sample.before, after: sample.after });
    }) as Promise<{ before: { state: Awaited<ReturnType<typeof read>>; now: number }; after: { state: Awaited<ReturnType<typeof read>>; now: number } }>;
  };
  await press(inv.locator('[data-slot="4"]')); await press(inv.locator('[data-furnace="fuel"]'));
  await press(inv.locator('[data-slot="1"]')); await press(input);
  // Stage the next owned input before waiting, so no extra inventory selection delays the observed click.
  await press(inv.locator('[data-slot="2"]'));
  await expect.poll(async () => (await read()).progress).toBeGreaterThanOrEqual(.25);
  const topup = await inputClick();
  expect(topup.before.state.input?.id).toBe(fixture.iron);
  expect(topup.before.state.progress).toBeGreaterThan(0);
  expect(topup.after.state.input).toEqual({ id: fixture.iron, count: topup.before.state.input!.count + 1 });
  expect(topup.after.state.progress).toBe(topup.before.state.progress);
  expect(topup.after.state.progressInputId).toBe(fixture.iron);
  await press(inv.locator('[data-slot="3"]'));
  await expect.poll(async () => (await read()).progress).toBeGreaterThanOrEqual(.45);
  const swap = await inputClick(), swapped = swap.after.state;
  expect(swap.before.state.input?.id).toBe(fixture.iron);
  expect(swap.before.state.progress).toBeGreaterThan(0);
  expect(swapped.input).toEqual({ id: fixture.diamond, count: 1 });
  expect(swapped.progress).toBe(0); expect(swapped.progressInputId).toBeUndefined();
  // Old iron may have legitimately completed while the real UI was operating. Account every owner.
  const returnedIron = swap.before.state.input!.count;
  const ironIngot = await page.evaluate(() => window.__craft.stackId("iron_ingot"));
  const cookedIron = swapped.output?.id === ironIngot ? swapped.output.count : 0;
  expect(returnedIron + cookedIron).toBe(2);
  if (swapped.output) expect(swapped.output.id).toBe(ironIngot);
  await expect(inv.getByTestId("cursor")).toContainText(`Iron Ore ×${returnedIron}`);
  await press(inv.locator('[data-slot="5"]'));
  expect(await countStack(page, "iron_ore")).toBe(returnedIron);
  if (cookedIron) {
    await press(output); await press(inv.locator('[data-slot="9"]'));
    expect(await countStack(page, "iron_ingot")).toBe(cookedIron);
  }
  // Pause through the real UI before screenshots. Rendering/automation work must not impose an elapsed-time ceiling.
  await expect.poll(async () => (await read()).progress).toBeGreaterThanOrEqual(.2);
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
  const paused = await read();
  expect(paused.input).toEqual({ id: fixture.diamond, count: 1 }); expect(paused.output).toBeNull();
  expect(paused.progress).toBeGreaterThan(0); expect(paused.progress).toBeLessThan(1);
  expect(paused.progressInputId).toBe(fixture.diamond);
  await snap(page, info, "real-paused-partial-cook-after-identity-reset");
  expect(await read()).toEqual(paused);
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!).furnaces[0].state);
  expect(saved).toEqual(paused);
  await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
  await page.waitForFunction(() => window.__craft.game !== null);
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
  const restored = await read();
  const diamond = await page.evaluate(() => window.__craft.stackId("diamond"));
  const restoredUnits = restored.output?.id === diamond ? restored.output.count : 0;
  const resumedWork = restored.progress + restoredUnits - saved.progress;
  const resumedBurnSeconds = saved.burnLeft - restored.burnLeft;
  expect(resumedBurnSeconds).toBeGreaterThanOrEqual(-1e-8);
  expect(resumedWork).toBeGreaterThanOrEqual(-1e-8);
  expect(resumedWork).toBeLessThanOrEqual(resumedBurnSeconds / 10 + .01);
  if (restoredUnits) {
    expect(restoredUnits).toBe(1); expect(restored.input).toBeNull(); expect(restored.progress).toBe(0);
  } else {
    expect(restored.input).toEqual({ id: fixture.diamond, count: 1 }); expect(restored.output).toBeNull();
    expect(restored.progressInputId).toBe(fixture.diamond);
    expect(resumedWork).toBeCloseTo(resumedBurnSeconds / 10, 7);
  }
  await page.waitForFunction(() => window.__craft.game!.renderer.isAreaReady(2), undefined, { timeout: 60_000 });
  await press(page.getByRole("button", { name: "Back to Game" })); await open();
  await expect(output.locator("img")).toHaveAttribute("alt", "Diamond", { timeout: 60_000 });
  const completed = await read();
  expect(completed.input).toBeNull(); expect(completed.progress).toBe(0); expect(completed.progressInputId).toBeUndefined();
  expect(completed.output?.count).toBe(1); expect(completed.fuel).toEqual({ id: fixture.coal, count: 1 });
  // Independent fuel clock proves at least one full new-input cook after the observed reset.
  expect(swapped.burnLeft - completed.burnLeft).toBeGreaterThanOrEqual(10 - .05);
  await output.scrollIntoViewIfNeeded(); await snap(page, info, "actual-diamond-result-after-own-full-cook");
  await press(output); await press(inv.locator('[data-slot="6"]'));
  expect(await countStack(page, "diamond")).toBe(1); expect(await countStack(page, "diamond_ore")).toBe(0);
  expect(await countStack(page, "iron_ore")).toBe(returnedIron); expect(await countStack(page, "iron_ingot")).toBe(cookedIron);
  await fs.writeFile(info.outputPath("observed-model-progress.json"), JSON.stringify({ model: "Existing application ten-second cook; read-only real event observations, no injected ticks or native timing claim", topup, swap, returnedIron, cookedIron, paused, saved, restored, resumedWork, resumedBurnSeconds, completed }, null, 2));
  await snap(page, info, "diamond-full-cook-and-pause-boundary-reload");
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]); expect(errors).toEqual([]);
}
