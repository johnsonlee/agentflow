import { expect, test, type Page } from "@playwright/test";
import { blockAt, countStack, craftIronPickaxe, createWorld, giveSmeltingKit, look, setFood, settle, smeltIronIngot, snap, target } from "./helpers";

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
    down: (x: number, y: number) => send("touchStart", x, y),
    up: () => send("touchEnd"),
  };
}

test.describe("Mobile browser (touch): smelting, iron tools, hunger and food", () => {
  test("survival: smelt with taps, craft an iron pickaxe, hold to mine gold ore, hold to eat", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await giveSmeltingKit(page);
    const touch = await finger(page);
    const vp = page.viewportSize()!;
    const view = { x: vp.width * 0.65, y: vp.height * 0.45 };

    /** Taps a hotbar slot, aims down at `yaw` and taps the view to place. */
    const placeAt = async (slot: number, yaw: number, block: string) => {
      await page.locator(`.hotbar .slot[data-slot="${slot}"]`).tap();
      await look(page, yaw, -1.2);
      const hit = (await target(page))!;
      const at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
      await touch.tap(view.x, view.y);
      await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate((b) => window.__craft.blockId(b), block));
      await page.waitForTimeout(300);
      return at;
    };
    const close = async () => {
      await page.getByRole("button", { name: "Close inventory" }).tap();
      await expect(page.locator(".inventory-screen")).toBeHidden();
    };

    await placeAt(0, 0, "furnace");
    await touch.tap(view.x, view.y);
    await smeltIronIngot(page, (l) => l.tap());
    await snap(page, testInfo, "10-touch-furnace-smelted");
    await close();

    await placeAt(6, Math.PI / 2, "crafting_table");
    await touch.tap(view.x, view.y);
    await craftIronPickaxe(page, (l) => l.tap());
    await close();
    expect(await countStack(page, "iron_pickaxe")).toBe(1);

    const gold = await placeAt(5, Math.PI, "gold_ore");
    await page.locator('.hotbar .slot[data-slot="8"]').tap();
    await page.waitForTimeout(200);
    expect(await target(page)).toMatchObject(gold);
    await touch.down(view.x, view.y);
    await expect.poll(() => blockAt(page, gold.x, gold.y, gold.z), { timeout: 20_000 }).toBe(0);
    await touch.up();
    await expect.poll(() => countStack(page, "gold_ore")).toBe(1);

    // Press-and-hold with food in hand eats it.
    await setFood(page, 10);
    const hunger = page.locator(".hud .hunger");
    await expect(hunger).toHaveAttribute("data-food", "10");
    await page.locator('.hotbar .slot[data-slot="4"]').tap();
    await touch.down(view.x, view.y);
    await expect(hunger).toHaveAttribute("data-food", "18", { timeout: 20_000 });
    await touch.up();
    expect(await countStack(page, "cooked_porkchop")).toBe(0);
    await snap(page, testInfo, "11-touch-ate-porkchop");
  });
});
