import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, type CDPSession, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Inventory, blockId, createAgent, serializeSave, stackId, type BlockEdit, type SaveData } from "@craft/engine";
import { command, snap, waitForTerrain } from "./helpers";

/** Prior-owned portal/pad/bags fixture, not survival acquisition or ignition evidence.
 * Real keyboard/touch joystick enters the source; real Main handles dwell/travel.
 * Return uses disclosed chat /tp into the existing destination portal, followed by
 * real dwell. No runtime direct travel API, pose, timer or health mutation. */
function fixture(): SaveData {
  const cells = new Map<string, BlockEdit>();
  const put = (x: number, y: number, z: number, id: number) => cells.set(`${x},${y},${z}`, [x, y, z, id]);
  for (let x = -4; x <= 5; x++) for (let z = -4; z <= 5; z++) {
    put(x, 79, z, blockId("stone")); for (let y = 80; y <= 84; y++) put(x, y, z, 0);
  }
  for (let x = 0; x < 2; x++) {
    put(x, 79, 0, blockId("obsidian")); put(x, 83, 0, blockId("obsidian"));
    for (let y = 80; y < 83; y++) put(x, y, 0, 192);
  }
  for (let y = 80; y < 83; y++) { put(-1, y, 0, blockId("obsidian")); put(2, y, 0, blockId("obsidian")); }
  const inventory = new Inventory();
  inventory.slots[0] = { id: stackId("diamond_pickaxe"), count: 1, damage: 7 };
  inventory.slots[1] = { id: stackId("stone"), count: 32 };
  inventory.slots[2] = { id: stackId("nether_wart"), count: 3 };
  const agent = createAgent(3, 80, 3); agent.slots[0] = { id: stackId("stone"), count: 5 };
  agent.slots[26] = { id: stackId("blaze_powder"), count: 2 }; agent.selected = 26;
  return { version: 1, name: "Scoped portal travel fixture", seed: 7, generatorVersion: 2,
    mode: "survival", timeOfDay: .25, player: { position: { x: .5, y: 80, z: 3.5 }, yaw: 0, pitch: 0, flying: false },
    inventory: inventory.toJSON(), agent, programs: [], edits: [...cells.values()],
    portals: { version: 1, records: [{ axis: "x", x: 0, y: 80, z: 0, width: 2, height: 3 }] },
    gamerules: { doMobSpawning: false, doDaylightCycle: false, keepInventory: false } };
}
async function sourceManifest() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const entries: Record<string, string> = {};
  async function walk(relative: string): Promise<void> {
    const children = await fs.readdir(path.join(root, relative), { withFileTypes: true }) as Array<{name:string;isDirectory():boolean;isFile():boolean}>;
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.posix.join(relative, child.name);
      if (child.isDirectory()) await walk(name);
      else if (child.isFile()) entries[name] = createHash("sha256").update(await fs.readFile(path.join(root, name))).digest("hex");
    }
  }
  for (const dir of ["apps/web/src", "packages/engine/src", "packages/textures/src", "packages/input/src"]) await walk(dir);
  for (const file of ["nether-travel.ts", "desktop-nether-travel.spec.ts", "mobile-nether-travel.spec.ts", "helpers.ts"]) {
    const name = `apps/web/e2e/${file}`; entries[name] = createHash("sha256").update(await fs.readFile(path.join(root, name))).digest("hex");
  }
  return { root, localBase: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), entries,
    manifestSha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex") };
}
export async function netherTravelRoute(page: Page, info: TestInfo, mobile: boolean) {
  const before = await sourceManifest(), initial = fixture(), rawFixture = serializeSave(initial);
  const errors: string[] = [], observations: unknown[] = [], rawSaves: Record<string, string> = {};
  let stage = "load-prior-owned-fixture", failure: string | null = null, finger: CDPSession | null = null;
  const press = (locator: Locator) => mobile ? locator.tap() : locator.click();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const read = () => page.evaluate(() => {
    const g = window.__craft.game!;
    return { dimension: g.world.dimension, seed: g.world.seed, generatorVersion: g.world.generatorVersion,
      inventory: g.inventory.toJSON(), agent: structuredClone(g.agent), position: { ...g.body.position },
      portals: g.world.portals.exportState(), edits: g.world.exportEdits(), fireballs: g.mobs.exportFireballs(),
      loadErrors: [...g.loadErrors], rawStorage: localStorage.getItem("craft.save.v1") };
  });
  const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
  const sameBags = (value: Awaited<ReturnType<typeof read>>) => {
    expect(value.inventory).toEqual(initial.inventory); expect(value.agent.slots).toHaveLength(27);
    expect(value.agent.slots).toEqual(initial.agent!.slots); expect(value.agent.selected).toBe(initial.agent!.selected); expect(value.loadErrors).toEqual([]);
  };
  const quit = async (label: string) => {
    if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
    await expect(page.locator(".pause-screen")).toBeVisible(); await press(page.getByRole("button", { name: "Save & Quit to Title" }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("craft.save.v1")); expect(raw).not.toBeNull(); rawSaves[label] = raw!;
    return JSON.parse(raw!) as SaveData;
  };
  const resume = async () => { await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); };
  try {
    await page.goto("/"); await page.evaluate(raw => { localStorage.clear(); localStorage.setItem("craft.save.v1", raw); }, rawFixture);
    await page.reload(); await resume(); const source = await record("source-frame-and-global-bags"); sameBags(source);
    expect(source.dimension).toBe("overworld"); await snap(page, info, "nether-travel-01-source-frame");
    stage = "actual-forward-input-into-source-portal";
    if (mobile) {
      await expect(page.locator(".touch-stick-base")).toBeVisible(); const box = await page.locator(".touch-stick-base").boundingBox(); expect(box).not.toBeNull();
      const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2; finger = await page.context().newCDPSession(page);
      try {
        await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 161 }] });
        await finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 60, id: 161 }] });
        await expect.poll(() => page.evaluate(() => window.__craft.game!.body.position.z), { timeout: 45_000, intervals: [50] }).toBeLessThan(1.2);
      } finally { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
    } else {
      try { await page.keyboard.down("KeyW"); await expect.poll(() => page.evaluate(() => window.__craft.game!.body.position.z), { timeout: 45_000, intervals: [50] }).toBeLessThan(1.2); }
      finally { await page.keyboard.up("KeyW"); }
    }
    const contact = await record("actual-input-stopped-in-source-contact"); expect(contact.position.z).toBeLessThan(source.position.z - 1);
    expect(contact.position.x).toBeGreaterThan(-.2); expect(contact.position.x).toBeLessThan(1.2);
    stage = "actual-source-dwell-and-Main-Nether-handoff";
    await page.waitForFunction(() => window.__craft.game?.world.dimension === "nether", undefined, { timeout: 120_000 });
    await waitForTerrain(page); const nether = await record("actual-Nether-after-Main-publication"); sameBags(nether);
    expect(nether.generatorVersion).toBe(1); expect(nether.portals.records).toHaveLength(1); await snap(page, info, "nether-travel-02-nether-arrival");
    stage = "Nether-save-quit-cold-restore";
    const savedNether = await quit("nether-after-entry"); expect(savedNether.dimensions?.active).toBe("nether");
    expect(savedNether.dimensions?.inactive.overworld?.portals?.records).toHaveLength(1); expect(savedNether.dimensions?.links).toHaveLength(1);
    await resume(); const coldNether = await record("cold-Nether-bags-and-owner"); sameBags(coldNether); expect(coldNether.dimension).toBe("nether");
    expect(coldNether.portals).toEqual(nether.portals); await snap(page, info, "nether-travel-03-cold-nether");
    stage = "disclosed-chat-navigation-into-owned-Nether-frame";
    const frame = coldNether.portals.records[0]; await command(page, `/tp ${frame.x + .5} ${frame.y} ${frame.z + .5}`);
    await record("actual-chat-tp-before-return-dwell"); stage = "actual-Nether-dwell-and-Main-Overworld-return";
    await page.waitForFunction(() => window.__craft.game?.world.dimension === "overworld", undefined, { timeout: 120_000 });
    await waitForTerrain(page); const returned = await record("actual-Overworld-after-Main-return"); sameBags(returned);
    expect(returned.generatorVersion).toBe(2); expect(returned.portals).toEqual(source.portals);
    expect(returned.edits.some(e => e[0] === 4 && e[1] === 79 && e[2] === 5 && e[3] === blockId("stone"))).toBe(true);
    await snap(page, info, "nether-travel-04-overworld-return"); stage = "Overworld-save-quit-cold-restore";
    const savedReturn = await quit("overworld-after-return"); expect(savedReturn.dimensions?.active).toBe("overworld");
    expect(savedReturn.dimensions?.inactive.nether?.portals?.records).toEqual(nether.portals.records); expect(savedReturn.dimensions?.links).toHaveLength(1);
    await resume(); const coldReturn = await record("cold-Overworld-bags-and-both-owners"); sameBags(coldReturn); expect(coldReturn.dimension).toBe("overworld");
    expect(coldReturn.portals).toEqual(source.portals); await snap(page, info, "nether-travel-05-cold-overworld");
    await quit("overworld-final-proof"); expect(errors).toEqual([]);
  } catch (error) { failure = String(error); throw error; }
  finally {
    try { await page.keyboard.up("KeyW"); } catch { /* Retain original failure if browser closed. */ }
    if (finger) try { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await finger.detach(); } catch { /* Retain original failure. */ }
    const after = await sourceManifest();
    const proof = { stage, failure, mobile, project: info.project.name, viewport: page.viewportSize(),
      fixture: { sha256: createHash("sha256").update(rawFixture).digest("hex"), raw: rawFixture,
        qualification: "Prior-owned live portal/pad/bags fixture. No acquisition, ignition, native calibration or full Education claim. First entry uses actual KeyW or CDP touch joystick. Return navigation is real chat /tp into an owned frame, not direct travel. No runtime pose/health/timer mutation." },
      testedSourceBefore: before, testedSourceAfter: after, sourceUnchanged: before.manifestSha256 === after.manifestSha256,
      observations, rawSaves, errors, browserVersion: page.context().browser()?.version() ?? null,
      coverage: ["actual desktop KeyW or mobile joystick entry", "real contact/dwell/Main preparation/handoff", "Nether cold restore", "return contact/dwell after disclosed chat navigation", "Overworld cold restore", "global inventory and Agent27 slots", "one link and both partitions"],
      uncovered: ["survival acquisition/ignition", "crossrealm death/respawn", "Blaze combat", "brewing", "full Education and native graphics parity", "native timing/search calibration"] };
    const file = info.outputPath("nether-travel-proof.json"); await fs.writeFile(file, JSON.stringify(proof, null, 2) + "\n");
    await info.attach("nether-travel-proof", { path: file, contentType: "application/json" }); expect(proof.sourceUnchanged).toBe(true);
  }
}
