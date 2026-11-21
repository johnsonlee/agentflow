import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { collectWorldDrops, command, countStack, createWorld, look, mobExists, newestMob, parkMouse, pressMouse, snap, trackMob, bringMob, waitForTerrain } from "./helpers";

/** A flat pad, pre-owned Agent stone and full player bag are fixtures. Commands/clicks own all transfers. */
export async function agentGroundDropsRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("stone"));
      for (let dy = 1; dy <= 4; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    const id = window.__craft.stackId("stone");
    Object.assign(g.agent, { x: x + 3, y: floor + 1, z, facing: 2 });
    g.agent.slots.fill(null); g.agent.slots[0] = { id, count: 3 };
    g.inventory.slots.fill(null);
    return { id, floor };
  });
  const open = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("k");
    await expect(page.locator(".code-screen")).toBeVisible();
  };
  const run = async () => {
    await press(page.getByRole("button", { name: "▶ Run" }));
    await expect(page.locator(".code-screen")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  };
  await open();
  await press(page.locator('[data-palette="drop"]'));
  await page.getByLabel("Drop quantity (empty means whole stack)").fill("2");
  await page.getByLabel("Drop quantity (empty means whole stack)").press("Tab");
  await run();
  expect(await page.evaluate(() => window.__craft.game!.agent.slots[0])).toEqual({ id: fixture.id, count: 1 });
  expect(await countStack(page, "stone")).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__craft.game!.worldDrops.records.reduce((n, r) => n + r.stack.count, 0))).toBe(2);
  await page.waitForTimeout(700);
  await snap(page, info, "agent-quantity-drop-owned-on-ground");
  await open(); await press(page.getByRole("button", { name: "New", exact: true }));
  await press(page.locator('[data-palette="move"]'));
  await press(page.locator('[data-palette="collect"]'));
  await run();
  expect(await page.evaluate(() => window.__craft.game!.agent.slots[0])).toEqual({ id: fixture.id, count: 3 });
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records)).toEqual([]);
  expect(await countStack(page, "stone")).toBe(0);
  // A real combat death must preserve loot even when every player slot is occupied.
  await command(page, "/give diamond_sword"); await command(page, "/give cobblestone 2304");
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.filter(Boolean).length)).toBe(36);
  const filler = await countStack(page, "cobblestone");
  await command(page, "/summon pig"); const pig = (await newestMob(page, "pig"))!;
  await look(page, 0, 0); if (!mobile) await parkMouse(page);
  const stopTrack = await trackMob(page, pig);
  const touch = mobile ? await page.context().newCDPSession(page) : null;
  const touchCombat: Record<string, unknown>[] = [];
  const combatState = () => page.evaluate(mobId => {
    const g = window.__craft.game;
    const mob = g?.mobs.mobs.find(m => m.id === mobId);
    return { browserNowMs: performance.now(), gamePresent: !!g, playerHealth: g?.health ?? null,
      paused: g?.paused ?? null, modalOpen: g ? (g as unknown as { screenOpen(): boolean }).screenOpen() : null,
      finitePose: !!g && [g.body.yaw, g.body.pitch, g.body.position.x, g.body.position.y, g.body.position.z].every(Number.isFinite),
      targetId: g?.targetMob?.id ?? null, mobExists: !!mob, mobHealth: mob?.health ?? null,
      playerPosition: g ? { ...g.body.position } : null, mobPosition: mob ? { ...mob.position } : null };
  }, pig);
  try {
    for (let i = 0; i < 8 && await mobExists(page, pig); i++) {
      await bringMob(page, pig); await page.waitForTimeout(120);
      if (touch) {
        const observation: Record<string, unknown> = { attempt: i + 1 };
        touchCombat.push(observation);
        // A cached target is the game's actual in-reach raycast result, not an injected hit.
        await expect.poll(async () => {
          const state = await combatState(); observation.beforeReady = state;
          return state.gamePresent && state.playerHealth! > 0 && !state.paused && !state.modalOpen && state.finitePose && state.targetId === pig;
        }, { timeout: 10_000, message: "Live player and finite, in-range pig target before the real touch" }).toBe(true);
        const before = await combatState(); observation.before = before;
        expect(before.mobHealth).not.toBeNull();
        await page.evaluate(() => {
          const w = window as unknown as { __agentCombatTouch?: { events: unknown[]; stop(): void } };
          w.__agentCombatTouch?.stop();
          const events: unknown[] = [];
          const observe = (event: PointerEvent) => {
            const g = window.__craft.game;
            events.push({ type: event.type, eventTimeMs: event.timeStamp, browserNowMs: performance.now(),
              trusted: event.isTrusted, pointerType: event.pointerType, pointerId: event.pointerId,
              targetClass: event.target instanceof Element ? event.target.className : null,
              targetId: g?.targetMob?.id ?? null, playerHealth: g?.health ?? null, paused: g?.paused ?? null });
          };
          for (const type of ["pointerdown", "pointerup", "pointercancel"]) document.addEventListener(type, observe as EventListener, { capture: true, passive: true });
          w.__agentCombatTouch = { events, stop() {
            for (const type of ["pointerdown", "pointerup", "pointercancel"]) document.removeEventListener(type, observe as EventListener, true);
          } };
        });
        const vp = page.viewportSize()!;
        let failure: unknown;
        try {
          observation.downStartedNodeMs = Date.now();
          await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 82 }] });
          observation.downAcknowledgedNodeMs = Date.now(); observation.afterDownAck = await combatState();
          // Keep the actual finger down until a game frame records damage/death. No tick, hit or output is injected.
          await page.waitForFunction(({ mobId, initialHealth }) => {
            const g = window.__craft.game;
            if (!g || g.health <= 0 || g.paused || (g as unknown as { screenOpen(): boolean }).screenOpen()) throw new Error("Combat became inactive while the real touch was held");
            if (![g.body.yaw, g.body.pitch, g.body.position.x, g.body.position.y, g.body.position.z].every(Number.isFinite)) throw new Error("Nonfinite camera during held touch");
            const mob = g.mobs.mobs.find(m => m.id === mobId);
            return !mob || mob.health < initialHealth;
          }, { mobId: pig, initialHealth: before.mobHealth! }, { timeout: 10_000, polling: "raf" });
          observation.heldResult = await combatState(); observation.damageObservedNodeMs = Date.now();
        } catch (error) {
          failure = error; observation.failure = String(error);
        } finally {
          observation.releaseStartedNodeMs = Date.now();
          try { await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
          catch (error) { observation.releaseFailure = String(error); failure ??= error; }
          observation.releaseAcknowledgedNodeMs = Date.now(); observation.afterRelease = await combatState();
          observation.pointerEvents = await page.evaluate(() => {
            const w = window as unknown as { __agentCombatTouch?: { events: unknown[]; stop(): void } };
            const observed = w.__agentCombatTouch; observed?.stop(); delete w.__agentCombatTouch;
            return observed?.events ?? [];
          });
        }
        if (failure) throw failure;
      } else await pressMouse(page, "left");
      await page.waitForTimeout(450);
    }
  } finally {
    await stopTrack();
    await fs.writeFile(info.outputPath("actual-agent-pig-combat-input.json"), JSON.stringify({
      fixture: "Bring-near position/velocity and camera tracking only; health, hits and outputs are actual game results",
      method: "At most eight attempts; acknowledge actual CDP down, observe health decrease/death while held, finally release",
      touchCombat, final: await combatState(), errors,
      limit: "Historical639 surviving-pig cause remains unproved; this corrects input evidence, not a performance acceptance test",
    }, null, 2));
  }
  expect(await mobExists(page, pig)).toBe(false);
  expect(await countStack(page, "raw_porkchop")).toBe(0); expect(await countStack(page, "cobblestone")).toBe(filler);
  const pork = await page.evaluate(() => window.__craft.stackId("raw_porkchop"));
  const loot = () => page.evaluate((id) => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === id).reduce((n, r) => n + r.stack.count, 0), pork);
  const rolledPork = await loot();
  expect(Number.isInteger(rolledPork)).toBe(true); expect(rolledPork).toBeGreaterThanOrEqual(1); expect(rolledPork).toBeLessThanOrEqual(3);
  await page.waitForTimeout(700); expect(await loot()).toBe(rolledPork);
  await page.evaluate(() => window.__craft.game!.save()); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  expect(await loot()).toBe(rolledPork);
  // Remove one fixture filler stack only; the later pickup is the actual automatic ground transfer.
  await page.evaluate(() => { window.__craft.game!.inventory.slots[1] = null; });
  await collectWorldDrops(page);
  expect(await countStack(page, "raw_porkchop")).toBe(rolledPork); expect(await loot()).toBe(0);
  expect(await countStack(page, "cobblestone")).toBe(filler - 64);
  await snap(page, info, "full-bag-mob-loot-survives-reload-and-pickup");
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.filter(Boolean).length)).toBe(36);
  // Position/idle state of a raw summoned chicken are fixtures; its death is a real Agent action.
  await command(page, "/summon chicken"); const chicken = (await newestMob(page, "chicken"))!;
  await page.evaluate((id) => {
    const g = window.__craft.game!, a = g.agent, mob = g.mobs.mobs.find(m => m.id === id)!;
    mob.position = { x: a.x + .5, y: a.y, z: a.z - .5 };
    mob.velocity = { x: 0, y: 0, z: 0 }; mob.walking = false; mob.thinkTimer = 60;
  }, chicken);
  await open(); await press(page.getByRole("button", { name: "New", exact: true }));
  await press(page.locator('[data-palette="attack"]')); await run();
  expect(await mobExists(page, chicken)).toBe(false);
  const groundCount = (name: string) => page.evaluate((n) => {
    const id = window.__craft.stackId(n);
    return window.__craft.game!.worldDrops.records.filter(r => r.stack.id === id).reduce((sum, r) => sum + r.stack.count, 0);
  }, name);
  const rolledFeather = await groundCount("feather");
  expect(Number.isInteger(rolledFeather)).toBe(true); expect(rolledFeather).toBeGreaterThanOrEqual(0); expect(rolledFeather).toBeLessThanOrEqual(2);
  expect(await groundCount("raw_chicken")).toBe(1);
  expect(await countStack(page, "raw_chicken")).toBe(0); expect(await countStack(page, "feather")).toBe(0);
  expect(await page.evaluate(() => window.__craft.game!.agent.slots[0])).toEqual({ id: fixture.id, count: 3 });
  // A raw zombie with one health and an open-sky column is a bounded sunlight-death fixture.
  // Neither fire damage nor the claimed rotten flesh is injected by the test.
  await command(page, "/time set night"); await command(page, "/summon zombie");
  const zombie = (await newestMob(page, "zombie"))!;
  await page.evaluate((id) => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x) - 3, z = Math.floor(p.z), y = Math.floor(p.y + .01);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (let h = y; h < 128; h++) g.world.setBlock(x + dx, h, z + dz, 0);
      g.world.setBlock(x + dx, y - 1, z + dz, window.__craft.blockId("stone"));
    }
    const mob = g.mobs.mobs.find(m => m.id === id)!;
    mob.position = { x: x + .5, y, z: z + .5 }; mob.velocity = { x: 0, y: 0, z: 0 }; mob.health = 1;
  }, zombie);
  await command(page, "/time set day");
  await expect.poll(() => mobExists(page, zombie), { timeout: 20_000 }).toBe(false);
  const rolledFlesh = await groundCount("rotten_flesh");
  expect(Number.isInteger(rolledFlesh)).toBe(true); expect(rolledFlesh).toBeGreaterThanOrEqual(0); expect(rolledFlesh).toBeLessThanOrEqual(2);
  expect(await countStack(page, "rotten_flesh")).toBe(0);
  await page.waitForTimeout(1200);
  expect(await groundCount("raw_chicken")).toBe(1); expect(await groundCount("feather")).toBe(rolledFeather); expect(await groundCount("rotten_flesh")).toBe(rolledFlesh);
  await snap(page, info, "agent-and-daylight-deaths-retain-full-bag-loot-on-ground");
  await page.evaluate(() => window.__craft.game!.save()); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  expect(await groundCount("raw_chicken")).toBe(1); expect(await groundCount("feather")).toBe(rolledFeather); expect(await groundCount("rotten_flesh")).toBe(rolledFlesh);
  await page.evaluate(() => { const slots = window.__craft.game!.inventory.slots; for (const index of [2, 3, 4]) slots[index] = null; });
  await collectWorldDrops(page);
  expect(await countStack(page, "raw_chicken")).toBe(1); expect(await countStack(page, "feather")).toBe(rolledFeather); expect(await countStack(page, "rotten_flesh")).toBe(rolledFlesh);
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records)).toEqual([]);
  expect(await countStack(page, "cobblestone")).toBe(filler - 256);
  await snap(page, info, "agent-and-daylight-loot-reloads-and-picks-up-once");
  // Distance is a raw despawn fixture, not a kill; ordinary far-away removal must not create loot.
  await command(page, "/summon pig"); const despawned = (await newestMob(page, "pig"))!;
  await page.evaluate((id) => { const g = window.__craft.game!; g.mobs.mobs.find(m => m.id === id)!.position.x = g.body.position.x + 120; }, despawned);
  await expect.poll(() => mobExists(page, despawned)).toBe(false);
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records)).toEqual([]);
  expect(await countStack(page, "raw_porkchop")).toBe(rolledPork);
  await fs.writeFile(info.outputPath("actual-native-base-loot-rolls.json"), JSON.stringify({ rng: "uncontrolled session Math.random; source ranges only, not measured native distribution", pig: { rolled: rolledPork, range: [1, 3], route: "player/full bag/save/pickup" }, chicken: { meat: 1, feather: rolledFeather, featherRange: [0, 2], route: "Agent/full bag/save/pickup" }, zombie: { flesh: rolledFlesh, range: [0, 2], route: "daylight/full bag/save/pickup" }, despawn: { extraWorldDrops: 0 } }, null, 2));
  expect(errors).toEqual([]);
}
