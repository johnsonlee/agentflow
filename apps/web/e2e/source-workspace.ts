import { expect, type CDPSession, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import { Inventory, createAgent, serializeSave, type CodeProgram, type CodeWorkspaceData, type SaveData } from "@craft/engine";
import { waitForTerrain } from "./helpers";

/** Each world starts with one disclosed raw fixture. After Continue all changes are UI actions. */
export async function sourceWorkspaceRoute(page: Page, info: TestInfo, mobile: boolean, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  const label = mobile ? (size.width < size.height ? "portrait" : "landscape") : "desktop";
  const output = (name: string) => info.outputPath(`${label}-${name}`);
  const press = (node: Locator) => mobile ? node.tap() : node.click();
  const code = page.locator(".code-screen"), panel = code.locator(".code-panel");
  const source = () => code.getByRole("textbox", { name: "Source code", exact: true });
  const name = () => code.getByRole("textbox", { name: "New program name", exact: true });
  const language = () => code.getByRole("combobox", { name: "Code language", exact: true });
  const phases: unknown[] = [], rawSaves: Record<string, string> = {}, diagnosticVisibility: unknown[] = [], coldGeometry: unknown[] = [], pans: unknown[] = [], errors: string[] = [];
  let stage = "initial", failure: string | null = null, finger: CDPSession | null = null;
  const error = (value: Error) => errors.push(value.message); page.on("pageerror", error);
  const jsInvalid = '<img src=x onerror="window.__sourceWorkspaceProbe=1">\n\u0000agent.move(FORWARD, steps);';
  const jsInvalidName = "n".repeat(81), pyInvalid = 'import os\n\tprint("日本語")\n', pyName = "Python repair draft";
  const longSource = "agent.place(UP);\n//" + "x".repeat(17000), longName = "Long compiler-invalid draft";
  const tooLarge = "//" + "Q".repeat(65536), repairedSource = "agent.place(UP);\nagent.destroy(UP);", repairedName = "Restored finite source";
  const old: CodeProgram = { name: "Old retained", trigger: { type: "chat", command: "old" }, blocks: [{ type: "command", cmd: { op: "turn", side: "left" } }] };
  const workspace = (js: string, jsName: string, active: "javascript" | "python"): CodeWorkspaceData => ({ version: 1, language: active, drafts: { javascript: { source: js, name: jsName }, python: { source: pyInvalid, name: pyName } } });
  const read = () => page.evaluate(() => {
    const g = window.__craft.game!;
    return { agent: structuredClone(g.agent), bag: g.inventory.toJSON(), programs: structuredClone(g.programs), target: g.world.getLoadedBlock(8, 81, 8), drops: g.worldDrops.toJSON(), running: g.programRunning, loadErrors: [...g.loadErrors], saveError: g.saveError, raw: localStorage.getItem("craft.save.v1"), probe: (window as unknown as { __sourceWorkspaceProbe?: number }).__sourceWorkspaceProbe ?? null };
  });
  const ui = async () => await code.isVisible() && await source().count() ? { language: await language().inputValue(), source: await source().inputValue(), name: await name().inputValue(), maxlength: await source().getAttribute("maxlength") } : null;
  const phase = async (value: string) => { stage = value; phases.push({ label: value, state: await read(), ui: await ui() }); };
  const snap = (value: string) => page.screenshot({ path: output(value + ".png") });
  const ground = (s: Awaited<ReturnType<typeof read>>) => s.drops.records.reduce((n, r) => n + (r.stack.id === 4 ? r.stack.count : 0), 0);
  const untouched = (s: Awaited<ReturnType<typeof read>>) => {
    expect(s.agent.slots[0]).toEqual({ id: 3, count: 2 }); expect(s.agent.facing).toBe(2); expect(s.programs).toEqual([old]);
    expect(s.target).toBe(0); expect(ground(s)).toBe(0); expect(s.bag.slots.every(x => x === null)).toBe(true); expect(s.running).toBe(false); expect(s.loadErrors).toEqual([]); expect(s.probe).toBeNull();
  };
  const open = async () => {
    if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("KeyK");
    await expect(code).toBeVisible(); await press(code.getByRole("button", { name: "Create program from code", exact: true })); await expect(source()).toBeVisible();
  };
  const close = async () => { await press(code.getByRole("button", { name: "Close Code Builder", exact: true })); await expect(code).toBeHidden(); };
  const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
  // Nearest-edge automation can stop at a fractional clipped edge. Prove that a
  // user can reveal each control with wheel/touch input, then keep ratio=1.
  const revealColdControl = async (control: Locator, checkpoint: string, key: string) => {
    await control.scrollIntoViewIfNeeded();
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await control.evaluate(e => {
        const r = e.getBoundingClientRect(), p = e.closest(".code-panel")! as HTMLElement, b = p.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, panelTop: b.top + p.clientTop + 8, panelBottom: b.top + p.clientTop + p.clientHeight - 8, scrollTop: p.scrollTop };
      });
      if (before.top >= before.panelTop && before.bottom <= before.panelBottom) return;
      const box = (await panel.boundingBox())!, delta = before.top < before.panelTop ? Math.max(30, before.panelTop - before.top) : Math.min(-30, before.panelBottom - before.bottom);
      const shift = Math.max(-box.height * .3, Math.min(box.height * .3, delta));
      if (mobile) {
        finger = await page.context().newCDPSession(page); const x = box.x + 5, y = box.y + box.height / 2;
        try {
          await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 204 }] });
          for (let i = 1; i <= 8; i++) { await finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + shift * i / 8, id: 204 }] }); await page.waitForTimeout(18); }
          await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } finally { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {}); await finger.detach(); finger = null; }
      } else { await page.mouse.move(box.x + 5, box.y + box.height / 2); await page.mouse.wheel(0, -shift); }
      await page.waitForTimeout(200);
      const after = await control.evaluate(e => { const r = e.getBoundingClientRect(), p = e.closest(".code-panel")!; return { top: r.top, bottom: r.bottom, scrollTop: p.scrollTop }; });
      pans.push({ checkpoint, key, attempt, before, after, shift, method: mobile ? "actual CDP touch on panel padding; no DOM scroll writes" : "actual mouse wheel on panel padding; no DOM scroll writes" });
    }
  };
  const cold = async (file: string, expected: CodeWorkspaceData, programs: CodeProgram[]) => {
    await close(); await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title", exact: true }));
    await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("craft.save.v1")!); rawSaves[file] = raw; await fs.writeFile(output(file + ".json"), raw);
    const saved = JSON.parse(raw) as SaveData; expect(saved.codeWorkspace).toEqual(expected); expect(saved.programs).toEqual(programs);
    for (const partition of Object.values(saved.dimensions?.inactive ?? {})) expect(partition).not.toHaveProperty("codeWorkspace");
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); await open();
    expect(JSON.parse((await read()).raw!).codeWorkspace).toEqual(expected); await expect(language()).toHaveValue(expected.language); await expect(source()).toHaveValue(expected.drafts[expected.language].source); await expect(name()).toHaveValue(expected.drafts[expected.language].name);
    for (const [key, control] of [["language", language()], ["name", name()], ["source", source()]] as const) {
      await revealColdControl(control, file, key); await expect(control).toBeInViewport({ ratio: 1 });
      const fact = await control.evaluate(e => { const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, font: parseFloat(getComputedStyle(e).fontSize), uncovered: hit === e || !!hit && e.contains(hit) }; });
      expect(fact.rect.width).toBeGreaterThanOrEqual(44); expect(fact.rect.height).toBeGreaterThanOrEqual(44); expect(fact.font).toBeGreaterThanOrEqual(16); expect(fact.uncovered).toBe(true); coldGeometry.push({ checkpoint: file, key, viewport: size, ...fact });
      if (key === "name") await snap(file + "-cold-restored-name-language");
    }
  };
  const visibleDiagnostic = async () => {
    const alert = code.getByRole("alert"); await expect(alert).toBeInViewport({ ratio: 1 });
    const fact = await alert.evaluate(e => {
      const r = e.getBoundingClientRect(), p = e.closest(".code-panel")!.getBoundingClientRect(), f = e.closest(".code-panel")!.querySelector(".cb-import-actions")!.getBoundingClientRect();
      const points = [{ x: r.x + Math.min(8, r.width / 2), y: r.y + Math.min(8, r.height / 2) }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, { x: r.x + Math.min(8, r.width / 2), y: r.bottom - Math.min(5, r.height / 2) }];
      return { message: e.textContent, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, panel: { x: p.x, y: p.y, width: p.width, height: p.height }, insideViewport: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, insidePanel: r.top >= p.top && r.bottom <= p.bottom, footerOverlapArea: Math.max(0, Math.min(r.right, f.right) - Math.max(r.left, f.left)) * Math.max(0, Math.min(r.bottom, f.bottom) - Math.max(r.top, f.top)), hits: points.map(v => { const hit = document.elementFromPoint(v.x, v.y); return { ...v, uncovered: hit === e || !!hit && e.contains(hit) }; }) };
    });
    expect(fact.insideViewport).toBe(true); expect(fact.insidePanel).toBe(true); expect(fact.footerOverlapArea).toBe(0); expect(fact.hits.every(p => p.uncovered)).toBe(true); diagnosticVisibility.push(fact);
  };
  const pan = async () => {
    const box = (await panel.boundingBox())!, stats = () => panel.evaluate(e => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight })); const before = await stats(); expect(before.max).toBeGreaterThan(20);
    finger = await page.context().newCDPSession(page); const x = box.x + 5, from = box.y + box.height * .8, to = box.y + box.height * .25;
    const swipe = async (reverse: boolean) => { const start = reverse ? to : from, end = reverse ? from : to; await finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: start, id: 203 }] }); for (let i = 1; i <= 8; i++) { await finger!.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: start + (end - start) * i / 8, id: 203 }] }); await page.waitForTimeout(18); } await finger!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await page.waitForTimeout(180); };
    try { if (before.max - before.top < 20) await swipe(true); const start = await stats(); await swipe(false); const after = await stats(); expect(after.top - start.top).toBeGreaterThan(5); pans.push({ start, after, delta: after.top - start.top, method: "actual CDP touch on panel padding; no DOM scroll writes" }); }
    finally { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {}); await finger.detach(); finger = null; }
  };
  try {
    const edits: [number, number, number, number][] = []; for (let x = 0; x <= 15; x++) for (let z = 0; z <= 15; z++) { edits.push([x, 79, z, 3]); for (let y = 80; y <= 85; y++) edits.push([x, y, z, 0]); }
    const agent = createAgent(8, 80, 8, 2); agent.slots[0] = { id: 3, count: 2 };
    const initial: SaveData = { version: 1, name: "Source workspace " + label, seed: 17, generatorVersion: 3, mode: "survival", timeOfDay: .25, player: { position: { x: 6.5, y: 80, z: 12.5 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), playerState: { health: 20 }, agent, programs: [old], edits, mobs: { nextId: 1, records: [] }, gamerules: { doMobSpawning: false, doDaylightCycle: false } };
    const raw = serializeSave(initial); await fs.writeFile(output("initial-finiteStone2-oldAST-platform.json"), raw); await page.goto("/"); await page.evaluate(value => { localStorage.clear(); localStorage.setItem("craft.save.v1", value); }, raw); await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); untouched(await read()); await phase("initial-finiteStone2-oldAST-no-workspace");
    await open(); await source().fill("agent.turn(LEFT_TURN);"); await name().fill(jsInvalidName); await press(code.getByRole("button", { name: "Create block program", exact: true })); await expect(code.getByRole("alert")).toContainText("80 characters"); await visibleDiagnostic(); untouched(await read()); await phase("invalid-name-refused-no-new-AST-or-Run");
    await source().fill(jsInvalid); await language().selectOption("python"); await source().fill(pyInvalid); await name().fill(pyName); await press(code.getByRole("button", { name: "Create block program", exact: true })); await expect(code.getByRole("alert")).toContainText("Line 2, column 1: Python indentation must use spaces, not tabs"); await visibleDiagnostic(); untouched(await read()); await phase("both-invalid-drafts-are-data-no-owner-change");
    await cold("invalid-two-language-drafts-world-save", workspace(jsInvalid, jsInvalidName, "python"), [old]); untouched(await read()); await language().selectOption("javascript"); await expect(source()).toHaveValue(jsInvalid); await expect(name()).toHaveValue(jsInvalidName); expect(await code.locator("img").count()).toBe(0); if (mobile) await pan(); await snap("cold-invalid-plaintext-name81-NUL"); await phase("cold-invalid-drafts-and-language-restored-inert");
    await source().fill(longSource); await name().fill(longName); await press(code.getByRole("button", { name: "Create block program", exact: true })); await expect(code.getByRole("alert")).toContainText("16384 UTF-8 bytes"); await visibleDiagnostic(); await expect(source()).toHaveValue(longSource); expect(await source().getAttribute("maxlength")).toBeNull(); untouched(await read()); await snap("compiler-refused-17K-source-retained"); await phase("17K-source-refused-by-compiler-but-storable");
    await cold("17K-compiler-refused-source-world-save", workspace(longSource, longName, "javascript"), [old]); untouched(await read()); await phase("cold-17K-source-exact-without-compile-or-Run");
    await source().fill(tooLarge); await name().fill("Too large RAM draft"); await expect(source()).toHaveValue(tooLarge); await expect(code.locator(".cb-import-note").filter({ hasText: "Source drafts exceed storage limits" })).toBeAttached(); await close(); await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title", exact: true })); await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".pause-screen").getByRole("alert")).toContainText("Shorten or copy"); const refused = await read(); untouched(refused); expect(JSON.parse(refused.raw!).codeWorkspace).toEqual(workspace(longSource, longName, "javascript")); await fs.writeFile(output("oversize-refused-last-persistable-workspace.json"), refused.raw!); await phase("oversize-RAM-quit-refused-last-persistable-draft-kept");
    await press(page.getByRole("button", { name: "Back to Game", exact: true })); await open(); await expect(source()).toHaveValue(tooLarge); expect(await source().getAttribute("maxlength")).toBeNull(); untouched(await read()); await snap("reopened-oversize-not-truncated"); await phase("oversize-source-still-exact-in-session-for-repair");
    await source().fill(repairedSource); await name().fill(repairedName); untouched(await read()); await phase("repaired-valid-source-remains-private-no-auto-AST"); await cold("repaired-valid-source-world-save", workspace(repairedSource, repairedName, "javascript"), [old]); untouched(await read()); await snap("cold-valid-source-before-explicit-conversion"); await phase("cold-valid-source-does-not-auto-compile-or-run");
    await press(code.getByRole("button", { name: "Create block program", exact: true })); const converted = await read(); expect(converted.programs).toEqual([old, { name: repairedName, trigger: { type: "run" }, blocks: [{ type: "command", cmd: { op: "place", dir: "up" } }, { type: "command", cmd: { op: "destroy", dir: "up" } }] }]); expect(converted.agent.slots[0]).toEqual({ id: 3, count: 2 }); expect(ground(converted)).toBe(0); expect(converted.running).toBe(false); await snap("restored-source-converted-separate-Run"); await phase("explicit-conversion-adds-new-AST-without-auto-Run");
    await press(code.getByRole("button", { name: "▶ Run", exact: true })); await expect(code).toBeHidden(); await expect.poll(async () => (await read()).running).toBe(false); const ran = await read(); expect(ran.agent.slots[0]).toEqual({ id: 3, count: 1 }); expect(ground(ran)).toBe(1); expect(ran.target).toBe(0); expect(ran.programs[0]).toEqual(old); expect(ran.bag).toEqual(initial.inventory); await phase("explicit-Run-finiteStone1-groundCobble1-old-AST-retained");
    await open(); await cold("finite-post-Run-and-drafts-world-save", workspace(repairedSource, repairedName, "javascript"), converted.programs); const final = await read(); expect(final.agent.slots[0]).toEqual({ id: 3, count: 1 }); expect(ground(final)).toBe(1); expect(final.programs).toEqual(converted.programs); expect(final.running).toBe(false); expect(final.probe).toBeNull(); expect(final.loadErrors).toEqual([]); await snap("cold-final-source-and-finite-owners"); await phase("cold-finite-owners-and-both-source-drafts-retained"); expect(errors).toEqual([]); stage = "complete";
  } catch (e) { failure = e instanceof Error ? e.stack ?? e.message : String(e); throw e; }
  finally {
    if (finger) { await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {}); await finger.detach().catch(() => {}); }
    page.off("pageerror", error);
    await fs.writeFile(output("source-workspace-proof.json"), JSON.stringify({ stage, failure, mobile, viewport: size, label, phases, rawSaves, diagnosticVisibility, coldGeometry, pans, errors, finalReadback: await read().catch(e => ({ error: String(e) })), fixture: "Only one initial raw fixture per world: Agent Stone2, empty player bag, old chat AST and preowned platform. All typing, conversion/refusal, SaveQuit, repair, cold reload and explicit Run are browser UI. No afterstartup outcome/pose/world/Agent/program/storage writes.", storageSemantics: "Application world-owned drafts; invalid syntax/name/NUL/HTML remain inert text. 17K compiler-refused text remains storable. >64KiB RAM quit refuses without truncation, last persistable workspace kept. No native MakeCode project compatibility.", notCovered: ["Browser quota-exceeded/stale storage callback/mandatory death/corrupt-source backup are component checks, not this route", "Native project/runtime/API/SSO/classroom/full Education/native graphics/distribution parity", "No physical-phone or performance acceptance; mobile portrait/landscape are browser emulation", "Only tested controls/diagnostics and actual native touch pan, not all form content visible simultaneously"] }, null, 2));
  }
}
