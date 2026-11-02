import { test, type Page } from "@playwright/test";
import { createWorld, giveRedstoneKit, redstoneRoute, settle, snap } from "./helpers";

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

test.describe("Mobile browser (touch): redstone basics", () => {
  test("survival: lever -> dust -> lamp, iron door with a button, wooden door by hand, torch -> lamp, all with taps", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await createWorld(page, { mode: "survival", animals: false });
    await settle(page);
    await giveRedstoneKit(page);
    const touch = await finger(page);
    const vp = page.viewportSize()!;
    await redstoneRoute(page, async (slot, aim) => {
      if (slot !== null) await page.locator(`.hotbar .slot[data-slot="${slot}"]`).tap();
      await aim();
      await touch.tap(vp.width * 0.65, vp.height * 0.45);
    });
    await snap(page, testInfo, "70-touch-redstone-circuit");
  });
});
