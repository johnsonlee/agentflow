import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { command, createWorld, snap, waitForTerrain } from "./helpers";

type Stack = { id: number; count: number; damage?: number; book?: { pages: string[]; title?: string; author?: string } };
const totals = (stacks: Stack[]) => {
  const result: Record<string, number> = {};
  for (const { count, ...metadata } of stacks) { const key = JSON.stringify(metadata); result[key] = (result[key] ?? 0) + count; }
  return result;
};
/** Raw full bag, worn items, pending screen owners and flat fall pad are disclosed fixtures.
 * Death itself follows an actual command teleport and simulated fatal landing; no dead/drop output is injected.
 * Menus currently suspend player/mob simulation, so pending owners are frozen/hidden before the fall. */
export async function playerDeathRoute(page: Page, info: TestInfo, mobile: boolean) {
  const evidence: unknown[] = [];
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const observe = () => page.evaluate(() => {
    const g = window.__craft.game!, d = g as unknown as { inventoryScreen: { pendingItems(): Stack[] }; deathState: unknown };
    return { dead: g.dead, health: g.health, inventory: g.inventory.toJSON(), pending: d.inventoryScreen.pendingItems(), ground: g.worldDrops.toJSON(), death: d.deathState, agent: structuredClone(g.agent.slots), furnaces: [...g.furnaces] };
  });
  const title = async () => { await press(page.locator(".death-screen").getByRole("button", { name: "Title Screen", exact: true })); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); };
  const resume = async (dead: boolean) => {
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ }));
    await page.waitForFunction(() => !!window.__craft.game);
    if (dead) { await expect(page.locator(".death-screen")).toHaveCount(1); await expect(page.locator(".death-screen")).toBeVisible(); await expect(page.locator(".inventory-screen")).toBeHidden(); }
    else await waitForTerrain(page);
  };
  const saveAlive = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
    return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!));
  };
  const fixture = async (full: boolean, pending: boolean) => page.evaluate(({ full, pending }) => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x) + 8, z = Math.floor(p.z), floor = Math.floor(p.y) - 1;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("bedrock"));
      for (let dy = 1; dy <= 45; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    g.inventory.slots.fill(null); if (full) for (let i = 0; i < 36; i++) g.inventory.slots[i] = { id: window.__craft.blockId("cobblestone"), count: 64 };
    g.inventory.slots[0] = { id: window.__craft.stackId("diamond_pickaxe"), count: 1, damage: 7 };
    g.inventory.slots[1] = { id: window.__craft.stackId("written_book"), count: 1, book: { pages: ["Death transfer keeps nested pages", "Second page"], title: "Carried proof", author: "Player" } };
    g.inventory.equipment.head = { id: window.__craft.stackId("iron_helmet"), count: 1, damage: 5 };
    const screen = (g as unknown as { inventoryScreen: { show(...args: unknown[]): void; grid: (Stack | null)[]; cursor: Stack | null; lookup: Stack | null; recovery: Stack[]; freezeForDeath(): void } }).inventoryScreen;
    if (pending) {
      screen.show(g.inventory, "survival"); screen.grid[0] = { id: window.__craft.stackId("stick"), count: 3 };
      screen.cursor = { id: window.__craft.stackId("iron_ingot"), count: 4 }; screen.lookup = { id: 32768, count: 1 };
      screen.recovery = [{ id: window.__craft.stackId("feather"), count: 2 }]; screen.freezeForDeath();
    }
    // World owners are not player death possessions. The idle furnace cannot consume these items.
    const key = `${x + 3},${floor + 1},${z}`;
    g.world.setBlock(x + 3, floor + 1, z, window.__craft.blockId("furnace"));
    g.furnaces.set(key, { input: null, fuel: { id: window.__craft.stackId("coal"), count: 2 }, output: { id: window.__craft.stackId("gold_ingot"), count: 3 }, burnLeft: 0, burnTotal: 0, progress: 0 });
    g.agent.slots[0] = { id: window.__craft.stackId("diamond"), count: 5 };
    return { x: x + .5, z: z + .5, floor, key };
  }, { full, pending });
  const fall = async (at: { x: number; z: number; floor: number }) => {
    await command(page, `/tp ${at.x} ${at.floor + 38} ${at.z}`);
    await expect(page.locator(".death-screen")).toBeVisible({ timeout: 15_000 }); await expect(page.locator(".death-screen")).toHaveCount(1);
    expect(await page.evaluate(() => window.__craft.game!.health)).toBe(0);
  };
  const errors = await createWorld(page, { mode: "survival" });
  const a = await fixture(true, true), before = await observe();
  const expected = [...before.inventory.slots.filter((s): s is Stack => !!s), ...Object.values(before.inventory.equipment!).filter((s): s is Stack => !!s), ...before.pending];
  await page.evaluate(() => {
    const store = window.__craft.game!.worldDrops, original = store.planSpawnBatch.bind(store);
    (window as unknown as { __deathRestore: () => void }).__deathRestore = () => { store.planSpawnBatch = original; };
    store.planSpawnBatch = () => null;
  });
  await fall(a); const refused = await observe();
  expect(refused.inventory).toEqual(before.inventory); expect(refused.pending).toEqual(before.pending); expect(refused.ground.records).toEqual([]);
  await press(page.getByRole("button", { name: "Respawn", exact: true })); await expect(page.locator(".death-screen")).toBeVisible();
  expect((await observe()).inventory).toEqual(before.inventory);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    (window as unknown as { __restoreDeathQuota: () => void }).__restoreDeathQuota = () => { Storage.prototype.setItem = set; };
    Storage.prototype.setItem = function(key, value) { if (key === "craft.save.v1") throw new DOMException("quota fixture", "QuotaExceededError"); return set.call(this, key, value); };
  });
  await press(page.getByRole("button", { name: "Title Screen", exact: true })); await expect(page.locator(".death-screen")).toBeVisible();
  const downloadEvent = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" }));
  const backup = info.outputPath("pending-death-backup.json"); await (await downloadEvent).saveAs(backup);
  const exported = JSON.parse(await fs.readFile(backup, "utf8")); expect(exported.playerState.death.phase).toBe("pending");
  await press(page.getByRole("button", { name: "Title Screen", exact: true })); await expect(page.locator(".death-screen")).toBeVisible();
  await snap(page, info, "death-transfer-refusal-quota-and-export-never-clear-owners");
  await page.evaluate(() => (window as unknown as { __restoreDeathQuota: () => void }).__restoreDeathQuota());
  await title(); await resume(true);
  const loadedPending = await observe(); expect(loadedPending.inventory).toEqual(before.inventory); expect(loadedPending.pending).toEqual(before.pending);
  await press(page.getByRole("button", { name: "Respawn", exact: true })); await expect(page.locator(".death-screen")).toHaveCount(0);
  const transferred = await observe(); expect(transferred.inventory.slots.every(s => s === null)).toBe(true); expect(Object.values(transferred.inventory.equipment!).every(s => s === null)).toBe(true); expect(transferred.pending).toEqual([]);
  expect(totals(transferred.ground.records.map(r => r.stack))).toEqual(totals(expected));
  expect(transferred.agent).toEqual(before.agent); expect(transferred.furnaces).toEqual(before.furnaces);
  expect(await page.evaluate(() => window.__craft.game!.respawn())).toBe(false); expect(totals((await observe()).ground.records.map(r => r.stack))).toEqual(totals(expected));
  await snap(page, info, "full-player-batch-world-owned-once-after-pending-death-reload");
  const alive = await saveAlive(); await resume(false); expect(totals((await observe()).ground.records.map(r => r.stack))).toEqual(totals(expected));
  // Actual automatic pickup at the real landing site; overflow remains owned by the ground.
  await command(page, `/tp ${a.x} ${a.floor + 1} ${a.z}`); await page.waitForTimeout(1300);
  const picked = await observe(); expect(picked.inventory.slots.some(s => s?.id === before.inventory.slots[0]!.id && s.damage === 7)).toBe(true);
  expect(picked.inventory.slots.some(s => s?.book?.title === "Carried proof" && s.book.pages[1] === "Second page")).toBe(true);
  expect(totals([...picked.inventory.slots.filter((s): s is Stack => !!s), ...picked.ground.records.map(r => r.stack)])).toEqual(totals(expected));
  evidence.push({ scenario: "full ownership/refusal/quota/loaded-pending/retry/pickup", before, refused, loadedPending, transferred, alive, picked });

  // A successful default death remains dead-complete across title/reload; it never emits twice.
  await createWorld(page, { mode: "survival" }); const b = await fixture(false, false); await fall(b);
  const complete = await observe(); expect(complete.death).toMatchObject({ phase: "complete", keepInventory: false });
  await title(); await resume(true); const reloadedComplete = await observe(); expect(totals(reloadedComplete.ground.records.map(r => r.stack))).toEqual(totals(complete.ground.records.map(r => r.stack)));
  expect(reloadedComplete.inventory.slots.every(s => s === null)).toBe(true);
  await press(page.getByRole("button", { name: "Respawn", exact: true })); expect(totals((await observe()).ground.records.map(r => r.stack))).toEqual(totals(complete.ground.records.map(r => r.stack)));
  evidence.push({ scenario: "loaded-complete default death", complete, reloadedComplete });

  // Keep Inventory is an actual command, saved and reloaded. Full pending owners reopen in plain recovery.
  await createWorld(page, { mode: "survival" }); await command(page, "/gamerule keepInventory true");
  const keepSave = await saveAlive(); expect(keepSave.gamerules.keepInventory).toBe(true); await resume(false);
  const c = await fixture(true, true), keptBefore = await observe(); await fall(c); const keptDead = await observe();
  expect(keptDead.ground.records).toEqual([]); expect(keptDead.inventory).toEqual(keptBefore.inventory); expect(keptDead.pending).toEqual(keptBefore.pending);
  await title(); await resume(true); await press(page.getByRole("button", { name: "Respawn", exact: true }));
  await expect(page.locator(".inventory-screen")).toBeVisible(); await expect(page.locator(".recovery-section")).toBeVisible();
  await expect(page.locator(".inventory-screen h2")).toHaveText("Inventory");
  const kept = await observe(); expect(kept.inventory).toEqual(keptBefore.inventory); expect(totals(kept.pending)).toEqual(totals(keptBefore.pending)); expect(kept.ground.records).toEqual([]); expect(kept.furnaces).toEqual(keptBefore.furnaces);
  await snap(page, info, "saved-keep-inventory-restores-full-bag-and-plain-held-item-recovery");
  evidence.push({ scenario: "persisted keepInventory and complete retained death", keepSave, keptBefore, keptDead, kept });
  // Actual edited book closure followed by an actual zombie hit (health1 is a disclosed input fixture).
  await createWorld(page, { mode: "survival" }); await command(page, "/time set night");
  await command(page, "/gamerule doDaylightCycle false"); const d = await fixture(false, false);
  await page.evaluate(() => {
    const g = window.__craft.game!;
    g.inventory.slots[2] = { id: window.__craft.stackId("book_and_quill"), count: 1 };
    (g as unknown as { bookScreen: { show(s: Stack): void } }).bookScreen.show(g.inventory.slots[2]!);
  });
  await page.getByLabel("Book page", { exact: true }).fill("Draft edited through the real book UI");
  await press(page.locator(".book-screen").getByRole("button", { name: "Done", exact: true }));
  await page.evaluate(() => {
    const g = window.__craft.game!;
    g.health = 1; g.inventory.equipment.chest = { id: window.__craft.stackId("iron_chestplate"), count: 1, damage: 239 };
    g.mobs.spawn("zombie", { x: g.body.position.x + 1, y: g.body.position.y, z: g.body.position.z });
  });
  await expect(page.locator(".death-screen")).toBeVisible(); const fatalHit = await observe();
  const helmet = fatalHit.ground.records.find(r => r.stack.id === before.inventory.equipment!.head!.id);
  expect(helmet?.stack.damage).toBe(6);
  const chestId = await page.evaluate(() => window.__craft.stackId("iron_chestplate"));
  expect(fatalHit.ground.records.some(r => r.stack.id === chestId)).toBe(false);
  expect(fatalHit.ground.records.some(r => r.stack.book?.pages[0] === "Draft edited through the real book UI")).toBe(true);
  await snap(page, info, "actual-zombie-fatal-hit-post-wear-helmet-and-flushed-book");
  await title(); const validDeadRaw = await page.evaluate(() => localStorage.getItem("craft.save.v1")!);
  const invalidEvidence: unknown[] = [];
  for (const invalidCount of [999, 1]) {
    const corrupt = await page.evaluate(({ raw, count }) => {
      const data = JSON.parse(raw); data.inventory.slots[0] = { id: window.__craft.stackId("diamond"), count };
      const text = JSON.stringify(data); localStorage.setItem("craft.save.v1", text); return text;
    }, { raw: validDeadRaw, count: invalidCount });
    await resume(true); await press(page.getByRole("button", { name: "Respawn", exact: true }));
    await expect(page.locator(".death-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("Damaged player");
    await press(page.getByRole("button", { name: "Title Screen", exact: true })); await expect(page.locator(".death-screen")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
    const downloaded = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" }));
    const filename = info.outputPath(`damaged-death-owner-${invalidCount}.json`); await (await downloaded).saveAs(filename);
    expect(JSON.parse(await fs.readFile(filename, "utf8")).recoveryOriginalSave).toBe(corrupt);
    await press(page.getByRole("button", { name: "Title Screen", exact: true })); await expect(page.locator(".death-screen")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
    invalidEvidence.push({ invalidCount, corrupt, state: await observe() });
  }
  await snap(page, info, "malformed-and-contradictory-death-ownership-preserves-original-save");
  evidence.push({ scenario: "actual book edit and fatal armor wear; raw ownership corruption", fatalHit, validDeadRaw, invalidEvidence });
  await fs.writeFile(info.outputPath("player-death-evidence.json"), JSON.stringify({ fixtures: "Raw full bag/worn items/grid/cursor/lookup/recovery and bedrock fall pad, idle furnace and Agent contents; refusing sink and storage quota. Real teleport+fatal landing, menus, download, Continue, Respawn and automatic pickup. No dead/drop outputs injected. Menu-open simulation remains suspended.", evidence, errors }, null, 2));
  expect(errors).toEqual([]);
}
