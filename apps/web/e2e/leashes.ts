import fs from "node:fs/promises";
import { LEASH_PROFILE } from "@craft/engine";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aimAtTop, blockAt, collectWorldDrops, command, countStack, createWorld, look, lookAtCell, lookAtMob, parkMouse, snap, target, trackMob, waitForTerrain } from "./helpers";

/** New ownership routes isolate recipe/use/transfer boundaries with raw ingredients.
 * String acquisition and log-derived fence crafting have separate actual-browser routes.
 * No finished Lead, link, drop roll, damage, movement outcome or timer is injected here. */
async function leashSetup(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const inv = page.locator(".inventory-screen");
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
  const select = async (name?: string) => {
    const slot = name ? await slotOf(name) : await empty(); expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`)); else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
  };
  let useSequence = 0;
  const use = async () => {
    const sequence = ++useSequence, vp = page.viewportSize()!;
    // Capture native input phases without changing controls, actor state or the input frame.
    let before: unknown, after: unknown, originalFailure: unknown, failed = false;
    const captureErrors: { stage: string; error: string }[] = [];
    const captureError = (stage: string, error: unknown) => { if (captureErrors.length < 8) captureErrors.push({ stage, error: String(error).slice(0, 2000) }); };
    try {
    before = await page.evaluate(at => {
      const g = window.__craft.game!;
      const state = () => ({ at: performance.now(), body: structuredClone(g.body),
        targetBlock: g.targetBlock ? structuredClone(g.targetBlock) : null, targetMob: g.targetMob?.id ?? null,
        table: { ...at, loadedId: g.world.getLoadedBlock(at.x, at.y, at.z) ?? null,
          belowLoadedId: g.world.getLoadedBlock(at.x, at.y - 1, at.z) ?? null },
        selected: g.inventory.selected, inventory: structuredClone(g.inventory.slots),
        paused: g.paused, dead: g.dead, areaReady: g.renderer.isAreaReady(2) });
      const w = window as unknown as { __leashPointerEvents?: unknown[]; __leashInputState?: typeof state; __leashPointerCleanup?: () => void };
      w.__leashPointerCleanup?.(); w.__leashPointerEvents = []; w.__leashInputState = state;
      const listener = (event: Event) => { const e = event as PointerEvent;
        w.__leashPointerEvents!.push({ phase: e.type, timeStamp: e.timeStamp, observedAt: performance.now(),
          pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, buttons: e.buttons,
          x: e.clientX, y: e.clientY, target: (e.target as HTMLElement)?.className, state: state() });
      };
      for (const type of ["pointerdown", "pointerup", "pointercancel"]) window.addEventListener(type, listener, true);
      w.__leashPointerCleanup = () => { for (const type of ["pointerdown", "pointerup", "pointercancel"]) window.removeEventListener(type, listener, true); };
      return state();
    }, table);
      if (finger) {
        // Ordered physical quick tap: no page wait or telemetry RPC between native start and end.
        let contactFailure: unknown, contactFailed = false;
        try { await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 123 }] }); }
        catch (error) { contactFailed = true; contactFailure = error; }
        try { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
        catch (error) { if (!contactFailed) { contactFailed = true; contactFailure = error; } else captureError("touchEnd", error); }
        if (contactFailed) throw contactFailure;
      } else { await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); }
      await page.waitForTimeout(300);
    } catch (error) { failed = true; originalFailure = error; }
    finally {
      try {
        after = await page.evaluate(() => {
          const w = window as unknown as { __leashPointerEvents?: unknown[]; __leashInputState?: () => unknown };
          return { state: w.__leashInputState?.(), events: w.__leashPointerEvents ?? [] };
        });
      } catch (error) { captureError("sample", error); }
      finally {
        try { await page.evaluate(() => { (window as unknown as { __leashPointerCleanup?: () => void }).__leashPointerCleanup?.(); }); }
        catch (error) { captureError("cleanup", error); }
      }
      const evidence = () => ({ sequence, before, after, originalFailure: failed ? String(originalFailure).slice(0, 2000) : null, captureErrors,
        input: mobile ? "Ordered actual CDP touchStart/touchEnd without intentional contact wait" : "Actual right mouse click",
        qualification: "Read-only capture-phase input samples; target phase precedes target handlers. Native event timestamps expose contact duration; camera meshing readiness is not physics tick evidence. No retry or outcome writes." });
      try { await fs.writeFile(info.outputPath(`leash-use-${sequence}.json`), JSON.stringify(evidence(), null, 2)); }
      catch (error) {
        captureError("write", error);
        try { await fs.writeFile(info.outputPath(`leash-use-${sequence}-capture-fallback.json`), JSON.stringify(evidence(), null, 2)); }
        catch (fallbackError) { captureError("fallbackWrite", fallbackError); console.error("Leash diagnostic capture failed", captureErrors); }
      }
    }
    if (failed) throw originalFailure;
    if (captureErrors.length) throw new Error(`Leash diagnostic capture failed: ${JSON.stringify(captureErrors)}`);
  };
  const open = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE"); await expect(inv).toBeVisible(); };
  const close = () => press(page.getByRole("button", { name: "Close inventory" }));
  const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
  const saveQuit = async () => { await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!)); };
  const resume = async () => { await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("bedrock"));
      for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    g.inventory.slots.fill(null);
    for (const [i, name, count] of [[0, "iron_axe", 1], [1, "diamond_sword", 1], [2, "crafting_table", 1], [3, "string", 5], [4, "oak_planks", 4], [5, "stick", 2], [6, "cobblestone", 1]] as const)
      g.inventory.slots[i] = { id: window.__craft.stackId(name), count };
    return { x, z, floor };
  });
  const origin = { x: pad.x + .5, y: pad.floor + 1, z: pad.z + .5 };
  await command(page, `/tp ${origin.x} ${origin.y} ${origin.z}`); await command(page, "/time set day"); await command(page, "/gamerule doDaylightCycle false");
  const table = { x: pad.x + 3, y: pad.floor + 1, z: pad.z - 2 };
  await select("crafting_table"); await aimAtTop(page, table.x, table.y - 1, table.z); await use();
  await expect.poll(() => blockAt(page, table.x, table.y, table.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await lookAtCell(page, table.x, table.y, table.z); await use(); await expect(inv).toBeVisible();
  const put = async (name: string, cells: number[]) => {
    const slot = await slotOf(name), count = await countStack(page, name); expect(slot).toBeGreaterThanOrEqual(0);
    await press(inv.locator(`[data-slot="${slot}"]`)); for (const cell of cells) await press(inv.locator(`[data-craft="${cell}"]`));
    if (count > cells.length) await press(inv.locator(`[data-slot="${slot}"]`));
  };
  await put("string", [1, 3, 4, 8]); await expect(inv.locator("[data-craft-result] img[alt='Lead']")).toHaveCount(0);
  await put("string", [0]); await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Lead");
  const filler = await slotOf("cobblestone"); await press(inv.locator(`[data-slot="${filler}"]`));
  const pending = () => page.evaluate(() => (window.__craft.game! as unknown as { inventoryScreen: { pendingItems(): unknown[] } }).inventoryScreen.pendingItems());
  const before = await pending(); await press(inv.locator("[data-craft-result]")); expect(await pending()).toEqual(before); await press(inv.locator(`[data-slot="${filler}"]`));
  await inv.locator('[data-craft="0"]').scrollIntoViewIfNeeded(); await snap(page, info, "modern-five-string-two-lead-preview-and-owned-cursor-refusal");
  await press(inv.locator("[data-craft-result]")); await press(inv.locator(`[data-slot="${await empty()}"]`)); expect(await countStack(page, "lead_rope")).toBe(2);
  await put("oak_planks", [0, 2, 3, 5]); await put("stick", [1, 4]); await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Oak Fence");
  await press(inv.locator("[data-craft-result]")); await press(inv.locator(`[data-slot="${await empty()}"]`)); await close();
  const fence = { x: pad.x + 2, y: pad.floor + 1, z: pad.z - 2 };
  await select("oak_fence"); await aimAtTop(page, fence.x, fence.y - 1, fence.z); await use(); await expect.poll(() => blockAt(page, fence.x, fence.y, fence.z)).toBe(188);
  const summon = async (kind: "pig" | "sheep" | "chicken") => {
    await command(page, `/summon ${kind}`);
    return page.evaluate(() => {
      const g = window.__craft.game!, m = g.mobs.mobs.at(-1)!, p = g.body.position;
      m.position = { x: p.x + (m.kind === "chicken" ? 1.5 : 0), y: p.y, z: p.z - 2.5 }; m.velocity = { x: 0, y: 0, z: 0 };
      m.walking = false; m.thinkTimer = 60; // One pre-attachment idle pose, never a leash-physics freeze.
      return m.id;
    });
  };
  const aimMob = async (id: number) => {
    await lookAtMob(page, id); const stop = await trackMob(page, id);
    const targeted = () => page.evaluate(i => {
      const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === i);
      return g.targetMob?.id === i && m !== undefined && Math.hypot(m.position.x - g.body.position.x, m.position.y - g.body.position.y, m.position.z - g.body.position.z) <= 3.5;
    }, id);
    if (!await targeted()) {
      const box = finger ? (await page.locator(".touch-stick-base").boundingBox())! : null;
      try {
        if (finger) { const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2; await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 127 }] }); await finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 72, id: 127 }] }); }
        else await page.keyboard.down("KeyW");
        await expect.poll(targeted, { timeout: 20_000 }).toBe(true);
      } catch (error) { await stop(); throw error; }
      finally { if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.keyboard.up("KeyW"); }
    }
    return stop;
  };
  const useMob = async (id: number) => { const stop = await aimMob(id); try { await use(); } finally { await stop(); } };
  const records = () => page.evaluate(() => window.__craft.game!.leashes.records);
  return { errors, press, finger, inv, slotOf, empty, select, use, open, close, pause, saveQuit, resume, pad, origin, fence, summon, aimMob, useMob, records };
}

export async function leashFollowFenceRoute(page: Page, info: TestInfo, mobile: boolean) {
  const f = await leashSetup(page, info, mobile), pig = await f.summon("pig");
  await f.select("lead_rope"); await f.useMob(pig); await expect.poll(async () => (await f.records()).length).toBe(1);
  const first = (await f.records())[0]; expect(first.targetMobId).toBe(pig); expect(first.anchor.kind).toBe("player"); expect(await countStack(page, "lead_rope")).toBe(1);
  await f.useMob(pig); expect(await f.records()).toHaveLength(1); expect(await countStack(page, "lead_rope")).toBe(1);
  const saved = await f.saveQuit(); expect(saved.leashes.records[0].key).toBe(first.key); await f.resume(); expect((await f.records())[0].key).toBe(first.key);
  const before = await page.evaluate(id => ({ player: { ...window.__craft.game!.body.position }, mob: { ...window.__craft.game!.mobs.mobs.find(m => m.id === id)!.position } }), pig);
  const walkForward = async (untilZ: number) => {
    await look(page, Math.PI, -.1);
    const base = mobile ? (await page.locator(".touch-stick-base").boundingBox())! : null;
    if (f.finger) { const x = base!.x + base!.width / 2, y = base!.y + base!.height / 2; await f.finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 124 }] }); await f.finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 72, id: 124 }] }); }
    else await page.keyboard.down("KeyW");
    try { await page.waitForFunction(z => window.__craft.game!.body.position.z > z, untilZ, { timeout: 30_000 }); }
    finally { if (f.finger) await f.finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.keyboard.up("KeyW"); }
  };
  await walkForward(before.player.z + 5.5);
  await page.waitForFunction(id => { const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!; return Math.hypot(g.body.position.x - m.position.x, g.body.position.z - m.position.z) < 4.5; }, pig, { timeout: 30_000 });
  const followed = await page.evaluate(id => { const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!; return { player: { ...g.body.position }, mob: { ...m.position }, velocity: { ...m.velocity }, ropes: g.renderer.scene.children.filter(o => o.userData.leashKey !== undefined).map(o => o.userData.leashKey) }; }, pig);
  expect(followed.mob.z).toBeGreaterThan(before.mob.z + 1); expect(followed.ropes).toContain(first.key);
  await lookAtMob(page, pig); await snap(page, info, "actual-walk-or-joystick-pulls-owned-pig-with-original-rope");
  // A disclosed wall is a terrain boundary, not an actor/velocity mutation. Normal collision must win.
  const wall = await page.evaluate(id => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!, z = Math.floor((m.position.z + g.body.position.z) / 2), x = Math.floor(m.position.x), y = Math.floor(m.position.y);
    for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 2; dy++) g.world.setBlock(x + dx, y + dy, z, window.__craft.blockId("bedrock"));
    return { x, y, z };
  }, pig);
  await walkForward(followed.player.z + 1.5);
  await page.waitForFunction(({ id, wall }) => { const m = window.__craft.game!.mobs.mobs.find(m => m.id === id)!; return m.position.z > wall.z - .6 && m.position.z < wall.z; }, { id: pig, wall }, { timeout: 30_000 });
  await page.waitForTimeout(600);
  const blocked = await page.evaluate(id => { const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!; return { position: { ...m.position }, velocity: { ...m.velocity }, record: g.leashes.records.find(r => r.targetMobId === id) }; }, pig);
  expect(blocked.position.z).toBeLessThan(wall.z); expect(blocked.record?.key).toBe(first.key);
  await snap(page, info, "leashed-pig-retains-owner-at-solid-wall");
  await page.evaluate(w => { const g = window.__craft.game!; for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 2; dy++) g.world.setBlock(w.x + dx, w.y + dy, w.z, 0); }, wall);
  await command(page, `/tp ${f.origin.x + 1} ${f.origin.y} ${f.origin.z}`); await f.select("lead_rope"); await lookAtCell(page, f.fence.x, f.fence.y, f.fence.z); await f.use();
  await expect.poll(async () => (await f.records())[0]?.anchor.kind).toBe("fence"); expect((await f.records())[0].key).toBe(first.key); expect(await countStack(page, "lead_rope")).toBe(1);
  await f.saveQuit(); await f.resume(); expect((await f.records())[0].key).toBe(first.key); expect((await f.records())[0].anchor).toMatchObject({ kind: "fence", ...f.fence });
  // Drop the unused crafted Lead and the two unused fences before filling only empty bag cells.
  await f.open();
  for (const name of ["lead_rope", "oak_fence"]) { await f.press(f.inv.locator(`[data-slot="${await f.slotOf(name)}"]`)); await f.press(page.getByRole("button", { name: "Drop held item", exact: true })); }
  await page.evaluate(() => { const g = window.__craft.game!; for (let i = 0; i < g.inventory.slots.length; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { id: window.__craft.stackId("cobblestone"), count: 64 }; });
  await f.close(); expect(await page.evaluate(() => window.__craft.game!.inventory.spaceFor(807))).toBe(0);
  await page.evaluate(id => {
    const g = window.__craft.game!, store = g.worldDrops, original = store.planSpawnBatch.bind(store), w = window as unknown as { __leashRefusal: { attempts: unknown[]; restore: () => void } };
    w.__leashRefusal = { attempts: [], restore: () => { store.planSpawnBatch = original; } };
    store.planSpawnBatch = stacks => {
      const mob = g.mobs.mobs.find(m => m.id === id)!, beforeHealth = mob.health;
      const recursiveAttack = g.mobs.attack(mob, 100, 0), recursiveSave = g.save();
      w.__leashRefusal.attempts.push({ stacks: structuredClone(stacks), beforeHealth, afterHealth: mob.health, recursiveAttack, recursiveSave }); return null;
    };
  }, pig);
  const breakFence = async (refused = false) => {
    await f.select("iron_axe"); await lookAtCell(page, f.fence.x, f.fence.y, f.fence.z); await expect.poll(() => target(page)).toMatchObject(f.fence);
    const vp = page.viewportSize()!;
    if (f.finger) await f.finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 125 }] }); else await page.mouse.down();
    try {
      if (refused) await page.waitForFunction(() => (window as unknown as { __leashRefusal: { attempts: unknown[] } }).__leashRefusal.attempts.length > 0, undefined, { timeout: 20_000 });
      else await expect.poll(() => blockAt(page, f.fence.x, f.fence.y, f.fence.z), { timeout: 20_000 }).toBe(0);
    } finally { if (f.finger) await f.finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up(); }
  };
  await breakFence(true);
  const refused = await page.evaluate(() => (window as unknown as { __leashRefusal: { attempts: { stacks: { id: number; count: number }[]; beforeHealth: number; afterHealth: number; recursiveAttack: boolean; recursiveSave: boolean }[] } }).__leashRefusal.attempts);
  for (const attempt of refused) { expect(attempt.stacks).toEqual(expect.arrayContaining([{ id: 188, count: 1 }, { id: 807, count: 1 }])); expect(attempt.afterHealth).toBe(attempt.beforeHealth); expect(attempt.recursiveAttack).toBe(false); expect(attempt.recursiveSave).toBe(false); }
  expect(await blockAt(page, f.fence.x, f.fence.y, f.fence.z)).toBe(188); expect((await f.records())[0].key).toBe(first.key);
  await page.evaluate(() => (window as unknown as { __leashRefusal: { restore(): void } }).__leashRefusal.restore());
  // Initial Agent pose is a disclosed command input; the actual destroy command owns the joint commit.
  await page.evaluate(at => { Object.assign(window.__craft.game!.agent, { x: at.x, y: at.y, z: at.z + 1, facing: 2 }); }, f.fence);
  if (mobile) await f.press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("KeyK");
  await expect(page.locator(".code-screen")).toBeVisible(); await f.press(page.locator('[data-palette="destroy"]')); await f.press(page.getByRole("button", { name: "▶ Run" }));
  await expect.poll(() => blockAt(page, f.fence.x, f.fence.y, f.fence.z), { timeout: 20_000 }).toBe(0);
  expect(await f.records()).toEqual([]);
  const ground = await page.evaluate(() => window.__craft.game!.worldDrops.records.filter(r => [188, 807].includes(r.stack.id)));
  expect(ground.filter(r => r.stack.id === 807).reduce((n, r) => n + r.stack.count, 0)).toBe(2);
  expect(ground.filter(r => r.stack.id === 188).reduce((n, r) => n + r.stack.count, 0)).toBe(3);
  await f.saveQuit(); await f.resume(); expect(await f.records()).toEqual([]);
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === 807).reduce((n, r) => n + r.stack.count, 0))).toBe(2);
  await snap(page, info, "single-joint-fence-and-lead-refund-survives-full-bag-save");
  await fs.writeFile(info.outputPath("leash-follow-fence-coverage.json"), JSON.stringify({ fixtures: "Raw5String/4planks/2sticks/table/tools/cobble+flatpad, one preattach idleactorpose; laterwallterrain/fullbagfiller/one refusalreceiver/initialAgentpose. NoLead/link/drop/outcome injection. UpstreamString/logacquisition independently covered elsewhere.", first, saved, before, followed, wall, blocked, refused, ground, movement: mobile ? "Actualjoystick" : "ActualW", limits: ["horizontalapp4/6/10pull; no nativephysics/gestures/refundcalibration", "fullbagjointAgentfencecommit andplayerbreakrefusal covered; emptyhand detach inotherroute", "no fullticket/performanceacceptance"], errors: f.errors }, null, 2));
  expect(f.errors).toEqual([]);
}

export async function leashMobRecoveryRoute(page: Page, info: TestInfo, mobile: boolean) {
  const f = await leashSetup(page, info, mobile), pig = await f.summon("pig");
  await f.select("lead_rope"); await f.useMob(pig); await expect.poll(async () => (await f.records()).length).toBe(1); const key = (await f.records())[0].key;
  await page.evaluate(id => {
    const g = window.__craft.game!, store = g.worldDrops, original = store.planSpawnBatch.bind(store);
    const w = window as unknown as { __mobLeadRefusal: { attempts: unknown[]; restore(): void } }; w.__mobLeadRefusal = { attempts: [], restore: () => { store.planSpawnBatch = original; } };
    store.planSpawnBatch = stacks => {
      const mob = g.mobs.mobs.find(m => m.id === id)!, beforeHealth = mob.health;
      const recursiveAttack = g.mobs.attack(mob, 100, 0), recursiveSave = g.save();
      w.__mobLeadRefusal.attempts.push({ stacks: structuredClone(stacks), beforeHealth, afterHealth: mob.health, recursiveAttack, recursiveSave }); return null;
    };
  }, pig);
  const hit = async (id: number) => {
    await f.select("diamond_sword"); const stop = await f.aimMob(id);
    try {
      await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(id);
      const before = await page.evaluate(i => ({ health: window.__craft.game!.mobs.mobs.find(m => m.id === i)!.health, attempts: (window as unknown as { __mobLeadRefusal?: { attempts: unknown[] } }).__mobLeadRefusal?.attempts.length ?? 0 }), id), vp = page.viewportSize()!;
      try {
        if (f.finger) await f.finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 126 }] }); else await page.mouse.down();
        await page.waitForFunction(({ id, before }) => { const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id), attempts = (window as unknown as { __mobLeadRefusal?: { attempts: unknown[] } }).__mobLeadRefusal?.attempts.length ?? 0; return !m || m.health < before.health || attempts > before.attempts; }, { id, before }, { timeout: 15_000, polling: "raf" });
      } finally { if (f.finger) await f.finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up(); }
    } finally { await stop(); }
  };
  for (let i = 0; i < 4; i++) { if (await page.evaluate(() => (window as unknown as { __mobLeadRefusal: { attempts: unknown[] } }).__mobLeadRefusal.attempts.length)) break; await hit(pig); }
  const refused = await page.evaluate(id => ({ actor: window.__craft.game!.mobs.mobs.find(m => m.id === id), links: window.__craft.game!.leashes.records, attempts: (window as unknown as { __mobLeadRefusal: { attempts: unknown[] } }).__mobLeadRefusal.attempts }), pig);
  expect(refused.actor?.health).toBe(1); expect(refused.links[0].key).toBe(key); expect(refused.attempts).toHaveLength(1);
  const attempt = refused.attempts[0] as { stacks: { id: number; count: number }[]; beforeHealth: number; afterHealth: number; recursiveAttack: boolean; recursiveSave: boolean };
  expect(attempt.afterHealth).toBe(attempt.beforeHealth); expect(attempt.recursiveAttack).toBe(false); expect(attempt.recursiveSave).toBe(false);
  const rolled = attempt.stacks; expect(rolled.filter(s => s.id === 807)).toEqual([{ id: 807, count: 1 }]);
  const saved = await f.saveQuit(); expect(saved.leashes.records[0].key).toBe(key); expect(saved.mobs.records.find((m: { id: number }) => m.id === pig).pendingLoot).toEqual(rolled.filter(s => s.id !== 807));
  await f.resume(); await hit(pig); expect(await page.evaluate(id => window.__craft.game!.mobs.mobs.some(m => m.id === id), pig)).toBe(false); expect(await f.records()).toEqual([]);
  const ground = await page.evaluate(() => window.__craft.game!.worldDrops.records.map(r => r.stack)); expect(ground).toEqual(rolled); await collectWorldDrops(page); expect(await countStack(page, "lead_rope")).toBe(2);
  // The empty hand explicitly releases a real supported actor; it never creates another link/unit.
  const sheep = await f.summon("sheep"); await f.select("lead_rope"); await f.useMob(sheep); await expect.poll(async () => (await f.records()).length).toBe(1);
  await f.select(); await f.useMob(sheep); await expect.poll(async () => (await f.records()).length).toBe(0); await collectWorldDrops(page); expect(await countStack(page, "lead_rope")).toBe(2);
  await f.select("lead_rope"); await f.useMob(sheep); await expect.poll(async () => (await f.records()).length).toBe(1);
  const chicken = await f.summon("chicken"); await f.select("lead_rope"); await f.useMob(chicken); await expect.poll(async () => (await f.records()).length).toBe(2);
  expect(await countStack(page, "lead_rope")).toBe(0); // The last attached Lead leaves the actual selected hand empty.
  const lastLeadKeys = (await f.records()).map(r => r.key);
  const fenceUseState = () => page.evaluate(fence => {
    const g = window.__craft.game!, t = g.targetBlock;
    return { player: { ...g.body.position }, target: t ? { x: t.x, y: t.y, z: t.z, id: t.id } : null,
      distance: Math.hypot(fence.x + .5 - g.body.position.x, fence.y + .75 - g.body.position.y, fence.z + .5 - g.body.position.z),
      records: g.leashes.records, held: g.inventory.slots[g.inventory.selected] };
  }, f.fence);
  const beforeFenceApproach = await fenceUseState();
  await lookAtCell(page, f.fence.x, f.fence.y, f.fence.z);
  // Collection can leave the player outside the tether-use range, even while the fence is raycastable.
  // Walk through the real input path; only the camera is aimed, with no actor or player pose mutation.
  if (beforeFenceApproach.distance > LEASH_PROFILE.retieReach - .5) {
    const box = f.finger ? (await page.locator(".touch-stick-base").boundingBox())! : null;
    try {
      if (f.finger) { const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2; await f.finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 128 }] }); await f.finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 72, id: 128 }] }); }
      else await page.keyboard.down("KeyW");
      await expect.poll(async () => (await fenceUseState()).distance, { timeout: 15_000 }).toBeLessThanOrEqual(LEASH_PROFILE.retieReach - .5);
    } finally { if (f.finger) await f.finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.keyboard.up("KeyW"); }
  }
  await lookAtCell(page, f.fence.x, f.fence.y, f.fence.z);
  await expect.poll(() => target(page)).toMatchObject({ ...f.fence, id: 188 });
  const beforeFenceUse = await fenceUseState();
  expect(beforeFenceUse.distance).toBeLessThanOrEqual(LEASH_PROFILE.retieReach); expect(beforeFenceUse.held).toBeNull();
  expect(beforeFenceUse.records.map(r => r.key)).toEqual(lastLeadKeys);
  await fs.writeFile(info.outputPath("last-lead-fence-use.json"), JSON.stringify({ beforeFenceApproach, beforeFenceUse, retieReach: LEASH_PROFILE.retieReach, inputAcknowledgement: "pending actual use" }, null, 2));
  await f.use();
  await expect(page.locator(".chat-line").filter({ hasText: /^Leads tied to fence$/ }).last()).toBeVisible();
  await expect.poll(async () => (await f.records()).every(r => r.anchor.kind === "fence")).toBe(true);
  const afterFenceUse = await fenceUseState();
  const lastLeadFenceUse = { beforeFenceApproach, beforeFenceUse, afterFenceUse, input: mobile ? "CDP joystick approach and short use tap" : "W approach and right click", inputAcknowledgement: "Leads tied to fence", retieReach: LEASH_PROFILE.retieReach };
  await fs.writeFile(info.outputPath("last-lead-fence-use.json"), JSON.stringify(lastLeadFenceUse, null, 2));
  expect(afterFenceUse.records.map(r => r.key)).toEqual(lastLeadKeys); expect(await countStack(page, "lead_rope")).toBe(0);
  await snap(page, info, "last-lead-empty-hand-ties-sheep-and-chicken-without-second-consumption");
  // A real fatal landing transfers only carried items; the two already-spent Leads stay world-owned.
  await command(page, `/tp ${f.origin.x} ${f.pad.floor + 38} ${f.origin.z}`);
  await expect(page.locator(".death-screen")).toBeVisible({ timeout: 30_000 });
  const deathOwners = await page.evaluate(() => ({ health: window.__craft.game!.health, links: window.__craft.game!.leashes.records, groundLeads: window.__craft.game!.worldDrops.records.filter(r => r.stack.id === 807) }));
  expect(deathOwners.health).toBe(0); expect(deathOwners.links.map(r => r.key)).toEqual(lastLeadKeys); expect(deathOwners.groundLeads).toEqual([]);
  await f.press(page.getByRole("button", { name: "Respawn", exact: true })); await expect(page.locator(".death-screen")).toHaveCount(0);
  expect((await f.records()).map(r => r.key)).toEqual(lastLeadKeys);
  const beforeCorrupt = await f.saveQuit();
  const corrupt = await page.evaluate(() => { const data = JSON.parse(localStorage.getItem("craft.save.v1")!); data.leashes.records[0].targetMobId = 999999; const raw = JSON.stringify(data); localStorage.setItem("craft.save.v1", raw); return raw; });
  await f.resume(); await f.pause(); await f.press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("leashes");
  expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
  const downloaded = page.waitForEvent("download"); await f.press(page.getByRole("button", { name: "Export world backup" })); const path = info.outputPath("invalid-leash-original.json"); await (await downloaded).saveAs(path); expect(JSON.parse(await fs.readFile(path, "utf8")).recoveryOriginalSave).toBe(corrupt);
  await snap(page, info, "joint-mob-owner-recovery-and-corrupt-original-leash-save-protection");
  await fs.writeFile(info.outputPath("leash-mob-recovery-coverage.json"), JSON.stringify({ fixtures: "Same disclosed rawrecipeinputs/tools/terrain; one initialactoridlepose; one refusedworldreceiver and finalinvalidstoredtargetID. No cachedroll/Lead/link/drop/damage outcome injection.", pig, key, refused, rolled, saved, ground, lastLeadKeys, lastLeadFenceUse, deathOwners, beforeCorrupt, limits: ["ModernfiveStringrecipevariant/appownershippolicy, nativeparityunverified", "No naturalString/logacquisition claim inthisboundaryroute", "No fullticket/performanceacceptance"], errors: f.errors }, null, 2));
  expect(f.errors).toEqual([]);
}
