import { nativePageWorldTap } from './native-world-tap';
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { command, countStack, createWorld, frames, look, lookAtCell, lookAtMob, newestMob, parkMouse, pressMouse, snap, waitForTerrain } from "./helpers";

/** Raw owned balls, clear terrain and initially stationary living actors are disclosed input fixtures. */
export async function snowballProjectileRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => { 
    await page.waitForFunction(() => (window.__craft.game as unknown as { placeCooldown: number }).placeCooldown === 0); // Read the actual application cooldown; do not inject input acceptance.
    if(!mobile)return pressMouse(page,'right');const vp=page.viewportSize()!;await nativePageWorldTap(page,vp.width*.65,vp.height*.45); };
  const pause = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await expect(page.locator(".pause-screen")).toBeVisible();
  };
  const fixture = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const at = { x: Math.floor(p.x), y: Math.floor(p.y + .01), z: Math.floor(p.z) };
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      g.world.setBlock(at.x + dx, at.y - 1, at.z + dz, window.__craft.blockId("bedrock"));
      for (let dy = 0; dy <= 6; dy++) g.world.setBlock(at.x + dx, at.y + dy, at.z + dz, 0);
    }
    p.x = at.x + .5; p.y = at.y; p.z = at.z + .5; g.body.velocity = { x: 0, y: 0, z: 0 };
    for (const m of g.mobs.mobs) m.position = { x: p.x + 40, y: p.y, z: p.z + 40 };
    g.inventory.slots.fill(null); g.inventory.slots[0] = { id: window.__craft.stackId("snowball"), count: 6 };
    g.inventory.select(0); return at;
  });
  if (!mobile) await parkMouse(page);
  const records = () => page.evaluate(() => window.__craft.game!.snowballProjectiles.records);
  const impacts = () => page.evaluate(() => window.__craft.game!.recentSnowballImpacts);
  await command(page, "/summon npc Guide"); const npc = (await newestMob(page, "npc"))!;
  const positionActor = (id: number, distance: number) => page.evaluate(({ id, distance }) => {
    const g = window.__craft.game!, p = g.body.position, m = g.mobs.mobs.find(m => m.id === id)!;
    m.position = { x: p.x, y: p.y, z: p.z - distance }; m.velocity = { x: 0, y: 0, z: 0 };
    m.walking = false; m.thinkTimer = 30; m.hurtTimer = 0;
  }, { id, distance });
  await positionActor(npc, 2.5); await lookAtMob(page, npc); await frames(page);
  await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(npc);
  await use(); await expect(page.locator(".npc-screen h2")).toHaveText("Guide");
  expect(await countStack(page, "snowball")).toBe(6); expect(await records()).toHaveLength(0);
  await press(page.getByRole("button", { name: "Close", exact: true }));
  await page.evaluate(id => { window.__craft.game!.mobs.mobs.find(m => m.id === id)!.position.x += 40; }, npc);

  const reducer = { x: fixture.x + 2, y: fixture.y, z: fixture.z };
  await page.evaluate(at => window.__craft.game!.world.setBlock(at.x, at.y, at.z, window.__craft.blockId("material_reducer")), reducer);
  await lookAtCell(page, reducer.x, reducer.y, reducer.z); await frames(page); await use();
  await expect(page.getByRole("heading", { name: "Material Reducer", exact: true })).toBeVisible();
  expect(await countStack(page, "snowball")).toBe(6); expect(await records()).toHaveLength(0);
  await press(page.getByRole("button", { name: "Close inventory" }));

  await command(page, "/summon pig"); const pig = (await newestMob(page, "pig"))!;
  await positionActor(pig, 2.5); await lookAtMob(page, pig); await frames(page);
  await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(pig);
  const beforeHealth = await page.evaluate(id => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, pig);
  await use();
  await expect.poll(async () => (await impacts()).some(hit => hit.kind === "mob" && hit.mobId === pig)).toBe(true);
  expect(await countStack(page, "snowball")).toBe(5);
  expect(await page.evaluate(id => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, pig)).toBe(beforeHealth);
  await expect.poll(async () => (await records()).length).toBe(0);
  await snap(page, info, "actual-thrown-snowball-contact-without-pig-health-damage");

  // A real solid wall must intercept the second shot before the living actor behind it.
  await positionActor(pig, 5);
  const wall = { x: fixture.x, y: fixture.y + 1, z: fixture.z - 2 };
  await page.evaluate(at => {
    const g = window.__craft.game!;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) g.world.setBlock(at.x + dx, at.y + dy, at.z, window.__craft.blockId("stone"));
  }, wall);
  await lookAtCell(page, wall.x, wall.y, wall.z); await frames(page);
  const firstImpacts = await impacts();
  await use(); await expect.poll(async () => (await impacts()).filter(hit => hit.kind === "block").length).toBeGreaterThan(0);
  expect(await countStack(page, "snowball")).toBe(4);
  expect((await impacts()).filter(hit => hit.kind === "mob")).toHaveLength(firstImpacts.filter(hit => hit.kind === "mob").length);
  expect(await page.evaluate(id => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, pig)).toBe(beforeHealth);

  const observedImpacts = await impacts();
  // Shoot into open sky and freeze through the actual pause control before persistence inspection.
  await look(page, Math.PI, 1.1); await frames(page); await use();
  await expect.poll(async () => (await records()).length).toBe(1);
  expect(await countStack(page, "snowball")).toBe(3);
  await pause(); // Pause before expensive captures; movement is observed through actual impacts and persisted flight.
  const paused = await records(); expect(paused).toHaveLength(1);
  await frames(page, 8); expect(await records()).toEqual(paused); // Actual animation frames while the menu is open.
  const visibleFlight = await page.evaluate(key => {
    const g = window.__craft.game!;
    const mesh = g.renderer.scene.children.find(child => child.userData.snowballProjectileKey === key) as import("three").Mesh | undefined;
    if (!mesh) return null;
    const ndc = mesh.position.clone().project(g.renderer.camera);
    const map = (mesh.material as import("three").MeshBasicMaterial).map!;
    return { key: mesh.userData.snowballProjectileKey, visible: mesh.visible, ndc: { x: ndc.x, y: ndc.y, z: ndc.z }, width: map.image.width, height: map.image.height, billboard: mesh.quaternion.angleTo(g.renderer.camera.quaternion) };
  }, paused[0].key);
  expect(visibleFlight).not.toBeNull(); expect(visibleFlight!.visible).toBe(true);
  expect(Math.abs(visibleFlight!.ndc.x)).toBeLessThan(1); expect(Math.abs(visibleFlight!.ndc.y)).toBeLessThan(1);
  expect(visibleFlight!.ndc.z).toBeGreaterThan(-1); expect(visibleFlight!.ndc.z).toBeLessThan(1);
  expect(visibleFlight!.width).toBeGreaterThan(0); expect(visibleFlight!.height).toBeGreaterThan(0);
  expect(visibleFlight!.billboard).toBeLessThan(.000001);
  await snap(page, info, "paused-real-flight-sprite-in-camera-with-original-atlas");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  const savedRaw = await page.evaluate(() => localStorage.getItem("craft.save.v1")!);
  const saved = JSON.parse(savedRaw).snowballProjectiles;
  expect(saved.records).toEqual(paused); expect(saved.version).toBe(1);
  await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); await pause();
  const restored = await records(); expect(restored).toHaveLength(1); expect(restored[0].key).toBe(paused[0].key);
  expect(restored[0].ageSeconds).toBeGreaterThanOrEqual(paused[0].ageSeconds);
  expect(restored[0].velocity.y).toBeLessThanOrEqual(paused[0].velocity.y);
  expect(await countStack(page, "snowball")).toBe(3);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "consumed-snowball-flight-restored-with-stable-owner");

  // Close the live writer before inserting a damaged disk fixture; pagehide otherwise saves the valid live owner.
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
  const corrupt = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("craft.save.v1")!);
    data.snowballProjectiles.records[0].velocity.x = "broken";
    const raw = JSON.stringify(data); localStorage.setItem("craft.save.v1", raw); return raw;
  });
  await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); await pause();
  expect(await page.evaluate(() => window.__craft.game!.loadErrors.some(message => /snowball/i.test(message)))).toBe(true);
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("snowball projectiles");
  expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
  const event = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" }));
  const download = await event, backup = info.outputPath("damaged-projectile-recovery.json"); await download.saveAs(backup);
  expect(JSON.parse(await fs.readFile(backup, "utf8")).recoveryOriginalSave).toBe(corrupt);
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
  await snap(page, info, "damaged-projectile-original-owner-save-preserved");
  await fs.writeFile(info.outputPath("snowball-projectile-evidence.json"), JSON.stringify({
    fixtures: "Six raw owned snowballs, clear bedrock pad, summoned initially stationary actors, explicit wall; no flight/impact/damage outcome injection",
    controls: mobile ? "actual CDP touch and UI taps" : "actual mouse and UI clicks", beforeHealth,
    actualImpacts: observedImpacts, paused, saved, restored, visibleFlight,
    limits: "Application flight calibration/lifetime/cooldown/cap, not native-runtime equivalence; no Blaze, health damage or unverified knockback; no performance claim", errors,
  }, null, 2));
  expect(errors).toEqual([]);
}
