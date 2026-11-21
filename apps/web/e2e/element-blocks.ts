import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { collectWorldDrops, aimAtTop, blockAt, command, countStack, createWorld, look, lookAtCell, parkMouse, player, pressMouse, snap, target, waitForTerrain } from "./helpers";

export async function elementBlockRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const touch = (type: "touchStart" | "touchEnd") => {
    const vp = page.viewportSize()!;
    return finger!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
  };
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const down = touch("touchStart");
    await new Promise((r) => setTimeout(r, 60));
    await Promise.all([down, touch("touchEnd")]);
  };
  const select = async (slot: number) => {
    if (mobile) await press(page.locator(`.hotbar [data-slot="${slot}"]`));
    else await page.keyboard.press(`Digit${slot + 1}`);
    await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(slot);
  };
  const pad = await page.evaluate(() => {
    const g = window.__craft.game!, p = g.body.position;
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y + .01) - 1, z0 = Math.floor(p.z);
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      g.world.setBlock(x0 + x, y0, z0 + z, window.__craft.blockId("stone"));
      for (let y = 1; y <= 3; y++) g.world.setBlock(x0 + x, y0 + y, z0 + z, 0);
    }
    return { x: x0, y: y0, z: z0 };
  });
  for (const item of ["element_constructor", "iron_pickaxe", "torch"]) await command(page, `/give ${item}`);
  if (!mobile) await parkMouse(page);
  await look(page, 0, -1.2); await target(page); await use();
  await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate(() => window.__craft.blockId("element_constructor")));
  await page.waitForTimeout(300); await use();
  await expect(page.getByRole("heading", { name: "Element Constructor" })).toBeVisible();
  const inv = page.locator(".inventory-screen");
  const atoms = [
    { p: 6, n: 6, name: "carbon", label: "Carbon", slot: 3, dx: -2, count: 2 },
    { p: 79, n: 118, name: "gold", label: "Gold", slot: 4, dx: 0, count: 3 },
    { p: 118, n: 176, name: "oganesson", label: "Oganesson", slot: 5, dx: 2, count: 2 },
  ];
  for (const atom of atoms) {
    for (const [name, value] of [["protons", atom.p], ["neutrons", atom.n], ["electrons", atom.p]] as const) {
      const field = inv.getByRole("spinbutton", { name, exact: true });
      await field.fill(String(value)); await field.blur();
    }
    await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", atom.label);
    for (let i = 0; i < atom.count; i++) await press(inv.locator('[data-chem-result]'));
    await press(inv.locator(`[data-slot="${atom.slot}"]`));
    expect(await countStack(page, atom.name)).toBe(atom.count);
  }
  await press(inv.locator('[data-slot="3"]')); await press(inv.locator('[data-element-lookup]'));
  await expect(inv.getByRole("spinbutton", { name: "protons", exact: true })).toHaveValue("6");
  await inv.getByRole("spinbutton", { name: "protons", exact: true }).scrollIntoViewIfNeeded();
  await snap(page, info, "element-lookup-disabled-values-readable");
  await press(inv.locator('[data-element-lookup]')); await press(inv.locator('[data-slot="3"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  await select(2); if (!mobile) await parkMouse(page);
  const torch = { x: pad.x - 3, y: pad.y + 1, z: pad.z + 2 };
  await aimAtTop(page, torch.x, torch.y - 1, torch.z); await target(page); await use();
  await expect.poll(() => blockAt(page, torch.x, torch.y, torch.z)).toBe(await page.evaluate(() => window.__craft.blockId("torch")));
  const plots = atoms.map((a) => ({ x: pad.x + a.dx, y: pad.y + 1, z: pad.z + 2 }));
  for (const [i, atom] of atoms.entries()) {
    await select(atom.slot); if (!mobile) await parkMouse(page);
    const p = plots[i];
    await aimAtTop(page, p.x, p.y - 1, p.z); await target(page); await page.waitForTimeout(300); await use();
    const id = await page.evaluate((z) => window.__craft.blockId(`element_${z}`), atom.p);
    expect(id).toBeGreaterThanOrEqual(32768);
    await expect.poll(() => blockAt(page, p.x, p.y, p.z)).toBe(id);
    expect(await countStack(page, atom.name)).toBe(atom.count - 1);
    await expect.poll(() => page.evaluate((at) => window.__craft.game!.world.getLight(at.x, at.y, at.z) & 15, p)).toBe(0);
  }
  // A two-high wall prevents mobile auto-jump from legitimately clearing the collision fixture.
  await select(4); if (!mobile) await parkMouse(page);
  const upperGold = { ...plots[1], y: plots[1].y + 1 };
  await aimAtTop(page, plots[1].x, plots[1].y, plots[1].z); await target(page); await page.waitForTimeout(300); await use();
  await expect.poll(() => blockAt(page, upperGold.x, upperGold.y, upperGold.z)).toBe(32847);
  expect(await countStack(page, "gold")).toBe(1);
  await command(page, "/give element_0");
  await select(0); if (!mobile) await parkMouse(page);
  const unknown = { x: pad.x + 3, y: pad.y + 1, z: pad.z - 2 };
  await aimAtTop(page, unknown.x, unknown.y - 1, unknown.z); await target(page); await use();
  await expect.poll(() => blockAt(page, unknown.x, unknown.y, unknown.z)).toBe(32768);
  await snap(page, info, "high-id-elements-rendered-as-cubes");
  if (!mobile) await parkMouse(page);
  await look(page, Math.PI, -.15);
  await snap(page, info, "constructed-element-cubes-carbon-gold-oganesson");
  // Move against the Gold cube with real keyboard/joystick input: a high ID must remain solid.
  if (!mobile) await parkMouse(page);
  await look(page, Math.PI, 0);
  if (mobile) {
    const box = (await page.locator(".touch-stick-base").boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 20 }] });
    for (let i = 1; i <= 6; i++) await finger!.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 12, id: 20 }] });
  } else await page.keyboard.down("KeyW");
  await expect.poll(async () => (await player(page)).z, { timeout: 20_000 }).toBeGreaterThan(pad.z + 1.5);
  await page.waitForTimeout(300);
  if (mobile) await touch("touchEnd"); else await page.keyboard.up("KeyW");
  const stopped = await player(page);
  expect(stopped.z).toBeGreaterThan(pad.z + 1.5);
  expect(stopped.z).toBeLessThan(pad.z + 1.71);
  await command(page, "/gamemode creative");
  if (mobile) {
    await press(page.getByRole("button", { name: "Open inventory" }));
    await press(inv.locator('[data-tab="elements"]'));
    await press(inv.locator('[data-block="gold"]'));
    await press(page.getByRole("button", { name: "Close inventory" }));
  } else {
    await parkMouse(page); await lookAtCell(page, plots[1].x, plots[1].y, plots[1].z); await target(page);
    await page.mouse.down({ button: "middle" }); await page.mouse.up({ button: "middle" });
  }
  await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selectedStack()?.id)).toBe(await page.evaluate(() => window.__craft.stackId("gold")));
  await command(page, "/gamemode survival");
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" })); await page.reload();
  await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
  for (const [i, atom] of atoms.entries()) expect(await blockAt(page, plots[i].x, plots[i].y, plots[i].z)).toBe(await page.evaluate((z) => window.__craft.blockId(`element_${z}`), atom.p));
  expect(await blockAt(page, upperGold.x, upperGold.y, upperGold.z)).toBe(32847);
  expect(await blockAt(page, unknown.x, unknown.y, unknown.z)).toBe(32768);
  await snap(page, info, "high-id-element-cubes-restored");
  await select(1);
  for (const p of [upperGold, ...plots, unknown]) {
    if (!mobile) await parkMouse(page);
    await lookAtCell(page, p.x, p.y, p.z); await expect.poll(() => target(page)).toMatchObject(p);
    if (mobile) await touch("touchStart"); else await page.mouse.down();
    await expect.poll(() => blockAt(page, p.x, p.y, p.z), { timeout: 20_000 }).toBe(0);
    if (mobile) await touch("touchEnd"); else await page.mouse.up();
    await collectWorldDrops(page); // Actual ground pickup through the chat/teleport fixture, then restore the pose.
  }
  for (const atom of atoms) expect(await countStack(page, atom.name)).toBe(atom.count);
  expect(await countStack(page, "element_0")).toBe(1);
  // The Agent builds and dismantles a high-ID Carbon cube, then returns the same base item IDs.
  await command(page, "/agent tp");
  const origin = await page.evaluate(() => { const a = window.__craft.game!.agent; return { x: a.x, y: a.y, z: a.z }; });
  expect(await blockAt(page, origin.x, origin.y, origin.z)).toBe(0);
  await page.evaluate((p) => {
    const w = window as unknown as { __elementLog: number[]; __stopElementLog: () => void };
    w.__elementLog = [];
    w.__stopElementLog = window.__craft.game!.world.onBlockChanged((x, y, z, id) => { if (x === p.x && y === p.y && z === p.z) w.__elementLog.push(id); });
  }, origin);
  await select(3);
  if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("k");
  await press(page.getByRole("button", { name: "Give held stack to Agent" }));
  await expect(page.locator(".cb-status")).toContainText("Gave the Agent 2 Carbon");
  for (const [type, dir] of [["move", "up"], ["place", "down"], ["destroy", "down"]]) {
    await press(page.locator(`[data-palette="${type}"]`));
    await page.locator(`.cb-block[data-type="${type}"] select[aria-label="Direction"]`).selectOption(dir);
  }
  await press(page.locator('[data-palette="drop"]'));
  await page.locator('.cb-block[data-type="drop"] select[aria-label="Direction"]').selectOption("down");
  await press(page.locator('[data-palette="move"]'));
  await page.locator('.cb-block[data-type="move"] select[aria-label="Direction"]').last().selectOption("down");
  await press(page.locator('[data-palette="collect"]'));
  await snap(page, info, "agent-high-id-element-program");
  await press(page.getByRole("button", { name: "▶ Run" }));
  await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __elementLog: number[] }).__elementLog)).toEqual([32774, 0]);
  await page.evaluate(() => (window as unknown as { __stopElementLog: () => void }).__stopElementLog());
  // Run closes Code Builder. The Agent now owns both the destroyed cube and its dropped remainder.
  await expect(page.locator(".code-screen")).toBeHidden();
  expect(await page.evaluate(() => window.__craft.game!.agent.slots.filter(Boolean))).toEqual([{ id: await page.evaluate(() => window.__craft.stackId("carbon")), count: 2 }]);
  expect(await countStack(page, "carbon")).toBe(0);
  if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("k");
  await press(page.getByRole("button", { name: "New", exact: true }));
  await press(page.locator('[data-palette="drop"]'));
  await press(page.getByRole("button", { name: "▶ Run" }));
  await expect(page.locator(".code-screen")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
  await collectWorldDrops(page); // Actual player pickup after the Agent explicitly drops its collected stack.
  expect(await countStack(page, "carbon")).toBe(2);
  expect(await page.evaluate(() => window.__craft.game!.agent.slots.filter(Boolean))).toEqual([]);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "element-cubes-canonical-items-recovered");
  expect(errors).toEqual([]);
}
