import { nativePageWorldTap } from './native-world-tap';
import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { SEA_LEVEL, blockId, bodyBox, boxCollides } from "@craft/engine";
import { command, countStack, createWorld, look, parkMouse, snap, trackMob } from "./helpers";

/** This file uses read-only observations plus disclosed raw terrain/tools/ingredients fixtures.
 * No RNG replacement, mob pose/health/velocity edit, direct step/attack/death/craft call, or injected
 * Ink Sac/Black Dye/Book and Quill/Written Book is permitted. Chat movement moves the player only. */
async function harness(page: Page, info: TestInfo, mobile: boolean, route: string) {
  const observations: unknown[] = [];
  const errors = await createWorld(page, { mode: "survival", seed: "12345" });
  const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  let fingerDown = false; // Only an acknowledged CDP contact belongs to this harness.
  const inv = page.locator(".inventory-screen");
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
  const openInventory = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
    await expect(inv).toBeVisible();
  };
  const closeInventory = async () => { await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden(); };
  const select = async (name: string): Promise<void> => {
    const slot = await slotOf(name); expect(slot).toBeGreaterThanOrEqual(0);
    if (slot >= 9) {
      await openInventory();
      const free = await page.evaluate(() => window.__craft.game!.inventory.slots.slice(0, 9).findIndex(s => s === null));
      expect(free).toBeGreaterThanOrEqual(0);
      await press(inv.locator(`[data-slot="${slot}"]`)); await press(inv.locator(`[data-slot="${free}"]`));
      await closeInventory(); return select(name);
    }
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`));
    else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
  };
  const use = async () => {
    if (mobile) { const vp = page.viewportSize()!; await nativePageWorldTap(page, vp.width * .65, vp.height * .45); }
    else { await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); }
  };
  const pause = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await expect(page.locator(".pause-screen")).toBeVisible();
  };
  const saveQuit = async () => {
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
    return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!));
  };
  const resume = async () => {
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
    await page.waitForFunction(() => Boolean(window.__craft.game));
    // Unlike waitForTerrain, this also permits a legitimate swimming player pose.
    await page.waitForFunction(() => window.__craft.game!.renderer.isAreaReady(2), undefined, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  };
  const state = (id?: number) => page.evaluate(i => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === i);
    const mob = m ? structuredClone(m) : null;
    const bodyCells: { x: number; y: number; z: number; id: number | null }[] = [];
    if (m) {
      for (let x = Math.floor(m.position.x - .475) - 1; x <= Math.floor(m.position.x + .475) + 1; x++)
        for (let y = Math.floor(m.position.y) - 1; y <= Math.floor(m.position.y + .95) + 1; y++)
          for (let z = Math.floor(m.position.z - .475) - 1; z <= Math.floor(m.position.z + .475) + 1; z++)
            bodyCells.push({ x, y, z, id: g.world.getLoadedBlock(x, y, z) ?? null });
    }
    const model = m ? (g.mobs as unknown as { models: Map<number, import("three").Group> }).models.get(m.id) : undefined;
    const tentacles: { index: number; rotation: number[] }[] = [];
    model?.traverse(o => { if (o.userData.tentacle !== undefined) tentacles.push({ index: o.userData.tentacle, rotation: [o.rotation.x, o.rotation.y, o.rotation.z] }); });
    const water = m ? [.1, .4, .85].map(f => g.world.getLoadedBlock(Math.floor(m.position.x), Math.floor(m.position.y + .95 * f), Math.floor(m.position.z)) ?? null) : null;
    const agent = structuredClone(g.agent);
    const [fx, fz] = [[0, 1], [-1, 0], [0, -1], [1, 0]][agent.facing];
    const directions = { forward: [fx, 0, fz], back: [-fx, 0, -fz], left: [fz, 0, -fx], right: [-fz, 0, fx], up: [0, 1, 0], down: [0, -1, 0] };
    const agentTargets = Object.entries(directions).map(([direction, [dx, dy, dz]]) => {
      const x = agent.x + dx, y = agent.y + dy, z = agent.z + dz;
      return { direction, x, y, z, loadedId: g.world.getLoadedBlock(x, y, z) ?? null,
        headLoadedId: g.world.getLoadedBlock(x, y + 1, z) ?? null, supportLoadedId: g.world.getLoadedBlock(x, y - 1, z) ?? null };
    });
    return { at: performance.now(), player: structuredClone(g.body), playerHealth: g.health, dead: g.dead, target: g.targetMob?.id ?? null,
      agent, agentTargets, programRunning: g.programRunning, paused: g.paused, areaReady: g.renderer.isAreaReady(2),
      mob, water, bodyCells, tentacles, biome: m ? g.world.generator.biomeAt(Math.floor(m.position.x), Math.floor(m.position.z)) : null,
      spawning: g.mobs.spawning, animalCount: g.mobs.animalCount(), squidCount: g.mobs.squidCount(),
      inventory: structuredClone(g.inventory.slots), drops: structuredClone(g.worldDrops.records),
      leashes: structuredClone(g.leashes.records), balloons: structuredClone(g.balloons.records) };
  }, id);
  const alive = (id: number) => page.evaluate(i => window.__craft.game!.mobs.mobs.some(m => m.id === i), id);
  const playerNear = async (id: number) => {
    const p = await page.evaluate(i => window.__craft.game!.mobs.mobs.find(m => m.id === i)?.position ?? null, id);
    if (!p) return;
    // Actual chat teleport approaches the swimming actor; the actor is never moved or reset.
    await command(page, `/tp ${p.x} ${p.y + .8} ${p.z + 1.5}`);
  };
  const playerKill = async (id: number) => {
    await select("diamond_sword");
    const stop = await trackMob(page, id);
    try {
      for (let attempt = 0; attempt < 8 && await alive(id); attempt++) {
        await playerNear(id);
        await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(id);
        const before = await state(id), evidence: Record<string, unknown> = { kind: "actual-player-input", attempt, before };
        try {
          evidence.downStarted = Date.now();
          if (finger) { const vp = page.viewportSize()!; await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 231 }] }); fingerDown = true; }
          else await page.mouse.down({ button: "left" });
          evidence.downAcknowledged = Date.now();
          await page.waitForFunction(({ id, health }) => {
            const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id);
            if (g.dead || g.paused) throw Error("Player combat became inactive");
            return !m || m.health < health;
          }, { id, health: before.mob!.health }, { polling: "raf", timeout: 12_000 });
          evidence.damageObserved = Date.now();
        } finally {
          if (finger && fingerDown) { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); fingerDown = false; }
          else if (!finger) await page.mouse.up({ button: "left" });
          evidence.releaseAcknowledged = Date.now(); evidence.after = await state(id); observations.push(evidence);
        }
        await page.waitForTimeout(450);
      }
    } finally { await stop(); }
    expect(await alive(id)).toBe(false);
  };
  const summon = async () => {
    const before = await page.evaluate(() => window.__craft.game!.mobs.mobs.map(m => m.id));
    await look(page, 0, -.2); await command(page, "/summon squid");
    const id = await page.evaluate(old => window.__craft.game!.mobs.mobs.find(m => m.kind === "squid" && !old.includes(m.id))?.id ?? null, before);
    expect(id).not.toBeNull(); return id!;
  };
  const inkGround = () => page.evaluate(() => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === window.__craft.stackId("ink_sac")));
  const pickupInk = async () => {
    for (let trip = 0; trip < 12 && (await inkGround()).length; trip++) {
      const drop = (await inkGround())[0];
      await command(page, `/tp ${drop.position.x} ${drop.position.y + .1} ${drop.position.z}`);
      await page.waitForTimeout(500);
    }
    expect(await inkGround()).toEqual([]);
  };
  const swimEvidence = async (id: number) => {
    // A real player approach loads the neighbourhood before observing a naturally spawned edge actor.
    await playerNear(id);
    await page.waitForFunction(() => window.__craft.game!.renderer.isAreaReady(2), undefined, { timeout: 60_000 });
    const samples: Awaited<ReturnType<typeof state>>[] = [];
    for (let i = 0; i < 8; i++) { samples.push(await state(id)); await page.waitForTimeout(400); }
    const waterId = blockId("water");
    const wetPairs = samples.slice(1).flatMap((current, index) => {
      const previous = samples[index];
      if (!previous.mob || !current.mob || previous.water?.[1] !== waterId || current.water?.[1] !== waterId) return [];
      return [{ previousIndex: index, currentIndex: index + 1,
        vertical: Math.abs(current.mob.position.y - previous.mob.position.y),
        horizontal: Math.hypot(current.mob.position.x - previous.mob.position.x, current.mob.position.z - previous.mob.position.z) }];
    });
    // Retain every actual sample before assertions, including legitimate surfacing or an unknown read.
    observations.push({ kind: "unmodified-live-swim-observations", id, samples, wetPairs,
      qualification: "Movement thresholds count only consecutive samples whose actual .4 body-center cell is water; dry falling/drift is excluded." });
    expect(samples.every(sample => sample.mob?.kind === "squid" && sample.mob.health === 10)).toBe(true);
    for (const sample of samples) {
      expect(sample.tentacles).toHaveLength(8);
      expect(sample.bodyCells.length).toBeGreaterThan(0);
      expect(sample.bodyCells.every(cell => cell.id !== null)).toBe(true);
      const missingCollisionReads: { x: number; y: number; z: number }[] = [];
      const collides = boxCollides((x, y, z) => {
        const cell = sample.bodyCells.find(cell => cell.x === x && cell.y === y && cell.z === z);
        if (cell?.id === undefined || cell.id === null) { missingCollisionReads.push({ x, y, z }); return blockId("stone"); }
        return cell.id;
      }, bodyBox(sample.mob!.position, .95, .95));
      observations.push({ kind: "independent-collision-readback", id, at: sample.at, missingCollisionReads, collides });
      expect(missingCollisionReads).toEqual([]); expect(collides).toBe(false);
      const air = sample.mob!.squidState!.airRemaining;
      expect(Number.isFinite(air)).toBe(true); expect(air).toBeGreaterThanOrEqual(0); expect(air).toBeLessThanOrEqual(15);
    }
    expect(wetPairs.length).toBeGreaterThan(0);
    expect(wetPairs.reduce((sum, pair) => sum + pair.vertical, 0)).toBeGreaterThan(.01);
    expect(wetPairs.reduce((sum, pair) => sum + pair.horizontal, 0)).toBeGreaterThan(.05);
    await playerNear(id); const stop = await trackMob(page, id);
    try { await snap(page, info, `${route}-original-eight-tentacle-live-squid`); } finally { await stop(); }
  };
  const record = async (label: string, extra: unknown) => {
    await fs.writeFile(info.outputPath(`${route}-${label}.json`), JSON.stringify(extra, null, 2));
  };
  const finish = async (extra: unknown, originalFailure?: unknown) => {
    const cleanupFailures: string[] = [];
    try {
      try { if (finger && fingerDown) { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); fingerDown = false; } }
      catch (error) { cleanupFailures.push(`touchEnd: ${String(error)}`); }
    } finally {
      try { if (finger) await finger.detach(); }
      catch (error) { cleanupFailures.push(`detach: ${String(error)}`); }
      finally {
        try {
          await record("coverage", { route, controls: mobile ? "Acknowledged CDP touch combat plus actual UI taps" : "Mouse combat plus actual UI clicks", observations, extra, errors, cleanupFailures,
            originalFailure: originalFailure === undefined ? null : String(originalFailure),
            fixtures: "Raw terrain/tools/ingredients and full bag only where explicitly stated; real chat approach/camera tracking. No outcome/RNG/mob-state injection.",
            limits: ["Application adult .95 model/motion/spawn policy; active native variant and numerical/graphics parity unresolved", "Constructed aquarium is mechanics only; natural route separately requires generated ocean and real scheduler", "No performance acceptance; full ticket remains open"] });
        } catch (error) { if (originalFailure === undefined) throw error; }
      }
    }
    if (originalFailure === undefined) { expect(cleanupFailures).toEqual([]); expect(errors).toEqual([]); }
  };
  return { observations, errors, press, inv, slotOf, empty, openInventory, closeInventory, select, use, pause, saveQuit, resume, state, alive, playerNear, playerKill, summon, inkGround, pickupInk, swimEvidence, record, finish };
}

/** Second-kill-only raw fixture: separate from the wide swimming aquarium and natural ocean.
 * Two water layers are required by the production whole-body summon margin. The surrounding
 * platform ends at base+3, leaving a dry unobstructed Agent navigation plane at that height. */
async function prepareSecondAgentWell(page: Page, origin: { x: number; z: number; floor: number }) {
  return page.evaluate(o => {
    const g = window.__craft.game!, x = Math.floor(o.x) + 20, z = Math.floor(o.z), base = o.floor;
    const solid = window.__craft.blockId("bedrock"), water = window.__craft.blockId("water");
    for (let dx = -4; dx <= 5; dx++) for (let dz = -4; dz <= 5; dz++) {
      g.world.setBlock(x + dx, base, z + dz, solid);
      for (let y = base + 1; y <= base + 2; y++)
        g.world.setBlock(x + dx, y, z + dz, dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1 ? water : solid);
      for (let y = base + 3; y <= base + 11; y++) g.world.setBlock(x + dx, y, z + dz, 0);
    }
    const cells = [];
    for (let dx = -4; dx <= 5; dx++) for (let dz = -4; dz <= 5; dz++)
      for (let y = base; y <= base + 11; y++) cells.push({ x: x + dx, y, z: z + dz, id: g.world.getLoadedBlock(x + dx, y, z + dz) ?? null });
    return { x, z, base, agentFeet: base + 3, approach: { x: x + .5, y: base + 3, z: z + 3.5 }, cells,
      qualification: "Disclosed second-Agent mechanics well: 2x2 horizontal cells, two vertical water layers, solid floor and two-high surrounding platform; no actor or outcome state assigned." };
  }, origin);
}

/** Aquarium mechanics: full-bag WorldDrops are independent from receiver refusal. Real base random
 * roll1..3 is retained as observed, never rerolled. A second genuine Agent kill supplies dye if needed. */
export async function squidAquariumRoute(page: Page, info: TestInfo, mobile: boolean) {
  const f = await harness(page, info, mobile, "aquarium");
  let result: Record<string, unknown> = { stage: "setup" };
  let originalFailure: unknown;
  try {
    await command(page, "/gamerule doDaylightCycle false"); await command(page, "/time set day");
    const origin = await page.evaluate(() => {
      const g = window.__craft.game!, x = Math.floor(g.body.position.x), z = Math.floor(g.body.position.z), floor = 20;
      // Disclosed bounded mechanics aquarium, never passed off as natural ocean generation.
      for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
        g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("bedrock"));
        for (let y = floor + 1; y <= floor + 9; y++) g.world.setBlock(x + dx, y, z + dz, 0);
        for (const y of [floor + 1, floor + 2]) {
          if (Math.abs(dx) <= 6 && Math.abs(dz) <= 6) g.world.setBlock(x + dx, y, z + dz, window.__craft.blockId("water"));
          else if (Math.abs(dx) <= 7 && Math.abs(dz) <= 7) g.world.setBlock(x + dx, y, z + dz, window.__craft.blockId("bedrock"));
        }
      }
      g.inventory.slots.fill(null);
      for (const [slot, name] of ["diamond_sword", "book", "feather", "crafting_table"].entries()) g.inventory.slots[slot] = { id: window.__craft.stackId(name), count: 1 };
      for (let slot = 4; slot < g.inventory.slots.length; slot++) g.inventory.slots[slot] = { id: window.__craft.stackId("cobblestone"), count: 64 };
      return { x: x + .5, y: floor + 3, z: z + .5, floor };
    });
    await command(page, `/tp ${origin.x} ${origin.y} ${origin.z + 6}`);
    expect(await countStack(page, "ink_sac")).toBe(0);
    result = { origin, stage: "raw-aquarium-ready" };
    const id = await f.summon(); result = { origin, id, stage: "observing-live-swim" }; await f.swimEvidence(id);
    // Cold restore the living ID and finite aquatic state before the genuine player kill.
    const liveSave = await f.saveQuit();
    const living = liveSave.mobs.records.find((m: { id: number }) => m.id === id);
    result = { origin, id, living, liveSave, stage: "living-cold-save" };
    expect(living.kind).toBe("squid"); expect(Number.isFinite(living.squidState.airRemaining)).toBe(true);
    expect(living.squidState.airRemaining).toBeGreaterThanOrEqual(0); expect(living.squidState.airRemaining).toBeLessThanOrEqual(15);
    await f.resume(); const restoredLiving = await f.state(id);
    result.restoredLiving = restoredLiving;
    f.observations.push({ kind: "actual-living-cold-restore", saved: living, restored: restoredLiving,
      qualification: "Readiness waits permit real simulation after load; actual finite bounded fields are recorded, without forcing exact elapsed-state equality." });
    expect(restoredLiving.mob?.id).toBe(id);
    expect(Number.isFinite(restoredLiving.mob!.squidState!.airRemaining)).toBe(true);
    expect(restoredLiving.mob!.squidState!.airRemaining).toBeGreaterThanOrEqual(0); expect(restoredLiving.mob!.squidState!.airRemaining).toBeLessThanOrEqual(15);
    await f.playerKill(id);
    const ground = await f.inkGround(); expect(ground).toHaveLength(1);
    const roll = ground[0].stack.count; result = { origin, id, living, liveSave, ground, roll, stage: "full-bag-world-owned-ink" }; expect(roll).toBeGreaterThanOrEqual(1); expect(roll).toBeLessThanOrEqual(3);
    expect(await countStack(page, "ink_sac")).toBe(0);
    expect(await page.evaluate(() => window.__craft.game!.inventory.slots.every(Boolean))).toBe(true);
    await snap(page, info, "full-bag-genuine-squid-ink-remains-world-owned");
    const pendingSave = await f.saveQuit(); result.pendingSave = pendingSave; result.stage = "cold-world-drop-restore"; await f.resume();
    expect((await f.inkGround()).map(r => ({ key: r.key, stack: r.stack }))).toEqual(ground.map(r => ({ key: r.key, stack: r.stack })));
    expect(await countStack(page, "ink_sac")).toBe(0);
    // Actual UI discards four preowned filler stacks far from all pool cells. No bag capacity edits.
    await command(page, `/tp ${origin.x - 10} ${origin.floor + 1} ${origin.z - 10}`);
    await f.openInventory();
    for (const slot of [8, 9, 10, 11]) { await f.press(f.inv.locator(`[data-slot="${slot}"]`)); await f.press(f.inv.locator("[data-drop-held]")); }
    await f.closeInventory(); await f.pickupInk(); expect(await countStack(page, "ink_sac")).toBe(roll);
    await command(page, `/tp ${origin.x - 9} ${origin.floor + 1} ${origin.z + 9}`);
    await f.openInventory();
    const craftIngredient = async (name: string, cell: number) => {
      const slot = await f.slotOf(name); expect(slot).toBeGreaterThanOrEqual(0);
      const count = await countStack(page, name);
      await f.press(f.inv.locator(`[data-slot="${slot}"]`)); await f.press(f.inv.locator(`[data-craft="${cell}"]`));
      if (count > 1) await f.press(f.inv.locator(`[data-slot="${slot}"]`));
    };
    await craftIngredient("book", 0); await craftIngredient("ink_sac", 1); await craftIngredient("feather", 2);
    await expect(f.inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Book and Quill");
    await snap(page, info, "actually-acquired-ink-book-and-quill-preview");
    await f.press(f.inv.locator("[data-craft-result]")); await f.press(f.inv.locator(`[data-slot="${await f.empty()}"]`));
    await f.closeInventory(); expect(await countStack(page, "ink_sac")).toBe(roll - 1);
    expect(await countStack(page, "book")).toBe(0); expect(await countStack(page, "feather")).toBe(0);
    await f.select("book_and_quill"); await f.use();
    await expect(page.locator(".book-screen")).toBeVisible();
    await page.getByLabel("Book page", { exact: true }).fill("Ordinary squid ink acquired from a living swimming actor.");
    await f.press(page.getByRole("button", { name: "Sign", exact: true }));
    await page.getByLabel("Book title").fill("Ocean field notes");
    await f.press(page.getByRole("button", { name: "Sign and Close", exact: true }));
    await f.select("written_book"); await f.use();
    await expect(page.locator(".book-title")).toHaveText("Ocean field notes");
    await expect(page.locator(".book-text")).toHaveText("Ordinary squid ink acquired from a living swimming actor.");
    await snap(page, info, "real-ui-signed-squid-ink-book"); await f.press(page.getByRole("button", { name: "Done", exact: true }));
    const bookSave = await f.saveQuit(); result.bookSave = bookSave; result.stage = "cold-signed-book-restore"; await f.resume();
    const book = await page.evaluate(() => window.__craft.game!.inventory.slots.find(s => s?.id === window.__craft.stackId("written_book")));
    result.book = book;
    expect(book?.book).toEqual(expect.objectContaining({ title: "Ocean field notes", author: "Player", pages: ["Ordinary squid ink acquired from a living swimming actor."] }));
    // Always a second genuine kill through the Code Builder Agent, regardless of the first roll.
    const agentWell = await prepareSecondAgentWell(page, origin);
    result.agentWell = agentWell;
    f.observations.push({ kind: "second-Agent-raw-terrain-fixture-ACK", agentWell });
    await command(page, `/tp ${agentWell.approach.x} ${agentWell.approach.y} ${agentWell.approach.z}`);
    await page.waitForFunction(() => window.__craft.game!.renderer.isAreaReady(2), undefined, { timeout: 60_000 });
    const expectedSpawn = { x: agentWell.x + .5, y: agentWell.base + 1.2, z: agentWell.z + .5 };
    const expectedBox = bodyBox(expectedSpawn, .95, .95), summonClearance = [];
    for (let x = Math.floor(expectedBox.minX); x <= Math.floor(expectedBox.maxX - 1e-6); x++)
      for (let y = Math.floor(expectedBox.minY - .15); y <= Math.floor(expectedBox.maxY + .15); y++)
        for (let z = Math.floor(expectedBox.minZ); z <= Math.floor(expectedBox.maxZ - 1e-6); z++)
          summonClearance.push(agentWell.cells.find(cell => cell.x === x && cell.y === y && cell.z === z) ?? { x, y, z, id: null });
    f.observations.push({ kind: "second-Agent-raw-well-ordinary-command-clearance", expectedSpawn, summonClearance });
    expect(summonClearance.length).toBeGreaterThan(0); expect(summonClearance.every(cell => cell.id === blockId("water"))).toBe(true);
    const agentId = await f.summon();
    const agentAttempts: unknown[] = [];
    result = { ...result, bookSave, book, agentId, agentAttempts, stage: "actual-agent-programs" };
    const initialState = await f.state(agentId), initialMob = initialState.mob!;
    // Independent loaded-cell readback verifies the actual ordinary summon, without repositioning it.
    const missing: { x: number; y: number; z: number }[] = [];
    const get = (x: number, y: number, z: number) => {
      const cell = initialState.bodyCells.find(cell => cell.x === x && cell.y === y && cell.z === z);
      if (cell?.id === undefined || cell.id === null) { missing.push({ x, y, z }); return blockId("stone"); }
      return cell.id;
    };
    const box = bodyBox(initialMob.position, .95, .95), bodyWater = [];
    for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX - 1e-6); x++)
      for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY - 1e-6); y++)
        for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ - 1e-6); z++) bodyWater.push({ x, y, z, id: get(x, y, z) });
    const collides = boxCollides(get, box);
    result.agentWellSummon = { initialState, bodyWater, missing, collides };
    f.observations.push({ kind: "second-Agent-actual-summon-loaded-water-geometry", evidence: result.agentWellSummon });
    expect(missing).toEqual([]); expect(initialState.bodyCells.every(cell => cell.id !== null)).toBe(true);
    expect(bodyWater.every(cell => cell.id === blockId("water"))).toBe(true); expect(collides).toBe(false);
    expect(initialMob.position.x).toBeGreaterThanOrEqual(agentWell.x + .475);
    expect(initialMob.position.x).toBeLessThanOrEqual(agentWell.x + 2 - .475);
    expect(initialMob.position.z).toBeGreaterThanOrEqual(agentWell.z + .475);
    expect(initialMob.position.z).toBeLessThanOrEqual(agentWell.z + 2 - .475);
    await command(page, `/tp ${Math.floor(initialMob.position.x) + 2.5} ${agentWell.agentFeet} ${Math.floor(initialMob.position.z) + .5}`);
    await look(page, 0, 0); await command(page, "/agent tp");
    result.agentStart = await f.state(agentId); // Read-only ACK of the one actual initial teleport.
    for (let attempt = 0; attempt < 12 && await f.alive(agentId); attempt++) {
      const attemptEvidence: Record<string, unknown> = { attempt, before: await f.state(agentId) };
      agentAttempts.push(attemptEvidence); f.observations.push({ kind: "actual-agent-program-attempt", evidence: attemptEvidence });
      try {
      if (mobile) await f.press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("KeyK");
      await expect(page.locator(".code-screen")).toBeVisible(); await f.press(page.getByRole("button", { name: "New", exact: true }));
      const relative = await page.evaluate(i => {
        const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === i)!, a = g.agent;
        const dx = Math.floor(m.position.x) - a.x, dz = Math.floor(m.position.z) - a.z;
        const [fx, fz] = [[0, 1], [-1, 0], [0, -1], [1, 0]][a.facing];
        const dirs = { forward: [fx, fz], back: [-fx, -fz], left: [fz, -fx], right: [-fz, fx] };
        const dy = m.position.y - a.y;
        const horizontalDirection = Object.entries(dirs).find(([, [x, z]]) => x === dx && z === dz)?.[0];
        const verticalDirection = dy > 0 ? "up" : "down";
        // Match the production floor-XZ and strict height predicate at the observed decision.
        const direction = dx === 0 && dz === 0
          ? (Math.abs(dy - (verticalDirection === "up" ? 1 : -1)) < 1.5 ? verticalDirection : undefined)
          : (horizontalDirection && Math.abs(dy) < 1.5 ? horizontalDirection : undefined);
        const desired = Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
        // Align XZ on the clear platform plane before any vertical step. Once directly above
        // the well, the existing down-attack height predicate can reach its two water layers.
        const moveDirection = dx !== 0 || dz !== 0
          ? Object.entries(dirs).find(([, [x, z]]) => x === desired[0] && z === desired[1])?.[0] ?? "up"
          : (m.position.y > a.y ? "up" : "down");
        return { agent: structuredClone(a), mob: structuredClone(m), dx, dy, dz, direction, moveDirection };
      }, agentId);
      // Editor pauses actor simulation. Retain actual Agent navigation across attempts; attack only
      // when the observed cell meets production geometry. The moving actor can still leave the cell.
      // No Agent/mob outcome or coordinate is assigned by the fixture.
      const operation = relative.direction ? "attack" : "move";
      const direction = relative.direction ?? relative.moveDirection;
      Object.assign(attemptEvidence, { relative, operation, direction });
      for (let i = 0; i < (operation === "attack" ? 3 : 1); i++) {
        await f.press(page.locator(`[data-palette="${operation}"]`));
        await page.locator(`[data-drop="on run / chat"] > .cb-block[data-type="${operation}"]`).last().getByLabel("Direction", { exact: true }).selectOption(direction);
      }
      await f.press(page.getByRole("button", { name: "▶ Run" }));
      await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
      } catch (error) { attemptEvidence.failure = String(error); throw error; }
      finally {
        try { attemptEvidence.after = await f.state(agentId); }
        catch (error) { attemptEvidence.afterReadFailure = String(error); }
      }
    }
    expect(await f.alive(agentId)).toBe(false);
    const agentGround = await f.inkGround();
    result = { ...result, agentGround, stage: "agent-ink-before-pickup" };
    const secondAcquiredBeforePickup = await countStack(page, "ink_sac") - (roll - 1);
    const secondRoll = secondAcquiredBeforePickup + agentGround.reduce((n, r) => n + r.stack.count, 0); expect(secondRoll).toBeGreaterThanOrEqual(1); expect(secondRoll).toBeLessThanOrEqual(3);
    await f.pickupInk(); expect(await countStack(page, "ink_sac")).toBe(roll - 1 + secondRoll);
    await command(page, `/tp ${origin.x - 9} ${origin.floor + 1} ${origin.z + 9}`);
    await f.openInventory(); await craftIngredient("ink_sac", 0);
    await expect(f.inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Black Dye");
    await f.press(f.inv.locator("[data-craft-result]")); await f.press(f.inv.locator(`[data-slot="${await f.empty()}"]`)); await f.closeInventory();
    expect(await countStack(page, "black_dye")).toBe(1); expect(await countStack(page, "ink_sac")).toBe(roll + secondRoll - 2);
    const finalSave = await f.saveQuit(); await f.resume();
    expect(await countStack(page, "black_dye")).toBe(1); expect(await countStack(page, "ink_sac")).toBe(roll + secondRoll - 2);
    await f.select("written_book"); await f.use(); await expect(page.locator(".book-title")).toHaveText("Ocean field notes");
    await f.press(page.getByRole("button", { name: "Done", exact: true }));
    result = { origin, id, living, restoredLiving, liveSave, roll, ground, pendingSave, bookSave, book, agentWell, agentWellSummon: result.agentWellSummon, agentId, agentAttempts, secondRoll, secondAcquiredBeforePickup, agentGround, finalSave, conservation: { genuineInk: roll + secondRoll, bookConsumed: 1, dyeConsumed: 1, remainingInk: roll + secondRoll - 2 }, stage: "complete" };
  } catch (error) { originalFailure = error; result.failure = String(error); throw error; }
  finally { await f.finish(result, originalFailure); }
}

/** No raw water or actor creation in this route. Pure generator search is disclosed site selection;
 * ordinary chat loads the chosen area and doMobSpawning drives the production scheduler. */
export async function squidNaturalOceanRoute(page: Page, info: TestInfo, mobile: boolean) {
  const f = await harness(page, info, mobile, "natural-ocean");
  let result: Record<string, unknown> = { stage: "site-search" };
  let originalFailure: unknown;
  try {
    const site = await page.evaluate(sea => {
      const gen = window.__craft.game!.world.generator;
      for (let x = -512; x <= 512; x += 8) for (let z = -512; z <= 512; z += 8) {
        const h = gen.heightAt(x, z); if (h < sea || h > sea + 3) continue;
        let ocean = 0;
        for (let angle = 0; angle < 16; angle++) {
          const ox = Math.floor(x + Math.cos(angle * Math.PI / 8) * 24), oz = Math.floor(z + Math.sin(angle * Math.PI / 8) * 24);
          if (gen.biomeAt(ox, oz) === "ocean" && gen.heightAt(ox, oz) <= sea - 4) ocean++;
        }
        if (ocean >= 6) return { x: x + .5, y: h + 1.01, z: z + .5, seed: window.__craft.game!.world.seed, eligibleOceanSamples: ocean };
      }
      return null;
    }, SEA_LEVEL);
    expect(site).not.toBeNull(); result = { site, stage: "generated-shore-found" };
    // Raw combat and unsupported attachment probe tools only; no acquired outcomes or terrain.
    await command(page, "/give diamond_sword"); await command(page, "/give lead_rope"); await command(page, "/give red_balloon");
    await command(page, `/tp ${site!.x} ${site!.y} ${site!.z}`);
    await page.waitForFunction(() => window.__craft.game!.renderer.isAreaReady(2), undefined, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__craft.game!.mobs.mobs.filter(m => m.kind === "squid").length)).toBe(0);
    result = { site, stage: "waiting-for-real-scheduler" };
    await command(page, "/gamerule doMobSpawning true");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.mobs.mobs.filter(m => m.kind === "squid").length), { timeout: 120_000 }).toBeGreaterThan(0);
    const natural = await page.evaluate(() => window.__craft.game!.mobs.mobs.find(m => m.kind === "squid")!.id);
    const spawned = await f.state(natural); result = { site, natural, spawned, stage: "natural-live-squid" }; expect(spawned.biome).toBe("ocean"); expect(spawned.spawning).toBe(true);
    expect(spawned.water!.every(id => id === spawned.water![0])).toBe(true);
    expect(spawned.water![0]).toBe(await page.evaluate(() => window.__craft.blockId("water")));
    expect(spawned.squidCount).toBeLessThanOrEqual(4); await command(page, "/gamerule doMobSpawning false");
    await f.swimEvidence(natural);
    const liveSave = await f.saveQuit(); await f.resume(); expect((await f.state(natural)).mob?.id).toBe(natural);
    // Unsupported attachments are a visible limitation: actual use must not consume or add owners.
    const attachmentEvidence = [];
    for (const item of ["lead_rope", "red_balloon"]) {
      await f.select(item); await f.playerNear(natural); const stop = await trackMob(page, natural);
      try {
        await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(natural);
        const before = await f.state(natural); await f.use(); await page.waitForTimeout(200); const after = await f.state(natural);
        expect(await countStack(page, item)).toBe(1); expect(after.leashes).toEqual(before.leashes); expect(after.balloons).toEqual(before.balloons);
        attachmentEvidence.push({ item, before, after });
      } finally { await stop(); }
    }
    const beforeInk = await countStack(page, "ink_sac"); expect(beforeInk).toBe(0);
    await f.playerKill(natural); await f.pickupInk();
    const ink = await countStack(page, "ink_sac"); expect(ink).toBeGreaterThanOrEqual(1); expect(ink).toBeLessThanOrEqual(3);
    await command(page, `/tp ${site!.x} ${site!.y} ${site!.z}`);
    await snap(page, info, "generated-ocean-real-scheduler-squid-ink-acquired");
    const acquiredSave = await f.saveQuit(); await f.resume(); expect(await countStack(page, "ink_sac")).toBe(ink);
    result = { site, natural, spawned, liveSave, attachmentEvidence, ink, acquiredSave, stage: "complete", fixtureQualification: "No water/terrain edits, summon, direct spawn, RNG replacement or actor-state assignment; pure generator shore selection, chat teleport/load, actual scheduler and real player combat/pickup." };
  } catch (error) { originalFailure = error; result.failure = String(error); throw error; }
  finally { await f.finish(result, originalFailure); }
}
