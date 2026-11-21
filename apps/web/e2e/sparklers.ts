import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, createWorld, lookAtCell, parkMouse, snap, target, waitForTerrain } from "./helpers";

/** Ingredient/environment fixtures only. The Constructor elements, cerium compound, all five colors, active states,
 * offhand transfer and saved result must be produced by actual input, never outcome writes. */
export async function sparklerRoute(page: Page, info: TestInfo, mobile: boolean) {
  const observations: unknown[] = []; let stage = "create", failure: string | null = null;
  const errors = await createWorld(page, { mode: "survival" });
  const press = (node: Locator) => mobile ? node.tap() : node.click();
  const inv = page.locator(".inventory-screen");
  const read = () => page.evaluate(() => {
    const g = window.__craft.game!;
    const ui = g as unknown as { inventoryScreen: { pendingItems(): import("@craft/engine").ItemStack[] } };
    return { inventory: structuredClone(g.inventory.toJSON()), pending: structuredClone(ui.inventoryScreen.pendingItems()),
      drops: structuredClone(g.worldDrops.records), errors: [...g.loadErrors] };
  });
  const record = async (label: string) => { const state = await read(); observations.push({ stage, label, state }); return state; };
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
  const slot = (index: number) => inv.locator(`[data-slot="${index}"]`);
  const close = async () => { await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden(); };
  const open = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE"); await expect(inv).toBeVisible(); };
  const select = async (index: number) => {
    if (mobile) await press(page.locator(`.hotbar [data-slot="${index}"]`)); else { await page.keyboard.press(`Digit${index + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(index);
  };
  const use = async () => {
    await page.waitForFunction(() => (window.__craft.game! as unknown as { placeCooldown: number }).placeCooldown === 0);
    if (mobile) { const vp = page.viewportSize()!; await page.touchscreen.tap(vp.width * .65, vp.height * .4); }
    else { await page.mouse.down({ button: "right" }); try { /* actual use edge */ } finally { await page.mouse.up({ button: "right" }); } }
  };
  const rows = [
    ["calcium_chloride", "orange_sparkler", "Orange Sparkler", 2],
    ["cerium_chloride", "blue_sparkler", "Blue Sparkler", 1],
    ["mercuric_chloride", "red_sparkler", "Red Sparkler", 1],
    ["potassium_chloride", "purple_sparkler", "Purple Sparkler", 1],
    ["tungsten_chloride", "green_sparkler", "Green Sparkler", 1],
  ] as const;
  try {
    stage = "ingredient-fixture";
    const fixture = await page.evaluate(() => {
      const g = window.__craft.game!, p = g.body.position;
      const pad = { x: Math.floor(p.x), y: Math.floor(p.y + .01) - 1, z: Math.floor(p.z) };
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
        g.world.setBlock(pad.x + x, pad.y, pad.z + z, window.__craft.blockId("bedrock"));
        for (let y = 1; y <= 5; y++) g.world.setBlock(pad.x + x, pad.y + y, pad.z + z, 0);
      }
      const creator = { x: pad.x + 2, y: pad.y + 1, z: pad.z }, table = { x: pad.x - 2, y: pad.y + 1, z: pad.z }, constructor = { x: pad.x, y: pad.y + 1, z: pad.z + 2 };
      g.world.setBlock(constructor.x, constructor.y, constructor.z, window.__craft.blockId("element_constructor"));
      g.world.setBlock(creator.x, creator.y, creator.z, window.__craft.blockId("compound_creator"));
      g.world.setBlock(table.x, table.y, table.z, window.__craft.blockId("crafting_table"));
      g.inventory.slots.fill(null);
      for (const [i, name, count] of [[3, "calcium_chloride", 2], [4, "mercuric_chloride", 1], [5, "potassium_chloride", 1], [6, "tungsten_chloride", 1], [8, "stick", 6]] as const)
        g.inventory.slots[i] = { id: window.__craft.stackId(name), count };
      return { constructor, creator, table, orange: window.__craft.stackId("orange_sparkler"), blue: window.__craft.stackId("blue_sparkler") };
    });
    const useStation = async (at: { x: number; y: number; z: number }, label: string) => {
      if (!mobile) await parkMouse(page); await lookAtCell(page, at.x, at.y, at.z);
      await expect.poll(() => target(page)).toMatchObject(at); await use();
      await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    };
    stage = "actual-element-constructor"; await useStation(fixture.constructor, "Element Constructor");
    const setParticle = async (name: string, count: number) => { const field = inv.getByRole("spinbutton", { name, exact: true }); await field.fill(String(count)); await field.blur(); };
    // The app's default stable Ce140, Cl35 and Mg24 entries; actual Constructor result clicks create the owned elements.
    for (const atom of [{ p: 58, n: 82, label: "Cerium", slot: 1, count: 1 }, { p: 17, n: 18, label: "Chlorine", slot: 2, count: 3 }, { p: 12, n: 12, label: "Magnesium", slot: 7, count: 6 }]) {
      await setParticle("protons", atom.p); await setParticle("neutrons", atom.n); await setParticle("electrons", atom.p);
      await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", atom.label);
      for (let i = 0; i < atom.count; i++) await press(inv.locator('[data-chem-result]'));
      await press(slot(atom.slot));
      expect((await read()).inventory.slots[atom.slot]?.count).toBe(atom.count);
    }
    await snap(page, info, "sparkler-elements-created-through-constructor"); await close();
    stage = "real-compound"; await useStation(fixture.creator, "Compound Creator");
    await press(slot(1)); await press(inv.locator('[data-chem-input="0"]'));
    await press(slot(2)); for (let i = 0; i < 3; i++) await press(inv.locator('[data-chem-input="1"]'));
    await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", "Cerium Chloride");
    await press(inv.locator('[data-chem-result]')); await press(slot(1));
    await snap(page, info, "sparkler-real-cerium-chloride"); await close();
    stage = "real-five-color-crafting"; await useStation(fixture.table, "Crafting Table");
    const put = async (name: string, cell: number) => {
      const index = await slotOf(name); expect(index).toBeGreaterThanOrEqual(0);
      const before = await page.evaluate(i => window.__craft.game!.inventory.slots[i]!.count, index);
      await press(slot(index)); await press(inv.locator(`[data-craft="${cell}"]`));
      if (before > 1) await press(slot(index));
    };
    const result = inv.locator("[data-craft-result] img");
    const icons: string[] = [];
    for (const [compound, name, label, count] of rows) for (let i = 0; i < count; i++) {
      await put(compound, 1); await put("magnesium", 4); await expect(result).toHaveCount(0);
      await put("stick", 7); await expect(result).toHaveAttribute("alt", label);
      if (i === 0) icons.push((await result.getAttribute("src"))!);
      expect(await result.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await press(inv.locator("[data-craft-result]"));
      const existing = await slotOf(name); await press(slot(existing < 0 ? await empty() : existing));
      const id = await page.evaluate(n => window.__craft.stackId(n), name);
      expect((await read()).inventory.slots.filter(s => s?.id === id).reduce((n, s) => n + s!.count, 0)).toBe(i + 1);
    }
    expect(new Set(icons).size).toBe(5);
    for (const [compound] of rows) expect(await slotOf(compound)).toBe(-1);
    expect(await slotOf("magnesium")).toBe(-1); expect(await slotOf("stick")).toBe(-1);
    await snap(page, info, "sparkler-five-colors-crafted"); await close(); await open();
    stage = "real-offhand-transfer";
    await press(slot(await slotOf("orange_sparkler"))); await press(inv.locator("[data-offhand]"));
    const blueSlot = await slotOf("blue_sparkler");
    if (blueSlot !== 0) { await press(slot(blueSlot)); await press(slot(0)); }
    await close(); await select(0);
    const ready = await record("crafted-orange-two-offhand-blue-main");
    expect(ready.inventory.offhand).toEqual({ id: fixture.orange, count: 2, sparkler: { state: "inactive" } });
    expect(ready.inventory.slots[0]).toEqual({ id: fixture.blue, count: 1, sparkler: { state: "inactive" } });
    stage = "actual-offhand-light";
    await press(page.getByRole("button", { name: "Light offhand sparkler", exact: true }));
    const lit = await record("offhand-lit-singleton-and-bag-remainder");
    expect(lit.inventory.offhand).toEqual({ id: fixture.orange, count: 1, sparkler: { state: "active" } });
    expect(lit.inventory.slots[0]).toEqual(ready.inventory.slots[0]);
    expect(lit.inventory.slots.filter(s => s?.id === fixture.orange)).toEqual([{ id: fixture.orange, count: 1, sparkler: { state: "inactive" } }]);
    await expect(page.getByRole("button", { name: "Light offhand sparkler", exact: true })).toBeDisabled();
    await press(page.getByRole("button", { name: "Light selected sparkler", exact: true }));
    const both = await record("two-hands-lit-only-by-separate-real-actions");
    expect(both.inventory.slots[0]).toEqual({ id: fixture.blue, count: 1, sparkler: { state: "active" } });
    await expect(page.locator(".held-sparkler.mainhand")).toHaveAttribute("data-sparkler-state", "active");
    await expect(page.locator(".held-sparkler.offhand")).toHaveAttribute("data-sparkler-state", "active");
    await snap(page, info, "sparkler-both-hands-lit-original-art");
    stage = "actual-cursor-offhand-swap"; await open();
    const orangeSlot = await slotOf("orange_sparkler");
    await press(slot(orangeSlot)); await press(inv.locator("[data-offhand]")); await press(slot(orangeSlot));
    const swapped = await record("inactive-offhand-active-bag-same-id-kept-separate");
    expect(swapped.inventory.offhand).toEqual({ id: fixture.orange, count: 1, sparkler: { state: "inactive" } });
    expect(swapped.inventory.slots[orangeSlot]).toEqual({ id: fixture.orange, count: 1, sparkler: { state: "active" } });
    expect(swapped.pending).toEqual([]);
    stage = "actual-active-drop-and-pickup";
    await press(slot(orangeSlot)); await press(page.getByRole("button", { name: "Drop held item", exact: true }));
    const dropped = await record("real-active-orange-ground-owner");
    expect(dropped.pending).toEqual([]);
    expect(dropped.drops.filter(row => row.stack.id === fixture.orange).map(row => row.stack)).toEqual([{ id: fixture.orange, count: 1, sparkler: { state: "active" } }]);
    expect(dropped.inventory.offhand).toEqual(swapped.inventory.offhand);
    await close(); await collectWorldDrops(page);
    const beforeCold = await record("actual-pickup-retained-active-owner");
    expect(beforeCold.drops.filter(row => row.stack.id === fixture.orange)).toEqual([]);
    expect(beforeCold.inventory.slots.filter(row => row?.id === fixture.orange)).toEqual([{ id: fixture.orange, count: 1, sparkler: { state: "active" } }]);
    expect(beforeCold.inventory.offhand).toEqual(swapped.inventory.offhand);
    stage = "actual-cold-save";
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("craft.save.v1")); observations.push({ stage, raw });
    expect(JSON.parse(raw!).inventory).toEqual(beforeCold.inventory);
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
    const restored = await record("actual-constructor-restored-owner-states");
    expect(restored.inventory).toEqual(beforeCold.inventory); expect(restored.pending).toEqual([]); expect(restored.errors).toEqual([]);
    await snap(page, info, "sparkler-offhand-state-cold-restored"); expect(errors).toEqual([]);
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    try { observations.push({ stage, label: "finally", state: await read() }); } catch { /* page may have failed before Game */ }
    await fs.writeFile(info.outputPath("sparkler-observations.json"), JSON.stringify({ stage, failure, errors, observations }, null, 2));
  }
}
