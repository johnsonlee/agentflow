import { nativePageWorldTap } from './native-world-tap';
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { aimAtTop, blockAt, command, createWorld, doubleTapSpace, frames, parkMouse, pressMouse, snap, target } from "./helpers";

const stations = ["element_constructor", "compound_creator", "material_reducer", "lab_table"] as const;
const keys = stations.flatMap(name => [`${name}_top`, `${name}_bottom`]);
function raster(key: string, size: 16 | 32, seed: number) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4;
    pixels[at] = (seed + x * 11) % 256;
    pixels[at + 1] = (seed * 3 + y * 13) % 256;
    pixels[at + 2] = ((x < size / 2) !== (y < size / 2)) ? seed : 255 - seed;
    pixels[at + 3] = 255;
  }
  pixels.set([91, 73, seed, 0]); // Deliberately retain RGB under alpha zero.
  return { key, width: size, height: size, rgbaBase64: pixels.toString("base64") };
}
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Original synthetic image fixtures only. Chat gives materials, actual use places/opens stations. */
export async function stationTexturesRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
  const quit = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
    else await page.keyboard.press("Escape");
    await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  };
  await quit();
  const untouched = await page.evaluate(() => localStorage.getItem("craft.save.v1"));
  const open = async () => { await press(page.getByRole("button", { name: "Resource Packs", exact: true })); };
  const choose = async (bytes: Buffer, name: string) => {
    const event = page.waitForEvent("filechooser");
    await press(page.getByRole("button", { name: "Import texture pack", exact: true }));
    await (await event).setFiles({ name, mimeType: "application/json", buffer: bytes });
  };
  const state = () => page.evaluate(() => ({ selected: window.__craft.texturePack, report: window.__craft.atlas.report, tileSize: window.__craft.atlas.tileSize, count: window.__craft.atlas.tiles.size }));
  const pixels = (key: string) => page.evaluate(k => { const t = window.__craft.atlas.sourceTile(k); return { width: t.width, height: t.height, rgba: Array.from(t.rgba) }; }, key);
  const assertRaster = async (key: string, fixture: ReturnType<typeof raster>) => expect(await pixels(key)).toEqual({ width: fixture.width, height: fixture.height, rgba: [...Buffer.from(fixture.rgbaBase64, "base64")] });
  const icons = async () => Promise.all(stations.map(name => page.getByAltText(name.replaceAll("_", " "), { exact: true }).getAttribute("src")));
  const generic = { version: 1, name: "Synthetic shared station 16", tiles: [raster("chem_station_top", 16, 31)] };
  const specific = { version: 1, name: "Synthetic eight station faces", tiles: [raster("chem_station_top", 32, 219), ...keys.map((key, i) => raster(key, i % 2 ? 32 : 16, 40 + i * 23))] };
  const genericBytes = Buffer.from(JSON.stringify(generic)), specificBytes = Buffer.from(JSON.stringify(specific));
  // Preserve exact imported bytes for independent raw-content review; these are not native images.
  await fs.writeFile(info.outputPath("synthetic-generic16.json"), genericBytes);
  await fs.writeFile(info.outputPath("synthetic-generic32-specific-eight.json"), specificBytes);
  await open();
  const originalIcons = await icons(), original = await pixels("chem_station_top");
  const totalTextureCount = (await state()).count;
  expect(totalTextureCount).toBeGreaterThanOrEqual(833);
  for (const key of keys) expect(await pixels(key)).toEqual(original);
  await choose(genericBytes, "synthetic-generic16.json");
  await expect(page.getByRole("button", { name: "Use pack", exact: true })).toBeVisible();
  expect((await state()).selected).toBeNull(); // Preview is staged, not applied.
  await press(page.getByRole("button", { name: "Use pack", exact: true }));
  await expect(page.locator(".pack-current")).toHaveText(`Current: ${generic.name}`);
  const genericState = await state();
  expect(genericState.selected?.contentSha256).toBe(sha(genericBytes));
  expect(genericState.report.directAppliedKeys).toEqual(["chem_station_top"]);
  expect(genericState.report.inheritedAppliedKeys.map(v => v.key).sort()).toEqual([...keys].sort());
  expect(genericState.report.inheritedAppliedKeys.every(v => v.fromKey === "chem_station_top")).toBe(true);
  expect(genericState.report.appliedKeys).toHaveLength(9);
  await expect(page.locator(".pack-coverage")).toContainText(`9 of ${totalTextureCount} textures replaced`);
  await press(page.locator(".pack-details summary"));
  await expect(page.locator(".pack-details")).toContainText("Images supplied: 1. Textures replaced directly: 1. Station faces using the shared image: 8.");
  for (const key of ["chem_station_top", ...keys]) await assertRaster(key, generic.tiles[0]);
  const genericIcons = await icons();
  genericIcons.forEach((icon, i) => expect(icon).not.toBe(originalIcons[i]));
  await snap(page, info, "station-generic-one-source-nine-effective");
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  expect((await state()).selected).toEqual(genericState.selected);
  for (const key of keys) await assertRaster(key, generic.tiles[0]);
  await open();
  await choose(specificBytes, "synthetic-generic32-specific-eight.json");
  await expect(page.getByRole("button", { name: "Use pack", exact: true })).toBeVisible();
  expect((await state()).selected).toEqual(genericState.selected);
  await press(page.getByRole("button", { name: "Use pack", exact: true }));
  await expect(page.locator(".pack-current")).toHaveText(`Current: ${specific.name}`);
  const specificState = await state();
  expect(specificState.selected?.contentSha256).toBe(sha(specificBytes));
  expect(specificState.tileSize).toBe(32);
  expect(specificState.report.directAppliedKeys).toHaveLength(9);
  expect(specificState.report.inheritedAppliedKeys).toEqual([]);
  expect(specificState.report.source32Count).toBe(5);
  expect(specificState.report.source16Count).toBe(totalTextureCount - 5);
  expect(specificState.report.expanded16To32Count).toBe(totalTextureCount - 5);
  for (const tile of specific.tiles) await assertRaster(tile.key, tile);
  const specificIcons = await icons();
  specificIcons.forEach((icon, i) => { expect(icon).not.toBe(genericIcons[i]); expect(icon).not.toBe(originalIcons[i]); });
  await press(page.locator(".pack-details summary"));
  await expect(page.locator(".pack-details")).toContainText("Images supplied: 9. Textures replaced directly: 9. Station faces using the shared image: 0.");
  await snap(page, info, "station-specific-priority-source16-and32-icons");
  // One malformed specific raster rejects the WHOLE candidate, preserving current atlas and icons.
  await choose(Buffer.from(JSON.stringify({ ...specific, name: "Must reject whole candidate", tiles: [generic.tiles[0], { ...specific.tiles[1], rgbaBase64: "AAAA" }] })), "invalid-specific.json");
  await expect(page.locator(".pack-status")).toContainText("could not be opened");
  expect(await state()).toEqual(specificState); expect(await icons()).toEqual(specificIcons);
  expect(await page.evaluate(() => localStorage.getItem("craft.save.v1"))).toBe(untouched);
  await press(page.getByRole("button", { name: "Use original textures", exact: true }));
  await expect(page.locator(".pack-current")).toHaveText("Current: Original textures");
  expect(await icons()).toEqual(originalIcons);
  for (const key of keys) expect(await pixels(key)).toEqual(original);
  // Reapply after reset to exercise the atlas-keyed icon cache, then cold reload the raw v1 record.
  await choose(specificBytes, "synthetic-eight-reapply.json");
  await expect(page.getByRole("button", { name: "Use pack", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: "Use pack", exact: true }));
  await expect(page.locator(".pack-current")).toHaveText(`Current: ${specific.name}`);
  expect(await icons()).toEqual(specificIcons);
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  expect((await state()).selected).toEqual(specificState.selected);
  const storedBytes = await page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const request = indexedDB.open("craft.local-textures.v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction("selection", "readonly"), get = tx.objectStore("selection").get("active"); get.onsuccess = () => resolve(Array.from(new Uint8Array(get.result.bytes))); get.onerror = () => reject(get.error); tx.oncomplete = () => db.close(); };
  }));
  expect(Buffer.from(storedBytes)).toEqual(specificBytes);
  for (const tile of specific.tiles) await assertRaster(tile.key, tile);
  await press(page.getByRole("button", { name: /Continue/ }));
  await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2));
  const gpu = await page.evaluate(() => {
    const g = window.__craft.game!, a = window.__craft.atlas;
    const renderer = g.renderer as unknown as { atlasTexture: { image: { data: unknown; width: number; height: number } } };
    const drops = (g as unknown as { worldDropsView: { texture: { image: { data: unknown } } } }).worldDropsView;
    return { sameWorldData: renderer.atlasTexture.image.data === a.data, sameDropData: drops.texture.image.data === a.data, width: renderer.atlasTexture.image.width, height: renderer.atlasTexture.image.height };
  });
  expect(gpu).toEqual({ sameWorldData: true, sameDropData: true, width: 1024, height: 1024 });
  for (const station of stations) await command(page, `/give ${station}`);
  await command(page, "/gamemode creative");
  expect(await page.evaluate(() => window.__craft.game!.inventory.slots.slice(0, 4).map(s => s?.id))).toEqual([44, 45, 46, 47]);
  // Terrain-only fixture: clear bounded air and four temporary stone supports, never set a station.
  await page.evaluate(() => {
    const w = window.__craft.game!.world;
    for (let x = -3; x <= 16; x++) for (let z = -5; z <= 5; z++) for (let y = 40; y <= 49; y++) w.setBlock(x, y, z, 0);
    for (let i = 0; i < 4; i++) w.setBlock(i * 4, 44, 0, window.__craft.blockId("stone"));
  });
  if (mobile) await press(page.getByRole("button", { name: "Toggle flying", exact: true })); else await doubleTapSpace(page);
  await expect.poll(() => page.evaluate(() => window.__craft.game!.body.flying)).toBe(true);
  // Observe native delivered pointer timestamps without changing controls or the input frame.
  await page.evaluate(() => {
    const w = window as unknown as { __stationPointerEvents: unknown[] };
    w.__stationPointerEvents = [];
    for (const type of ["pointerdown", "pointerup", "pointercancel"]) window.addEventListener(type, event => {
      const e = event as PointerEvent;
      w.__stationPointerEvents.push({ type, timeStamp: e.timeStamp, pointerId: e.pointerId, pointerType: e.pointerType, x: e.clientX, y: e.clientY, target: (e.target as HTMLElement)?.className });
    }, true);
  });
  let useSequence = 0;
  const interactionState = () => page.evaluate(() => {
    const g = window.__craft.game!;
    return { body: structuredClone(g.body), target: structuredClone(g.targetBlock), held: structuredClone(g.inventory.selectedStack()), paused: g.paused, events: (window as unknown as { __stationPointerEvents: unknown[] }).__stationPointerEvents };
  });
  const use = async () => {
    const sequence = ++useSequence, before = await interactionState();
    try {
      if (!mobile) await pressMouse(page, "right");
      else {
        // Native quick tap, with no extra page/RPC wait inflating the contact into a hold.
        const vp = page.viewportSize()!;
        await nativePageWorldTap(page, vp.width * .65, vp.height * .45);
      }
      await frames(page);
    } finally {
      await fs.writeFile(info.outputPath(`station-use-${sequence}.json`), JSON.stringify({ sequence, before, after: await interactionState(), fixture: "Read-only probes surrounding actual mouse or native Playwright touchscreen tap. No control/outcome writes." }, null, 2));
    }
  };
  const observed: unknown[] = [];
  for (const [i, station] of stations.entries()) {
    const x = i * 4;
    await command(page, `/tp ${x + .5} 46 ${3}`);
    if (mobile) await page.locator(`.hotbar .slot[data-slot="${i}"]`).tap(); else await page.keyboard.press(`Digit${i + 1}`);
    if (!mobile) await parkMouse(page);
    await aimAtTop(page, x, 44, 0);
    expect(await target(page)).toMatchObject({ x, y: 44, z: 0, normal: { x: 0, y: 1, z: 0 } });
    await use();
    await expect.poll(() => blockAt(page, x, 45, 0)).toBe(44 + i);
    await aimAtTop(page, x, 45, 0); await frames(page);
    expect(await target(page)).toMatchObject({ x, y: 45, z: 0, id: 44 + i, normal: { x: 0, y: 1, z: 0 } });
    await snap(page, info, `${station}-specific-top-real-placement`);
    await use(); await expect(page.locator(".inventory-screen")).toBeVisible();
    const heading = await page.locator(".inventory-screen").innerText();
    expect(heading.toLowerCase()).toContain(station.replaceAll("_", " "));
    await snap(page, info, `${station}-opened-through-real-use`);
    await press(page.getByRole("button", { name: "Close inventory", exact: true }));
    // Remove only the temporary terrain support to expose the placed station's bottom face.
    await page.evaluate(px => window.__craft.game!.world.setBlock(px, 44, 0, 0), x);
    await command(page, `/tp ${x + .5} 42.5 2`);
    if (!mobile) await parkMouse(page);
    await page.evaluate(px => {
      const b = window.__craft.game!.body, dx = px + .5 - b.position.x, dz = .5 - b.position.z, dy = 45.02 - (b.position.y + 1.62);
      b.yaw = Math.atan2(-dx, -dz); b.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }, x);
    const bottom = await target(page);
    expect(bottom).toMatchObject({ x, y: 45, z: 0, id: 44 + i, normal: { x: 0, y: -1, z: 0 } });
    await snap(page, info, `${station}-specific-bottom-exposed-flying`);
    observed.push({ station, id: 44 + i, x, y: 45, z: 0, heading, bottom, body: await page.evaluate(() => structuredClone(window.__craft.game!.body)) });
  }
  await quit();
  const rawSave = await page.evaluate(() => localStorage.getItem("craft.save.v1"));
  await fs.writeFile(info.outputPath("station-world-save.json"), rawSave!);
  await page.reload(); await expect(page.getByRole("heading", { name: "AgentFlow Craft" })).toBeVisible();
  expect((await state()).selected).toEqual(specificState.selected);
  await press(page.getByRole("button", { name: /Continue/ }));
  await expect.poll(() => page.evaluate(() => !!window.__craft.game)).toBe(true);
  for (let i = 0; i < 4; i++) expect(await blockAt(page, i * 4, 45, 0)).toBe(44 + i);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await fs.writeFile(info.outputPath("station-texture-evidence.json"), JSON.stringify({ fixtures: "Only original synthetic RGBA; terrain-only bounded air/support fixture and removal; real chat give/tp, camera-only aim, creative flying input, real mouse/touch placement and station use, real Save & Quit/Continue. No station/world save outcomes injected. Native fidelity and performance untested.", genericSha256: sha(genericBytes), specificSha256: sha(specificBytes), storedRawSha256: sha(Buffer.from(storedBytes)), genericState, specificState, originalIcons, genericIcons, specificIcons, gpu, observed, saveSha256: sha(Buffer.from(rawSave!)), errors }, null, 2));
  expect(errors).toEqual([]);
}
