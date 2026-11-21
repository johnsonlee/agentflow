import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fixture from "./fixtures/fluid-before-harvest.json" with { type: "json" };
import { blockAt, collectWorldDrops, command, countStack, lookAtCell, parkMouse, snap, target, waitForTerrain } from "./helpers";

/** Continuation of the actual scoped fluid desktop save, never a fresh primitive route.
 * Existing Iron tools/Table/pad and command/camera navigation remain disclosed fixtures.
 * Deep neighbor-only chambers, bedrock floors and adjacent Torches expose untouched natural ore.
 * No Diamond, Diamond Pickaxe, Obsidian, health, clock or ground-state outcome is granted. */
export async function fluidHarvestRoute(page: Page, info: TestInfo, mobile: boolean) {
  const initialRaw = JSON.stringify(fixture);
  const fixtureSHA256 = createHash("sha256").update(new TextEncoder().encode(initialRaw)).digest("hex");
  expect(fixtureSHA256).toBe("fc3be21c478e2c6ee69d6aeaa69737b5b62f08bf6dcc41ece9ed9b4fa8c3dcfb");
  let stage = "load-genuine-scoped-continuation", failure: string | null = null;
  const errors: string[] = [], observations: unknown[] = [], fixtureMutations: unknown[] = [];
  let finger: import("@playwright/test").CDPSession | null = null, touching = false;
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
  const read = () => page.evaluate(() => { const g = window.__craft.game!; return {
    inventory: g.inventory.toJSON(), health: g.health, position: { ...g.body.position },
    drops: structuredClone(g.worldDrops.records), errors: [...g.loadErrors],
    generatorVersion: g.world.generatorVersion, fluids: g.world.fluids.exportState(),
    edits: g.world.exportEdits(), rawStorage: localStorage.getItem("craft.save.v1"),
  }; });
  const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
  try {
    await page.goto("/");
    const installed = await page.evaluate(raw => { localStorage.clear(); localStorage.setItem("craft.save.v1", raw); return raw; }, initialRaw);
    expect(installed).toBe(initialRaw);
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
    finger = mobile ? await page.context().newCDPSession(page) : null;
    const touch = async (type: "touchStart" | "touchEnd") => {
      const vp = page.viewportSize()!;
      await finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .42, id: 125 }] });
      touching = type === "touchStart";
    };
    const holdBreak = async (cell: { x: number; y: number; z: number }) => {
      try {
        if (mobile) await touch("touchStart"); else await page.mouse.down({ button: "left" });
        await page.waitForFunction(p => window.__craft.game!.world.getBlock(p.x, p.y, p.z) === 0, cell, { timeout: 30_000 });
      } finally {
        if (mobile) await touch("touchEnd"); else await page.mouse.up({ button: "left" });
      }
    };
    const inv = page.locator(".inventory-screen");
    const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
    const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
    const select = async (name: string) => {
      const slot = await slotOf(name); expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(9);
      if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`));
      else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
      await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
    };
    const teleport = async (p: { x: number; y: number; z: number }) => { await command(page, `/tp ${p.x} ${p.y} ${p.z}`); await waitForTerrain(page); };
    const mine = async (cell: { x: number; y: number; z: number }, tool: string) => {
      await select(tool); await lookAtCell(page, cell.x, cell.y, cell.z);
      await expect.poll(() => target(page)).toMatchObject(cell); await holdBreak(cell);
    };
    const use = async () => {
      if (mobile) { const vp = page.viewportSize()!; await page.touchscreen.tap(vp.width * .65, vp.height * .42); }
      else { try { await page.mouse.down({ button: "right" }); } finally { await page.mouse.up({ button: "right" }); } }
    };
    const initial = await record("exact-real-previous-save-loaded");
    expect(initial.errors).toEqual([]); expect(initial.generatorVersion).toBe(2);
    expect(await countStack(page, "diamond")).toBe(0); expect(await countStack(page, "diamond_pickaxe")).toBe(0);
    expect(await countStack(page, "obsidian")).toBe(0); expect(await countStack(page, "bucket")).toBe(1);
    expect(await countStack(page, "iron_pickaxe")).toBe(1); expect(await countStack(page, "iron_axe")).toBe(1);
    const locations = await page.evaluate(() => {
      const g = window.__craft.game!, gen = g.world.generator, diamond = window.__craft.blockId("diamond_ore");
      const chunks = new Map<string, ReturnType<typeof gen.generate>>();
      const at = (x: number, y: number, z: number) => {
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16), key = `${cx},${cz}`;
        let chunk = chunks.get(key); if (!chunk) { chunk = gen.generate(cx, cz); chunks.set(key, chunk); }
        return chunk.get((x % 16 + 16) % 16, y, (z % 16 + 16) % 16);
      };
      const prior = new Set(g.world.exportEdits().map(e => `${e[0]},${e[1]},${e[2]}`));
      const ores: { x: number; y: number; z: number }[] = [];
      for (let cx = -4; cx <= 4 && ores.length < 3; cx++) for (let cz = -4; cz <= 4 && ores.length < 3; cz++)
        for (let y = 4; y <= 13 && ores.length < 3; y++) for (let z = 0; z < 16 && ores.length < 3; z++) for (let x = 0; x < 16 && ores.length < 3; x++) {
          const p = { x: cx * 16 + x, y, z: cz * 16 + z };
          if (at(p.x, y, p.z) !== diamond || prior.has(`${p.x},${y},${p.z}`) || ores.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 8)) continue;
          let clear = true;
          for (let dx = 0; dx <= 3; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 3; dy++) {
            if (dx === 0 && dz === 0 && dy === 0) continue;
            if (at(p.x + dx, y + dy, p.z + dz) === diamond) clear = false;
          }
          if (clear) ores.push(p);
        }
      if (ores.length !== 3) throw Error("Bounded natural Diamond search did not find three safe untouched ore sites");
      const tables = g.world.exportEdits().filter(e => e[3] === window.__craft.blockId("crafting_table"));
      const casts = g.world.exportEdits().filter(e => e[3] === window.__craft.blockId("obsidian"));
      if (tables.length !== 1 || casts.length !== 1) throw Error("Actual prior save must contain its one placed Table and one cast Obsidian");
      const cell = (e: number[]) => ({ x: e[0], y: e[1], z: e[2] });
      return { ores, table: cell(tables[0]), cast: cell(casts[0]), bounds: { minChunk: -4, maxChunk: 4, minY: 4, maxY: 13 }, scannedChunks: chunks.size };
    });
    observations.push({ stage, label: "read-only-natural-diamond-sites-and-actual-prior-cast", value: locations });

    stage = "natural-diamond-three-real-mines";
    for (const ore of locations.ores) {
      const before = await page.evaluate(p => {
        const g = window.__craft.game!, cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
        return { cell: p, generatedId: g.world.generator.generate(cx, cz).get((p.x % 16 + 16) % 16, p.y, (p.z % 16 + 16) % 16), liveId: g.world.getBlock(p.x, p.y, p.z), edited: g.world.exportEdits().some(e => e[0] === p.x && e[1] === p.y && e[2] === p.z) };
      }, ore);
      const diamondOre = await page.evaluate(() => window.__craft.blockId("diamond_ore"));
      expect(before.generatedId).toBe(diamondOre); expect(before.liveId).toBe(diamondOre); expect(before.edited).toBe(false);
      observations.push({ stage, label: "untouched-natural-ore-before-neighbor-navigation-fixture", value: before });
      const changes = await page.evaluate(({ ore, protectedOres }) => {
        const g = window.__craft.game!, diamond = window.__craft.blockId("diamond_ore");
        const changes: { x: number; y: number; z: number; before: number; after: number }[] = [];
        const setNeighbor = (x: number, y: number, z: number, id: number) => {
          if (protectedOres.some(p => p.x === x && p.y === y && p.z === z)) throw Error("Navigation fixture attempted to modify a protected target ore");
          const before = g.world.getBlock(x, y, z); if (before === diamond) throw Error("Navigation fixture refuses every Diamond Ore cell");
          if (before !== id) { g.world.setBlock(x, y, z, id); changes.push({ x, y, z, before, after: g.world.getBlock(x, y, z) }); }
        };
        for (let dx = 0; dx <= 3; dx++) for (let dz = -1; dz <= 1; dz++) {
          setNeighbor(ore.x + dx, ore.y - 1, ore.z + dz, window.__craft.blockId("bedrock"));
          for (let dy = 0; dy <= 3; dy++) {
            if (dx === 0 && dz === 0 && dy === 0) continue;
            setNeighbor(ore.x + dx, ore.y + dy, ore.z + dz, 0);
          }
        }
        setNeighbor(ore.x + 3, ore.y, ore.z + 1, window.__craft.blockId("torch"));
        return { ore, changes, allowedIds: [0, window.__craft.blockId("bedrock"), window.__craft.blockId("torch")], protectedAfter: protectedOres.map(p => ({ ...p, id: g.world.getBlock(p.x, p.y, p.z), edited: g.world.exportEdits().some(e => e[0] === p.x && e[1] === p.y && e[2] === p.z) })) };
      }, { ore, protectedOres: locations.ores });
      // Earlier target ores can legitimately be AIR now; the current target must remain untouched.
      const current = changes.protectedAfter.find(p => p.x === ore.x && p.y === ore.y && p.z === ore.z)!;
      expect(current.id).toBe(diamondOre); expect(current.edited).toBe(false);
      expect(changes.changes.every(c => changes.allowedIds.includes(c.after))).toBe(true);
      fixtureMutations.push(changes);
      await teleport({ x: ore.x + 2.5, y: ore.y, z: ore.z + .5 });
      const count = await countStack(page, "diamond"); await mine(ore, "iron_pickaxe");
      await collectWorldDrops(page, mobile); await expect.poll(() => countStack(page, "diamond"), { timeout: 20_000 }).toBe(count + 1);
      expect(await blockAt(page, ore.x, ore.y, ore.z)).toBe(0);
      await record("actual-natural-diamond-ore-broken-and-owned-once");
    }
    expect(await countStack(page, "diamond")).toBe(3); await snap(page, info, "three-natural-diamonds-from-actual-iron-tool-holds");

    stage = "natural-birch-sticks";
    const log = { x: -62, y: 35, z: -54 };
    const logBefore = await page.evaluate(p => {
      const g = window.__craft.game!, c = g.world.generator.generate(Math.floor(p.x / 16), Math.floor(p.z / 16));
      return { cell: p, generatedId: c.get((p.x % 16 + 16) % 16, p.y, (p.z % 16 + 16) % 16), liveId: g.world.getBlock(p.x, p.y, p.z), edited: g.world.exportEdits().some(e => e[0] === p.x && e[1] === p.y && e[2] === p.z) };
    }, log);
    const birch = await page.evaluate(() => window.__craft.blockId("birch_log"));
    expect(logBefore.generatedId).toBe(birch); expect(logBefore.liveId).toBe(birch); expect(logBefore.edited).toBe(false);
    observations.push({ stage, label: "remaining-natural-birch-log-before-real-input", value: logBefore });
    expect(await countStack(page, "birch_log")).toBe(0);
    // The prior actual route mined trunk32..34; stand in that genuine gap and aim straight up.
    await teleport({ x: -61.5, y: 32, z: -53.5 }); await mine(log, "iron_axe"); await collectWorldDrops(page, mobile);
    await expect.poll(() => countStack(page, "birch_log")).toBe(1); await record("remaining-natural-birch-log-actually-owned");

    stage = "actual-log-planks-sticks-diamond-pickaxe-ui";
    await teleport({ x: locations.table.x + .5, y: locations.table.y, z: locations.table.z + 2.5 });
    await lookAtCell(page, locations.table.x, locations.table.y, locations.table.z);
    await expect.poll(() => target(page)).toMatchObject(locations.table); await use();
    await expect(page.getByRole("heading", { name: "Crafting Table", exact: true })).toBeVisible();
    const cell = (i: number) => inv.locator(`[data-craft="${i}"]`), result = inv.locator("[data-craft-result]");
    const putResult = async (name: string) => {
      await expect(result.locator("img")).toHaveAttribute("alt", name);
      const destination = await empty(); expect(destination).toBeGreaterThanOrEqual(0);
      await press(result); await press(inv.locator(`[data-slot="${destination}"]`));
    };
    await press(inv.locator(`[data-slot="${await slotOf("birch_log")}"]`)); await press(cell(0));
    await putResult("Oak Planks"); expect(await countStack(page, "birch_log")).toBe(0); expect(await countStack(page, "oak_planks")).toBe(4);
    const planks = await slotOf("oak_planks"); await press(inv.locator(`[data-slot="${planks}"]`)); await press(cell(0)); await press(cell(3)); await press(inv.locator(`[data-slot="${planks}"]`));
    await putResult("Stick"); expect(await countStack(page, "stick")).toBe(4); expect(await countStack(page, "oak_planks")).toBe(2);
    const diamonds = await slotOf("diamond"); await press(inv.locator(`[data-slot="${diamonds}"]`)); for (const i of [0, 1, 2]) await press(cell(i));
    const sticks = await slotOf("stick"); await press(inv.locator(`[data-slot="${sticks}"]`)); await press(cell(4)); await press(cell(7)); await press(inv.locator(`[data-slot="${sticks}"]`));
    await expect(result.locator("img")).toHaveAttribute("alt", "Diamond Pickaxe"); await snap(page, info, "three-genuine-diamonds-two-crafted-sticks-pickaxe-recipe");
    await putResult("Diamond Pickaxe"); expect(await countStack(page, "diamond")).toBe(0); expect(await countStack(page, "stick")).toBe(2); expect(await countStack(page, "diamond_pickaxe")).toBe(1);
    await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden();
    await record("actual-ui-crafted-fresh-diamond-pickaxe");

    stage = "actual-prior-cast-obsidian-harvest";
    await teleport({ x: locations.cast.x + .5, y: locations.cast.y, z: locations.cast.z + 2.5 });
    expect(await blockAt(page, locations.cast.x, locations.cast.y, locations.cast.z)).toBe(await page.evaluate(() => window.__craft.blockId("obsidian")));
    await select("diamond_pickaxe");
    const toolBefore = await page.evaluate(() => ({ ...window.__craft.game!.inventory.selectedStack()! }));
    expect(toolBefore.count).toBe(1); expect(toolBefore.damage ?? 0).toBe(0);
    observations.push({ stage, label: "real-prior-cast-and-fresh-tool-before-actual-hold", value: { cast: locations.cast, tool: toolBefore } });
    await mine(locations.cast, "diamond_pickaxe"); await collectWorldDrops(page, mobile);
    await expect.poll(() => countStack(page, "obsidian"), { timeout: 20_000 }).toBe(1);
    const toolAfter = await page.evaluate(() => ({ ...window.__craft.game!.inventory.selectedStack()! }));
    expect(toolAfter).toEqual({ ...toolBefore, damage: 1 }); expect(await countStack(page, "diamond_pickaxe")).toBe(1);
    expect(await blockAt(page, locations.cast.x, locations.cast.y, locations.cast.z)).toBe(0);
    const harvested = await record("actual-cast-removed-one-obsidian-owner-one-diamond-tool-wear");
    await snap(page, info, "actual-cast-harvested-one-obsidian-worn-diamond-pickaxe");

    stage = "cold-retained-obsidian-and-worn-tool";
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await expect(page.locator(".pause-screen")).toBeVisible(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
    const validRaw = await page.evaluate(() => localStorage.getItem("craft.save.v1")!);
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
    expect(await countStack(page, "obsidian")).toBe(1); expect(await countStack(page, "diamond_pickaxe")).toBe(1);
    expect(await page.evaluate(() => window.__craft.game!.inventory.selectedStack())).toEqual(toolAfter);
    expect(await blockAt(page, locations.cast.x, locations.cast.y, locations.cast.z)).toBe(0);
    const cold = await record("cold-retains-exact-obsidian-and-worn-tool"); expect(cold.inventory).toEqual(harvested.inventory); expect(cold.errors).toEqual([]);
    await snap(page, info, "cold-owned-obsidian-and-diamond-pickaxe-wear-one");
    await fs.writeFile(info.outputPath("fluid-harvest-coverage.json"), JSON.stringify({ fixtureSHA256, initialRaw, locations, observations, fixtureMutations, toolBefore, toolAfter, validRaw, errors,
      fixtures: "ActualpreviousscopeddesktopfluidvalidRaw continuation; preownedIronAxe/Pickaxe andTable inherited; neighbor-onlychambers/bedrockfloors/Torchvisibility, commandteleports/camera and actualbodypickupnavigation. Everytargetore/generatoridentity/liveID/noedit asserted beforeactualhold; no Diamond/tool/Obsidian/HP/ground/clock outcomes injected.",
      notCovered: ["freshprimitiveSurvivalchain", "excavationthroughdeepcover (declaredneighborchamberfixture)", "allowner/death/Creative/AgentUIedgecases", "nativeorechance/hardness/damage/graphics", "existingappBirchLog→OakPlanks subset (nativeBirchPlanksidentitynotimplemented)", "portals/Nether/brewing/fullEducation/performance/physicalphone"] }, null, 2));
    expect(errors).toEqual([]); stage = "complete";
  } catch (error) { failure = String(error); throw error; }
  finally {
    if (mobile && touching && finger) await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(e => errors.push(`touch cleanup: ${String(e)}`));
    if (!mobile) for (const button of ["left", "right"] as const) await page.mouse.up({ button }).catch(e => errors.push(`mouse cleanup: ${String(e)}`));
    await finger?.detach().catch(e => errors.push(`detach: ${String(e)}`));
    const state = await page.evaluate(() => { const g = window.__craft?.game; return { inventory: g?.inventory.toJSON(), health: g?.health, errors: g?.loadErrors, position: g?.body.position, edits: g?.world.exportEdits() }; }).catch(e => ({ readbackFailure: String(e) }));
    await fs.writeFile(info.outputPath("fluid-harvest-final.json"), JSON.stringify({ stage, failure, fixtureSHA256, observations, fixtureMutations, errors, state }, null, 2));
    if (failure === null && errors.length) throw Error(`Harvest input cleanup or browser errors: ${errors.join("; ")}`);
  }
}
