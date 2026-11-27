import { nativePageWorldTap } from './native-world-tap';
import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createWorld, look, parkMouse, snap, target, waitForTerrain } from "./helpers";

/** Disclosed raw INACTIVE/legacy owners and a bedrock pad are fixtures. Only real UI/input
 * may activate, transfer, drop or save them. No active-state/outcome assignment is permitted. */
export async function glowActivationRoute(page: Page, info: TestInfo, mobile: boolean) {
  const observations: unknown[] = [];
  let stage = "create", failure: string | null = null;
  const errors = await createWorld(page, { mode: "survival" });
  const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
  const inv = page.locator(".inventory-screen");
  const shake = page.getByRole("button", { name: "Shake selected glow stick", exact: true });
  const slot = (index: number) => inv.locator(`[data-slot="${index}"]`);
  const read = () => page.evaluate(() => {
    const g = window.__craft.game!;
    const screen = g as unknown as { inventoryScreen: { pendingItems(): import("@craft/engine").ItemStack[] } };
    return { slots: structuredClone(g.inventory.slots), selected: g.inventory.selected,
      pending: structuredClone(screen.inventoryScreen.pendingItems()), drops: structuredClone(g.worldDrops.records),
      paused: g.paused, dead: g.dead, errors: [...g.loadErrors] };
  });
  const record = async (label: string) => { const state = await read(); observations.push({ stage, label, state }); return state; };
  const open = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
    await expect(inv).toBeVisible();
  };
  const close = async () => { await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden(); };
  const select = async (index: number) => {
    if (mobile) await press(page.locator(`.hotbar [data-slot="${index}"]`));
    else { await page.keyboard.press(`Digit${index + 1}`); await parkMouse(page); }
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(index);
  };
  const useAir = async () => {
    await look(page, 0, 1.2); expect(await target(page)).toBeNull();
    // Observe the production use-edge gate; inventory pauses its countdown.
    await page.waitForFunction(() => (window.__craft.game! as unknown as { placeCooldown: number }).placeCooldown === 0);
    const ack: Record<string, unknown> = { stage, kind: mobile ? "native-short-tap" : "right-mouse-use", before: await read() };
    observations.push(ack);
    if (mobile) {
      const vp = page.viewportSize()!;
      // Playwright native tap owns its complete start/end pair; no retained contact or timed hold.
      await nativePageWorldTap(page, vp.width * .65, vp.height * .4);
    } else {
      await page.mouse.down({ button: "right" });
      try { ack.downAcknowledged = Date.now(); } finally { await page.mouse.up({ button: "right" }); }
    }
    ack.completedAcknowledged = Date.now(); ack.after = await read();
  };
  const coldReload = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await expect(page.locator(".pause-screen")).toBeVisible();
    await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("craft.save.v1"));
    observations.push({ stage, label: "actual-savequit-raw", raw }); expect(raw).not.toBeNull();
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
    return JSON.parse(raw!) as { inventory: { slots: unknown[] }; inventoryPending?: unknown[] };
  };
  try {
    stage = "raw-fixture";
    const ids = await page.evaluate(() => {
      const g = window.__craft.game!, p = g.body.position, y = Math.floor(p.y + .01) - 1;
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
        g.world.setBlock(Math.floor(p.x) + x, y, Math.floor(p.z) + z, window.__craft.blockId("bedrock"));
        for (let dy = 1; dy <= 6; dy++) g.world.setBlock(Math.floor(p.x) + x, y + dy, Math.floor(p.z) + z, 0);
      }
      const red = window.__craft.stackId("red_glow_stick"), blue = window.__craft.stackId("blue_glow_stick"), green = window.__craft.stackId("glow_stick"), filler = window.__craft.stackId("cobblestone");
      g.inventory.slots.fill(null);
      for (let i = 0; i < 36; i++) g.inventory.slots[i] = { id: filler, count: 1 };
      g.inventory.slots[0] = { id: red, count: 2, glow: { state: "inactive" } };
      g.inventory.slots[1] = { id: blue, count: 1, glow: { state: "inactive" } };
      g.inventory.slots[2] = { id: green, count: 1 }; // Explicit legacy absence fixture, never activated here.
      return { red, blue, green, filler };
    });
    const redInactive = { id: ids.red, count: 1, glow: { state: "inactive" } };
    const redActive = { id: ids.red, count: 1, glow: { state: "active" } };
    const blueActive = { id: ids.blue, count: 1, glow: { state: "active" } };
    const legacy = { id: ids.green, count: 1 };
    const conserved = (state: Awaited<ReturnType<typeof read>>) => {
      const owners = [...state.slots.filter(s => s !== null), ...state.pending, ...state.drops.map(r => r.stack)];
      for (const [id, count] of [[ids.red, 2], [ids.blue, 1], [ids.green, 1], [ids.filler, 33]])
        expect(owners.filter(s => s.id === id).reduce((sum, s) => sum + s.count, 0)).toBe(count);
    };
    await select(0); const original = await record("initial-full-bag"); conserved(original);
    expect(original.slots.every(Boolean)).toBe(true); expect(original.pending).toEqual([]);
    stage = "fullbag-count2-refusal";
    await expect(shake).toBeEnabled(); await press(shake);
    await expect(page.getByText("Make room for the remaining glow sticks before shaking one.", { exact: true })).toBeVisible();
    const refused = await record("HUD-refusal"); expect(refused.slots).toEqual(original.slots); expect(refused.pending).toEqual([]); conserved(refused);
    await snap(page, info, "glow-full-bag-count2-atomic-refusal");
    stage = "fullbag-single-success";
    await select(1); await press(shake);
    await expect.poll(async () => (await read()).slots[1]).toEqual(blueActive);
    const single = await record("single-activated-without-spare-slot"); expect(single.slots.every(Boolean)).toBe(true); conserved(single);
    await expect(shake).toBeDisabled();
    stage = "real-filler-drop";
    await select(0); await open(); await press(slot(3));
    await press(page.getByRole("button", { name: "Drop held item", exact: true }));
    const dropped = await record("filler-now-ground-owned"); expect(dropped.slots[3]).toBeNull(); expect(dropped.pending).toEqual([]); conserved(dropped);
    expect(dropped.drops.filter(r => r.stack.id === ids.filler).reduce((n, r) => n + r.stack.count, 0)).toBe(1);
    await close();
    stage = "ordinary-use-activation";
    await useAir();
    await expect.poll(async () => (await read()).slots[0]).toEqual(redActive);
    const activated = await record("split-active-and-inactive-after-real-use");
    expect(activated.slots[3]).toEqual(redInactive); conserved(activated);
    await expect(shake).toBeDisabled(); await expect(page.locator(".held-glow-stick")).toHaveAttribute("data-glow-state", "active");
    await useAir(); const repeated = await record("ordinary-repeat-refused"); for (const index of [0, 1, 2, 3]) expect(repeated.slots[index]).toEqual(activated.slots[index]); conserved(repeated);
    await snap(page, info, "glow-real-use-active-singleton-and-inactive-remainder");
    stage = "real-cursor-swap-and-incompatible-cell-refusal";
    await open(); await press(slot(0)); await press(slot(3));
    const swapped = await record("active-inactive-bag-swap-never-merged");
    expect(swapped.slots[3]).toEqual(redActive); expect(swapped.pending).toEqual([redInactive]); conserved(swapped);
    await press(slot(0)); // Restore inactive to the empty bag cell; active remains distinct.
    await press(slot(3)); await press(inv.locator('[data-craft="0"]'));
    await press(slot(0)); const beforeCell = await record("inactive-cursor-active-work-cell");
    await press(inv.locator('[data-craft="0"]'));
    const afterCell = await record("incompatible-work-cell-refusal");
    expect(afterCell.slots).toEqual(beforeCell.slots); expect(afterCell.pending).toEqual(beforeCell.pending); conserved(afterCell);
    expect(afterCell.pending).toHaveLength(2);
    await snap(page, info, "glow-incompatible-cursor-workcell-refuses-without-loss");
    await press(slot(0)); await press(inv.locator('[data-craft="0"]')); await press(slot(3));
    // Return the two distinct owners to their original selected/remainder cells using actual swaps.
    await press(slot(0)); await press(slot(3)); await press(slot(0));
    const returned = await record("all-cursor-work-owners-returned"); expect(returned.pending).toEqual([]); expect(returned.slots[0]).toEqual(redActive); expect(returned.slots[3]).toEqual(redInactive); conserved(returned);
    await close(); stage = "cold-save-reload";
    const saved = await coldReload(); const restored = await record("restored-actual-save");
    for (const index of [0, 1, 2, 3]) expect(saved.inventory.slots[index]).toEqual(restored.slots[index]); expect(restored.slots[0]).toEqual(redActive); expect(restored.slots[3]).toEqual(redInactive); expect(restored.slots[1]).toEqual(blueActive); expect(restored.slots[2]).toEqual(legacy); expect(restored.pending).toEqual([]); expect(restored.errors).toEqual([]); conserved(restored);
    await snap(page, info, "glow-cold-restored-active-remainder-and-legacy-absence");
    expect(errors).toEqual([]); stage = "complete";
  } catch (error) { failure = String(error); throw error; }
  finally {
    try { observations.push({ stage, label: "final-readback", state: await read() }); }
    catch (error) { observations.push({ stage, label: "final-readback-unavailable", error: String(error) }); }
    await fs.writeFile(info.outputPath("glow-activation-coverage.json"), JSON.stringify({ stage, failure, errors, observations,
      fixture: "Bedrock/cleared air pad, raw red inactive2, raw blue inactive1, legacy green1 with absent metadata, and 33 raw one-unit cobblestone filler stacks. No active state or activation outcome is assigned.",
      input: mobile ? "Actual UI taps and Playwright native short tap with complete start/end pair" : "Actual UI clicks and acknowledged right mouse down/up in air",
      qualifications: ["Bag/workcell/cursor/raw-save observations are read-only.", "Filler may automatically merge on pickup; bag+pending+ground conservation is checked.", "Swap and incompatible workcell refusal are distinct operations; no claim that bag swapping should refuse.", "No native expiry, NBT, durability, illumination, graphics parity or performance claim."] }, null, 2));
  }
}
