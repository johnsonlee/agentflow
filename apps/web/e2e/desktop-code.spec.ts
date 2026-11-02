import { expect, test, type Page } from "@playwright/test";
import { blockAt, buildWallAhead, command, createWorld, look, settle, snap, waitForTerrain } from "./helpers";

const agent = (page: Page) => page.evaluate(() => ({ ...window.__craft.game!.agent, slots: undefined }));
const facingDir = (facing: number) => [[0, 1], [-1, 0], [0, -1], [1, 0]][facing];

async function openCodeBuilder(page: Page) {
  await page.keyboard.press("k");
  await expect(page.getByRole("heading", { name: "Code Builder" })).toBeVisible();
}

test.describe("PC browser: Education Edition Code Builder and Agent", () => {
  test("drag blocks into a program: move up; repeat 4 [place down; move forward]; Run builds a line", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await look(page, 0, 0);
    await page.keyboard.press("Digit5"); // Oak Planks
    await openCodeBuilder(page);
    await page.getByRole("button", { name: "Give held stack to Agent" }).click();
    await expect(page.locator(".cb-status")).toContainText("Gave the Agent 64 Oak Planks");

    const root = page.locator('[data-drop="on run / chat"]');
    await page.locator('[data-palette="move"]').dragTo(root);
    await root.locator('.cb-block[data-type="move"] select[aria-label="Direction"]').selectOption("up");
    await page.locator('[data-palette="repeat"]').dragTo(root);
    const loop = page.locator('[data-drop="do"]');
    await page.locator('[data-palette="place"]').dragTo(loop);
    await page.locator('[data-palette="move"]').dragTo(loop);
    await loop.locator('.cb-block[data-type="place"] select[aria-label="Direction"]').selectOption("down");
    await expect(root.locator(":scope > .cb-block")).toHaveCount(2);
    await expect(loop.locator(":scope > .cb-block")).toHaveCount(2);
    await snap(page, testInfo, "26-code-builder");

    const start = await agent(page);
    await page.getByRole("button", { name: "▶ Run" }).click();
    await expect(page.locator(".code-screen")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning), { timeout: 30_000 }).toBe(false);
    await expect(page.locator(".chat-line", { hasText: "finished" }).first()).toBeVisible();

    const [fx, fz] = facingDir(start.facing);
    const planks = await page.evaluate(() => window.__craft.blockId("oak_planks"));
    for (let i = 0; i < 4; i++) expect(await blockAt(page, start.x + fx * i, start.y, start.z + fz * i)).toBe(planks);
    const end = await agent(page);
    expect([end.x, end.y, end.z]).toEqual([start.x + fx * 4, start.y + 1, start.z + fz * 4]);
    await page.waitForTimeout(300);
    await snap(page, testInfo, "27-agent-built-line");
  });

  test("conditional: repeat until the Agent detects a block ahead [move forward] stops at a wall", async ({ page }) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await look(page, 0, 0);
    await page.evaluate(() => window.__craft.game!.teleportAgent());
    const wall = await buildWallAhead(page, 5);
    await openCodeBuilder(page);
    const root = page.locator('[data-drop="on run / chat"]');
    await page.locator('[data-palette="until"]').dragTo(root);
    await page.locator('[data-palette="move"]').dragTo(page.locator('[data-drop="do"]'));
    await page.getByRole("button", { name: "▶ Run" }).click();
    await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning), { timeout: 30_000 }).toBe(false);
    const end = await agent(page);
    // Facing north (-Z): it stops in the cell just in front of the wall.
    expect(end.z).toBe(wall.z + 1);
    await expect(page.locator(".chat-line", { hasText: "finished" }).first()).toBeVisible();
  });

  test("invalid programs: /code refuses one with a message, and a corrupt saved one is dropped on load", async ({ page }) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    // A program the editor can't produce (e.g. from a hand-edited save).
    await page.evaluate(() => {
      window.__craft.game!.programs.push({
        name: "Broken",
        trigger: { type: "chat", command: "broken" },
        blocks: [{ type: "command", cmd: { op: "move", dir: "sideways" } }],
      } as never);
    });
    await command(page, "/code broken");
    await expect(page.locator(".chat-line", { hasText: 'Can\'t run "Broken": Unknown direction sideways' })).toHaveCount(1);
    expect(await page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
    // The game loop is still running.
    const t0 = await page.evaluate(() => window.__craft.game!.renderer.renderer.info.render.frame);
    await expect.poll(() => page.evaluate(() => window.__craft.game!.renderer.renderer.info.render.frame)).toBeGreaterThan(t0);

    // Save it, then load the world: the corrupt program is dropped with a message.
    await page.evaluate(() => window.__craft.game!.save());
    await page.reload();
    await page.getByRole("button", { name: /Continue/ }).click();
    await waitForTerrain(page);
    expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual(['Program 1 "Broken": Unknown direction sideways']);
    expect(await page.evaluate(() => window.__craft.game!.programs.length)).toBe(0);
  });

  test("a hand-corrupted save (\"__proto__\"/\"toString\" ops, a \"__proto__\" chalkboard) loads, renders, and drops the bad entries", async ({ page }) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await page.evaluate(() => window.__craft.game!.save());
    // Edit the saved JSON the way a user (or a damaged file) could. The running game saves on
    // pagehide, so stop it saving over the edited file during the reload.
    await page.evaluate(() => {
      window.__craft.game!.save = () => undefined;
      const key = Object.keys(localStorage).find((k) => k.startsWith("craft.save"))!;
      const text = localStorage.getItem(key)!;
      const save = JSON.parse(text);
      save.programs = "__PROGRAMS__";
      save.chalkboards = "__BOARDS__";
      const programs =
        '[{"name":"Proto","trigger":{"type":"chat","command":"proto"},"blocks":[{"type":"command","cmd":{"op":"__proto__","dir":"up"}}]},' +
        '{"name":"Str","trigger":{"type":"chat","command":"str"},"blocks":[{"type":"command","cmd":{"op":"toString"}}]}]';
      const boards = '[{"x":0,"y":60,"z":0,"size":"__proto__","facing":0,"standing":true,"text":"x","locked":false}]';
      localStorage.setItem(key, JSON.stringify(save).replace('"__PROGRAMS__"', programs).replace('"__BOARDS__"', boards));
    });
    await page.reload();
    await page.getByRole("button", { name: /Continue/ }).click();
    await waitForTerrain(page);
    // Chat messages fade after 7 s (terrain can take longer on slow machines), so check the record.
    expect(await page.evaluate(() => window.__craft.game!.loadErrors)).toEqual([
      'Program 1 "Proto": Unknown command __proto__',
      'Program 2 "Str": Unknown command toString',
      "1 damaged chalkboard/furnace entries",
    ]);
    expect(await page.evaluate(() => [window.__craft.game!.programs.length, window.__craft.game!.chalkboards.size])).toEqual([0, 0]);
    const frame = () => page.evaluate(() => window.__craft.game!.renderer.renderer.info.render.frame);
    const f0 = await frame();
    await command(page, "/code str");
    await expect(page.locator(".chat-line", { hasText: 'No Code Builder program runs on "str"' })).toHaveCount(1);
    await expect.poll(frame).toBeGreaterThan(f0 + 5);
  });

  test("the editor refuses to nest loops and ifs deeper than 4", async ({ page }) => {
    test.setTimeout(120_000);
    await createWorld(page);
    await settle(page);
    await openCodeBuilder(page);
    // Tap-add 5 nested repeats: each time select the innermost "do" zone.
    await page.locator('[data-palette="repeat"]').click();
    for (let depth = 1; depth < 5; depth++) {
      await page.locator('[data-drop="do"] .cb-empty').last().click();
      await page.locator('[data-palette="repeat"]').click();
    }
    await expect(page.locator(".cb-status")).toHaveText("Loops and ifs can be nested at most 4 deep");
    expect(await page.locator(".cb-block[data-type=repeat]").count()).toBe(4);
    // Dragging a loop into the deepest zone is refused too.
    await page.locator('[data-palette="if"]').dragTo(page.locator('[data-drop="do"]').last());
    expect(await page.locator(".cb-block[data-type=if]").count()).toBe(0);
    // A command still fits at the deepest level, and the program runs.
    await page.locator('[data-drop="do"] .cb-empty').last().click();
    await page.locator('[data-palette="turn"]').click();
    await page.getByRole("button", { name: "▶ Run" }).click();
    await expect(page.locator(".code-screen")).toBeHidden();
  });

  test("/gamemode with a prototype name is rejected, and the world still saves and continues", async ({ page }) => {
    test.setTimeout(120_000);
    await createWorld(page);
    await settle(page);
    // Check each reply right away: chat lines fade after 7 s, and slow CI runners take seconds per command.
    for (const bad of ["__proto__", "constructor", "toString"]) {
      await command(page, `/gamemode ${bad}`);
      // The newest chat line is the reply (identical older lines may already have faded).
      await expect(page.locator(".chat-line").last()).toContainText("Usage: /gamemode <creative|survival>");
      expect(await page.evaluate(() => window.__craft.game!.mode)).toBe("creative");
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save & Quit to Title" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Continue/ }).click();
    await waitForTerrain(page);
    expect(await page.evaluate(() => window.__craft.game!.mode)).toBe("creative");
  });

  test("a save with corrupt top-level fields and a corrupt portfolio still load, render and open", async ({ page }) => {
    test.setTimeout(180_000);
    await createWorld(page);
    await settle(page);
    await page.evaluate(() => window.__craft.game!.save());
    await page.evaluate(() => {
      window.__craft.game!.save = () => undefined; // keep the edited file through the reload
      const save = JSON.parse(localStorage.getItem("craft.save.v1")!);
      save.name = { evil: true };
      save.mode = "constructor";
      save.timeOfDay = "__proto__";
      save.gamerules = "nope";
      save.player.flying = "yes";
      save.player.position = { x: "a", y: null, z: {} };
      localStorage.setItem("craft.save.v1", JSON.stringify(save));
      const ok = { id: "ok1", dataUrl: "data:image/jpeg;base64,AAAA", caption: "kept", takenAt: "2026-11-02T00:00:00.000Z" };
      localStorage.setItem("craft.portfolio.v1", '[{"__proto__":{"id":"x"}},{"id":"js","dataUrl":"javascript:alert(1)"},' + JSON.stringify(ok) + "]");
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Continue “Untitled World”" })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await waitForTerrain(page);
    const state = await page.evaluate(() => {
      const g = window.__craft.game!;
      return { mode: g.mode, time: g.timeOfDay, flying: g.body.flying, photos: g.portfolio.photos.map((p) => p.caption), errors: g.loadErrors };
    });
    expect(state.mode).toBe("creative");
    expect(Number.isFinite(state.time)).toBe(true);
    expect(state.flying).toBe(false);
    expect(state.photos).toEqual(["kept"]);
    expect(state.errors).toContain("2 damaged portfolio photos");
    const frame = () => page.evaluate(() => window.__craft.game!.renderer.renderer.info.render.frame);
    const f0 = await frame();
    await expect.poll(frame).toBeGreaterThan(f0 + 5);
    await page.keyboard.press("p");
    await expect(page.getByRole("heading", { name: "Portfolio (1)" })).toBeVisible();
  });
});
