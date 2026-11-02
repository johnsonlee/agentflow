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
