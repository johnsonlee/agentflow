import { nativePageWorldTap } from './native-world-tap';
import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, snap, waitForTerrain } from "./helpers";

/** Preowned emptybottles3 and raw SpiderEye1 are disclosed inputs, not acquired outcomes.
 * Water comes from the unchanged seed12345 natural shore. Every fill, drink, Eye meal,
 * pause, selection and save/reload uses actual UI/input; no progress/effect/outcome is assigned. */
type WaterOwnerProbe = { slot: number; source: { id: number; count: number }; id: number; count: number; mode: string; elapsed: number };
type WaterTouchProbe = { stickId: number | null; look: { id: number; breaking: boolean } | null };

export async function waterDrinkingRoute(page: Page, info: TestInfo, mobile: boolean) {
  let stage = "create", failure: string | null = null, errors: string[] = [];
  const observations: unknown[] = [];
  try {
    errors = await createWorld(page, { mode: "survival", seed: "12345" });
    const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
    const finger = mobile ? await page.context().newCDPSession(page) : null, vp = page.viewportSize()!;
    const view = { x: vp.width * .65, y: vp.height * .42, id: 118 };
    const down = async () => { if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [view] }); else await page.mouse.down({ button: "right" }); };
    const up = async () => { if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up({ button: "right" }); };
    const holdUntil = async (until: () => Promise<unknown>) => { try { await down(); await until(); } finally { await up(); } };
    const use = async () => { if (mobile) await nativePageWorldTap(page, view.x, view.y); else { await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); } };
    const elapsed = () => page.evaluate(() => (window.__craft.game! as unknown as { drinkOwner: { elapsed: number } | null }).drinkOwner?.elapsed ?? null);
    const waitProgress = (minimum: number) => page.waitForFunction(value => ((window.__craft.game! as unknown as { drinkOwner: { elapsed: number } | null }).drinkOwner?.elapsed ?? 0) >= value, minimum, { timeout: 20_000 });
    const select = async (index: number) => { if (mobile) await press(page.locator(`.hotbar [data-slot="${index}"]`)); else { await page.keyboard.press(`Digit${index + 1}`); await parkMouse(page); } await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(index); };
    // Chromium156 accepts changed ended contacts: end only the second finger and retain the view.
    // Isolated CDP diagnostics prove touchMove with a missing point does not release it.
    const tapWithViewHeld = async (locator: Locator, id: number) => {
      const box = (await locator.boundingBox())!;
      await finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [view, { x: box.x + box.width / 2, y: box.y + box.height / 2, id }] });
      await finger!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id }] });
    };
    const pause = async (viewHeld = false) => {
      if (mobile && viewHeld) await tapWithViewHeld(page.getByRole("button", { name: "Pause", exact: true }), 122);
      else if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
      await expect(page.locator(".pause-screen")).toBeVisible();
    };
    const quitPaused = async () => { await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible(); return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!)); };
    const read = () => page.evaluate(() => {
      const g = window.__craft.game!;
      return { slots: structuredClone(g.inventory.slots), selected: g.inventory.selected, hunger: { ...g.hunger }, status: structuredClone(g.playerStatus), health: g.health,
        drink: (g as unknown as { drinkOwner: { slot: number; count: number; mode: string; elapsed: number } | null }).drinkOwner ? { ...((g as unknown as { drinkOwner: { slot: number; count: number; mode: string; elapsed: number } }).drinkOwner) } : null,
        errors: [...g.loadErrors], paused: g.paused, dead: g.dead, wallTime: performance.now() };
    });
    const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
    const counts = () => page.evaluate(() => {
      const g = window.__craft.game!, empty = window.__craft.stackId("glass_bottle"), water = window.__craft.stackId("water_bottle");
      return { empty: g.inventory.slots.filter(s => s?.id === empty).reduce((n, s) => n + s!.count, 0), water: g.inventory.slots.filter(s => s?.id === water).reduce((n, s) => n + s!.count, 0) };
    });
    await page.evaluate(() => {
      const g = window.__craft.game!; g.inventory.slots.fill(null);
      g.inventory.slots[0] = { id: window.__craft.stackId("glass_bottle"), count: 3 };
      g.inventory.slots[2] = { id: window.__craft.stackId("spider_eye"), count: 1 };
      g.inventory.slots[3] = { id: window.__craft.stackId("coal"), count: 1 };
    });
    await command(page, "/gamerule doDaylightCycle false"); await command(page, "/tp -127.5 31 -101.5"); await waitForTerrain(page);
    const water = { x: -130, y: 30, z: -100 }, waterId = await page.evaluate(() => window.__craft.blockId("water")); expect(await blockAt(page, water.x, water.y, water.z)).toBe(waterId);
    stage = "actual-fill"; await select(0); await lookAtCell(page, water.x, water.y, water.z); await use(); await expect.poll(counts).toEqual({ empty: 2, water: 1 }); await select(1);
    stage = "release-cancels"; await holdUntil(() => waitProgress(.55)); expect(await elapsed()).toBeNull(); expect(await counts()).toEqual({ empty: 2, water: 1 }); await record("actual-release-cancelled-partial");
    stage = "held-selection-cancels";
    try {
      await down(); await waitProgress(.45);
      if (mobile) { await tapWithViewHeld(page.locator('.hotbar [data-slot="3"]'), 119); await tapWithViewHeld(page.locator('.hotbar [data-slot="1"]'), 120); }
      else {
        await page.keyboard.press("Digit4"); await page.waitForFunction(() => window.__craft.game!.inventory.selected === 3);
        await page.keyboard.press("Digit2"); await page.waitForFunction(() => window.__craft.game!.inventory.selected === 1);
      }
      expect(await page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(1); expect(await elapsed() ?? 0).toBeLessThan(.45); expect(await counts()).toEqual({ empty: 2, water: 1 });
    } finally { await up(); }
    if (mobile) {
      stage = "unrelated-joystick-release";
      // Geometry is resolved before the timed hold. No locator round trip spends its remaining budget.
      const joystickBox = await page.locator(".touch-stick-base").boundingBox(); expect(joystickBox).not.toBeNull();
      const joystickPoint = { x: joystickBox!.x + joystickBox!.width / 2, y: joystickBox!.y + joystickBox!.height / 2, id: 121 };
      const pendingSecondFinger: Array<Promise<{ ok: true } | { ok: false; error: unknown }>> = [];
      const sendSecondFinger = (params: { type: "touchStart" | "touchMove" | "touchEnd"; touchPoints: Array<{ x: number; y: number; id: number }> }) => {
        // Attach a rejection handler immediately; cleanup settles every send even if an observation fails.
        const acknowledgement = finger!.send("Input.dispatchTouchEvent", params).then(
          () => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
        pendingSecondFinger.push(acknowledgement); return acknowledgement;
      };
      try {
        await down();
        // A JSHandle retains the original live objects; it never assigns input, progress or results.
        const witness = await page.waitForFunction(() => {
          const g = window.__craft.game!, probe = g as unknown as { drinkOwner: WaterOwnerProbe | null; touch: WaterTouchProbe | null };
          const owner = probe.drinkOwner, look = probe.touch?.look;
          if (!owner || owner.id !== window.__craft.stackId("water_bottle") || !look?.breaking) return null;
          const empty = window.__craft.stackId("glass_bottle"), water = window.__craft.stackId("water_bottle");
          return { owner, look, before: { wallTime: performance.now(), elapsed: owner.elapsed, selected: g.inventory.selected,
            slot: owner.slot, sourceId: owner.id, sourceCount: owner.count, mode: owner.mode,
            selectedSourceMatches: owner.source === g.inventory.selectedStack(),
            counts: { empty: g.inventory.slots.reduce((n, s) => n + (s?.id === empty ? s.count : 0), 0), water: g.inventory.slots.reduce((n, s) => n + (s?.id === water ? s.count : 0), 0) } } };
        }, undefined, { timeout: 20_000 });
        try {
          // Send promptly without awaiting the protocol acknowledgement; observe the real stick start.
          const secondDown = sendSecondFinger({ type: "touchStart", touchPoints: [view, joystickPoint] });
          const stickWitness = await page.waitForFunction(w => {
            if (!w) throw new Error("The original Water owner witness is missing");
            const g = window.__craft.game!, probe = g as unknown as { drinkOwner: WaterOwnerProbe | null; touch: WaterTouchProbe | null };
            if (!probe.touch || probe.touch.stickId === null) return null;
            return { stickId: probe.touch.stickId, sameOwner: probe.drinkOwner === w.owner, sameViewPointer: probe.touch.look === w.look };
          }, witness, { timeout: 5_000 });
          try {
            const secondRelease = sendSecondFinger({ type: "touchEnd", touchPoints: [joystickPoint] });
            // Capture one coherent snapshot as soon as the actual joystick pointer is released.
            const afterWitness = await page.waitForFunction(({ original, stick }) => {
              if (!original) throw new Error("The original Water owner witness is missing");
              if (!stick) throw new Error("The joystick start witness is missing");
              const g = window.__craft.game!, probe = g as unknown as { drinkOwner: WaterOwnerProbe | null; touch: WaterTouchProbe | null };
              if (!probe.touch || probe.touch.stickId !== null) return null;
              const owner = probe.drinkOwner, empty = window.__craft.stackId("glass_bottle"), water = window.__craft.stackId("water_bottle");
              return { before: original.before, stickStart: stick, after: { wallTime: performance.now(),
                sameOwner: owner === original.owner, sameViewPointer: probe.touch.look === original.look,
                selectedSourceMatches: owner?.source === g.inventory.selectedStack(), viewBreaking: probe.touch.look?.breaking ?? false,
                stickId: probe.touch.stickId, selected: g.inventory.selected, slot: owner?.slot ?? null,
                sourceId: owner?.id ?? null, sourceCount: owner?.count ?? null, mode: owner?.mode ?? null, elapsed: owner?.elapsed ?? null,
                counts: { empty: g.inventory.slots.reduce((n, s) => n + (s?.id === empty ? s.count : 0), 0), water: g.inventory.slots.reduce((n, s) => n + (s?.id === water ? s.count : 0), 0) } } };
            }, { original: witness, stick: stickWitness }, { timeout: 5_000 });
            try {
              const proof = await afterWitness.jsonValue();
              const acknowledgements = await Promise.all([secondDown, secondRelease]);
              for (const acknowledgement of acknowledgements) if (!acknowledgement.ok) throw acknowledgement.error;
              expect(proof).not.toBeNull(); if (!proof) throw new Error("The coherent Water observation is missing");
              expect(proof.before.selected).toBe(1); expect(proof.before.slot).toBe(1); expect(proof.before.sourceId).toBe(831);
              expect(proof.before.sourceCount).toBe(1); expect(proof.before.mode).toBe("survival");
              expect(proof.before.selectedSourceMatches).toBe(true); expect(proof.before.elapsed).toBeGreaterThan(0);
              expect(proof.before.elapsed).toBeLessThan(1.6); expect(proof.before.counts).toEqual({ empty: 2, water: 1 });
              expect(proof.stickStart.stickId).not.toBeNull(); expect(proof.stickStart.sameOwner).toBe(true); expect(proof.stickStart.sameViewPointer).toBe(true);
              expect(proof.after.sameOwner).toBe(true); expect(proof.after.sameViewPointer).toBe(true); expect(proof.after.viewBreaking).toBe(true);
              expect(proof.after.stickId).toBeNull(); expect(proof.after.selectedSourceMatches).toBe(true); expect(proof.after.selected).toBe(1);
              expect(proof.after.slot).toBe(1); expect(proof.after.sourceId).toBe(831); expect(proof.after.sourceCount).toBe(1); expect(proof.after.mode).toBe("survival");
              expect(proof.after.elapsed).not.toBeNull(); expect(proof.after.elapsed!).toBeGreaterThanOrEqual(proof.before.elapsed);
              expect(proof.after.elapsed!).toBeLessThan(1.6); expect(proof.after.counts).toEqual({ empty: 2, water: 1 });
              expect(proof.after.wallTime).toBeGreaterThanOrEqual(proof.before.wallTime);
              observations.push({ stage, label: "second-finger-joystick-release-retains-same-active-owner", value: proof });
              // Keep the same physical view finger down deliberately until this Water drink completes.
              await page.waitForFunction(() => window.__craft.game!.inventory.selectedStack()?.id === window.__craft.stackId("glass_bottle"), undefined, { timeout: 20_000 });
              expect(await counts()).toEqual({ empty: 3, water: 0 }); expect(await elapsed()).toBeNull();
              await record("same-view-hold-deliberately-completed-after-joystick-release");
            } finally { await afterWitness.dispose(); }
          } finally { await stickWitness.dispose(); }
        } finally { await witness.dispose(); }
      } finally {
        try { await up(); }
        finally {
          const acknowledgements = await Promise.all(pendingSecondFinger);
          observations.push({ stage, label: "second-finger-CDP-sends-settled", value: acknowledgements.map(a => a.ok ? { ok: true } : {
            ok: false, error: a.error instanceof Error ? `${a.error.name}: ${a.error.message}` : String(a.error) }) });
        }
      }
      // Restore the next phase through an actual fresh use edge, not an inventory/progress reset.
      stage = "fresh-edge-refill-after-joystick-completion";
      await lookAtCell(page, water.x, water.y, water.z); await use(); await expect.poll(counts).toEqual({ empty: 2, water: 1 });
      expect(await page.evaluate(() => window.__craft.game!.inventory.slots[1])).toEqual({ id: 831, count: 1 });
      expect(await elapsed()).toBeNull(); await record("actual-fresh-edge-refill-restores-original-pause-phase-owner");
    } else {
      stage = "actual-wheel-cancel";
      try {
        await down(); await waitProgress(.45); await page.mouse.wheel(0, 1); await page.mouse.wheel(0, -1);
        // Whichever slot is latched for the frame, a real wheel intent must discard its old progress.
        expect(await elapsed() ?? 0).toBeLessThan(.45); expect(await counts()).toEqual({ empty: 2, water: 1 });
      } finally { await up(); }
      await select(1);
    }
    stage = "partial-pause-cold";
    try { await down(); await waitProgress(.5); await pause(true); expect(await elapsed()).toBeNull(); } finally { await up(); }
    const partialSave = await quitPaused(); expect(partialSave).not.toHaveProperty("drinkOwner"); expect(partialSave.inventory.slots[1]).toEqual({ id: 831, count: 1 });
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); expect(await elapsed()).toBeNull(); await select(1);
    await holdUntil(() => waitProgress(1.25)); expect(await counts()).toEqual({ empty: 2, water: 1 }); await record("fresh-cold-hold-does-not-inherit-old-progress");
    stage = "full-hunger-full-bag-drink";
    await page.evaluate(() => { const g = window.__craft.game!; for (let i = 0; i < 36; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { id: window.__craft.stackId("cobblestone"), count: 64 }; });
    const beforeDrink = await read(); expect(beforeDrink.hunger.food).toBe(20); expect(beforeDrink.health).toBe(20); expect(beforeDrink.slots.every(Boolean)).toBe(true);
    try {
      await down(); await page.waitForFunction(() => window.__craft.game!.inventory.selectedStack()?.id === window.__craft.stackId("glass_bottle"), undefined, { timeout: 20_000 });
      // Observe two ordinary rendered frames while the same physical hold remains down. No fresh place edge.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await counts()).toEqual({ empty: 3, water: 0 });
    } finally { await up(); }
    const afterDrink = await record("actual-full-food-full-bag-container-return"); expect(afterDrink.hunger).toEqual(beforeDrink.hunger); expect(afterDrink.status).toEqual(beforeDrink.status); expect(afterDrink.health).toBe(20); expect(afterDrink.slots.every(Boolean)).toBe(true);
    await expect(page.locator(".chat-log")).toContainText("Drank water; the Glass Bottle is empty."); await snap(page, info, "actual-full-hunger-drink-returns-empty-bottle-without-auto-refill");
    stage = "fresh-edge-refill"; await lookAtCell(page, water.x, water.y, water.z); await use(); await expect.poll(counts).toEqual({ empty: 2, water: 1 }); expect(await blockAt(page, water.x, water.y, water.z)).toBe(waterId);
    stage = "genuine-poison-not-cured";
    // This food-level input fixture only permits the real Eye meal. It does not create Poison.
    await page.evaluate(() => { const g = window.__craft.game!; g.hunger.food = 16; g.hunger.saturation = 0; g.hunger.exhaustion = 0; g.hunger.timer = 0; });
    await select(2); await look(page, 0, 1.2); await holdUntil(() => page.waitForFunction(() => Boolean(window.__craft.game!.playerStatus.poison), undefined, { timeout: 20_000 }));
    expect(await countStack(page, "spider_eye")).toBe(0); await select(1); const poisonBefore = await record("actual-eye-poison-before-water-drink"); expect(poisonBefore.status.poison!.remaining).toBeGreaterThan(2.2);
    await holdUntil(() => page.waitForFunction(() => window.__craft.game!.inventory.selectedStack()?.id === window.__craft.stackId("glass_bottle"), undefined, { timeout: 20_000 }));
    const poisonAfter = await record("actual-water-drink-does-not-cure-live-poison");
    const poisonDrinkWallSeconds = (poisonAfter.wallTime - poisonBefore.wallTime) / 1000;
    expect(poisonDrinkWallSeconds).toBeGreaterThan(0); expect(poisonDrinkWallSeconds + .1).toBeLessThan(poisonBefore.status.poison!.remaining);
    expect(poisonAfter.status.poison).toBeDefined(); expect(poisonAfter.status.poison!.remaining).toBeGreaterThan(0); expect(poisonAfter.status.poison!.remaining).toBeLessThan(poisonBefore.status.poison!.remaining); expect(await counts()).toEqual({ empty: 3, water: 0 }); await snap(page, info, "genuinely-eaten-eye-poison-remains-after-drinking-water");
    stage = "final-refill-and-cold"; await lookAtCell(page, water.x, water.y, water.z); await use(); await expect.poll(counts).toEqual({ empty: 2, water: 1 }); await pause(); const finalSave = await quitPaused();
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); expect(await counts()).toEqual({ empty: 2, water: 1 }); expect(await elapsed()).toBeNull(); expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]); await snap(page, info, "refilled-container-cold-restored-without-partial-drink");
    await fs.writeFile(info.outputPath("water-drinking-coverage.json"), JSON.stringify({ observations, partialSave, finalSave, errors,
      fixtures: "PreownedEmptyGlassBottle3, rawSpiderEye1/coal1; laterfullbagcobblestone andfood16 input fixture. Actualgeneratorseed12345naturalwater; actualchatteleport/camera. No filledbottle/drinkprogress/Poison/emptyreturn injected.",
      actual: ["naturalwateractualfill", "realreleasepartialcancel", "actualheldHUD/Digitselectioncancel", mobile ? "nativeviewhold plusobservedindependentjoystickfingerrelease/same-owner-witness/deliberatefinish/actualfreshrefill" : "actualwheelcancel", "actualpausepartial/coldfresh1.25snotcomplete", "fullfoodfullbag1.6sdrink/emptyreturn", "sameholdnorefill", "newuseedgerefill", "actualEyeeatingthenwaterdrinkwhilePoisonstillactive", "finalrefill/coldownerrestore"],
      notCovered: ["primitiveSurvivalbottle/Eyeacquisition (earlierbase138routes)", "PCpointercancel/blur sourceinputwiring (actualhandlerunit/sourceaudit)", "browserdeath/respawn/reset (actualhandlerunit)", "nativeEducationtiming/fullfood/Creativecalibration", "thirst/cure/mud/campfire/brewing", "fullEducation/exactgraphics", "performance/physicalphone"] }, null, 2));
    expect(errors).toEqual([]); stage = "complete";
  } catch (error) { failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error); throw error; }
  finally { const state = await page.evaluate(() => { const g = window.__craft?.game; return { slots: g?.inventory.slots, status: g?.playerStatus, health: g?.health, loadErrors: g?.loadErrors, paused: g?.paused, dead: g?.dead, drink: (g as unknown as { drinkOwner?: unknown } | null)?.drinkOwner, rawStorage: localStorage.getItem("craft.save.v1") }; }).catch(error => ({ readbackFailure: String(error) })); await fs.writeFile(info.outputPath("water-drinking-final.json"), JSON.stringify({ stage, failure, observations, state, errors }, null, 2)).catch((error: unknown) => console.error(String(error))); }
}
