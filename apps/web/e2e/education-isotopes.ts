import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { command, countStack, createWorld, look, parkMouse, pressMouse, snap, target, waitForTerrain } from "./helpers";

export async function educationIsotopeRoute(page: Page, info: TestInfo, mobile: boolean) {
  const errors = await createWorld(page, { mode: "survival" });
  const press = (l: Locator) => mobile ? l.tap() : l.click();
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  const use = async () => {
    if (!mobile) return pressMouse(page, "right");
    const vp = page.viewportSize()!;
    const down = finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .45, id: 7 }] });
    await new Promise((r) => setTimeout(r, 60));
    await Promise.all([down, finger!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })]);
  };
  const inv = page.locator(".inventory-screen");
  const open = async (yaw: number, block: string, title: string, place: boolean) => {
    if (mobile) await press(page.locator('.hotbar [data-slot="0"]'));
    else { await page.keyboard.press("Digit1"); await parkMouse(page); }
    await look(page, yaw, -1.2);
    await target(page);
    if (place) { await use(); await page.waitForTimeout(300); }
    await expect.poll(async () => (await target(page))?.id).toBe(await page.evaluate((n) => window.__craft.blockId(n), block));
    await use();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  };
  const inspect = async (slot: number, label: string, protons: number, neutrons: number) => {
    await press(inv.locator(`[data-slot="${slot}"]`));
    await press(inv.locator("[data-element-lookup]"));
    await expect(inv.locator("[data-element-lookup] img")).toHaveAttribute("alt", label);
    await expect(inv.getByRole("spinbutton", { name: "protons", exact: true })).toHaveValue(String(protons));
    await expect(inv.getByRole("spinbutton", { name: "electrons", exact: true })).toHaveValue(String(protons));
    await expect(inv.getByRole("spinbutton", { name: "neutrons", exact: true })).toHaveValue(String(neutrons));
    await expect(inv.locator("[data-chem-result]")).toBeDisabled();
  };
  for (const item of ["element_constructor", "carbon", "carbon_14", "oak_log"]) await command(page, `/give ${item}`);
  await open(0, "element_constructor", "Element Constructor", true);
  await press(inv.locator('[data-slot="3"]'));
  await press(inv.locator("[data-element-lookup]"));
  await expect(inv.locator("[data-element-lookup] img")).toHaveCount(0);
  await expect(inv.locator('[data-element-lookup-status="error"]')).toBeVisible();
  await expect(inv.getByTestId("cursor")).toContainText("Oak Log");
  await press(inv.locator('[data-slot="7"]'));
  expect(await countStack(page, "oak_log")).toBe(1);
  await inspect(1, "Carbon", 6, 6);
  await snap(page, info, "owned-carbon-particle-lookup");
  await press(inv.locator("[data-element-lookup]"));
  await press(inv.locator('[data-slot="1"]'));
  expect(await countStack(page, "carbon")).toBe(1);
  const set = async (name: string, value: number) => {
    const field = inv.getByRole("spinbutton", { name, exact: true });
    await field.fill(String(value));
    await field.blur();
  };
  for (const atom of [
    { p: 6, n: 5, name: "carbon_11", label: "Carbon-11", slot: 3, count: 6 },
    { p: 19, n: 24, name: "potassium_43", label: "Potassium-43", slot: 4, count: 1 },
    { p: 26, n: 33, name: "iron_59", label: "Iron-59", slot: 5, count: 1 },
  ]) {
    await set("protons", atom.p); await set("neutrons", atom.n); await set("electrons", atom.p);
    await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", atom.label);
    for (let i = 0; i < atom.count; i++) await press(inv.locator('[data-chem-result]'));
    await press(inv.locator(`[data-slot="${atom.slot}"]`));
    expect(await countStack(page, atom.name)).toBe(atom.count);
  }
  await inspect(3, "Carbon-11", 6, 5);
  await snap(page, info, "new-guide-isotope-looked-up");
  await press(inv.locator("[data-element-lookup]"));
  await press(inv.locator('[data-slot="3"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  for (const item of ["compound_creator", "hydrogen_2 6"]) await command(page, `/give ${item}`);
  await open(Math.PI / 2, "compound_creator", "Compound Creator", true);
  await press(inv.locator('[data-slot="3"]'));
  for (let i = 0; i < 6; i++) await press(inv.locator('[data-chem-input="0"]'));
  await press(inv.locator('[data-slot="6"]'));
  for (let i = 0; i < 6; i++) await press(inv.locator('[data-chem-input="1"]'));
  await expect(inv.locator('[data-chem-result] img')).toHaveAttribute("alt", "Benzene");
  await press(inv.locator('[data-chem-result]'));
  await press(inv.locator('[data-slot="3"]'));
  expect(await countStack(page, "carbon_11")).toBe(0);
  expect(await countStack(page, "hydrogen_2")).toBe(0);
  expect(await countStack(page, "benzene")).toBe(1);
  await snap(page, info, "isotopes-create-benzene");
  await press(page.getByRole("button", { name: "Close inventory" }));
  if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true }));
  else await page.keyboard.press("Escape");
  await press(page.getByRole("button", { name: "Save & Quit to Title" }));
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await waitForTerrain(page);
  expect(await countStack(page, "benzene")).toBe(1);
  expect(await countStack(page, "potassium_43")).toBe(1);
  expect(await countStack(page, "iron_59")).toBe(1);
  await open(0, "element_constructor", "Element Constructor", false);
  await inspect(2, "Carbon-14", 6, 8);
  await snap(page, info, "owned-isotope-in-lookup-before-pagehide");
  await page.reload();
  await press(page.getByRole("button", { name: /Continue/ }));
  await expect(inv.locator('[data-recovery="0"] img')).toHaveAttribute("alt", "Carbon-14");
  await press(inv.locator('[data-recovery="0"]'));
  await press(inv.locator('[data-slot="2"]'));
  await press(page.getByRole("button", { name: "Close inventory" }));
  await waitForTerrain(page);
  for (const name of ["carbon", "carbon_14", "benzene", "potassium_43", "iron_59"]) expect(await countStack(page, name)).toBe(1);
  expect(await countStack(page, "oak_log")).toBe(1);
  expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([]);
  await snap(page, info, "guide-isotopes-and-owned-lookup-recovered");
  expect(errors).toEqual([]);
}
