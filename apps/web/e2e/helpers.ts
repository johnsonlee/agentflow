import { expect, type Page, type TestInfo } from "@playwright/test";
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
  await page.evaluate(async () => {
    const key = (type: string) => window.dispatchEvent(new KeyboardEvent(type, { code: "Space", key: " ", bubbles: true }));
    key("keydown");
    key("keyup");
    await new Promise((r) => setTimeout(r, 80));
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
  const box = (await page.locator(".game-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await frames(page);
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
