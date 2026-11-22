import { expect, type CDPSession, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { CANE_GROWTH_CHANCE, CANE_GROWTH_SALT, Inventory, blockId, hash3, serializeSave, type BlockEdit, type SaveData } from "@craft/engine";
import { aimAtTop, lookAtCell, parkMouse, snap, target, waitForTerrain } from "./helpers";

/** Read-only seed selection chooses a reproducible opportunity window, never overrides runtime rates. */
function seedSelection() {
  for (let seed = 1; seed <= 10000; seed++) {
    const ticks: number[] = [];
    for (let tick = 1; tick <= 160 && ticks.length < 3; tick++) if (hash3(seed ^ tick ^ CANE_GROWTH_SALT, 8, 80, 8) < CANE_GROWTH_CHANCE) ticks.push(tick);
    if (ticks.length === 3 && ticks[0] >= 12 && ticks[0] <= 18 && ticks[1] - ticks[0] >= 18 && ticks[1] - ticks[0] <= 45 && ticks[2] - ticks[1] >= 20) return { seed, ticks };
  }
  throw Error("No bounded deterministic Cane fixture seed found");
}

export async function caneNaturalGrowthRoute(page: Page, info: TestInfo, mobile: boolean, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  const label = mobile ? (viewport.width < viewport.height ? "portrait" : "landscape") : "desktop";
  const file = (name: string) => info.outputPath(`${label}-${name}`), press = (l: Locator) => mobile ? l.tap() : l.click();
  const selection = seedSelection(), errors: string[] = [], phases: unknown[] = [], rawSaves: Record<string, string> = {}, timing: unknown[] = [], inputs: unknown[] = [];
  let stage = "initial", failure: string | null = null, finger: CDPSession | null = null;
  const onError = (e: Error) => errors.push(e.message); page.on("pageerror", onError);
  const cells = new Map<string, BlockEdit>(), put = (x: number, y: number, z: number, id: number) => cells.set(`${x},${y},${z}`, [x, y, z, id]);
  for (let x = 3; x <= 14; x++) for (let z = 3; z <= 15; z++) { put(x, 79, z, blockId("stone")); for (let y = 80; y <= 85; y++) put(x, y, z, 0); }
  for (const x of [8, 12]) { put(x, 79, 8, blockId("sand")); put(x + 1, 79, 8, blockId("water")); }
  for (const y of [80, 81, 82]) put(8, y, 8, 204);
  const initial: SaveData = { version: 1, name: "Natural Cane clock " + label, seed: selection.seed, generatorVersion: 3, mode: "survival", timeOfDay: .25,
    player: { position: { x: 8.5, y: 80, z: 11.5 }, yaw: 0, pitch: Math.atan2(-.12, 3), flying: false }, playerState: { health: 20 }, inventory: new Inventory().toJSON(),
    edits: [...cells.values()], caneGrowth: { version: 1, tick: 0, accumulator: 0, cursor: 0 }, gamerules: { doMobSpawning: false, doDaylightCycle: false } };
  const read = () => page.evaluate(() => {
    const g = window.__craft.game!;
    return { clock: g.caneGrowth.toJSON(), column: [80, 81, 82, 83].map(y => g.world.getLoadedBlock(8, y, 8)), replanted: [80, 81, 82, 83].map(y => g.world.getLoadedBlock(12, y, 8)),
      bag: g.inventory.toJSON(), agent: structuredClone(g.agent), drops: g.worldDrops.toJSON(), position: { ...g.body.position }, paused: g.paused, dead: g.dead, loadErrors: [...g.loadErrors],
      pending: (g as unknown as { inventoryScreen: { pendingItems(): unknown[] } }).inventoryScreen.pendingItems(), raw: localStorage.getItem("craft.save.v1"), wallMs: performance.now() };
  });
  const count = (s: Awaited<ReturnType<typeof read>>) => s.bag.slots.reduce((n, item) => n + (item?.id === 850 ? item.count : 0), 0);
  const ground = (s: Awaited<ReturnType<typeof read>>) => s.drops.records.reduce((n, item) => n + (item.stack.id === 850 ? item.stack.count : 0), 0);
  const phase = async (value: string) => { stage = value; const state = await read(); phases.push({ label: value, state }); expect(state.loadErrors).toEqual([]); expect(state.pending).toEqual([]); expect(state.agent.slots.every(s => s === null)).toBe(true); };
  const command = async (value: string) => {
    if (mobile) await press(page.getByRole("button", { name: "Chat and commands", exact: true })); else await page.keyboard.press("Slash");
    const input = page.getByRole("textbox", { name: "Chat", exact: true }); await input.fill(value); await input.press("Enter"); await expect(input).toBeHidden(); await waitForTerrain(page);
  };
  const select = async (index: number) => { if (mobile) await press(page.locator(`.hotbar [data-slot="${index}"]`)); else { await page.keyboard.press(`Digit${index + 1}`); await parkMouse(page); } };
  const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
  const cold = async (name: string, expectedBag: number) => {
    if (!(await page.locator(".pause-screen").isVisible())) await pause();
    const before = await read(); await press(page.getByRole("button", { name: "Save & Quit to Title", exact: true })); await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("craft.save.v1")!); rawSaves[name] = raw; await fs.writeFile(file(name + ".json"), raw);
    const saved = JSON.parse(raw) as SaveData; expect(saved.caneGrowth).toEqual(before.clock); expect(saved.inventory).toEqual(before.bag); expect(count(before)).toBe(expectedBag); expect(ground(before)).toBe(0);
    await page.waitForTimeout(1500); expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(raw);
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
    const after = await read(); expect(count(after)).toBe(expectedBag); expect(ground(after)).toBe(0); expect(after.clock.tick).toBeGreaterThanOrEqual(saved.caneGrowth!.tick);
    timing.push({ checkpoint: name, before, savedClock: saved.caneGrowth, after, qualification: "Title wall time never changes stored clock. Resumed live simulation may advance normally; no runtime clock writes." });
  };
  const harvestUpper = async (expectedBagAndGround: number) => {
    await command("/tp 8.5 80 11.5"); await select(1); await lookAtCell(page, 8, 81, 8);
    await expect.poll(() => target(page)).toMatchObject({ x: 8, y: 81, z: 8, id: 204 });
    inputs.push({ label: "before-real-middle-harvest", target: await target(page), state: await read(), method: mobile ? "actual CDP long touch" : "actual left mouse hold" });
    try {
      if (mobile) { const p = { x: viewport.width * .65, y: viewport.height * .42, id: 211 }; finger = await page.context().newCDPSession(page); await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] }); }
      else await page.mouse.down({ button: "left" });
      await expect.poll(async () => (await read()).column, { timeout: 20000, intervals: [50] }).toEqual([204, 0, 0, 0]);
    } finally {
      if (finger) { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await finger.detach(); finger = null; }
      if (!mobile) await page.mouse.up({ button: "left" });
    }
    const cut = await read(); expect(cut.column).toEqual([204, 0, 0, 0]); expect(count(cut) + ground(cut)).toBe(expectedBagAndGround);
    await command("/tp 8.5 80 8.5"); await expect.poll(async () => count(await read()), { timeout: 20000 }).toBe(expectedBagAndGround); expect(ground(await read())).toBe(0);
  };
  try {
    const raw = serializeSave(initial); await fs.writeFile(file("initial-supported-Cane3-empty-bag-clock0.json"), raw); await fs.writeFile(file("readonly-seed-selection.json"), JSON.stringify({ ...selection, chance: CANE_GROWTH_CHANCE, salt: CANE_GROWTH_SALT, coordinate: [8, 80, 8], interpretation: "Chosen normal seed and clock0; no accelerated rate, RNG or tick injection. Application timing, not native calibration." }, null, 2));
    await page.goto("/"); await page.evaluate(value => { localStorage.clear(); localStorage.setItem("craft.save.v1", value); }, raw); await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
    const start = await read(); expect(start.column).toEqual([204, 204, 204, 0]); expect(start.replanted).toEqual([0, 0, 0, 0]); expect(count(start) + ground(start)).toBe(0); await phase("initial-owned-three-stems-no-Cane-item-clock-zero-fixture"); await snap(page, info, label + "-supported-three-before-real-upper-harvest");
    await harvestUpper(2); await phase("actual-middle-harvest-two-items-root-retained");
    const waiting = await read(); await expect.poll(async () => (await read()).column, { timeout: 120000, intervals: [100] }).toEqual([204, 204, 0, 0]);
    const grown = await read(); timing.push({ checkpoint: "first-natural-regrowth", before: waiting, after: grown }); expect(count(grown)).toBe(2); expect(ground(grown)).toBe(0); await phase("unaccelerated-natural-one-upper-cell-growth-no-item-output"); await snap(page, info, label + "-natural-two-stems-unaccelerated");
    await pause(); const paused = await read(); await page.waitForTimeout(1500); const still = await read(); expect(still.clock).toEqual(paused.clock); expect(still.column).toEqual(paused.column); expect(still.paused).toBe(true); timing.push({ checkpoint: "actual-Pause-freeze", before: paused, after: still }); await phase("actual-Pause-stops-clock-and-growth");
    await cold("natural-two-stems-checkpoint", 2); expect((await read()).column).toEqual([204, 204, 0, 0]); await phase("cold-two-stem-clock-checkpoint-bag-two");
    await expect.poll(async () => (await read()).column, { timeout: 150000, intervals: [100] }).toEqual([204, 204, 204, 0]); await page.waitForTimeout(2000); expect((await read()).column).toEqual([204, 204, 204, 0]); expect(count(await read())).toBe(2); await phase("natural-third-stem-and-three-high-cap-no-fourth"); await snap(page, info, label + "-natural-three-high-cap");
    await harvestUpper(4); await phase("actual-second-upper-harvest-four-finite-items-root-retained");
    await command("/tp 12.5 80 11.5"); await select(0); expect((await read()).bag.slots[0]).toEqual({ id: 850, count: 4 }); await aimAtTop(page, 12, 79, 8); await expect.poll(() => target(page)).toMatchObject({ x: 12, y: 79, z: 8, normal: { x: 0, y: 1, z: 0 } });
    await page.waitForFunction(() => ((window.__craft.game! as unknown as { placeCooldown: number }).placeCooldown) === 0);
    inputs.push({ label: "before-real-one-Cane-replant", target: await target(page), state: await read() });
    if (mobile) await page.touchscreen.tap(viewport.width * .65, viewport.height * .42); else { await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); }
    await expect.poll(async () => count(await read())).toBe(3); const planted = await read(); expect(planted.replanted[0]).toBe(204); expect(planted.replanted[3]).toBe(0); expect(ground(planted)).toBe(0); await phase("actual-one-held-Cane-replants-second-bed-three-items-left"); await snap(page, info, label + "-finite-replant-new-root-bag-three");
    await cold("finite-three-items-and-replanted-root-final", 3); const final = await read(); expect(final.column[0]).toBe(204); expect(final.column[3]).toBe(0); expect(final.replanted[0]).toBe(204); expect(final.replanted[3]).toBe(0); expect(count(final)).toBe(3); expect(ground(final)).toBe(0); expect(final.loadErrors).toEqual([]); await phase("cold-bag-three-both-real-roots-and-valid-growth-clock"); expect(errors).toEqual([]); stage = "complete";
  } catch (e) { failure = e instanceof Error ? e.stack ?? e.message : String(e); throw e; }
  finally {
    // The nested harvest route owns the active session; TypeScript does not follow that closure assignment.
    const activeFinger = finger as CDPSession | null;
    if (activeFinger) { await activeFinger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {}); await activeFinger.detach().catch(() => {}); }
    if (!mobile) await page.mouse.up({ button: "left" }).catch(() => {}); page.off("pageerror", onError);
    await fs.writeFile(file("cane-natural-growth-proof.json"), JSON.stringify({ stage, failure, label, mobile, viewport, selection, phases, timing, inputs, rawSaves, errors, finalReadback: await read().catch(e => ({ error: String(e) })), fixture: "Initial prior-owned Cane3/Sand/Water/platform/secondbed/emptybag/normalclock0. Readonly hash seed selection, unaccelerated runtime. Actual mouse/touch harvest and placement, typed chatTP navigation/pickup. Existing directyaw/pitch aim helpers are disclosed targeting fixtures only; not natural navigation proof. No Give/Setblock/Creative or runtime world/item/Agent/program/storageoutcome/clock/RNG/rate writes.", coverage: ["real upper harvest and canonical finite items", "natural one-cell regrowth and existing cap3", "actualPause freeze", "two actual world SaveQuit/page.reload cold checkpoints", "four harvested items minus one actual replant leaves three", "growth creates physical cells only, never inventory items"], uncovered: ["native Education/Bedrock timing/age/support/geometry calibration", "natural initial Cane/soil/water acquisition", "fullbag and portal crossrealm growth browser routes (separate scope)", "Bone/BoneMeal/SuperFertilizer interactions", "physical-phone/performance/fullEducation/nativegraphics/distribution parity"] }, null, 2));
  }
}
