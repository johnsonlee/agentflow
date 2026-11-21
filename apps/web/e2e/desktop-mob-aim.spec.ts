import { expect, test } from "@playwright/test";
import { MOB_SPECS, type MobKind } from "@craft/engine";
import fs from "node:fs/promises";
import { command, createWorld, frames, look, lookAtMob, newestMob, snap, trackMob, waitForTerrain } from "./helpers";

test("PC: every supported mob has a finite camera aim and actual crosshair target", async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors = await createWorld(page, { mode: "creative" });
  await command(page, "/time set night");
  const observations = [];
  for (const kind of Object.keys(MOB_SPECS) as MobKind[]) {
    await look(page, 0, 0);
    await command(page, `/summon ${kind}`);
    const id = await newestMob(page, kind); expect(id).not.toBeNull();
    // Disclosed fixture: isolate a live actor on a clear pad, not a completed hit or raycast output.
    await page.evaluate(mobId => {
      const g = window.__craft.game!, p = g.body.position;
      const x = Math.floor(p.x), z = Math.floor(p.z), floor = Math.floor(p.y + .01) - 1;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        g.world.setBlock(x + dx, floor, z + dz, window.__craft.blockId("stone"));
        for (let y = floor + 1; y <= floor + 4; y++) g.world.setBlock(x + dx, y, z + dz, 0);
      }
      p.x = x + .5; p.y = floor + 1; p.z = z + .5;
      g.body.velocity = { x: 0, y: 0, z: 0 };
      for (const mob of g.mobs.mobs) {
        if (mob.id === mobId) {
          mob.position = { x: p.x, y: p.y, z: p.z - 2.5 };
          mob.velocity = { x: 0, y: 0, z: 0 }; mob.walking = false; mob.hurtTimer = 0; mob.thinkTimer = 30;
        } else mob.position = { x: p.x + 40, y: p.y, z: p.z + 40 };
      }
    }, id!);
    await waitForTerrain(page);
    expect(await lookAtMob(page, id!)).toBe(true);
    await frames(page);
    const read = () => page.evaluate(mobId => {
      const g = window.__craft.game!;
      return { id: mobId, kind: g.mobs.mobs.find(m => m.id === mobId)?.kind,
        yaw: g.body.yaw, pitch: g.body.pitch,
        finite: Number.isFinite(g.body.yaw) && Number.isFinite(g.body.pitch),
        targeted: g.targetMob?.id ?? null };
    }, id!);
    expect((await read()).finite).toBe(true);
    await expect.poll(async () => (await read()).targeted).toBe(id);
    const aimed = await read();
    const stop = await trackMob(page, id!);
    try {
      // A disclosed position shift makes the tracking helper update the actual ray, without injecting its result.
      await page.evaluate(mobId => { const mob = window.__craft.game!.mobs.mobs.find(m => m.id === mobId)!; mob.position.x += .4; }, id!);
      await frames(page, 4);
      await expect.poll(async () => (await read()).targeted).toBe(id);
      const tracked = await read(); expect(tracked.finite).toBe(true);
      observations.push({ kind, height: MOB_SPECS[kind].height, aimed, tracked });
      await snap(page, info, `finite-actual-crosshair-${kind}`);
    } finally { await stop(); }
  }
  await fs.writeFile(info.outputPath("finite-mob-aim.json"), JSON.stringify({
    fixture: "Actual summon commands; isolated initially stationary live actors, one explicit tracking position shift and clear pad; camera-helper observation, no raycast/hit output injection",
    observations, errors,
  }, null, 2));
  expect(observations).toHaveLength(Object.keys(MOB_SPECS).length);
  expect(errors).toEqual([]);
});
