import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flying: boolean;
  onGround: boolean;
}

/** Creates a new world through the real title-screen UI and waits until nearby terrain is meshed. */
/**
 * Natural animal spawning is off by default so wandering animals can't intercept clicks and taps
 * aimed at blocks; tests about natural spawning pass `animals: true`.
 */
export async function createWorld(page: Page, options: { seed?: string; mode?: "creative" | "survival"; url?: string; animals?: boolean } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // CPU_THROTTLE=<n> slows the page n-fold (CDP), to reproduce slow CI runners locally.
  const throttle = Number(process.env.CPU_THROTTLE ?? 0);
  if (throttle > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await page.goto(options.url ?? "/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  await page.getByRole("button", { name: "Create New World" }).click();
  await page.getByLabel("Seed").fill(options.seed ?? "12345");
  if (options.mode === "survival") await page.getByRole("button", { name: /Game Mode/ }).click();
  if (!options.animals) await page.getByRole("button", { name: "Spawn Animals: On" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await waitForTerrain(page);
  return errors;
}

export async function waitForTerrain(page: Page) {
  await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
  // Let the player settle onto the ground.
  await page.waitForFunction(() => window.__craft.game?.body.onGround === true, undefined, { timeout: 20_000 });
}

export function player(page: Page): Promise<PlayerState> {
  return page.evaluate(() => {
    const b = window.__craft.game!.body;
    return { ...b.position, yaw: b.yaw, pitch: b.pitch, flying: b.flying, onGround: b.onGround };
  });
}

export function look(page: Page, yaw: number, pitch: number) {
  return page.evaluate(([y, p]) => {
    const b = window.__craft.game!.body;
    b.yaw = y;
    b.pitch = p;
  }, [yaw, pitch] as const);
}

/** Block currently under the crosshair (after at least one frame). */
export async function target(page: Page) {
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const t = window.__craft.game!.targetBlock;
    return t ? { x: t.x, y: t.y, z: t.z, id: t.id, normal: t.normal } : null;
  });
}

export function blockAt(page: Page, x: number, y: number, z: number) {
  return page.evaluate(([bx, by, bz]) => window.__craft.game!.world.getBlock(bx, by, bz), [x, y, z] as const);
}

/** Saves a screenshot into the test output and, if SCREENSHOT_DIR is set, into that folder for review. */
export async function snap(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, `${testInfo.project.name}-${name}.png`));
  }
}

/** Asserts the canvas shows a rendered scene (many distinct colours), not a blank or single-colour frame. */
export async function expectRenderedScene(page: Page) {
  const colours = await page.evaluate(() => {
    const g = window.__craft.game!;
    const canvas = g.renderer.canvas;
    // Render and read back in the same task, before the drawing buffer is cleared.
    g.renderer.renderer.render(g.renderer.scene, g.renderer.camera);
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    const set = new Set<number>();
    for (let i = 0; i < data.length; i += 4) set.add((data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3));
    return set.size;
  });
  expect(colours).toBeGreaterThan(40);
}

/** Waits until the player is standing still on the ground. */
export async function settle(page: Page) {
  await page.waitForFunction(() => {
    const b = window.__craft.game!.body;
    return b.onGround && Math.hypot(b.velocity.x, b.velocity.z) < 0.05;
  });
}

