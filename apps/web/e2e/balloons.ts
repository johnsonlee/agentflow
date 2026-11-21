import fs from "node:fs/promises";
import { balloonColorOf } from "@craft/engine";
import type { Mesh, MeshBasicMaterial, Line } from "three";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { command, countStack, createWorld, lookAtCell, lookAtMob, parkMouse, snap, waitForTerrain, collectWorldDrops, trackMob, frames } from "./helpers";

/** Original art + production UI routes. Terrain, stations, dyes and String are disclosed fixtures.
 * Spider acquisition has its own actual-browser suite. No finished He, Latex, Lead or Balloon is injected. */
async function setup(page: Page, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click(), inv = page.locator(".inventory-screen");
  const use = async () => {
    if (mobile) { const vp = page.viewportSize()!; await page.touchscreen.tap(vp.width * .65, vp.height * .45); }
    else { await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); }
    await page.waitForTimeout(300);
  };
  const slotOf = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name);
  const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
  const select = async (name?: string): Promise<void> => {
    const slot = name ? await slotOf(name) : await empty(); expect(slot).toBeGreaterThanOrEqual(0);
    if (slot >= 9) {
      if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
      const free = await page.evaluate(() => window.__craft.game!.inventory.slots.slice(0, 9).findIndex(s => s === null)); expect(free).toBeGreaterThanOrEqual(0);
      await press(inv.locator(`[data-slot="${slot}"]`)); await press(inv.locator(`[data-slot="${free}"]`)); await press(page.getByRole("button", { name: "Close inventory" }));
      return select(name);
    }
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`)); else { await page.keyboard.press(`Digit${slot + 1}`); await parkMouse(page); }
  };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y + .01);
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      g.world.setBlock(x + dx, y - 1, z + dz, window.__craft.blockId("bedrock"));
      for (let dy = 0; dy <= 8; dy++) g.world.setBlock(x + dx, y + dy, z + dz, 0);
    }
    g.inventory.slots.fill(null); return { x, y, z };
  });
  await command(page, `/tp ${pad.x + .5} ${pad.y} ${pad.z + .5}`); await command(page, "/time set day"); await command(page, "/gamerule doDaylightCycle false");
  const stations = { element_constructor: { x: pad.x - 2, y: pad.y, z: pad.z - 2 }, compound_creator: { x: pad.x, y: pad.y, z: pad.z - 3 }, crafting_table: { x: pad.x + 2, y: pad.y, z: pad.z - 2 } };
  // Station kit is placed as terrain to isolate the real particle, compound and crafting interfaces.
  await page.evaluate(st => { for (const [name, at] of Object.entries(st)) window.__craft.game!.world.setBlock(at.x, at.y, at.z, window.__craft.blockId(name)); }, stations);
  const open = async (name: keyof typeof stations) => { if (!mobile) await parkMouse(page); const at = stations[name]; await lookAtCell(page, at.x, at.y, at.z); await use(); await expect(inv).toBeVisible(); };
  const close = () => press(page.getByRole("button", { name: "Close inventory" }));
  const put = async (name: string, cells: number[], attr = "data-craft") => {
    const slot = await slotOf(name), count = await countStack(page, name); expect(slot).toBeGreaterThanOrEqual(0);
    await press(inv.locator(`[data-slot="${slot}"]`)); for (const cell of cells) await press(inv.locator(`[${attr}="${cell}"]`));
    if (count > cells.length) await press(inv.locator(`[data-slot="${slot}"]`));
  };
  const take = async (attr: string, label: string) => { await expect(inv.locator(`[${attr}] img`)).toHaveAttribute("alt", label); await press(inv.locator(`[${attr}]`)); const existing = label === "Latex" ? await slotOf("latex") : -1; await press(inv.locator(`[data-slot="${existing >= 0 ? existing : await empty()}"]`)); };
  const craft = async (color: "red" | "blue") => {
    await open("element_constructor");
    for (const atom of [{ p: 6, n: 6, name: "carbon", count: 30 }, { p: 1, n: 0, name: "hydrogen", count: 48 }, { p: 2, n: 2, name: "helium", count: 1 }]) {
      for (const [name, value] of [["protons", atom.p], ["neutrons", atom.n], ["electrons", atom.p]] as const) { const field = inv.getByRole("spinbutton", { name, exact: true }); await field.fill(String(value)); await field.blur(); }
      for (let i = 0; i < atom.count; i++) await press(inv.locator("[data-chem-result]"));
      await press(inv.locator(`[data-slot="${await empty()}"]`)); expect(await countStack(page, atom.name)).toBe(atom.count);
    }
    await close(); await open("compound_creator");
    for (let i = 0; i < 6; i++) {
      await put("carbon", [0, 0, 0, 0, 0], "data-chem-input"); await put("hydrogen", Array(8).fill(1), "data-chem-input"); await take("data-chem-result", "Latex");
    }
    expect(await countStack(page, "latex")).toBe(6); expect(await countStack(page, "carbon")).toBe(0); expect(await countStack(page, "hydrogen")).toBe(0);
    await close(); await command(page, "/give string 5"); await command(page, `/give ${color}_dye`); await open("crafting_table");
    await put("string", [0, 1, 3, 4, 8]); await take("data-craft-result", "Lead");
    expect(await countStack(page, "lead_rope")).toBeGreaterThanOrEqual(2);
    await put("latex", [0, 2, 3, 5, 6, 8]); await put(`${color}_dye`, [1]); await put("helium", [4]); await put("lead_rope", [7]);
    const leadSlot = await slotOf("lead_rope"); expect(leadSlot).toBeGreaterThanOrEqual(0);
    await press(inv.locator(`[data-slot="${leadSlot}"]`));
    const pending = () => page.evaluate(() => (window.__craft.game! as unknown as { inventoryScreen: { pendingItems(): unknown[] } }).inventoryScreen.pendingItems());
    const beforeRefusal = await pending(); await press(inv.locator("[data-craft-result]")); expect(await pending()).toEqual(beforeRefusal); expect(await countStack(page, `${color}_balloon`)).toBe(0);
    await press(inv.locator(`[data-slot="${leadSlot}"]`));
    await take("data-craft-result", `${color === "red" ? "Red" : "Blue"} Balloon`);
    expect(await countStack(page, "latex")).toBe(0); expect(await countStack(page, "helium")).toBe(0); expect(await countStack(page, `${color}_balloon`)).toBe(1);
    await close();
  };
  const records = () => page.evaluate(() => window.__craft.game!.balloons.records);
  const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
  const save = async () => { await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible(); return page.evaluate(() => JSON.parse(localStorage.getItem("craft.save.v1")!)); };
  const resume = async () => { await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); };
  const balloonVisual = async (key: number) => {
    await frames(page);
    const record = (await records()).find(r => r.key === key)!;
    const expectedColor = balloonColorOf(record.itemId)!.colorhex;
    const observed = await page.evaluate(k => {
      const g = window.__craft.game!, group = g.renderer.scene.children.find(o => o.userData.balloonKey === k)!;
      const body = group.children[0] as Mesh, knot = group.children[1] as Mesh, highlight = group.children[2] as Mesh, tether = group.children[3] as Line;
      const material = body.material as MeshBasicMaterial;
      const projected = (object: Mesh | Line) => {
        const positions = object.geometry.getAttribute("position");
        const samples = Array.from({ length: positions.count }, (_, i) => object.position.clone().set(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(object.matrixWorld).project(g.renderer.camera));
        return { vertices: positions.count, allInside: samples.every(p => Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1) };
      };
      const shades = body.geometry.getAttribute("color");
      return { key: k, owner: g.balloons.records.find(r => r.key === k), actualRayTarget: g.targetBalloon,
        groupVisible: group.visible, bodyVisible: body.visible, knotVisible: knot.visible, highlightVisible: highlight.visible, tetherVisible: tether.visible,
        materialType: material.type, appMaterialColor: material.color.getHex(), vertexColors: material.vertexColors,
        vertexShadeRange: shades ? { min: Math.min(...Array.from(shades.array)), max: Math.max(...Array.from(shades.array)) } : null,
        body: projected(body), tether: projected(tether), highlight: projected(highlight), camera: { yaw: g.body.yaw, pitch: g.body.pitch } };
    }, key);
    expect(observed.appMaterialColor).toBe(expectedColor); expect(observed.materialType).toBe("MeshBasicMaterial"); expect(observed.vertexColors).toBe(true);
    expect(observed.vertexShadeRange!.min).toBeGreaterThanOrEqual(.649); expect(observed.vertexShadeRange!.max).toBeLessThanOrEqual(1);
    expect(observed.groupVisible && observed.bodyVisible && observed.highlightVisible && observed.tetherVisible).toBe(true); expect(observed.body.allInside).toBe(true); expect(observed.tether.allInside).toBe(true); expect(observed.body.vertices).toBeGreaterThan(20);
    return { expectedColor, ...observed };
  };
  const balloonInputEvidence: unknown[] = [];
  const balloonPose = (key: number) => page.evaluate(k => {
    const g = window.__craft.game!;
    return { at: performance.now(), key: k, target: g.targetBalloon, record: g.balloons.records.find(r => r.key === k) ?? null,
      player: { ...g.body.position }, camera: { yaw: g.body.yaw, pitch: g.body.pitch }, selected: g.inventory.selected, hand: g.inventory.slots[g.inventory.selected] };
  }, key);
  // Track only the camera. Engine physics and product ownership remain the actual inputs under test.
  const trackBalloon = async (key: number) => {
    await page.evaluate(k => {
      const w = window as unknown as { __balloonCameraTrack?: { on: boolean } };
      if (w.__balloonCameraTrack) w.__balloonCameraTrack.on = false;
      const tracker = { on: true }; w.__balloonCameraTrack = tracker;
      const step = () => {
        if (!tracker.on) return;
        const g = window.__craft.game, r = g?.balloons.records.find(r => r.key === k);
        if (!g || !r) { tracker.on = false; return; }
        const dx = r.position.x - g.body.position.x, dz = r.position.z - g.body.position.z, dy = r.position.y + .2 - g.body.position.y - 1.62;
        const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
        if (![yaw, pitch].every(Number.isFinite)) { tracker.on = false; return; }
        g.body.yaw = yaw; g.body.pitch = pitch; requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, key);
    return () => page.evaluate(() => { const t = (window as unknown as { __balloonCameraTrack?: { on: boolean } }).__balloonCameraTrack; if (t) t.on = false; });
  };
  const balloonAction = async (key: number, action: "detach" | "pop") => {
    const stop = await trackBalloon(key);
    const evidence: { key: number; action: string; before?: unknown; after?: unknown; pointer?: unknown } = { key, action };
    try {
      await expect.poll(() => page.evaluate(() => window.__craft.game!.targetBalloon?.key)).toBe(key);
      evidence.before = await balloonPose(key);
      expect((evidence.before as { target: { key: number } | null }).target?.key).toBe(key);
      // Capture native event timestamps without modifying event processing or inserting RPCs in contact.
      await page.evaluate(() => {
        const w = window as unknown as { __balloonPointerEvents?: unknown[]; __balloonPointerCleanup?: () => void };
        w.__balloonPointerEvents = [];
        const listener = (event: Event) => { const e = event as PointerEvent; w.__balloonPointerEvents!.push({ type: e.type, at: e.timeStamp, button: e.button, buttons: e.buttons, pointerType: e.pointerType }); };
        for (const type of ["pointerdown", "pointerup", "pointercancel"]) window.addEventListener(type, listener, true);
        w.__balloonPointerCleanup = () => { for (const type of ["pointerdown", "pointerup", "pointercancel"]) window.removeEventListener(type, listener, true); };
      });
      await expect.poll(() => page.evaluate(() => window.__craft.game!.targetBalloon?.key)).toBe(key);
      if (action === "detach") {
        await use(); // Actual paired quick tap/right click; tracking stays active through physical contact.
        await expect.poll(async () => (await records()).some(r => r.key === key)).toBe(false);
      } else {
        const finger = mobile ? await page.context().newCDPSession(page) : null, vp = page.viewportSize()!;
        try {
          if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 191 }] }); else await page.mouse.down();
          await page.waitForFunction(k => !window.__craft.game!.balloons.records.some(r => r.key === k), key, { polling: "raf", timeout: 15_000 });
        } finally { if (finger) { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await finger.detach(); } else await page.mouse.up(); }
      }
    } finally {
      try {
        evidence.after = await balloonPose(key);
        evidence.pointer = await page.evaluate(() => { const w = window as unknown as { __balloonPointerEvents?: unknown[]; __balloonPointerCleanup?: () => void }; w.__balloonPointerCleanup?.(); return w.__balloonPointerEvents ?? []; });
      } finally { balloonInputEvidence.push(evidence); await stop(); }
    }
  };
  return { errors, press, inv, use, select, pad, craft, records, pause, save, resume, balloonAction, balloonInputEvidence, balloonVisual };
}

export async function balloonChemistryLiftRoute(page: Page, info: TestInfo, mobile: boolean) {
  const f = await setup(page, mobile); await f.craft("red"); expect(await countStack(page, "lead_rope")).toBe(1);
  await command(page, "/summon pig");
  const pig = await page.evaluate(() => {
    const g = window.__craft.game!, m = g.mobs.mobs.at(-1)!, p = g.body.position;
    m.position = { x: p.x + 1, y: p.y, z: p.z + 2 }; m.velocity = { x: 0, y: 0, z: 0 }; m.walking = false; m.thinkTimer = 120;
    // Broad roof keeps both moving bodies within loaded solid collision bounds.
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) g.world.setBlock(Math.floor(p.x) + dx, Math.floor(p.y) + 5, Math.floor(p.z) + dz, window.__craft.blockId("bedrock"));
    return { id: m.id, position: { ...m.position }, roof: Math.floor(p.y) + 5 };
  });
  await f.select("red_balloon"); await lookAtMob(page, pig.id); await f.use(); await expect.poll(async () => (await f.records()).length).toBe(1);
  const owner = (await f.records())[0]; expect(owner.target).toEqual({ kind: "mob", mobId: pig.id }); expect(await countStack(page, "red_balloon")).toBe(0);
  await page.waitForFunction(({ id, y }) => window.__craft.game!.mobs.mobs.find(m => m.id === id)!.position.y > y + .25, { id: pig.id, y: pig.position.y }, { timeout: 30_000 });
  // Observe the actual balloon body meeting the solid ceiling; the pig remains lifted below it.
  await page.waitForFunction(({ key, roof }) => { const r = window.__craft.game!.balloons.records.find(r => r.key === key); return !!r && r.position.y + .4 >= roof - .025 && r.position.y + .4 <= roof; }, { key: owner.key, roof: pig.roof }, { timeout: 30_000 });
  const lifted = await page.evaluate(({ id, key, roof }) => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!, balloon = g.balloons.records.find(r => r.key === key)!;
    const roofCell = { x: Math.floor(balloon.position.x), y: roof, z: Math.floor(balloon.position.z) };
    return { id: m.id, position: { ...m.position }, velocity: { ...m.velocity }, balloon, roofCell: { ...roofCell, id: g.world.getLoadedBlock(roofCell.x, roofCell.y, roofCell.z) }, meshes: g.renderer.scene.children.filter(o => o.userData.balloonKey !== undefined).map(o => o.userData.balloonKey), player: { ...g.body.position } };
  }, { id: pig.id, key: owner.key, roof: pig.roof });
  expect(lifted.position.y).toBeGreaterThan(pig.position.y + .25); expect(lifted.position.y).toBeLessThanOrEqual(pig.roof - .8); expect(lifted.meshes).toContain(owner.key);
  expect(lifted.balloon.target).toEqual({ kind: "mob", mobId: pig.id }); expect(lifted.balloon.position.y + .4).toBeLessThanOrEqual(pig.roof); expect(lifted.balloon.position.y + .4).toBeGreaterThanOrEqual(pig.roof - .025); expect(lifted.roofCell.id).toBe(await page.evaluate(() => window.__craft.blockId("bedrock")));
  // Frame the same actor, original balloon and full tether together using only real player chat movement/camera.
  const photoAt = { x: lifted.position.x + 4, y: f.pad.y, z: lifted.position.z + 5 };
  await command(page, `/tp ${photoAt.x} ${photoAt.y} ${photoAt.z}`);
  const liftPhoto = await page.evaluate(({ id, key }) => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!, r = g.balloons.records.find(r => r.key === key)!;
    const middle = { x: (m.position.x + r.position.x) / 2, y: (m.position.y + r.position.y + .4) / 2, z: (m.position.z + r.position.z) / 2 };
    const dx = middle.x - g.body.position.x, dz = middle.z - g.body.position.z, dy = middle.y - g.body.position.y - 1.62;
    g.body.yaw = Math.atan2(-dx, -dz); g.body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return { mob: { id: m.id, position: { ...m.position } }, balloon: r, player: { ...g.body.position }, camera: { yaw: g.body.yaw, pitch: g.body.pitch }, midpoint: middle };
  }, { id: pig.id, key: owner.key });
  const redVisual = await f.balloonVisual(owner.key);
  await fs.writeFile(info.outputPath("red-balloon-world-visual.json"), JSON.stringify(redVisual, null, 2));
  await snap(page, info, "real-chemistry-red-balloon-tether-and-lifted-pig-at-solid-ceiling");
  await command(page, `/tp ${lifted.player.x} ${lifted.player.y} ${lifted.player.z}`);
  const saved = await f.save(); await f.resume(); expect((await f.records())[0].key).toBe(owner.key);
  // A second fully constructed color gives independent recipe and icon coverage.
  await f.craft("blue");
  await f.select("blue_balloon");
  await lookAtCell(page, f.pad.x + 1, f.pad.y - 1, f.pad.z); await f.use(); expect(await countStack(page, "blue_balloon")).toBe(1); expect((await f.records()).map(r => r.key)).toEqual([owner.key]);
  await lookAtMob(page, pig.id); await f.use(); expect(await countStack(page, "blue_balloon")).toBe(1); expect((await f.records()).map(r => r.key)).toEqual([owner.key]);
  const icon = await page.evaluate(() => { const g = window.__craft.game!, i = g.inventory.slots.findIndex(s => s?.id === window.__craft.stackId("blue_balloon")); return i; });
  if (mobile) await f.press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE");
  const blueIcon = f.inv.locator(`[data-slot="${icon}"] img`); await expect(blueIcon).toHaveAttribute("alt", "Blue Balloon"); await blueIcon.scrollIntoViewIfNeeded(); await expect(blueIcon).toBeVisible(); await snap(page, info, "second-blue-balloon-constructed-with-distinct-icon"); await f.press(page.getByRole("button", { name: "Close inventory" }));
  await command(page, "/gamemode creative"); expect((await f.records()).map(r => r.key)).toEqual([owner.key]); await command(page, "/gamemode survival");
  await command(page, `/tp ${f.pad.x + 7} ${f.pad.y + 38} ${f.pad.z + 7}`); await expect(page.locator(".death-screen")).toBeVisible({ timeout: 30_000 });
  const deathOwners = await f.records(); expect(deathOwners.map(r => r.key)).toEqual([owner.key]); await f.press(page.getByRole("button", { name: "Respawn", exact: true })); await expect(page.locator(".death-screen")).toHaveCount(0); expect((await f.records()).map(r => r.key)).toEqual([owner.key]);
  await fs.writeFile(info.outputPath("balloon-chemistry-lift.json"), JSON.stringify({ fixtures: "Flat bedrock, placed station kit, String5+dye per recipe via actual chat; String acquisition independently covered by Spider suite; one initial idle pig pose and roof. Every C/H/He made in Constructor, all Latex in Creator, all Lead and balloons table-crafted; no postattach position/velocity/health writes.", pig, owner, lifted, liftPhoto, redVisual, saved, deathOwners, errors: f.errors, limits: ["Original artwork; application buoyancy/ownership policy, not measured native numerical parity", "No performance acceptance"] }, null, 2)); expect(f.errors).toEqual([]);
}

export async function balloonOwnershipRoute(page: Page, info: TestInfo, mobile: boolean) {
  const f = await setup(page, mobile); await f.craft("red");
  const fence = { x: f.pad.x + 2, y: f.pad.y, z: f.pad.z + 2 };
  await page.evaluate(at => window.__craft.game!.world.setBlock(at.x, at.y, at.z, window.__craft.blockId("oak_fence")), fence);
  await f.select("red_balloon"); await lookAtCell(page, fence.x, fence.y, fence.z); await f.use(); await expect.poll(async () => (await f.records()).length).toBe(1);
  const owner = (await f.records())[0]; expect(owner.target).toEqual({ kind: "fence", ...fence }); expect(await countStack(page, "red_balloon")).toBe(0);
  await f.select();
  try { await f.balloonAction(owner.key, "detach"); }
  finally { await fs.writeFile(info.outputPath("balloon-physical-input-evidence.json"), JSON.stringify(f.balloonInputEvidence, null, 2)); }
  await expect.poll(async () => (await f.records()).length).toBe(0);
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records.filter(r => r.stack.id === window.__craft.stackId("red_balloon")).reduce((n, r) => n + r.stack.count, 0))).toBe(1);
  // Bag capacity is a fixture; it must leave the actual detached world owner intact across cold Continue.
  await page.evaluate(() => { const g = window.__craft.game!; for (let i = 0; i < g.inventory.slots.length; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { id: window.__craft.stackId("cobblestone"), count: 64 }; });
  const saved = await f.save(); await f.resume(); expect(await countStack(page, "red_balloon")).toBe(0);
  await page.evaluate(() => { const g = window.__craft.game!, i = g.inventory.slots.findIndex(s => s?.id === window.__craft.stackId("cobblestone")); g.inventory.slots[i] = null; });
  await collectWorldDrops(page); expect(await countStack(page, "red_balloon")).toBe(1);
  await page.evaluate(() => { const g = window.__craft.game!; for (let i = 0; i < g.inventory.slots.length; i++) if (g.inventory.slots[i]?.id === window.__craft.stackId("cobblestone")) g.inventory.slots[i] = null; });
  await command(page, `/tp ${f.pad.x + .5} ${f.pad.y} ${f.pad.z + .5}`); await f.select("red_balloon"); await lookAtCell(page, fence.x, fence.y, fence.z); await f.use(); await expect.poll(async () => (await f.records()).length).toBe(1);
  const popped = (await f.records())[0];
  try { await f.balloonAction(popped.key, "pop"); }
  finally { await fs.writeFile(info.outputPath("balloon-physical-input-evidence.json"), JSON.stringify(f.balloonInputEvidence, null, 2)); }
  await expect.poll(async () => (await f.records()).length).toBe(0);
  expect(await countStack(page, "red_balloon")).toBe(0); expect(await countStack(page, "lead_rope")).toBe(1);
  expect(await page.evaluate(at => window.__craft.game!.world.getBlock(at.x, at.y, at.z), fence)).toBe(188);
  expect(await page.evaluate(() => window.__craft.game!.worldDrops.records.filter(r => [807, 822].includes(r.stack.id)))).toEqual([]);
  await snap(page, info, "empty-hand-balloon-detach-world-pickup-and-destructive-pop");
  // Joint fence destruction combines an ordinary Lead and independently crafted Balloon.
  await f.craft("blue"); await command(page, "/summon sheep");
  const sheep = await page.evaluate(() => { const g = window.__craft.game!, m = g.mobs.mobs.at(-1)!, p = g.body.position; m.position = { x: p.x + 1, y: p.y, z: p.z + 1.5 }; m.velocity = { x: 0, y: 0, z: 0 }; m.walking = false; m.thinkTimer = 120; return m.id; });
  await f.select("lead_rope"); await lookAtMob(page, sheep); await f.use(); await expect.poll(() => page.evaluate(() => window.__craft.game!.leashes.records.length)).toBe(1);
  // Approach the post from its clear east side through actual player chat input; leave the sheep simulated.
  await command(page, `/tp ${fence.x + 2.5} ${f.pad.y} ${fence.z + .5}`);
  await lookAtCell(page, fence.x, fence.y, fence.z);
  const fenceUsePose = () => page.evaluate(at => {
    const g = window.__craft.game!, t = g.targetBlock;
    return { at: performance.now(), player: { ...g.body.position }, camera: { yaw: g.body.yaw, pitch: g.body.pitch },
      targetBlock: t ? { x: t.x, y: t.y, z: t.z, id: t.id } : null, targetMob: g.targetMob?.id ?? null,
      distance: Math.hypot(at.x + .5 - g.body.position.x, at.y + .75 - g.body.position.y, at.z + .5 - g.body.position.z),
      hand: g.inventory.slots[g.inventory.selected], leads: g.leashes.records };
  }, fence);
  await expect.poll(async () => (await fenceUsePose()).targetBlock).toEqual({ ...fence, id: 188 });
  await expect.poll(async () => (await fenceUsePose()).targetMob).toBeNull();
  const beforeFenceUse = await fenceUsePose(); expect(beforeFenceUse.targetBlock).toEqual({ ...fence, id: 188 }); expect(beforeFenceUse.targetMob).toBeNull(); expect(beforeFenceUse.distance).toBeLessThan(4);
  await fs.writeFile(info.outputPath("balloon-joint-fence-use.json"), JSON.stringify({ beforeFenceUse, input: "pending actual quick use" }, null, 2));
  await f.use();
  const afterFenceUse = await fenceUsePose();
  await fs.writeFile(info.outputPath("balloon-joint-fence-use.json"), JSON.stringify({ beforeFenceUse, afterFenceUse, input: mobile ? "Actual quick touchscreen tap" : "Actual right mouse click" }, null, 2));
  await expect.poll(() => page.evaluate(() => window.__craft.game!.leashes.records[0]?.anchor.kind)).toBe("fence");
  await f.select("blue_balloon"); await lookAtCell(page, fence.x, fence.y, fence.z); await f.use(); await expect.poll(async () => (await f.records()).length).toBe(1);
  const jointOwner = (await f.records())[0];
  const bluePhotoPlayer = await page.evaluate(() => ({ ...window.__craft.game!.body.position }));
  await command(page, `/tp ${fence.x + 4.5} ${f.pad.y} ${fence.z + 4.5}`);
  await page.evaluate(k => { const g = window.__craft.game!, r = g.balloons.records.find(r => r.key === k)!;
    const dx = r.position.x - g.body.position.x, dz = r.position.z - g.body.position.z, dy = (r.position.y + .4 + r.lastAnchor.y) / 2 - g.body.position.y - 1.62;
    g.body.yaw = Math.atan2(-dx, -dz); g.body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, jointOwner.key);
  const blueVisual = await f.balloonVisual(jointOwner.key);
  await fs.writeFile(info.outputPath("blue-balloon-world-visual.json"), JSON.stringify(blueVisual, null, 2));
  await snap(page, info, "original-blue-balloon-and-full-tether-on-real-fence");
  await command(page, `/tp ${bluePhotoPlayer.x} ${bluePhotoPlayer.y} ${bluePhotoPlayer.z}`);
  await page.evaluate(() => {
    const store = window.__craft.game!.worldDrops, original = store.planSpawnBatch.bind(store);
    const w = window as unknown as { __balloonRefusal: { attempts: unknown[]; restore(): void } };
    w.__balloonRefusal = { attempts: [], restore: () => { store.planSpawnBatch = original; } };
    store.planSpawnBatch = stacks => { w.__balloonRefusal.attempts.push(structuredClone(stacks)); return null; };
  });
  const agentDestroy = async () => {
    await page.evaluate(at => { Object.assign(window.__craft.game!.agent, { x: at.x, y: at.y, z: at.z + 1, facing: 2 }); }, fence);
    if (mobile) await f.press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("KeyK");
    await expect(page.locator(".code-screen")).toBeVisible(); await f.press(page.locator('[data-palette="destroy"]')); await f.press(page.getByRole("button", { name: "▶ Run" }));
    await expect(page.locator(".code-screen")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  };
  await agentDestroy();
  const jointRefused = await page.evaluate(() => (window as unknown as { __balloonRefusal: { attempts: { id: number; count: number }[][] } }).__balloonRefusal.attempts);
  expect(jointRefused.length).toBeGreaterThan(0); expect(jointRefused[0]).toEqual(expect.arrayContaining([{ id: 188, count: 1 }, { id: 807, count: 1 }, { id: 819, count: 1 }]));
  expect((await f.records())[0].key).toBe(jointOwner.key); expect(await page.evaluate(() => window.__craft.game!.leashes.records.length)).toBe(1);
  await page.evaluate(() => (window as unknown as { __balloonRefusal: { restore(): void } }).__balloonRefusal.restore());
  await agentDestroy(); await expect.poll(async () => (await f.records()).length).toBe(0); expect(await page.evaluate(() => window.__craft.game!.leashes.records)).toEqual([]);
  const jointGround = await page.evaluate(() => window.__craft.game!.worldDrops.records.map(r => r.stack));
  for (const id of [188, 807, 819]) expect(jointGround.filter(s => s.id === id).reduce((n, s) => n + s.count, 0)).toBe(1);
  await collectWorldDrops(page); expect(await countStack(page, "blue_balloon")).toBe(1);
  await command(page, `/tp ${f.pad.x + .5} ${f.pad.y} ${f.pad.z + .5}`);
  await page.evaluate(at => window.__craft.game!.world.setBlock(at.x, at.y, at.z, window.__craft.blockId("oak_fence")), fence);
  // A second real source chain supplies a mob-owned product; no actor damage/loot outcome is seeded.
  await command(page, `/tp ${f.pad.x + .5} ${f.pad.y} ${f.pad.z + .5}`);
  await f.craft("red"); await command(page, "/give diamond_sword");
  await command(page, `/tp ${f.pad.x + .5} ${f.pad.y} ${f.pad.z + .5}`);
  await command(page, "/summon pig");
  const deathPig = await page.evaluate(() => window.__craft.game!.mobs.mobs.at(-1)!.id);
  const deathRoof = await page.evaluate(id => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!, x = Math.floor(m.position.x), z = Math.floor(m.position.z), y = Math.floor(m.position.y) + 5;
    const floor = Math.floor(g.body.position.y) - 1, bedrock = window.__craft.blockId("bedrock");
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      g.world.setBlock(x + dx, floor, z + dz, bedrock); g.world.setBlock(x + dx, y, z + dz, bedrock);
      if (Math.abs(dx) === 8 || Math.abs(dz) === 8) for (let wy = floor + 1; wy < y; wy++) g.world.setBlock(x + dx, wy, z + dz, bedrock);
    }
    return { x, y, z, floor, radius: 8, floorId: g.world.getLoadedBlock(x, floor, z), roofId: g.world.getLoadedBlock(x, y, z), reason: "Disclosed pre-attachment bedrock floor/walls/ceiling bound real rise during player reach commands and cold save recovery; no actor/balloon state writes" };
  }, deathPig);
  expect(deathRoof.floorId).toBe(await page.evaluate(() => window.__craft.blockId("bedrock"))); expect(deathRoof.roofId).toBe(deathRoof.floorId);
  const mobInputEvidence: unknown[] = [];
  const mobUsePose = () => page.evaluate(id => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id), t = g.targetBlock;
    const mobDistance = m ? Math.hypot(m.position.x - g.body.position.x, m.position.y - g.body.position.y, m.position.z - g.body.position.z) : Infinity;
    const centreDistance = m ? Math.hypot(m.position.x - g.body.position.x, m.position.y + .45 - g.body.position.y - 1.62, m.position.z - g.body.position.z) : Infinity;
    return { at: performance.now(), mobId: id, mob: m ? { position: { ...m.position }, velocity: { ...m.velocity }, health: m.health } : null,
      player: { ...g.body.position }, camera: { yaw: g.body.yaw, pitch: g.body.pitch }, selected: g.inventory.selected, hand: g.inventory.slots[g.inventory.selected],
      targetMob: g.targetMob?.id ?? null, targetBalloon: g.targetBalloon, targetBlock: t ? { x: t.x, y: t.y, z: t.z, id: t.id, distance: t.distance } : null,
      mobDistance, clear: g.targetMob?.id === id && mobDistance <= 3.5 && (!t || t.distance > centreDistance),
      leads: g.leashes.records, balloons: g.balloons.records };
  }, deathPig);
  const approachMob = async () => {
    // Disclosed player-only chat candidate positions. The actor and all forces remain simulated.
    for (const [dx, dz] of [[2.5, 0], [-2.5, 0], [0, -2.5], [0, 2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]]) {
      const at = await page.evaluate(id => ({ ...window.__craft.game!.mobs.mobs.find(m => m.id === id)!.position }), deathPig);
      await command(page, `/tp ${at.x + dx} ${at.y} ${at.z + dz}`);
      await lookAtMob(page, deathPig); const stop = await trackMob(page, deathPig); let accepted = false;
      try {
        await expect.poll(async () => (await mobUsePose()).clear, { timeout: 1500 }).toBe(true);
        const pose = await mobUsePose(); mobInputEvidence.push({ action: "approach", offset: { dx, dz }, pose });
        if (pose.clear) { accepted = true; return stop; }
      } catch (error) { mobInputEvidence.push({ action: "blocked-approach", offset: { dx, dz }, pose: await mobUsePose(), error: String(error) }); }
      finally { if (!accepted) await stop(); }
    }
    throw new Error("No clear actual ray to simulated pig from eight disclosed player chat approach candidates");
  };
  const useOwnedMob = async (name: "lead_rope" | "red_balloon") => {
    // Selection/parkMouse precedes the final camera aim and live target acknowledgement.
    await f.select(name); let stop: (() => Promise<void>) | undefined;
    const evidence: { action: string; before?: unknown; after?: unknown } = { action: `use-${name}` };
    try {
      stop = await approachMob(); evidence.before = await mobUsePose(); expect((evidence.before as { clear: boolean }).clear).toBe(true);
      await f.use();
      await expect.poll(() => page.evaluate(({ id, name }) => name === "lead_rope" ? window.__craft.game!.leashes.records.some(r => r.targetMobId === id) : window.__craft.game!.balloons.records.some(r => r.target.kind === "mob" && r.target.mobId === id), { id: deathPig, name })).toBe(true);
    } finally {
      try { evidence.after = await mobUsePose(); }
      finally { if (stop) await stop(); mobInputEvidence.push(evidence); await fs.writeFile(info.outputPath("balloon-mob-physical-input-evidence.json"), JSON.stringify(mobInputEvidence, null, 2)); }
    }
  };
  await useOwnedMob("lead_rope"); await useOwnedMob("red_balloon");
  const deathBalloon = (await f.records()).find(r => r.target.kind === "mob" && r.target.mobId === deathPig)!;
  const deathLead = await page.evaluate(id => window.__craft.game!.leashes.records.find(r => r.targetMobId === id)!, deathPig);
  const deathBounds = await page.evaluate(({ id, key, roof, floor }) => {
    const g = window.__craft.game!, m = g.mobs.mobs.find(m => m.id === id)!, r = g.balloons.records.find(r => r.key === key)!;
    const x = Math.floor(r.position.x), z = Math.floor(r.position.z);
    return { mob: { position: { ...m.position }, velocity: { ...m.velocity } }, balloon: r, roofCell: { x, y: roof, z, id: g.world.getLoadedBlock(x, roof, z) }, floorCell: { x, y: floor, z, id: g.world.getLoadedBlock(x, floor, z) } };
  }, { id: deathPig, key: deathBalloon.key, roof: deathRoof.y, floor: deathRoof.floor });
  expect(deathBounds.roofCell.id).toBe(deathRoof.roofId); expect(deathBounds.floorCell.id).toBe(deathRoof.floorId); expect(deathBounds.balloon.position.y + .4).toBeLessThanOrEqual(deathRoof.y);
  await fs.writeFile(info.outputPath("balloon-mob-bounded-terrain.json"), JSON.stringify({ deathRoof, deathBounds }, null, 2));
  await page.evaluate(id => {
    const g = window.__craft.game!, store = g.worldDrops, original = store.planSpawnBatch.bind(store);
    const w = window as unknown as { __balloonMobRefusal: { attempts: unknown[]; restore(): void } };
    w.__balloonMobRefusal = { attempts: [], restore: () => { store.planSpawnBatch = original; } };
    store.planSpawnBatch = stacks => {
      const mob = g.mobs.mobs.find(m => m.id === id)!, health = mob.health, mode = g.mode;
      const recursiveSave = g.save(), recursiveMode = g.runChat("/gamemode creative"), recursiveAttack = g.mobs.attack(mob, 100, 0);
      w.__balloonMobRefusal.attempts.push({ stacks: structuredClone(stacks), health, afterHealth: mob.health, mode, afterMode: g.mode, recursiveSave, recursiveMode, recursiveAttack }); return null;
    };
  }, deathPig);
  const hitMob = async () => {
    await f.select("diamond_sword"); let stop: (() => Promise<void>) | undefined;
    const attackEvidence: { action: string; before?: unknown; after?: unknown } = { action: "actual-sword-attack" };
    try {
      stop = await approachMob(); attackEvidence.before = await mobUsePose(); expect((attackEvidence.before as { clear: boolean }).clear).toBe(true);
      await expect.poll(() => page.evaluate(() => window.__craft.game!.targetMob?.id)).toBe(deathPig);
      const before = await page.evaluate(id => ({ health: window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, jointAttempts: (window as unknown as { __balloonMobRefusal?: { attempts: { stacks: { id: number; count: number }[] }[] } }).__balloonMobRefusal?.attempts.filter(a => a.stacks.some(s => s.id === 807) && a.stacks.some(s => s.id === 822)).length ?? 0 }), deathPig);
      const finger = mobile ? await page.context().newCDPSession(page) : null, vp = page.viewportSize()!;
      try {
        if (finger) await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 192 }] }); else await page.mouse.down();
        await page.waitForFunction(({ id, before }) => { const m = window.__craft.game!.mobs.mobs.find(m => m.id === id), jointAttempts = (window as unknown as { __balloonMobRefusal?: { attempts: { stacks: { id: number; count: number }[] }[] } }).__balloonMobRefusal?.attempts.filter(a => a.stacks.some(s => s.id === 807) && a.stacks.some(s => s.id === 822)).length ?? 0; return !m || m.health < before.health || jointAttempts > before.jointAttempts; }, { id: deathPig, before }, { polling: "raf", timeout: 15_000 });
      } finally { if (finger) { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await finger.detach(); } else await page.mouse.up(); }
    } finally {
      try { attackEvidence.after = await mobUsePose(); }
      finally { if (stop) await stop(); mobInputEvidence.push(attackEvidence); await fs.writeFile(info.outputPath("balloon-mob-physical-input-evidence.json"), JSON.stringify(mobInputEvidence, null, 2)); }
    }
  };
  for (let i = 0; i < 4; i++) {
    if (await page.evaluate(() => (window as unknown as { __balloonMobRefusal: { attempts: { stacks: { id: number; count: number }[] }[] } }).__balloonMobRefusal.attempts.some(a => a.stacks.some(s => s.id === 807) && a.stacks.some(s => s.id === 822)))) break;
    await hitMob();
  }
  const mobRefused = await page.evaluate(id => ({ health: window.__craft.game!.mobs.mobs.find(m => m.id === id)!.health, balloons: window.__craft.game!.balloons.records, leads: window.__craft.game!.leashes.records, ground: window.__craft.game!.worldDrops.records, attempts: (window as unknown as { __balloonMobRefusal: { attempts: { stacks: { id: number; count: number }[]; health: number; afterHealth: number; mode: string; afterMode: string; recursiveSave: boolean; recursiveMode: string; recursiveAttack: boolean }[] } }).__balloonMobRefusal.attempts }), deathPig);
  // Retain every actual receiver call before assertions: runtime Lead release is a distinct source.
  await fs.writeFile(info.outputPath("balloon-mob-receiver-raw.json"), JSON.stringify({ deathRoof, deathPig, deathLead, deathBalloon, mobRefused }, null, 2));
  const expectedPigLootId = await page.evaluate(() => window.__craft.stackId("raw_porkchop"));
  const jointFatalAttempts = mobRefused.attempts.filter(a => a.stacks.some(s => s.id === 807) && a.stacks.some(s => s.id === 822));
  const incidentalLeadAttempts = mobRefused.attempts.filter(a => a.stacks.length === 1 && a.stacks[0].id === 807 && a.stacks[0].count === 1);
  const unexpectedAttempts = mobRefused.attempts.filter(a => !jointFatalAttempts.includes(a) && !incidentalLeadAttempts.includes(a));
  expect(unexpectedAttempts).toEqual([]);
  for (const attempt of mobRefused.attempts) {
    expect(attempt.afterHealth).toBe(attempt.health); expect(attempt.mode).toBe("survival"); expect(attempt.afterMode).toBe("survival"); expect(attempt.recursiveSave).toBe(false); expect(attempt.recursiveAttack).toBe(false); expect(attempt.recursiveMode).toContain("transferred");
  }
  for (const attempt of incidentalLeadAttempts) expect(attempt.stacks).toEqual([{ id: 807, count: 1 }]);
  expect(jointFatalAttempts).toHaveLength(1); expect(jointFatalAttempts[0].stacks).toHaveLength(3);
  expect(jointFatalAttempts[0].stacks).toEqual(expect.arrayContaining([{ id: 807, count: 1 }, { id: 822, count: 1 }]));
  const actualPigLoot = jointFatalAttempts[0].stacks.filter(s => s.id === expectedPigLootId); expect(actualPigLoot).toHaveLength(1);
  expect(Number.isInteger(actualPigLoot[0].count)).toBe(true); expect(actualPigLoot[0].count).toBeGreaterThanOrEqual(1); expect(actualPigLoot[0].count).toBeLessThanOrEqual(3);
  expect(mobRefused.health).toBe(1); expect(mobRefused.ground).toEqual([]);
  const fatalAttempt = jointFatalAttempts[0], cachedBatch = fatalAttempt.stacks;
  expect(cachedBatch.filter(s => s.id === 807)).toEqual([{ id: 807, count: 1 }]); expect(cachedBatch.filter(s => s.id === 822)).toEqual([{ id: 822, count: 1 }]);
  expect(mobRefused.balloons.find(r => r.key === deathBalloon.key)).toBeDefined(); expect(mobRefused.leads.find(r => r.key === deathLead.key)).toBeDefined();
  const pendingMobSave = await f.save();
  expect(pendingMobSave.mobs.records.find((m: { id: number }) => m.id === deathPig).pendingLoot).toEqual(cachedBatch.filter(s => s.id !== 807 && s.id !== 822));
  expect(pendingMobSave.mobs.records.find((m: { id: number }) => m.id === deathPig).health).toBe(1);
  await f.resume();
  expect((await f.records()).find(r => r.key === deathBalloon.key)).toBeDefined(); expect(await page.evaluate(id => window.__craft.game!.leashes.records.find(r => r.targetMobId === id)?.key, deathPig)).toBe(deathLead.key);
  // Cold Continue removes only the refused receiver fixture. Track the one real retry publication.
  await page.evaluate(() => { const store = window.__craft.game!.worldDrops, original = store.planSpawnBatch.bind(store), w = window as unknown as { __balloonMobCommits: unknown[] }; w.__balloonMobCommits = []; store.planSpawnBatch = (stacks, position, velocity) => { const plan = original(stacks, position, velocity); if (!plan) return plan; return { ...plan, commit: () => { const ok = plan.commit(); if (ok) w.__balloonMobCommits.push(structuredClone(stacks)); return ok; } }; }; });
  await hitMob(); expect(await page.evaluate(id => window.__craft.game!.mobs.mobs.some(m => m.id === id), deathPig)).toBe(false);
  expect((await f.records()).some(r => r.key === deathBalloon.key)).toBe(false); expect(await page.evaluate(id => window.__craft.game!.leashes.records.some(r => r.targetMobId === id), deathPig)).toBe(false);
  const mobGround = await page.evaluate(() => window.__craft.game!.worldDrops.records.map(r => r.stack)); expect(mobGround).toEqual(cachedBatch);
  const mobCommits = await page.evaluate(() => (window as unknown as { __balloonMobCommits: unknown[] }).__balloonMobCommits); expect(mobCommits).toEqual([cachedBatch]);
  await collectWorldDrops(page); await command(page, `/tp ${f.pad.x + .5} ${f.pad.y} ${f.pad.z + .5}`);
  await snap(page, info, "real-fatal-pig-hit-commits-one-cached-loot-lead-balloon-batch-after-cold-recovery");
  // A genuine recovered owner is corrupted only in storage; UI must preserve the exact original.
 await f.select("blue_balloon"); await lookAtCell(page, fence.x, fence.y, fence.z); await f.use(); await expect.poll(async () => (await f.records()).length).toBe(1);
  await f.save();
  const corrupt = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("craft.save.v1")!); d.balloons.records[0].target = { kind: "mob", mobId: 999999 }; const raw = JSON.stringify(d); localStorage.setItem("craft.save.v1", raw); return raw; });
  await f.resume(); await f.pause(); await f.press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.locator(".save-status")).toContainText("balloon"); expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(corrupt);
  const download = page.waitForEvent("download"); await f.press(page.getByRole("button", { name: "Export world backup" })); const backup = info.outputPath("invalid-balloon-original.json"); await (await download).saveAs(backup); expect(JSON.parse(await fs.readFile(backup, "utf8")).recoveryOriginalSave).toBe(corrupt);
  await fs.writeFile(info.outputPath("balloon-ownership.json"), JSON.stringify({ fixtures: "Same disclosed station/String/dye/terrain kit and constructor→Latex→Lead→balloon source chain; fence terrain fixture, fullbag cobble filler and one freed filler slot; extra complete chemistry source chain for mob-death owner; actual chat clear east-side fence approach and cardinal/diagonal player-only reach candidates track the simulated pig; pre-attachment bounded terrain roof for real mob rise; refused joint receivers/reentrancy probes and final stored corrupt target. No finished product/refund/pop outcome injection.", owner, saved, popped, jointOwner, blueVisual, jointRefused, jointGround, deathPig, deathRoof, deathBounds, deathBalloon, deathLead, mobRefused, jointFatalAttempts, incidentalLeadAttempts, actualPigLoot, pendingMobSave, mobGround, mobCommits, errors: f.errors, limits: ["No performance acceptance"] }, null, 2)); expect(f.errors).toEqual([]);
}
