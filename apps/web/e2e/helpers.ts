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
export async function createWorld(page: Page, options: { seed?: string; mode?: "creative" | "survival"; url?: string } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(options.url ?? "/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  await page.getByRole("button", { name: "Create New World" }).click();
  await page.getByLabel("Seed").fill(options.seed ?? "12345");
  if (options.mode === "survival") await page.getByRole("button", { name: /Game Mode/ }).click();
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