/** Starts tracking the highest feet Y reached per frame; call the returned function to get the rise. */
export async function trackRise(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const w = window as unknown as { __rise: { start: number; peak: number; on: boolean } };
    const b = window.__craft.game!.body;
    w.__rise = { start: b.position.y, peak: b.position.y, on: true };
    const step = () => {
      if (!w.__rise.on) return;
      w.__rise.peak = Math.max(w.__rise.peak, window.__craft.game!.body.position.y);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  return () =>
    page.evaluate(() => {
      const w = window as unknown as { __rise: { start: number; peak: number; on: boolean } };
      w.__rise.on = false;
      return w.__rise.peak - w.__rise.start;
    });
}

/**
 * Double-taps Space with an 80 ms gap inside the page. Separate Playwright key presses can be
 * hundreds of milliseconds apart on slow CI runners, which exceeds the 300 ms double-tap window.
 */
export async function doubleTapSpace(page: Page) {
  await page.evaluate(() => {
    const key = (type: string) => window.dispatchEvent(new KeyboardEvent(type, { code: "Space", key: " ", bubbles: true }));
    key("keydown");
    key("keyup");
    // Busy-wait instead of setTimeout: on a slow runner a timer can fire after a long frame, stretching
    // the gap past the 300 ms double-tap window.
    const t = performance.now();
    while (performance.now() - t < 80) {
      // spin
    }
    key("keydown");
    key("keyup");
  });
}

/** Runs a chat command through the real chat input. */
export async function command(page: Page, text: string) {
  await page.evaluate(() => {
    // Open chat the same way the "/" key does, independent of keyboard focus.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Slash", key: "/", bubbles: true }));
  });
  const input = page.getByRole("textbox", { name: "Chat" });
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toBeHidden();
}

/** Id of the newest mob of a kind. */
export function newestMob(page: Page, kind: string) {
  return page.evaluate((k) => {
    const mobs = window.__craft.game!.mobs.mobs.filter((m) => m.kind === k);
    return mobs.length ? mobs[mobs.length - 1].id : null;
  }, kind);
}

/** Resolves after the game has run at least `n` more frames. */
export function frames(page: Page, n = 2) {
  return page.evaluate((count) => new Promise<void>((resolve) => {
    const step = () => (--count <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
}

/**
 * Parks the real mouse on the crosshair before aiming. With pointer lock held (after closing chat or
 * the inventory), any later mouse travel is camera movement, so clicks must not move the mouse:
 * aim after this, then press with {@link pressMouse}.
 */
export async function parkMouse(page: Page) {
  // Pointer lock is requested when a screen closes and granted asynchronously; let it settle first so
  // the lock's first (discarded) mouse event happens here, not during the click.
  await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 2000 }).catch(() => undefined);
  const box = (await page.locator(".game-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await frames(page);
}

/**
 * Walks towards a mob with the real W key while {@link trackMob} keeps the camera on it, until it is
 * under the crosshair within reach, as a player would. Returns false if it never came into reach.
 */
export async function approachMob(page: Page, id: number, timeout = 20_000) {
  const targeted = () => page.evaluate((mobId) => window.__craft.game!.targetMob?.id === mobId, id);
  if (await targeted()) return true;
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction((mobId) => window.__craft.game!.targetMob?.id === mobId, id, { timeout, polling: "raf" });
    return true;
  } catch {
    return false;
  } finally {
    await page.keyboard.up("KeyW");
  }
}

/** A real mouse click where the mouse already is (no travel, so no camera movement). */
export async function pressMouse(page: Page, button: "left" | "right" = "left") {
  await page.mouse.down({ button });
  await page.mouse.up({ button });
}

/**
 * Keeps the camera on a mob every frame, like a player tracking it with the mouse, until the returned
 * function is called. The mob itself is not moved. On slow CI runners (a few frames per second) a
 * single aim goes stale before the click lands because the mob keeps walking.
 */
export async function trackMob(page: Page, id: number): Promise<() => Promise<void>> {
  await page.evaluate((mobId) => {
    const w = window as unknown as { __track: { on: boolean } };
    w.__track = { on: true };
    const heights: Record<string, number> = { pig: 0.9, sheep: 1.3, chicken: 0.7, npc: 1.9 };
    const step = () => {
      if (!w.__track.on) return;
      const g = window.__craft.game!;
      const mob = g.mobs.mobs.find((m) => m.id === mobId);
      if (mob) {
        const dx = mob.position.x - g.body.position.x;
        const dz = mob.position.z - g.body.position.z;
        const dy = mob.position.y + heights[mob.kind] * 0.5 - (g.body.position.y + 1.62);
        g.body.yaw = Math.atan2(-dx, -dz);
        g.body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, id);
  await frames(page);
  return () => page.evaluate(() => {
    (window as unknown as { __track: { on: boolean } }).__track.on = false;
  });
}

/** Points the camera at the centre of a mob. Returns false if it no longer exists. */
export function lookAtMob(page: Page, id: number) {
  return page.evaluate((mobId) => {
    const g = window.__craft.game!;
    const mob = g.mobs.mobs.find((m) => m.id === mobId);
    if (!mob) return false;
    const heights: Record<string, number> = { pig: 0.9, sheep: 1.3, chicken: 0.7, npc: 1.9 };
    const dx = mob.position.x - g.body.position.x;
    const dz = mob.position.z - g.body.position.z;
    const dy = mob.position.y + heights[mob.kind] * 0.5 - (g.body.position.y + 1.62);
    g.body.yaw = Math.atan2(-dx, -dz);
    g.body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return true;
  }, id);
}

export function mobExists(page: Page, id: number) {
  return page.evaluate((mobId) => window.__craft.game!.mobs.mobs.some((m) => m.id === mobId), id);
}

/** Counts items of a block in the inventory. */
export function countItem(page: Page, name: string) {
  return page.evaluate((n) => {
    const id = window.__craft.blockId(n);
    return window.__craft.game!.inventory.slots.reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
  }, name);
}

/** Keeps a (fleeing) mob within reach: moves it 2.5 blocks in front of the player at foot level. */
export function bringMob(page: Page, id: number) {
  return page.evaluate((mobId) => {
    const g = window.__craft.game!;
    const mob = g.mobs.mobs.find((m) => m.id === mobId);
    if (!mob) return false;
    const p = g.body.position;
    mob.position = { x: p.x - Math.sin(g.body.yaw) * 2.5, y: p.y + 0.01, z: p.z - Math.cos(g.body.yaw) * 2.5 };
    mob.velocity = { x: 0, y: 0, z: 0 };
    return true;
  }, id);
}

/**
 * Crafts a wooden pickaxe from two logs in an open crafting table, through the real UI:
 * logs -> 8 planks, 2 planks -> 4 sticks, 3 planks + 2 sticks -> pickaxe, put in hotbar slot index 3.
 * `press` clicks (desktop) or taps (mobile) a locator. Expects the logs in slot 0 and slots 3, 9 and 10 free.
 */
export async function craftWoodenPickaxe(page: Page, press: (l: Locator) => Promise<void>) {
  const inv = page.locator(".inventory-screen");
  const slot = (i: number) => press(inv.locator(`[data-slot="${i}"]`));
  const craft = (i: number) => press(inv.locator(`[data-craft="${i}"]`));
  const result = inv.locator("[data-craft-result]");
  const holding = inv.locator('[data-testid="cursor"]');
  await expect(inv.locator("[data-craft]")).toHaveCount(9);

  await slot(0); // pick up both logs
  await craft(0);
  await craft(0);
  await expect(result.locator("img")).toHaveAttribute("alt", "Oak Planks");
  await press(result);
  await press(result);
  await expect(holding).toContainText("Oak Planks ×8");

  // Sticks: two planks stacked vertically.
  await craft(0);
  await craft(3);
  await slot(9); // put the other 6 planks down
  await expect(result.locator("img")).toHaveAttribute("alt", "Stick");
  await press(result);
  await expect(holding).toContainText("Stick ×4");

  // Pickaxe: three planks across the top, two sticks down the middle.
  await craft(4);
  await craft(7);
  await slot(10);
  await slot(9);
  await craft(0);
  await craft(1);
  await craft(2);
  await slot(9);
  await expect(result.locator("img")).toHaveAttribute("alt", "Wooden Pickaxe");
  await press(result);
  await expect(holding).toContainText("Wooden Pickaxe ×1");
  await slot(3);
  await expect(holding).toBeEmpty();
}

/** Number of a block or item in the inventory. */
export function countStack(page: Page, name: string) {
  return page.evaluate((n) => {
    const id = window.__craft.stackId(n);
    return window.__craft.game!.inventory.slots.reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
  }, name);
}

/**
 * Increment 2 starting kit, given in survival through real chat commands. Resulting slots:
 * 0 furnace, 1 iron ore, 2 coal, 3 sticks (2), 4 cooked porkchop, 5 gold ore, 6 crafting table,
 * 7 iron ingots (2; with the smelted one that makes the 3 a pickaxe needs).
 */
export async function giveSmeltingKit(page: Page) {
  for (const c of ["furnace", "iron_ore", "coal", "stick 2", "cooked_porkchop", "gold_ore", "crafting_table", "iron_ingot 2"]) {
    await command(page, `/give ${c}`);
  }
  expect(await countStack(page, "iron_ingot")).toBe(2);
}

/**
 * In an open furnace: iron ore in, coal as fuel, wait for the ingot (10 s of game time; slow runners
 * clamp frame time, so allow a minute), then put it on the two given ingots (slot 7).
 */
export async function smeltIronIngot(page: Page, press: (l: Locator) => Promise<void>) {
  const inv = page.locator(".inventory-screen");
  await expect(page.getByRole("heading", { name: "Furnace" })).toBeVisible();
  await expect(inv.locator("[data-craft]")).toHaveCount(0);
  await press(inv.locator('[data-slot="1"]'));
  await press(inv.locator('[data-furnace="input"]'));
  await press(inv.locator('[data-slot="2"]'));
  await press(inv.locator('[data-furnace="fuel"]'));
  await expect(inv.locator(".furnace-flame")).toHaveAttribute("data-burning", "true");
  await expect(inv.locator('[data-furnace="output"] img')).toHaveAttribute("alt", "Iron Ingot", { timeout: 60_000 });
  await expect(inv.locator('[data-furnace="input"] img')).toHaveCount(0);
  await press(inv.locator('[data-furnace="output"]'));
  await press(inv.locator('[data-slot="7"]'));
  await expect(inv.locator('[data-testid="cursor"]')).toBeEmpty();
  expect(await countStack(page, "iron_ingot")).toBe(3);
}

/** In an open crafting table: 3 ingots (slot 7) over 2 sticks (slot 3) -> Iron Pickaxe into slot 8. */
export async function craftIronPickaxe(page: Page, press: (l: Locator) => Promise<void>) {
  const inv = page.locator(".inventory-screen");
  await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
  await press(inv.locator('[data-slot="7"]'));
  for (const i of [0, 1, 2]) await press(inv.locator(`[data-craft="${i}"]`));
  await press(inv.locator('[data-slot="3"]'));
  for (const i of [4, 7]) await press(inv.locator(`[data-craft="${i}"]`));
  await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Iron Pickaxe");
  await press(inv.locator("[data-craft-result]"));
  await press(inv.locator('[data-slot="8"]'));
  await expect(inv.locator('[data-testid="cursor"]')).toBeEmpty();
}

/** Sets the survival food level (test setup: a fresh world starts full, and full players can't eat). */
export function setFood(page: Page, food: number) {
  return page.evaluate((f) => {
    window.__craft.game!.hunger.food = f;
  }, food);
}

/** Block light (0-15) at a cell, read from the game's light engine. */
export function blockLight(page: Page, x: number, y: number, z: number) {
  return page.evaluate(([bx, by, bz]) => window.__craft.game!.world.getLight(bx, by, bz) & 15, [x, y, z] as const);
}

/**
 * Test setup: carves a sealed 5x3x5 stone room deep underground around (x, z) and returns the
 * floor-level centre. The player is then moved in with a real /tp command.
 */
export function buildDarkRoom(page: Page, cx: number, cz: number, floorY = 20) {
  return page.evaluate(([x0, z0, fy]) => {
    const w = window.__craft.game!.world;
    const stone = window.__craft.blockId("stone");
    for (let x = x0 - 4; x <= x0 + 4; x++) for (let z = z0 - 4; z <= z0 + 4; z++) for (let y = fy - 2; y <= fy + 5; y++) w.setBlock(x, y, z, stone);
    for (let x = x0 - 2; x <= x0 + 2; x++) for (let z = z0 - 2; z <= z0 + 2; z++) for (let y = fy; y <= fy + 2; y++) w.setBlock(x, y, z, 0);
    return { x: x0, y: fy, z: z0 };
  }, [cx, cz, floorY] as const);
}

/** Crafts 4 torches in the open survival inventory from coal (slot 0) and a stick (slot 1); puts them in slot 0. */
export async function craftTorches(page: Page, press: (l: Locator) => Promise<void>) {
  const inv = page.locator(".inventory-screen");
  await press(inv.locator('[data-slot="0"]'));
  await press(inv.locator('[data-craft="0"]'));
  await press(inv.locator('[data-slot="1"]'));
  await press(inv.locator('[data-craft="2"]'));
  await expect(inv.locator("[data-craft-result] img")).toHaveAttribute("alt", "Torch");
  await press(inv.locator("[data-craft-result]"));
  await expect(inv.locator('[data-testid="cursor"]')).toContainText("Torch ×4");
  await press(inv.locator('[data-slot="0"]'));
  await expect(inv.locator('[data-testid="cursor"]')).toBeEmpty();
}

export function health(page: Page) {
  return page.evaluate(() => window.__craft.game!.health);
}

/**
 * Test setup: a 2-high, 5-wide stone wall across the -Z direction, `distance` blocks in front of
 * the player (who faces -Z at yaw 0), so a zombie summoned 3 blocks ahead lands behind it.
 */
export function buildWallAhead(page: Page, distance = 2) {
  return page.evaluate((d) => {
    const g = window.__craft.game!;
    const p = g.body.position;
    const stone = window.__craft.blockId("stone");
    const x0 = Math.floor(p.x);
    const z = Math.floor(p.z) - d;
    const y0 = Math.floor(p.y);
    for (let x = x0 - 2; x <= x0 + 2; x++) for (let y = y0; y <= y0 + 1; y++) g.world.setBlock(x, y, z, stone);
    return { x0, z, y0 };
  }, distance);
}

/** Points the camera at the centre of a block cell. */
export function lookAtCell(page: Page, x: number, y: number, z: number) {
  return page.evaluate(([cx, cy, cz]) => {
    const g = window.__craft.game!;
    const dx = cx + 0.5 - g.body.position.x;
    const dz = cz + 0.5 - g.body.position.z;
    const dy = cy + 0.5 - (g.body.position.y + 1.62);
    g.body.yaw = Math.atan2(-dx, -dz);
    g.body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, [x, y, z] as const);
}

/** Anchor cell of the first chalkboard. */
export function firstBoard(page: Page) {
  return page.evaluate(() => {
    const b = [...window.__craft.game!.chalkboards.values()][0];
    return { x: b.x, y: b.y, z: b.z };
  });
}

/** Survival kit for the chemistry route. Slots: 0-3 the four stations, 4 sand, 5 ammonia, 6 phosphorus. */
export async function giveChemistryKit(page: Page) {
  for (const c of ["element_constructor", "compound_creator", "material_reducer", "lab_table", "sand", "ammonia", "phosphorus"]) {
    await command(page, `/give ${c}`);
  }
  expect(await countStack(page, "lab_table")).toBe(1);
}

const slotHolding = (page: Page, name: string) =>
  page.evaluate((n) => window.__craft.game!.inventory.slots.findIndex((s) => s?.id === window.__craft.stackId(n)), name);
const emptySlot = (page: Page) => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex((s) => s === null));

/**
 * In an open Element Constructor: takes two hydrogen (the default 1p 0n 1e), is refused for an
 * ion, previews oxygen-18, then builds oxygen-16. `typed` enters numbers in the fields (desktop);
 * otherwise every change is a tap on − / +.
 */
export async function buildHydrogenAndOxygen(page: Page, press: (l: Locator) => Promise<void>, typed: boolean) {
  const inv = page.locator(".inventory-screen");
  await expect(page.getByRole("heading", { name: "Element Constructor" })).toBeVisible();
  const status = inv.locator("[data-chem-status]");
  const result = inv.locator("[data-chem-result]");
  await expect(status).toHaveText("Hydrogen (H): atomic number 1, mass 1");
  await press(result);
  await press(result);
  await press(inv.locator(`[data-slot="${await emptySlot(page)}"]`));
  expect(await countStack(page, "hydrogen")).toBe(2);

  const set = async (key: "protons" | "neutrons" | "electrons", from: number, to: number) => {
    const row = inv.locator(`[data-particle="${key}"]`);
    if (typed) {
      await row.locator("input").fill(String(to));
      await row.locator("input").blur();
    } else {
      for (let i = from; i !== to; i += Math.sign(to - from)) await press(row.locator(`[data-step="${Math.sign(to - from)}"]`));
    }
    await expect(row.locator("input")).toHaveValue(String(to));
  };
  await set("protons", 1, 8);
  await expect(status).toHaveAttribute("data-chem-status", "error");
  await expect(status).toHaveText("A neutral Oxygen atom needs 8 electrons");
  await expect(result.locator("img")).toHaveCount(0);
  await set("electrons", 1, 8);
  await set("neutrons", 0, 10);
  await expect(status).toHaveText("Oxygen-18 (O-18): atomic number 8, 10 neutrons");
  await set("neutrons", 10, 8);
  await expect(status).toHaveText("Oxygen (O): atomic number 8, mass 16");
  await expect(result.locator("img")).toHaveAttribute("alt", "Oxygen");
  await press(result);
  await press(inv.locator(`[data-slot="${await emptySlot(page)}"]`));
  expect(await countStack(page, "oxygen")).toBe(1);
}

/** In an open Compound Creator: 2 hydrogen + 1 oxygen -> Water. */
export async function createWater(page: Page, press: (l: Locator) => Promise<void>) {
  const inv = page.locator(".inventory-screen");
  await expect(page.getByRole("heading", { name: "Compound Creator" })).toBeVisible();
  await press(inv.locator(`[data-slot="${await slotHolding(page, "hydrogen")}"]`));
  await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-chem-input="0"]'));
  await expect(inv.locator("[data-chem-status]")).toHaveAttribute("data-chem-status", "error");
  await press(inv.locator(`[data-slot="${await slotHolding(page, "oxygen")}"]`));
  await press(inv.locator('[data-chem-input="4"]'));
  await expect(inv.locator("[data-chem-status]")).toHaveText("Water (H₂O)");
  await expect(inv.locator("[data-chem-result] img")).toHaveAttribute("alt", "Water");
  await press(inv.locator("[data-chem-result]"));
  await expect(inv.locator("[data-chem-input] img")).toHaveCount(0);
  await press(inv.locator(`[data-slot="${await emptySlot(page)}"]`));
  expect(await countStack(page, "water_compound")).toBe(1);
  expect(await countStack(page, "hydrogen")).toBe(0);
  expect(await countStack(page, "oxygen")).toBe(0);
}

/** In an open Material Reducer: sand -> 1 silicon + 2 oxygen. */
export async function reduceSand(page: Page, press: (l: Locator) => Promise<void>) {
  const inv = page.locator(".inventory-screen");
  await expect(page.getByRole("heading", { name: "Material Reducer" })).toBeVisible();
  await press(inv.locator(`[data-slot="${await slotHolding(page, "sand")}"]`));
  await press(inv.locator('[data-chem-input="0"]'));
  await expect(inv.locator("[data-chem-status]")).toHaveText("Sand reduces to:");
  await expect(inv.locator(".reducer-output img")).toHaveCount(2);
  await press(inv.locator('[data-chem-action="reduce"]'));
  await expect(inv.locator('[data-chem-input="0"] img')).toHaveCount(0);
  expect(await countStack(page, "sand")).toBe(0);
  expect(await countStack(page, "silicon")).toBe(1);
  expect(await countStack(page, "oxygen")).toBe(2);
}

/** In an open Lab Table: ammonia + phosphorus -> Super Fertilizer. */
export async function mixSuperFertilizer(page: Page, press: (l: Locator) => Promise<void>) {
  const inv = page.locator(".inventory-screen");
  await expect(page.getByRole("heading", { name: "Lab Table" })).toBeVisible();
  await press(inv.locator(`[data-slot="${await slotHolding(page, "ammonia")}"]`));
  await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator(`[data-slot="${await slotHolding(page, "phosphorus")}"]`));
  await press(inv.locator('[data-chem-input="1"]'));
  await expect(inv.locator("[data-chem-result] img")).toHaveAttribute("alt", "Super Fertilizer");
  await press(inv.locator("[data-chem-result]"));
  await press(inv.locator(`[data-slot="${await emptySlot(page)}"]`));
  expect(await countStack(page, "super_fertilizer")).toBe(1);
  expect(await countStack(page, "ammonia")).toBe(0);
  expect(await countStack(page, "phosphorus")).toBe(0);
}

/** Test setup: sets a block directly in the world (to stage water, snow or grass next to the player). */
export function setBlock(page: Page, x: number, y: number, z: number, name: string) {
  return page.evaluate(([bx, by, bz, n]) => window.__craft.game!.world.setBlock(bx as number, by as number, bz as number, window.__craft.blockId(n as string)), [x, y, z, name] as const);
}

/** Counts blocks named `names` within `r` (x/z) and ±2 (y) of a point. */
export function countBlocksNear(page: Page, at: { x: number; y: number; z: number }, names: string[], r = 4) {
  return page.evaluate(([p, ns, rr]) => {
    const ids = (ns as string[]).map((n) => window.__craft.blockId(n));
    const pt = p as { x: number; y: number; z: number };
    let n = 0;
    for (let x = -rr; x <= rr; x++) for (let z = -rr; z <= rr; z++) for (let y = -2; y <= 2; y++) {
      if (ids.includes(window.__craft.game!.world.getBlock(pt.x + x, pt.y + y, pt.z + z))) n++;
    }
    return n;
  }, [at, names, r] as const);
}

/** Survival kit for the lab products. Slots: 0 super fertilizer, 1 ice bomb, 2 heat block, 3 underwater torch, 4 glow stick, 5 torch. */
export async function giveLabProducts(page: Page) {
  for (const c of ["super_fertilizer 2", "ice_bomb 2", "heat_block", "underwater_torch", "glow_stick 2", "torch"]) await command(page, `/give ${c}`);
  expect(await countStack(page, "glow_stick")).toBe(2);
}

/**
 * The five Lab Table product effects. `use(slot, yaw)` selects a hotbar slot, aims down at `yaw`
 * and uses the held item once; it returns the targeted block.
 */
export async function labProductEffects(page: Page, use: (slot: number, yaw: number) => Promise<{ x: number; y: number; z: number }>) {
  const aim = async (yaw: number) => {
    await look(page, yaw, -1.2);
    return (await target(page))!;
  };
  // Super fertilizer on grass: plants grow around it.
  let hit = await aim(0);
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    await setBlock(page, hit.x + x, hit.y, hit.z + z, "grass");
  }
  await use(0, 0);
  await expect.poll(() => countBlocksNear(page, { x: hit.x, y: hit.y + 1, z: hit.z }, ["tall_grass", "dandelion", "poppy"])).toBeGreaterThan(0);
  expect(await countStack(page, "super_fertilizer")).toBe(1);
  // Clear each stage's results so later aims hit the ground.
  const clearAbove = async (p: { x: number; y: number; z: number }) => {
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) await setBlock(page, p.x + x, p.y + 1, p.z + z, "air");
  };
  await clearAbove(hit);

  // Ice bomb on a pool: the water freezes.
  hit = await aim(Math.PI / 2);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) await setBlock(page, hit.x + x, hit.y + 1, hit.z + z, "water");
  await use(1, Math.PI / 2);
  await expect.poll(() => countBlocksNear(page, { x: hit.x, y: hit.y + 1, z: hit.z }, ["ice"], 1)).toBe(9);
  expect(await countStack(page, "ice_bomb")).toBe(1);
  await clearAbove(hit);

  // Heat block: placed next to snow and ice, it melts them.
  hit = await aim(Math.PI);
  const at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  await setBlock(page, at.x + 1, at.y, at.z, "snow");
  await setBlock(page, at.x - 1, at.y, at.z, "ice");
  await use(2, Math.PI);
  await expect.poll(() => page.evaluate((p) => window.__craft.game!.world.getBlock(p.x, p.y, p.z), at)).toBe(await page.evaluate(() => window.__craft.blockId("placed_heat_block")));
  const blockAtP = (p: { x: number; y: number; z: number }) => page.evaluate((q) => window.__craft.game!.world.getBlock(q.x, q.y, q.z), p);
  expect(await blockAtP({ ...at, x: at.x + 1 })).toBe(0);
  expect(await blockAtP({ ...at, x: at.x - 1 })).toBe(await page.evaluate(() => window.__craft.blockId("water")));

  // Underwater torch: a plain torch can't go in water, the underwater torch can, and it lights the water.
  hit = await aim(-Math.PI / 2);
  const wet = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  await setBlock(page, wet.x, wet.y, wet.z, "water");
  await use(5, -Math.PI / 2);
  await page.waitForTimeout(300);
  expect(await countStack(page, "torch")).toBe(1);
  await use(3, -Math.PI / 2);
  await expect.poll(() => page.evaluate((p) => window.__craft.game!.world.getBlock(p.x, p.y, p.z), wet)).toBe(await page.evaluate(() => window.__craft.blockId("placed_underwater_torch")));
  expect(await page.evaluate((p) => window.__craft.game!.world.getLight(p.x, p.y + 1, p.z) & 15, wet)).toBe(13);

  // Glow stick: held, it lights the player's surroundings; placed, it emits block light.
  expect(await page.evaluate(() => window.__craft.game!.heldLight)).toBe(0);
  const lit = await use(4, -Math.PI / 4);
  await expect.poll(() => page.evaluate(() => window.__craft.game!.heldLight)).toBe(10);
  const glow = await page.evaluate(() => window.__craft.blockId("placed_glow_stick"));
  await expect.poll(() => countBlocksNear(page, lit, ["placed_glow_stick"], 2)).toBe(1);
  expect(await countStack(page, "glow_stick")).toBe(1);
  expect(glow).toBeGreaterThan(0);
}

/** Aims at the middle of the top face of the block at (x, y, z) (so a placed block lands on it). */
export function aimAtTop(page: Page, x: number, y: number, z: number) {
  return page.evaluate(([cx, cy, cz]) => {
    const g = window.__craft.game!;
    const dx = cx + 0.5 - g.body.position.x;
    const dz = cz + 0.5 - g.body.position.z;
    const dy = cy + 0.98 - (g.body.position.y + 1.62);
    g.body.yaw = Math.atan2(-dx, -dz);
    g.body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, [x, y, z] as const);
}

/** Survival kit for the redstone route. Slots: 0 lever, 1 redstone, 2 lamp, 3 wooden door, 4 stone button, 5 iron door, 6 redstone torch. */
export async function giveRedstoneKit(page: Page) {
  for (const c of ["lever", "redstone 2", "redstone_lamp 2", "wooden_door", "stone_button", "iron_door", "redstone_torch"]) await command(page, `/give ${c}`);
  expect(await countStack(page, "redstone_torch")).toBe(1);
}

/**
 * The redstone route on a flattened 9x9 stone pad around the player (test setup):
 * lever -> 2 dust -> lamp, toggled on and off; a wooden door opened and closed by hand; an iron
 * door opened by a stone button, closing again after it; a redstone torch lighting a lamp.
 * `use(slot, aim)` selects a hotbar slot (or none), aims with `aim` and uses (right-click or tap).
 */
export async function redstoneRoute(page: Page, use: (slot: number | null, aim: () => Promise<unknown>) => Promise<void>) {
  const { px, gy, pz } = await page.evaluate(() => {
    const g = window.__craft.game!;
    const p = g.body.position;
    return { px: Math.floor(p.x), gy: Math.floor(p.y + 0.01) - 1, pz: Math.floor(p.z) };
  });
  // One evaluate for the whole pad: hundreds of round trips are slow on software-rendered CI runners.
  await page.evaluate(([x0, y0, z0]) => {
    const g = window.__craft.game!;
    const stone = window.__craft.blockId("stone");
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      g.world.setBlock(x0 + x, y0, z0 + z, stone);
      for (let y = 1; y <= 3; y++) g.world.setBlock(x0 + x, y0 + y, z0 + z, 0);
    }
  }, [px, gy, pz] as const);
  const id = (n: string) => page.evaluate((name) => window.__craft.blockId(name), n);
  const at = (x: number, y: number, z: number) => page.evaluate(([a, b, c]) => window.__craft.game!.world.getBlock(a, b, c), [x, y, z] as const);
  const nameAt = (x: number, y: number, z: number) => page.evaluate(([a, b, c]) => {
    const g = window.__craft.game!;
    const bid = g.world.getBlock(a, b, c);
    return window.__craft.blockName(bid);
  }, [x, y, z] as const);
  /** Places from `slot` on the pad at (x, z) and checks the block landed there. */
  const place = async (slot: number, x: number, z: number, expected: RegExp) => {
    await use(slot, async () => {
      await aimAtTop(page, px + x, gy, pz + z);
      await expect.poll(() => target(page)).toMatchObject({ x: px + x, y: gy, z: pz + z });
    });
    await expect.poll(() => nameAt(px + x, gy + 1, pz + z)).toMatch(expected);
    await page.waitForTimeout(250);
  };
  const useOn = async (x: number, y: number, z: number) => {
    await use(null, async () => {
      await lookAtCell(page, px + x, gy + y, pz + z);
      await expect.poll(() => target(page)).toMatchObject({ x: px + x, y: gy + y, z: pz + z });
    });
    await page.waitForTimeout(300);
  };
  const lightAbove = (x: number, z: number) => page.evaluate(([a, b, c]) => window.__craft.game!.world.getLight(a, b, c) & 15, [px + x, gy + 2, pz + z] as const);

  // Lever -> dust -> dust -> lamp (placed far to near so nothing blocks the aim).
  await place(2, 2, 3, /^redstone_lamp$/);
  await place(1, 2, 2, /^redstone_wire_0$/);
  await place(1, 2, 1, /^redstone_wire_0$/);
  await place(0, 2, 0, /^lever$/);
  expect(await lightAbove(2, 3)).toBe(0);
  await useOn(2, 1, 0);
  await expect.poll(() => nameAt(px + 2, gy + 1, pz + 3)).toBe("redstone_lamp_on");
  expect(await nameAt(px + 2, gy + 1, pz)).toBe("lever_on");
  expect(await nameAt(px + 2, gy + 1, pz + 1)).toBe("redstone_wire_15");
  expect(await nameAt(px + 2, gy + 1, pz + 2)).toBe("redstone_wire_14");
  await expect.poll(() => lightAbove(2, 3)).toBe(14);
  await useOn(2, 1, 0);
  await expect.poll(() => nameAt(px + 2, gy + 1, pz + 3)).toBe("redstone_lamp");
  await expect.poll(() => lightAbove(2, 3)).toBe(0);

  // Iron door with a stone button beside it: the button opens it, and it closes after a second.
  await place(5, -2, 2, /^door_iron_lower_\d_0$/);
  expect(await nameAt(px - 2, gy + 2, pz + 2)).toMatch(/^door_iron_upper_\d_0$/);
  await place(4, -2, 1, /^stone_button$/);
  // Record every change of the door's lower half: the button holds for 1 s of game time, which can
  // pass before a slow runner's next poll, so the open-then-closed sequence is checked from the log.
  await page.evaluate(([x, y, z]) => {
    const w = window as unknown as { __doorLog: string[] };
    w.__doorLog = [];
    window.__craft.game!.world.onBlockChanged((bx, by, bz, bid) => {
      if (bx === x && by === y && bz === z) w.__doorLog.push(window.__craft.blockName(bid));
    });
  }, [px - 2, gy + 1, pz + 2] as const);
  const doorLog = () => page.evaluate(() => (window as unknown as { __doorLog: string[] }).__doorLog);
  await useOn(-2, 2, 2); // by hand: an iron door doesn't open
  expect(await nameAt(px - 2, gy + 1, pz + 2)).toMatch(/_0$/);
  expect(await doorLog()).toEqual([]);
  await useOn(-2, 1, 1);
  await expect.poll(async () => (await doorLog()).map((n) => n.slice(-1)).join(""), { timeout: 15_000 }).toBe("10");
  expect(await doorLog()).toEqual([expect.stringMatching(/^door_iron_lower_\d_1$/), expect.stringMatching(/^door_iron_lower_\d_0$/)]);

  // Wooden door: opened and closed by hand.
  await place(3, -3, -1, /^door_wooden_lower_\d_0$/);
  await useOn(-3, 1, -1);
  await expect.poll(() => nameAt(px - 3, gy + 1, pz - 1)).toMatch(/^door_wooden_lower_\d_1$/);
  expect(await nameAt(px - 3, gy + 2, pz - 1)).toMatch(/^door_wooden_upper_\d_1$/);
  await useOn(-3, 2, -1);
  await expect.poll(() => nameAt(px - 3, gy + 1, pz - 1)).toMatch(/^door_wooden_lower_\d_0$/);

  // A redstone torch powers the lamp next to it.
  await place(6, -2, -2, /^redstone_torch$/);
  await place(2, -1, -2, /^redstone_lamp/);
  await expect.poll(() => nameAt(px - 1, gy + 1, pz - 2)).toBe("redstone_lamp_on");
  expect(await at(px, gy, pz)).toBe(await id("stone"));

  // Leave the wooden door open by hand (the desktop spec checks it is still open after reloading).
  await useOn(-3, 1, -1);
  await expect.poll(() => nameAt(px - 3, gy + 1, pz - 1)).toMatch(/^door_wooden_lower_\d_1$/);
  return { px, gy, pz };
}
