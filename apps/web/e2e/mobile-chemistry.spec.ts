import { expect, test, type Page } from "@playwright/test";
import {
  blockAt, buildHydrogenAndOxygen, createWater, createWorld, giveChemistryKit, giveLabProducts, labProductEffects, look, mixSuperFertilizer, reduceSand, settle, snap, target,
} from "./helpers";

/** Real touch through CDP; the release is sent without waiting for the press to be handled. */
async function finger(page: Page) {
  const session = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchEnd", x = 0, y = 0) =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 9 }] });
  return {
    async tap(x: number, y: number) {
      const down = send("touchStart", x, y);
      await new Promise((r) => setTimeout(r, 60));
      await Promise.all([down, send("touchEnd")]);
    },
  };
}

test.describe("Mobile browser (touch): Education Edition chemistry", () => {
  test("survival: build hydrogen and oxygen with steppers, create water, reduce sand, mix super fertilizer", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await giveChemistryKit(page);
    const touch = await finger(page);
    const vp = page.viewportSize()!;
    const view = { x: vp.width * 0.65, y: vp.height * 0.45 };

    /** Taps a hotbar slot, aims down at `yaw`, taps the view to place, then taps the block to open it. */
    const placeAndOpen = async (slot: number, yaw: number, block: string) => {
      await page.locator(`.hotbar .slot[data-slot="${slot}"]`).tap();
      await look(page, yaw, -1.2);
      const hit = (await target(page))!;
      const at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
      await touch.tap(view.x, view.y);
      await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate((b) => window.__craft.blockId(b), block));
      await page.waitForTimeout(300);
      await touch.tap(view.x, view.y);
      await expect(page.locator(".inventory-screen")).toBeVisible();
    };
    const close = async () => {
      await page.getByRole("button", { name: "Close inventory" }).tap();
      await expect(page.locator(".inventory-screen")).toBeHidden();
    };

    await placeAndOpen(0, 0, "element_constructor");
    await buildHydrogenAndOxygen(page, (l) => l.tap(), false);
    await snap(page, testInfo, "60-touch-element-constructor");
    await close();

    await placeAndOpen(1, Math.PI / 2, "compound_creator");
    await createWater(page, (l) => l.tap());
    await snap(page, testInfo, "61-touch-compound-creator-water");
    await close();

    await placeAndOpen(2, Math.PI, "material_reducer");
    await reduceSand(page, (l) => l.tap());
    await snap(page, testInfo, "62-touch-material-reducer-sand");
    await close();

    await placeAndOpen(3, -Math.PI / 2, "lab_table");
    await mixSuperFertilizer(page, (l) => l.tap());
    await snap(page, testInfo, "63-touch-lab-table-fertilizer");
    await close();
  });

  test("survival: lab products used with taps", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await giveLabProducts(page);
    const touch = await finger(page);
    const vp = page.viewportSize()!;
    await labProductEffects(page, async (slot, yaw) => {
      await page.locator(`.hotbar .slot[data-slot="${slot}"]`).tap();
      await look(page, yaw, -1.2);
      const hit = (await target(page))!;
      await touch.tap(vp.width * 0.65, vp.height * 0.45);
      await page.waitForTimeout(350);
      return hit;
    });
    await snap(page, testInfo, "65-touch-lab-product-effects");
  });
});
