import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { blockAt, createWorld, expectRenderedScene, look, player, settle, snap, target, trackRise } from "./helpers";

/** Real multi-touch through the Chrome DevTools Protocol (Playwright's touchscreen API only supports taps). */
class Finger {
  private static nextId = 1;
  private readonly id = Finger.nextId++;
  constructor(private readonly cdp: CDPSession) {}

  start(x: number, y: number) {
    return this.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: this.id }] });
  }
  move(x: number, y: number) {
    return this.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: this.id }] });
  }
  end() {
    return this.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
}

async function cdp(page: Page) {
  return page.context().newCDPSession(page);
}

async function centerOf(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("Mobile browser (touch)", () => {
  test("shows the touch layout: joystick, action buttons and tappable hotbar", async ({ page }, testInfo) => {
    const errors = await createWorld(page);
    expect(await page.evaluate(() => window.__craft.touch)).toBe(true);
    await expect(page.locator(".touch-stick-base")).toBeVisible();
    await expect(page.getByRole("button", { name: "Jump" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle flying" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open inventory" })).toBeVisible();
    await expectRenderedScene(page);
    await look(page, 0.6, -0.25);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "01-touch-hud");
    expect(errors).toEqual([]);
  });

  test("virtual joystick walks the player and dragging turns the camera", async ({ page }, testInfo) => {
    await createWorld(page);
    await look(page, 0, 0);
    const session = await cdp(page);
    const start = await player(page);

    // Push the joystick straight up (forward) for a second.
    const stick = new Finger(session);
    const base = await centerOf(page, ".touch-stick-base");
    await stick.start(base.x, base.y);
    for (let i = 1; i <= 6; i++) await stick.move(base.x, base.y - i * 12);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "02-joystick-held");
    await page.waitForTimeout(700);
    const moved = await player(page);
    await stick.end();
    expect(start.z - moved.z).toBeGreaterThan(1);
    expect(Math.abs(moved.x - start.x)).toBeLessThan(0.6);

    // Push right to strafe.
    await stick.start(base.x, base.y);
    for (let i = 1; i <= 6; i++) await stick.move(base.x + i * 12, base.y);
    await page.waitForTimeout(700);
    const strafed = await player(page);
    await stick.end();
    expect(strafed.x - moved.x).toBeGreaterThan(0.8);

    // Drag on the right half rotates the view.
    const look1 = await player(page);
    const finger = new Finger(session);
    const vp = page.viewportSize()!;
    await finger.start(vp.width * 0.7, vp.height * 0.4);
    for (let i = 1; i <= 8; i++) await finger.move(vp.width * 0.7 - i * 15, vp.height * 0.4 + i * 4);
    await finger.end();
    await page.waitForTimeout(100);
    const look2 = await player(page);
    expect(look2.yaw).toBeGreaterThan(look1.yaw + 0.3);
    expect(look2.pitch).toBeLessThan(look1.pitch);
  });

  test("tap places and press-and-hold breaks blocks", async ({ page }, testInfo) => {
    await createWorld(page);
    await look(page, 0, -1.2);
    const hit = await target(page);
    expect(hit).not.toBeNull();
    const placeAt = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    const session = await cdp(page);
    const vp = page.viewportSize()!;

    // Select hotbar slot 7 (glass) by tapping it.
    await page.locator('.hotbar .slot[data-slot="6"]').tap();
    await expect(page.locator('.hotbar .slot[data-slot="6"]')).toHaveClass(/selected/);
    const glass = await page.evaluate(() => window.__craft.blockId("glass"));

    const finger = new Finger(session);
    await finger.start(vp.width * 0.65, vp.height * 0.45);
    await page.waitForTimeout(60);
    await finger.end();
    await expect.poll(() => blockAt(page, placeAt.x, placeAt.y, placeAt.z)).toBe(glass);
    await snap(page, testInfo, "03-placed-glass");

    await page.waitForTimeout(150);
    const t2 = await target(page);
    await finger.start(vp.width * 0.65, vp.height * 0.45);
    await expect.poll(() => blockAt(page, t2!.x, t2!.y, t2!.z), { timeout: 5000 }).toBe(0);
    await finger.end();
  });

  test("jump and fly buttons, inventory button", async ({ page }, testInfo) => {
    await createWorld(page);
    const session = await cdp(page);
    await settle(page);
    const jump = await centerOf(page, ".touch-jump");
    const finger = new Finger(session);
    const rise = await trackRise(page);
    await finger.start(jump.x, jump.y);
    await page.waitForTimeout(300);
    await finger.end();
    expect(await rise()).toBeGreaterThan(0.8);

    await settle(page);
    const fly = await centerOf(page, ".touch-fly");
    await finger.start(fly.x, fly.y);
    await finger.end();
    await expect.poll(async () => (await player(page)).flying).toBe(true);
    const flyStart = await player(page);
    await finger.start(jump.x, jump.y);
    await page.waitForTimeout(600);
    await finger.end();
    expect((await player(page)).y).toBeGreaterThan(flyStart.y + 2);

    await page.getByRole("button", { name: "Open inventory" }).tap();
    await expect(page.getByRole("heading", { name: "Creative Inventory" })).toBeVisible();
    await snap(page, testInfo, "04-touch-inventory");
    await page.locator('.inventory-screen .item-cell[data-block="diamond_ore"]').tap();
    await page.getByRole("button", { name: "Close inventory" }).tap();
    await expect(page.locator(".inventory-screen")).toBeHidden();
    expect(await page.evaluate(() => window.__craft.game!.inventory.selectedStack()!.id)).toBe(
      await page.evaluate(() => window.__craft.blockId("diamond_ore")),
    );

    await page.getByRole("button", { name: "Pause" }).tap();
    await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
    await snap(page, testInfo, "05-touch-pause");
  });
});

