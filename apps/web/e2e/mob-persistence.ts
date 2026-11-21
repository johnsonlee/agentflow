import { expect, type JSHandle, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { bringMob, collectWorldDrops, command, countStack, createWorld, look, mobExists, parkMouse, pressMouse, snap, trackMob, waitForTerrain } from "./helpers";

/** Raw living creatures, idle poses, a loaded flat pad and a one-refusal sink are disclosed fixtures.
 * Damage, saving/quitting, Continue, death retries and pickup are actual browser interactions.
 * No loot outputs or pending-roll values are injected, and Math.random is never replaced. */
export async function mobPersistenceRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const cdp = mobile ? await page.context().newCDPSession(page) : null;
  let attackSequence = 0;
  const interact = async (attack: boolean) => {
    if (!cdp) return pressMouse(page, attack ? "left" : "right");
    const vp = page.viewportSize()!;
    if (attack) {
      const sequence = ++attackSequence;
      const events: { event: string; wallTime: string; detail?: unknown }[] = [];
      const record = (event: string, detail?: unknown) => events.push({ event, wallTime: new Date().toISOString(), detail });
      const before = await page.evaluate(() => {
        const g = window.__craft.game!, m = g.targetMob;
        const attempts = (window as unknown as { __refusedLoot?: { attempts: unknown[][] } }).__refusedLoot?.attempts.length ?? 0;
        return { targetId: m?.id ?? null, health: m?.health ?? null, attempts, playerHealth: g.health, dead: g.dead, paused: g.paused, position: { ...g.body.position }, yaw: g.body.yaw, pitch: g.body.pitch,
          modals: [...document.querySelectorAll<HTMLElement>(".inventory-screen,.code-screen,.pause-screen,.death-screen,.npc-screen")].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => e.className) };
      });
      record("before", before);
      let failure: unknown = null;
      let observed: JSHandle<unknown> | null = null;
      try {
        await page.evaluate(() => { (window as unknown as { __mobAttackProbes: unknown[] }).__mobAttackProbes = []; });
        expect(before.targetId).not.toBeNull(); expect(before.health).toBeGreaterThan(0);
        expect(before.dead).toBe(false); expect(before.paused).toBe(false);
        expect(before.playerHealth).toBeGreaterThan(0); expect(before.modals).toEqual([]);
        expect([before.position.x, before.position.y, before.position.z, before.yaw, before.pitch].every(Number.isFinite)).toBe(true);
        record("touchStart-send", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 109 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 109 }] });
        record("touchStart-ack");
        observed = await page.waitForFunction(({ id, health, attempts }) => {
          const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id);
          const currentAttempts = (window as unknown as { __refusedLoot?: { attempts: unknown[][] } }).__refusedLoot?.attempts.length ?? 0;
          const state = { browserTime: performance.now(), id, exists: Boolean(m), health: m?.health ?? null, attempts: currentAttempts, targetId: g.targetMob?.id ?? null, playerHealth: g.health, dead: g.dead, paused: g.paused };
          (window as unknown as { __mobAttackProbes: unknown[] }).__mobAttackProbes.push(state);
          return !m || m.health < health! || currentAttempts > attempts ? state : false;
        }, { id: before.targetId!, health: before.health!, attempts: before.attempts }, { polling: "raf", timeout: 15_000 });
        record("actual-outcome-wait-returned");
      } catch (error) {
        failure = error; record("attack-error", String(error));
      } finally {
        record("touchEnd-send", { type: "touchEnd", touchPoints: [] });
        try { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); record("touchEnd-ack"); }
        catch (error) { failure ??= error; record("touchEnd-error", String(error)); }
        // Release first: reading/disposing the observation handle requires extra RPCs and must
        // not prolong the real hold through a second attack cooldown or fatal-transfer attempt.
        if (observed) {
          try { record("actual-outcome-observed-after-release", await observed.jsonValue()); }
          catch (error) { failure ??= error; record("outcome-read-error", String(error)); }
          finally {
            try { await observed.dispose(); }
            catch (error) { failure ??= error; record("outcome-dispose-error", String(error)); }
          }
        }
        let probes: unknown;
        try { probes = await page.evaluate(() => (window as unknown as { __mobAttackProbes?: unknown[] }).__mobAttackProbes ?? []); }
        catch (error) { probes = { readError: String(error) }; }
        await fs.writeFile(info.outputPath(`mob-touch-attack-${sequence}.json`), JSON.stringify({ sequence, before, events, probes, failure: failure === null ? null : String(failure), limits: "Read-only state probes surrounding actual acknowledged touch input; existing bring-near and camera tracking fixtures retained. No health, damage, tick, loot or actor-outcome write." }, null, 2));
      }
      if (failure !== null) throw failure;
      return;
    }
    const down = cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 109 }] });
    await new Promise(resolve => setTimeout(resolve, 60));
    await Promise.all([down, cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })]);
  };
  const pause = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
    else await page.keyboard.press("Escape");
    await expect(page.locator(".pause-screen")).toBeVisible();
  };
  const saveQuit = async () => {
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
    return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!));
  };
  const resume = async (paused = false) => {
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
    await page.waitForFunction(() => window.__craft.game !== null && window.__craft.game !== undefined);
    if (paused) {
      await pause();
      await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
    } else await waitForTerrain(page);
  };
  await command(page, "/time set night"); await command(page, "/gamerule doDaylightCycle false");
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("bedrock"));
      for (let dy = 1; dy <= 5; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    const positions = [{ x: p.x, z: p.z - 2.5 }, { x: x + 5.5, z: z + .5 }, { x: x - 5.5, z: z + .5 }, { x: x + .5, z: z + 4.5 }, { x: x + 8.5, z: z + 8.5 }];
    const kinds = ["pig", "sheep", "chicken", "npc", "zombie"] as const;
    const ids = kinds.map((kind, i) => {
      const m = g.mobs.spawn(kind, { ...positions[i], y: floor + 1 }, kind === "npc" ? { name: "Saved Guide", dialogue: "Five living kinds survive Continue.", yaw: .37 } : { yaw: .37 });
      m.velocity = { x: 0, y: 0, z: 0 }; m.onGround = true; m.walking = false; m.thinkTimer = 60;
      return m.id;
    });
    // A small cage bounds the existing zombie AI without changing it.
    const q = positions[4];
    for (let dy = 1; dy <= 3; dy++) for (const d of [{ x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 }])
      g.world.setBlock(Math.floor(q.x) + d.x, floor + dy, Math.floor(q.z) + d.z, window.__craft.blockId("bedrock"));
    return { ids, floor, origin: { ...p } };
  });
  const pig = fixture.ids[0], npc = fixture.ids[3];
  const hitPig = async () => {
    await look(page, 0, 0); if (!mobile) await parkMouse(page); await bringMob(page, pig);
    const untrack = await trackMob(page, pig);
    await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(pig);
    await interact(true); await untrack(); await page.waitForTimeout(450);
  };
  await hitPig();
  const wounded = await page.evaluate(id => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, pig);
  expect(wounded).toBeGreaterThan(0); expect(wounded).toBeLessThan(10);
  const first = await saveQuit();
  expect(first.mobs.records.map((m: { id: number }) => m.id)).toEqual(fixture.ids);
  expect(first.mobs.records.find((m: { id: number }) => m.id === pig).health).toBe(wounded);
  expect(first.mobs.records.find((m: { id: number }) => m.id === npc).health).toBe("invulnerable");
  expect(first.npcs).toHaveLength(1);
  await resume(true);
  const loaded = await page.evaluate(() => {
    const g = window.__craft.game!;
    return { mobs: g.mobs.mobs.map(m => ({ id: m.id, kind: m.kind, position: { ...m.position }, health: m.kind === "npc" ? "invulnerable" : m.health, name: m.name, dialogue: m.dialogue })), modelIds: [...(g.mobs as unknown as { models: Map<number, unknown> }).models.keys()] };
  });
  expect(loaded.mobs.map(m => m.id)).toEqual(fixture.ids); expect(loaded.modelIds).toEqual(fixture.ids);
  expect(new Set(loaded.modelIds).size).toBe(5);
  for (const before of first.mobs.records) {
    const after = loaded.mobs.find(m => m.id === before.id)!;
    expect(after.kind).toBe(before.kind); expect(after.health).toBe(before.health);
    expect(Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y, after.position.z - before.position.z)).toBeLessThan(1.5);
    if (before.kind === "npc") { expect(after.name).toBe(before.name); expect(after.dialogue).toBe(before.dialogue); }
  }
  await snap(page, info, "all-five-kinds-restored-with-stable-model-ids");
  await press(page.getByRole("button", { name: "Back to Game", exact: true }));
  await page.evaluate(id => { window.__craft.game!.mobs.mobs.find(m => m.id === id)!.position.x -= 5; }, pig);
  await look(page, 0, 0); if (!mobile) await parkMouse(page); await bringMob(page, npc);
  const stopNpc = await trackMob(page, npc); await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(npc);
  await interact(false); await stopNpc();
  await expect(page.locator(".npc-screen")).toBeVisible();
  await expect(page.locator(".npc-screen h2")).toHaveText("Saved Guide");
  await expect(page.locator(".npc-text")).toHaveText("Five living kinds survive Continue.");
  await press(page.locator(".npc-screen").getByRole("button", { name: "Close", exact: true }));
  // Move the guide out of the next real combat target's ray.
  await page.evaluate(id => { const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!; m.position.x += 5; }, npc);
  await command(page, "/give diamond_sword");
  const sword = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId("diamond_sword")));
  if (mobile) await press(page.locator(`.hotbar [data-slot="${sword}"]`)); else await page.keyboard.press(`Digit${sword + 1}`);
  await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(sword);
  await page.evaluate(() => {
    const g = window.__craft.game!, store = g.worldDrops, original = store.planSpawnBatch.bind(store);
    const fixture = window as unknown as { __refusedLoot: { attempts: unknown[][]; restore: () => void } };
    fixture.__refusedLoot = { attempts: [], restore: () => { store.planSpawnBatch = original; } };
    store.planSpawnBatch = (stacks) => { fixture.__refusedLoot.attempts.push(structuredClone(stacks)); return null; };
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await page.evaluate(() => (window as unknown as { __refusedLoot: { attempts: unknown[][] } }).__refusedLoot.attempts.length)) break;
    await hitPig();
  }
  const refused = await page.evaluate(id => ({ health: window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, attempts: (window as unknown as { __refusedLoot: { attempts: unknown[][] } }).__refusedLoot.attempts, ground: window.__craft.game!.worldDrops.records }), pig);
  expect(refused.health).toBe(1); expect(refused.attempts).toHaveLength(1); expect(refused.ground).toEqual([]);
  const rolled = refused.attempts[0] as { id: number; count: number }[];
  expect(rolled).toHaveLength(1); expect(rolled[0].count).toBeGreaterThanOrEqual(1); expect(rolled[0].count).toBeLessThanOrEqual(3);
  expect(await countStack(page, "raw_porkchop")).toBe(0);
  // Distance despawn may remove ordinary creatures, but must not erase a refused loot owner.
  await command(page, `/tp ${fixture.origin.x + 120} ${fixture.floor + 1} ${fixture.origin.z}`);
  await page.waitForTimeout(600);
  expect(await mobExists(page, fixture.ids[2])).toBe(false); // Ordinary unrolled creature still despawns.
  expect(await mobExists(page, pig)).toBe(true);
  expect(await page.evaluate(id => {
    const g = window.__craft.game!, mob = g.mobs.mobs.find(m => m.id === id)!;
    return (g as unknown as { mobLoot: { exportPending(m: unknown): unknown } }).mobLoot.exportPending(mob);
  }, pig)).toEqual(rolled);
  await command(page, `/tp ${fixture.origin.x} ${fixture.floor + 1} ${fixture.origin.z}`);
  const pending = await saveQuit();
  expect(pending.mobs.records.find((m: { id: number }) => m.id === pig).pendingLoot).toEqual(rolled);
  await resume(); expect(await mobExists(page, pig)).toBe(true);
  await hitPig(); expect(await mobExists(page, pig)).toBe(false);
  const ground = () => page.evaluate(() => window.__craft.game!.worldDrops.records.map(r => r.stack));
  expect(await ground()).toEqual(rolled); await page.waitForTimeout(700); expect(await ground()).toEqual(rolled);
  await snap(page, info, "cached-refused-fatal-loot-committed-once-after-continue");
  await collectWorldDrops(page); expect(await countStack(page, "raw_porkchop")).toBe(rolled[0].count); expect(await ground()).toEqual([]);
  const dead = await saveQuit(); expect(dead.mobs.records.some((m: { id: number }) => m.id === pig)).toBe(false);
  await resume(); expect(await mobExists(page, pig)).toBe(false); expect(await countStack(page, "raw_porkchop")).toBe(rolled[0].count);
  await command(page, "/summon chicken");
  const allocated = await page.evaluate(() => window.__craft.game!.mobs.mobs.at(-1)!.id);
  expect(allocated).toBeGreaterThan(Math.max(...fixture.ids));
  const compatibility = await saveQuit();
  await page.evaluate(() => { const data = JSON.parse(localStorage.getItem("craft.save.v1")!); delete data.mobs; localStorage.setItem("craft.save.v1", JSON.stringify(data)); });
  await resume();
  expect(await page.evaluate(() => window.__craft.game!.mobs.mobs.map(m => m.kind))).toEqual(["npc"]);
  const legacy = await saveQuit(); expect(legacy.mobs.records).toHaveLength(1); expect(legacy.mobs.records[0].name).toBe("Saved Guide");
  const corrupt = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("craft.save.v1")!); data.mobs.records[0].pendingLoot = [{ id: -1, count: 1 }];
    const raw = JSON.stringify(data); localStorage.setItem("craft.save.v1", raw); return raw;
  });
  await resume(); await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("creatures");
  expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
  const downloadEvent = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" }));
  const download = await downloadEvent; const backupPath = info.outputPath("damaged-creature-recovery.json"); await download.saveAs(backupPath);
  expect(JSON.parse(await fs.readFile(backupPath, "utf8")).recoveryOriginalSave).toBe(corrupt);
  await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.locator(".pause-screen")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
  const assertStatusVisible = async () => {
    const bounds = await page.locator(".pause-screen .save-status").evaluate(status => {
      const panel = status.closest(".panel")!, box = status.getBoundingClientRect(), clip = panel.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, clipTop: Math.max(clip.top + panel.clientTop, 0), clipBottom: Math.min(clip.top + panel.clientTop + panel.clientHeight, innerHeight), clipLeft: Math.max(clip.left + panel.clientLeft, 0), clipRight: Math.min(clip.left + panel.clientLeft + panel.clientWidth, innerWidth) };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(bounds.clipTop - 1); expect(bounds.bottom).toBeLessThanOrEqual(bounds.clipBottom + 1);
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.clipLeft - 1); expect(bounds.right).toBeLessThanOrEqual(bounds.clipRight + 1);
  };
  await assertStatusVisible();
  await snap(page, info, "damaged-creature-original-preserved-even-after-export-request");
  if (mobile) {
    // Reuse the actual corrupt-save recovery flow at landscape and a narrow portrait viewport.
    for (const viewport of [{ width: 915, height: 412 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(viewport);
      await press(page.getByRole("button", { name: "Save & Quit to Title" }));
      await expect(page.locator(".save-status")).toContainText("Original save preserved"); await assertStatusVisible();
      await snap(page, info, `recovery-warning-fully-visible-${viewport.width}x${viewport.height}`);
      const downloaded = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" }));
      await (await downloaded).saveAs(info.outputPath(`recovery-backup-${viewport.width}x${viewport.height}.json`));
      await expect(page.locator(".save-status")).toContainText("Backup download requested"); await assertStatusVisible();
      await snap(page, info, `recovery-backup-status-fully-visible-${viewport.width}x${viewport.height}`);
      await press(page.getByRole("button", { name: "Save & Quit to Title" })); await assertStatusVisible();
      expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
      await expect(page.locator(".pause-screen")).toBeVisible();
    }
  }
  await fs.writeFile(info.outputPath("mob-persistence-evidence.json"), JSON.stringify({ fixtures: "raw living entities/idle poses, loaded bedrock pad/zombie cage/night; one sink refusal; legacy section deletion; corrupt pending fixture. No loot injection or RNG override.", first, loaded, refused, pending, dead, allocated, compatibility, legacy, errors }, null, 2));
  expect(errors).toEqual([]);
}
