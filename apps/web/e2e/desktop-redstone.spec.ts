import { expect, test } from "@playwright/test";
import { createWorld, giveRedstoneKit, parkMouse, pressMouse, redstoneRoute, settle, snap } from "./helpers";

test.describe("PC browser: redstone basics", () => {
  test("survival: lever -> dust -> lamp, iron door with a button, wooden door by hand, torch -> lamp; saved (with a hand-opened door)", async ({ page }, testInfo) => {
    // Slow CI runners (software GL, about 4 fps) need time for the many aimed uses.
    test.setTimeout(420_000);
    await createWorld(page, { mode: "survival", animals: false });
    await settle(page);
    await giveRedstoneKit(page);
    const { px, gy, pz } = await redstoneRoute(page, async (slot, aim) => {
      if (slot !== null) await page.keyboard.press(`Digit${slot + 1}`);
      await parkMouse(page);
      await aim();
      await pressMouse(page, "right");
    });
    await snap(page, testInfo, "70-redstone-circuit");

    // Circuit states survive Save & Quit and Continue (the torch keeps the lamp lit).
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save & Quit to Title" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect.poll(() => page.evaluate(() => window.__craft.game !== null)).toBe(true);
    const names = await page.evaluate(([x, y, z]) => {
      const g = window.__craft.game!;
      return [[x + 2, y + 1, z + 1], [x - 1, y + 1, z - 2], [x + 2, y + 1, z], [x - 3, y + 1, z - 1], [x - 3, y + 2, z - 1]]
        .map(([a, b, c]) => window.__craft.blockName(g.world.getBlock(a, b, c)));
    }, [px, gy, pz] as const);
    expect(names.slice(0, 3)).toEqual(["redstone_wire_0", "redstone_lamp_on", "lever"]);
    // The hand-opened wooden door is still open (both halves) after reloading (review 193df6be).
    expect(names[3]).toMatch(/^door_wooden_lower_\d_1$/);
    expect(names[4]).toMatch(/^door_wooden_upper_\d_1$/);
    // Let the restored redstone run a while: the door stays open.
    await page.waitForTimeout(1500);
    expect(await page.evaluate(([x, y, z]) => window.__craft.blockName(window.__craft.game!.world.getBlock(x - 3, y + 1, z - 1)), [px, gy, pz] as const)).toMatch(/_1$/);
    expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  });
});
