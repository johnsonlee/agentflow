import { expect, test } from "@playwright/test";
import { blockAt, command, countStack, craftWoodenPickaxe, createWorld, look, parkMouse, pressMouse, settle, snap, target } from "./helpers";

test.describe("PC browser: items, tools and tool-based mining", () => {
  test("survival: craft a wooden pickaxe from logs, then mine stone into cobblestone", async ({ page }, testInfo) => {
    // About 25 UI steps; GitHub runners take over a second per click (software rendering).
    test.setTimeout(180_000);
    await createWorld(page, { mode: "survival" });
    await settle(page);
    await command(page, "/give oak_log 2");
    await command(page, "/give crafting_table");
    await command(page, "/give stone");
    expect(await countStack(page, "oak_log")).toBe(2);

    // Place the crafting table in front of the player and open it.
    await page.keyboard.press("Digit2");
    await parkMouse(page);
    await look(page, 0, -1.2);
    const hit = await target(page);
    const tableAt = { x: hit!.x + hit!.normal.x, y: hit!.y + hit!.normal.y, z: hit!.z + hit!.normal.z };
    await pressMouse(page, "right");
    await expect.poll(() => blockAt(page, tableAt.x, tableAt.y, tableAt.z)).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
    await page.waitForTimeout(300);
    await pressMouse(page, "right");
    await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();

    await craftWoodenPickaxe(page, (l) => l.click());
    await snap(page, testInfo, "12-crafted-pickaxe");
    await page.keyboard.press("e");
    await expect(page.locator(".inventory-screen")).toBeHidden();
    expect(await countStack(page, "wooden_pickaxe")).toBe(1);
    expect(await countStack(page, "stick")).toBe(2);
    expect(await countStack(page, "oak_planks")).toBe(3);

    // Place the stone behind the player, then mine it with the pickaxe.
    await page.keyboard.press("Digit3");
    await parkMouse(page);
    await look(page, Math.PI, -1.2);
    const ground = await target(page);
    const stoneAt = { x: ground!.x + ground!.normal.x, y: ground!.y + ground!.normal.y, z: ground!.z + ground!.normal.z };
    await pressMouse(page, "right");
    await expect.poll(() => blockAt(page, stoneAt.x, stoneAt.y, stoneAt.z)).toBe(await page.evaluate(() => window.__craft.blockId("stone")));

    await page.keyboard.press("Digit4");
    await expect(page.locator('.hotbar .slot[data-slot="3"] img')).toHaveAttribute("alt", "Wooden Pickaxe");
    await page.waitForTimeout(200);
    const aimed = await target(page);
    expect(aimed).toMatchObject(stoneAt);
    await page.mouse.down();
    await expect.poll(() => blockAt(page, stoneAt.x, stoneAt.y, stoneAt.z), { timeout: 20_000 }).toBe(0);
    await page.mouse.up();
    // Minecraft: a pickaxe harvests stone as cobblestone, and the tool wears by one use.
    await expect.poll(() => countStack(page, "cobblestone")).toBe(1);
    // The pickaxe wore (exactly one use per block is unit-tested; a slow release may start on the block below).
    const pickaxe = (await page.evaluate(() => window.__craft.game!.inventory.slots[3]))!;
    expect(pickaxe).toMatchObject({ id: await page.evaluate(() => window.__craft.stackId("wooden_pickaxe")), count: 1 });
    expect(pickaxe.damage).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.hotbar .slot[data-slot="3"] .durability')).toHaveAttribute("data-durability", String(59 - pickaxe.damage!));
    await snap(page, testInfo, "13-mined-cobblestone");
  });
});