/**
 * The touch controls use Pointer Events, so a mouse (desktop browser in mobile emulation, or a
 * mouse-driven operator) can play the mobile layout too.
 */
test.describe("Mobile layout (mouse pointer)", () => {
  test("mouse drag on the joystick walks and drag on the view turns the camera", async ({ page }, testInfo) => {
    await createWorld(page);
    await look(page, 0, 0);
    const start = await player(page);

    const base = await centerOf(page, ".touch-stick-base");
    await page.mouse.move(base.x, base.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(base.x, base.y - i * 12);
    await expect(page.locator(".touch-stick-base")).toHaveClass(/active/);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "06-mouse-joystick-held");
    await page.waitForTimeout(700);
    const moved = await player(page);
    await page.mouse.up();
    expect(start.z - moved.z).toBeGreaterThan(1);
    expect(Math.abs(moved.x - start.x)).toBeLessThan(0.6);
    await expect(page.locator(".touch-stick-base")).not.toHaveClass(/active/);
    expect(moved.flying).toBe(false);

    const vp = page.viewportSize()!;
    const look1 = await player(page);
    await page.mouse.move(vp.width * 0.7, vp.height * 0.4);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(vp.width * 0.7 - i * 15, vp.height * 0.4 + i * 4);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const look2 = await player(page);
    expect(look2.yaw).toBeGreaterThan(look1.yaw + 0.3);
    expect(look2.pitch).toBeLessThan(look1.pitch);
  });

  test("mouse click places, press-and-hold breaks, jump button holds", async ({ page }, testInfo) => {
    await createWorld(page);
    await look(page, 0, -1.2);
    const hit = await target(page);
    expect(hit).not.toBeNull();
    const placeAt = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    const vp = page.viewportSize()!;

    await page.locator('.hotbar .slot[data-slot="6"]').click();
    const glass = await page.evaluate(() => window.__craft.blockId("glass"));
    await page.mouse.click(vp.width * 0.65, vp.height * 0.45, { delay: 60 });
    await expect.poll(() => blockAt(page, placeAt.x, placeAt.y, placeAt.z)).toBe(glass);
    // A short click is a tap: it must not also break the block it placed.
    await page.waitForTimeout(300);
    expect(await blockAt(page, placeAt.x, placeAt.y, placeAt.z)).toBe(glass);
    await snap(page, testInfo, "07-mouse-placed-glass");

    const t2 = await target(page);
    await page.mouse.move(vp.width * 0.65, vp.height * 0.45);
    await page.mouse.down();
    await expect.poll(() => blockAt(page, t2!.x, t2!.y, t2!.z), { timeout: 5000 }).toBe(0);
    await page.mouse.up();

    await settle(page);
    const jump = await centerOf(page, ".touch-jump");
    const rise = await trackRise(page);
    await page.mouse.move(jump.x, jump.y);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    expect(await rise()).toBeGreaterThan(0.8);
  });
});

test.describe("Mobile browser (multi-touch)", () => {
  test("joystick and look drag work at the same time", async ({ page }) => {
    await createWorld(page);
    await look(page, 0, 0);
    const session = await cdp(page);
    const start = await player(page);
    const base = await centerOf(page, ".touch-stick-base");
    const vp = page.viewportSize()!;
    const lookX = vp.width * 0.7;
    const lookY = vp.height * 0.4;
    const touch = (type: string, touchPoints: Array<{ x: number; y: number; id: number }>) =>
      session.send("Input.dispatchTouchEvent", { type: type as "touchStart", touchPoints });

    // Thumb on the stick, pushed forward.
    await touch("touchStart", [{ x: base.x, y: base.y, id: 91 }]);
    for (let i = 1; i <= 6; i++) await touch("touchMove", [{ x: base.x, y: base.y - i * 12, id: 91 }]);
    const stickHeld = { x: base.x, y: base.y - 72, id: 91 };
    // Second finger lands on the view and drags while the stick stays held.
    await touch("touchStart", [stickHeld, { x: lookX, y: lookY, id: 92 }]);
    for (let i = 1; i <= 8; i++) await touch("touchMove", [stickHeld, { x: lookX - i * 15, y: lookY, id: 92 }]);
    await page.waitForTimeout(600);
    const during = await player(page);
    await touch("touchEnd", []);

    expect(during.yaw).toBeGreaterThan(start.yaw + 0.3);
    // Still walking: displacement since the start is non-trivial while the camera turned.
    expect(Math.hypot(during.x - start.x, during.z - start.z)).toBeGreaterThan(0.8);
  });
});
