import { nativePageWorldTap } from './native-world-tap';
import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, command, countStack, createWorld, look, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

/** Ingredients are staged with commands; crafting, equipment, combat and saving use player UI. */
export async function armorRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  await command(page, "/give crafting_table");
  await command(page, "/give iron_ingot 8");
  const touch = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => { if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2);
  expect(await target(page)).not.toBeNull();
  await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("crafting_table")));
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Crafting Table" })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  await press(inv.locator('[data-slot="1"]'));
  for (const i of [0, 2, 3, 4, 5, 6, 7, 8]) await press(inv.locator(`[data-craft="${i}"]`));
  await expect(inv.locator('[data-craft-result] img')).toHaveAttribute("alt", "Iron Chestplate");
  await press(inv.locator('[data-craft-result]'));
  await press(inv.locator('[data-slot="2"]'));
  expect(await countStack(page, "iron_ingot")).toBe(0);
  expect(await countStack(page, "iron_chestplate")).toBe(1);
  await press(page.getByRole("button", { name: "Close inventory" }));
  const open = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Open inventory" }));
    else await page.keyboard.press("e");
    await expect(inv).toBeVisible();
  };
  await open();
  await press(inv.locator('[data-slot="2"]'));
  // Invalid slot must preserve the cursor and leave all equipment untouched.
  await press(inv.locator('[data-equipment="head"]'));
  await expect(inv.locator('[data-equipment="head"] img')).toHaveCount(0);
  await press(inv.locator('[data-equipment="chest"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  // Unequip to the bag, then put the same piece back on.
  await press(inv.locator('[data-equipment="chest"]'));
  await press(inv.locator('[data-slot="3"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveCount(0);
  await press(inv.locator('[data-slot="3"]'));
  await press(inv.locator('[data-equipment="chest"]'));
  await snap(page, info, "armor-crafted-equipped");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await expect(page.locator('[data-armor-points]')).toHaveAttribute("data-armor-points", "6");
  // Disable natural regeneration through hunger setup, leaving actual zombie attacks unchanged.
  await page.evaluate(() => { const g = window.__craft.game!; g.health = 20; g.hunger.food = 17; });
  await command(page, "/time set night");
  await command(page, "/summon zombie");
  const summonedZombieId = await page.evaluate(() => window.__craft.game!.mobs.mobs.filter(m => m.kind === "zombie").at(-1)!.id);
  await expect.poll(() => page.evaluate(() => window.__craft.game!.health), { timeout: 30_000 }).toBeLessThan(20);
  await open(); // Pauses mob simulation so both measurements describe the same hit count.
  const hit = await page.evaluate(() => {
    const g = window.__craft.game!;
    return { health: g.health, wear: g.inventory.equipment.chest?.damage ?? 0 };
  });
  expect(hit.wear).toBeGreaterThanOrEqual(1);
  expect(20 - hit.health).toBeCloseTo(hit.wear * 3 * (1 - 6 * .04), 5);
  await expect(inv.locator('[data-equipment="chest"] .durability')).toHaveAttribute("data-durability", String(240 - hit.wear));
  await snap(page, info, "armor-reduced-zombie-damage-and-wear");
  await press(page.getByRole("button", { name: "Close inventory" }));
  // Separate measured combat from the later unarmored ownership workflow. The real mode command
  // resets player health as usual; it neither repairs armor nor removes the existing zombie.
  await command(page, "/gamemode creative");
  const isolation = await page.evaluate(id => {
    const g = window.__craft.game!, zombie = g.mobs.mobs.find(m => m.id === id)!;
    const before = { id: zombie.id, health: zombie.health, position: { ...zombie.position } };
    const roof = { x: Math.floor(zombie.position.x), y: Math.ceil(zombie.position.y + 3), z: Math.floor(zombie.position.z) };
    // Daylight burning still runs outside the AI radius. An opaque raw roof preserves this owner.
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++)
      g.world.setBlock(roof.x + dx, roof.y, roof.z + dz, window.__craft.blockId("bedrock"));
    // This lies outside the 64-block AI radius and inside the 96-block despawn radius.
    const workshop = { x: Math.floor(zombie.position.x) + 76 + .5, y: 85, z: Math.floor(zombie.position.z) + .5 };
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      const x = Math.floor(workshop.x) + dx, z = Math.floor(workshop.z) + dz;
      g.world.setBlock(x, 84, z, window.__craft.blockId("bedrock"));
      for (let y = 85; y < 96; y++) g.world.setBlock(x, y, z, 0);
    }
    return { before, roof, workshop };
  }, summonedZombieId);
  await command(page, `/tp ${isolation.workshop.x} ${isolation.workshop.y} ${isolation.workshop.z}`);
  await waitForTerrain(page);
  await command(page, "/agent tp");
  await command(page, "/time set day");
  const observeIsolation = () => page.evaluate(id => {
    const g = window.__craft.game!, zombie = g.mobs.mobs.find(m => m.id === id);
    return { mode: g.mode, dead: g.dead, health: g.health, player: { ...g.body.position }, agent: { x: g.agent.x, y: g.agent.y, z: g.agent.z }, zombie: zombie ? { id: zombie.id, health: zombie.health, position: { ...zombie.position }, skyLight: g.world.getLight(Math.floor(zombie.position.x), Math.floor(zombie.position.y + 1.6), Math.floor(zombie.position.z)) >> 4 } : null };
  }, summonedZombieId);
  const isolated = await observeIsolation();
  expect(isolated.dead).toBe(false); expect(isolated.health).toBeGreaterThan(0);
  expect(isolated.zombie?.id).toBe(summonedZombieId);
  expect(isolated.zombie?.health).toBe(isolation.before.health);
  expect(isolated.zombie!.skyLight).toBeLessThan(15);
  const separation = Math.hypot(isolated.player.x - isolated.zombie!.position.x, isolated.player.z - isolated.zombie!.position.z);
  expect(separation).toBeGreaterThan(64); expect(separation).toBeLessThan(96);
  const saved = await page.evaluate(() => window.__craft.game!.inventory.equipment.chest);
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
  else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  expect(await page.evaluate(() => window.__craft.game!.inventory.equipment.chest)).toEqual(saved);
  const restoredIsolation = await observeIsolation();
  expect(restoredIsolation.zombie).toEqual(isolated.zombie);
  expect(restoredIsolation.dead).toBe(false); expect(restoredIsolation.health).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await open();
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await snap(page, info, "armor-worn-equipment-restored");
  await press(inv.locator('[data-equipment="chest"]'));
  await press(inv.locator('[data-slot="2"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  await command(page, "/gamemode survival");
  await command(page, "/give material_reducer");
  if (mobile) await press(page.locator('.hotbar [data-slot="0"]'));
  else { await page.keyboard.press("Digit1"); await parkMouse(page); }
  await look(page, Math.PI / 2, -1.2);
  await target(page);
  await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("material_reducer")));
  await page.waitForTimeout(300);
  await use();
  await expect(page.getByRole("heading", { name: "Material Reducer" })).toBeVisible();
  await press(inv.locator('[data-slot="2"]'));
  await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-slot="2"]'));
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots[2])).toEqual(saved);
  await snap(page, info, "armor-station-input-preserves-wear");
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) {
    await press(page.locator('.hotbar [data-slot="2"]'));
    await press(page.getByRole("button", { name: "Code Builder", exact: true }));
  } else {
    await page.keyboard.press("Digit3");
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(2);
    await page.keyboard.press("k");
  }
  await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
  await press(page.getByRole("button", { name: "Give held stack to Agent" }));
  await expect(page.locator(".cb-status")).toContainText("Gave the Agent 1 Iron Chestplate");
  expect(await page.evaluate(() => window.__craft.game!.agent.slots[0])).toEqual(saved);
  await press(page.locator('[data-palette="drop"]'));
  await press(page.getByRole("button", { name: "▶ Run" }));
  await expect(page.locator(".code-screen")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  await collectWorldDrops(page); // The Agent drops this owned armor on the ground.
  await expect.poll(() => countStack(page, "iron_chestplate")).toBe(1);
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots[0])).toEqual(saved);
  const afterAgentPickup = await observeIsolation();
  expect(afterAgentPickup.mode).toBe("survival"); expect(afterAgentPickup.dead).toBe(false); expect(afterAgentPickup.health).toBeGreaterThan(0);
  await open();
  await press(inv.locator('[data-slot="0"]'));
  await press(inv.locator('[data-equipment="chest"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  const capacity = await page.evaluate(() => {
    const g = window.__craft.game!;
    return g.inventory.spaceFor(window.__craft.blockId("cobblestone"));
  });
  await command(page, "/give cobblestone 2304");
  expect(await countStack(page, "cobblestone")).toBe(capacity);
  await open();
  await expect(inv.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await expect(inv.getByTestId("cursor")).toBeEmpty();
  await press(inv.locator('[data-equipment="chest"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveCount(0);
  await expect(inv.getByTestId("cursor")).toContainText("Iron Chestplate");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await expect(inv).toBeVisible();
  await expect(inv.getByRole("status")).toContainText("Inventory full");
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveCount(0);
  await snap(page, info, "armor-full-bag-close-refused");
  // pagehide uses the real save path while the item is held and no bag slot is available.
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await expect(inv).toBeVisible();
  await expect(inv.locator('[data-recovery="0"] img')).toHaveAttribute("alt", "Iron Chestplate");
  expect(await countStack(page, "cobblestone")).toBe(capacity);
  await press(inv.locator('[data-recovery="0"]'));
  await press(inv.locator('[data-equipment="chest"]'));
  await expect(inv.locator('[data-equipment="chest"] img')).toHaveAttribute("alt", "Iron Chestplate");
  await press(page.getByRole("button", { name: "Close inventory" }));
  await expect(inv).toBeHidden();
  expect(await countStack(page, "cobblestone")).toBe(capacity);
  expect(await page.evaluate(() => window.__craft.game!.inventory.equipment.chest?.id)).toBe(saved?.id);
  await snap(page, info, "armor-held-full-bag-reload-recovered");
  const finalIsolation = await observeIsolation();
  expect(finalIsolation.mode).toBe("survival"); expect(finalIsolation.dead).toBe(false); expect(finalIsolation.health).toBeGreaterThan(0);
  expect(finalIsolation.zombie).toEqual(isolated.zombie);
  await fs.writeFile(info.outputPath("armor-isolated-ownership-coverage.json"), JSON.stringify({ fixture: "After real armored zombie hits, existing creative command resets player health normally. Raw opaque roof protects the original zombie from daylight, and an elevated bedrock workshop is 76 horizontal blocks away. /tp, /agent tp and /time set day isolate later actual survival station/Agent/full-bag ownership. No zombie removal, actor freeze, damage, armor, owned item or output rewrite.", combat: hit, isolation, separation, isolated, restoredIsolation, afterAgentPickup, finalIsolation, limits: ["not continuous survival beside the hostile", "not proof of exact historical CI fatal source (hostile proximity and unsafe pickup/return geometry were fixture risks)", "pickup helper teleports; physical movement not claimed", "no performance acceptance"] }, null, 2));
  expect(errors).toEqual([]);
}
