import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { collectWorldDrops, command, countStack, createWorld, snap } from "./helpers";

/** Raw terrain/airborne live chicken/Agent pose fixture. The claimed meat comes only from a real Agent attack. */
export async function groundPickupLedgeRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 4; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("stone"));
      for (let dy = 1; dy <= 6; dy++) g.world.setBlock(x + dx, floor + dy, z + dz, 0);
    }
    g.world.setBlock(x + 1, floor + 1, z, window.__craft.blockId("stone"));
    Object.assign(g.agent, { x, y: floor + 4, z: z + 1, facing: 2 });
    g.inventory.slots.fill(null);
    return { x, z, floor, meatId: window.__craft.stackId("raw_chicken"), featherId: window.__craft.stackId("feather") };
  });
  await command(page, `/tp ${fixture.x + .5} ${fixture.floor + 1} ${fixture.z + 3.5}`);
  await command(page, "/summon chicken");
  const chicken = await page.evaluate((f) => {
    const g = window.__craft.game!, mob = g.mobs.mobs.filter(m => m.kind === "chicken").at(-1)!;
    mob.position = { x: f.x + .8, y: f.floor + 4, z: f.z + .5 };
    mob.velocity = { x: 0, y: 0, z: 0 }; mob.walking = false; mob.thinkTimer = 60;
    return mob.id;
  }, fixture);
  if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("k");
  await press(page.locator('[data-palette="attack"]')); await press(page.getByRole("button", { name: "▶ Run" }));
  await expect(page.locator(".code-screen")).toBeHidden();
  await expect.poll(() => page.evaluate((id) => window.__craft.game!.mobs.mobs.some(m => m.id === id), chicken)).toBe(false);
  const before = await page.evaluate(() => {
    const g = window.__craft.game!;
    return { player: structuredClone(g.body), records: g.worldDrops.records };
  });
  expect(await countStack(page, "raw_chicken")).toBe(0);
  expect(before.records.filter(r => r.stack.id === fixture.meatId).reduce((n, r) => n + r.stack.count, 0)).toBe(1);
  await fs.writeFile(info.outputPath("ledge-before-real-pickup.json"), JSON.stringify({ fixture, before }, null, 2));
  try { await collectWorldDrops(page); }
  catch (error) {
    const failed = await page.evaluate(() => ({ player: structuredClone(window.__craft.game!.body), records: window.__craft.game!.worldDrops.records, paused: window.__craft.game!.paused }));
    await fs.writeFile(info.outputPath("ledge-failed-real-pickup.json"), JSON.stringify(failed, null, 2));
    await snap(page, info, "narrow-ledge-stalled-real-pickup");
    throw error;
  }
  expect(await countStack(page, "raw_chicken")).toBe(1);
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records)).toEqual([]);
  expect(await countStack(page, "feather")).toBe(before.records.filter(r => r.stack.id === fixture.featherId).reduce((n, r) => n + r.stack.count, 0));
  await snap(page, info, "actual-safe-body-pose-recovers-ledge-loot-once"); expect(errors).toEqual([]);
}
