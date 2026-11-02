import { expect, test, type Page } from "@playwright/test";
import {
  blockAt, countStack, craftIronPickaxe, createWorld, giveSmeltingKit, look, parkMouse, pressMouse, setFood, settle, smeltIronIngot, snap, target,
} from "./helpers";

/** Selects a hotbar slot with its number key, aims down at `yaw` and right-clicks to place; returns the placed position. */
async function placeAt(page: Page, key: string, yaw: number, block: string) {
  await page.keyboard.press(key);
  await parkMouse(page);
  await look(page, yaw, -1.2);
  const hit = (await target(page))!;
  const at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  await pressMouse(page, "right");
  await expect.poll(() => blockAt(page, at.x, at.y, at.z)).toBe(await page.evaluate((b) => window.__craft.blockId(b), block));
  await page.waitForTimeout(300);
  return at;
}

test.describe("PC browser: smelting, iron tools, hunger and food", () => {
  test("survival: smelt iron ore, craft an iron pickaxe, mine gold ore, eat cooked meat", async ({ page }, testInfo) => {
    // Smelting takes 10 s of game time, and slow runners clamp frame time.
    test.setTimeout(240_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await giveSmeltingKit(page);

    // Furnace: place it, open it with a right-click, smelt iron ore with coal.
    await placeAt(page, "Digit1", 0, "furnace");
    await pressMouse(page, "right");
    await smeltIronIngot(page, (l) => l.click());
    await snap(page, testInfo, "14-furnace-smelted");
    await page.keyboard.press("e");
    await expect(page.locator(".inventory-screen")).toBeHidden();

    // Crafting table to the side; craft the iron pickaxe.
    await placeAt(page, "Digit7", Math.PI / 2, "crafting_table");
    await pressMouse(page, "right");
    await craftIronPickaxe(page, (l) => l.click());
    await page.keyboard.press("e");
    await expect(page.locator(".inventory-screen")).toBeHidden();
    expect(await countStack(page, "iron_pickaxe")).toBe(1);

    // Gold ore needs an iron pickaxe; mine it and keep the ore.
    const gold = await placeAt(page, "Digit6", Math.PI, "gold_ore");
    expect(await countStack(page, "gold_ore")).toBe(0);
    await page.keyboard.press("Digit9");
    await expect(page.locator('.hotbar .slot[data-slot="8"] img')).toHaveAttribute("alt", "Iron Pickaxe");
    await page.waitForTimeout(200);
    expect(await target(page)).toMatchObject(gold);
    await page.mouse.down();
    await expect.poll(() => blockAt(page, gold.x, gold.y, gold.z), { timeout: 20_000 }).toBe(0);
    await page.mouse.up();
    await expect.poll(() => countStack(page, "gold_ore")).toBe(1);
    await snap(page, testInfo, "15-mined-gold-ore");

    // Eat the cooked porkchop by holding right-click: the hunger bar rises by 8.
    await setFood(page, 10);
    const hunger = page.locator(".hud .hunger");
    await expect(hunger).toHaveAttribute("data-food", "10");
    await expect(hunger.locator(".food.full")).toHaveCount(5);
    await page.keyboard.press("Digit5");
    await page.mouse.down({ button: "right" });
    await expect(hunger).toHaveAttribute("data-food", "18", { timeout: 20_000 });
    await page.mouse.up({ button: "right" });
    await expect(hunger.locator(".food.full")).toHaveCount(9);
    expect(await countStack(page, "cooked_porkchop")).toBe(0);
    await snap(page, testInfo, "16-ate-porkchop");
  });
});
