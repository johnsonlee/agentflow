import { nativePageWorldTap } from './native-world-tap';
import { expect, type Page, type Locator, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import { blockId, stackId, type ItemStack, type SaveData } from '@craft/engine';
import { look, lookAtCell, aimAtTop, parkMouse, target, waitForTerrain, snap, collectWorldDrops } from './helpers';
import { fixtureContract, metadata, CHEST_A, CHEST_B } from './single-chest-fixture';
type Point = {
    x: number;
    y: number;
    z: number;
};
const totals = (stacks: readonly ItemStack[]) => Object.fromEntries([...stacks.reduce((map, s) => { const k = JSON.stringify([s.id, s.damage ?? 0, s.book ?? null, s.glow ?? null, s.sparkler ?? null]); map.set(k, (map.get(k) ?? 0) + s.count); return map; }, new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b)));
export async function chestRoute(page: Page, info: TestInfo, mobile: boolean) {
    const contract = fixtureContract(), errors: string[] = [], observations: unknown[] = [], receipts: Record<string, unknown> = {}, completedPhases: string[] = [];
    let stage = 'initial-codec-fixture', failure: string | null = null;
    const press = (l: Locator) => mobile ? l.tap() : l.click(), inv = page.locator('.inventory-screen'), cursor = inv.locator('[data-testid="cursor"]');
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error')
        errors.push(m.text()); });
    const read = () => page.evaluate(() => { const g = window.__craft.game!; return { realm: g.world.dimension, bag: g.inventory.toJSON(), agent: structuredClone(g.agent), chests: [...g.chests].map(([key, c]) => ({ key, state: c.snapshot() })), drops: g.worldDrops.toJSON(), programs: structuredClone(g.programs), running: g.programRunning, portals: g.world.portals.exportState(), position: { ...g.body.position }, loadErrors: [...g.loadErrors] }; });
    const record = async (label: string) => { stage = label; const value = await read(); observations.push({ label, value }); return value; };
    const mark = async (label: string) => { const value=await record(label); completedPhases.push(label); return value; };
    const count = (name: string) => page.evaluate(n => window.__craft.game!.inventory.slots.reduce((sum, s) => sum + (s?.id === window.__craft.stackId(n) ? s.count : 0), 0), name);
    const slot = (name: string, damage?: number) => page.evaluate(({ n, d }) => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n) && (d === undefined || s.damage === d)), { n: name, d: damage });
    const empty = () => page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s === null));
    const chest = (p: Point) => page.evaluate(p => window.__craft.game!.chests.get(`${p.x},${p.y},${p.z}`)?.snapshot() ?? null, p);
    const block = (p: Point) => page.evaluate(p => window.__craft.game!.world.getBlock(p.x, p.y, p.z), p);
    const chat = async (text: string) => { if (mobile)
        await press(page.getByRole('button', { name: 'Chat and commands', exact: true }));
    else
        await page.keyboard.press('Slash'); const input = page.getByRole('textbox', { name: 'Chat', exact: true }); await expect(input).toBeVisible(); await input.fill(text); await input.press('Enter'); await expect(input).toBeHidden(); };
    const tp = async (x: number, z: number, y = 80) => { await chat(`/tp ${x} ${y} ${z}`); await waitForTerrain(page); };
    const use = async () => { await page.waitForFunction(() => ((window.__craft.game! as unknown as {
        placeCooldown: number;
    }).placeCooldown) === 0); if (mobile) {
        const v = page.viewportSize()!;
        await nativePageWorldTap(page, v.width * .65, v.height * .42);
    }
    else
        try {
            await page.mouse.down({ button: 'right' });
        }
        finally {
            await page.mouse.up({ button: 'right' });
        } };
    const close = async () => { await press(page.getByRole('button', { name: 'Close inventory', exact: true })); await expect(inv).toBeHidden(); };
    const openBag = async () => { if (mobile)
        await press(page.getByRole('button', { name: 'Open inventory', exact: true }));
    else
        await page.keyboard.press('KeyE'); await expect(inv).toBeVisible(); };
    const select = async (name: string, damage?: number) => { const i = await slot(name, damage); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9); if (mobile)
        await press(page.locator(`.hotbar [data-slot="${i}"]`));
    else {
        await page.keyboard.press(`Digit${i + 1}`);
        await parkMouse(page);
    } await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i); };
    const openAt = async (p: Point, title: string) => { await tp(p.x + .5, p.z + 2.5); await lookAtCell(page, p.x, p.y, p.z); await expect.poll(() => target(page)).toMatchObject(p); await use(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); };
    const sourceSlot = (i: number) => press(inv.locator(`[data-slot="${i}"]`)), chestCell = (i: number) => inv.locator(`[data-chest="${i}"]`), craft = (i: number) => inv.locator(`[data-craft="${i}"]`);
    const fillCraft = async (name: string, indices: number[]) => { const i = await slot(name); await sourceSlot(i); for (const n of indices)
        await press(craft(n)); if (await cursor.textContent())
        await sourceSlot(i); await expect(cursor).toBeEmpty(); };
    const deposit = async (name: string, to: number, damage?: number) => { await sourceSlot(await slot(name, damage)); await press(chestCell(to)); await expect(cursor).toBeEmpty(); };
    const putResult = async () => { await expect(inv.locator('[data-craft-result] img')).toHaveAttribute('alt', 'Chest'); await press(inv.locator('[data-craft-result]')); await sourceSlot(await empty()); await expect(cursor).toBeEmpty(); };
    const place = async (p: Point) => { await tp(p.x + .5, p.z + 2.5); await select('chest'); await aimAtTop(page, p.x, p.y - 1, p.z); await use(); await expect.poll(() => block(p)).toBe(203); expect((await chest(p))?.slots).toEqual(Array(27).fill(null)); };
    // Splits actual preowned Cobblestone through real work cells; never grants or assigns a bag result.
    const fillBag = async () => { await openBag(); for (let rounds = 0; rounds < 36; rounds++) {
        const destination = await empty();
        if (destination < 0)
            break;
        const source = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.blockId('cobblestone') && s.count > 1));
        expect(source).toBeGreaterThanOrEqual(0);
        await sourceSlot(source);
        await press(craft(0));
        await sourceSlot(source);
        await press(craft(0));
        await sourceSlot(destination);
        await expect(cursor).toBeEmpty();
    } expect((await read()).bag.slots.filter(Boolean)).toHaveLength(36); await close(); };
    const pause = async () => { if (mobile)
        await press(page.getByRole('button', { name: 'Pause', exact: true }));
    else
        await page.keyboard.press('Escape'); await expect(page.locator('.pause-screen')).toBeVisible(); };
    const quit = async (label: string) => { await pause(); await press(page.getByRole('button', { name: 'Save & Quit to Title', exact: true })); const raw = await page.evaluate(() => localStorage.getItem('craft.save.v1')); expect(raw).not.toBeNull(); await fs.writeFile(info.outputPath(`${label}.json`), raw!); return JSON.parse(raw!) as SaveData; };
    const resume = async (pendingRecovery = false) => {
        await page.reload(); await press(page.getByRole('button', { name: /Continue/ }));
        if (pendingRecovery) {
            // Restored held items open a real recovery UI and suspend physics until it closes.
            await expect(inv).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Saved held items', exact: true })).toBeVisible();
            await page.waitForFunction(() => window.__craft.game?.renderer.isAreaReady(2) === true, undefined, { timeout: 60_000 });
        } else await waitForTerrain(page);
    };
    try {
        await fs.writeFile(info.outputPath('initial-fixture-contract.json'), JSON.stringify(contract, null, 2));
        await page.goto('/');
        await page.evaluate(raw => { localStorage.clear(); localStorage.setItem('craft.save.v1', raw); }, contract.raw);
        await resume();
        const initial = await record('initial-only-raw-kit-full-bags-table-pad-prior-portal-noChest');
        expect(initial.chests).toEqual([]);
        expect(initial.bag).toEqual(contract.initial.inventory);
        expect(initial.agent.slots).toEqual(contract.initial.agent!.slots);
        expect(initial.loadErrors).toEqual([]);
        await mark('raw-fixture-loaded-without-repair'); stage='crafting-mixed-and-Oak-Chests';
        await openAt({ x: 0, y: 80, z: -3 }, 'Crafting Table');
        await fillCraft('oak_planks', [0, 2, 6, 8]);
        await expect(inv.locator('[data-craft-result] img')).toHaveCount(0);
        await fillCraft('birch_planks', [1, 3, 5, 7]);
        await fillCraft('cobblestone', [4]);
        await expect(inv.locator('[data-craft-result] img')).toHaveCount(0);
        await press(craft(4));
        await sourceSlot(await slot('cobblestone'));
        await expect(cursor).toBeEmpty();
        await putResult();
        expect(await count('chest')).toBe(1);
        expect(await count('oak_planks')).toBe(8);
        expect(await count('birch_planks')).toBe(0);
        await fillCraft('oak_planks', [0, 1, 2, 3, 5, 6, 7, 8]);
        await putResult();
        expect(await count('chest')).toBe(2);
        expect(await count('oak_planks')).toBe(0);
        await snap(page, info, 'actual-mixed-and-Oak-eight-plank-Chests');
        await close();
        stage='actual-Chest-placement'; await place(CHEST_A);
        await place(CHEST_B);
        await mark('two-actually-crafted-Chests-placed-with-empty27owners'); stage='live27slot-merge-and-metadata-swap';
        await openAt(CHEST_A, 'Chest');
        await expect(inv.locator('[data-chest]')).toHaveCount(27);
        for (let i = 0; i < metadata.length; i++)
            await deposit(['iron_axe', 'written_book', 'glow_stick', 'orange_sparkler', 'tonic'][i], i, i === 0 ? 13 : undefined);
        await deposit('stone', 26);
        await sourceSlot(await slot('stone'));
        await press(chestCell(26));
        await expect(cursor).toContainText('Stone ×4');
        await sourceSlot(await empty());
        expect((await chest(CHEST_A))!.slots[26]).toEqual({ id: blockId('stone'), count: 64 });
        await deposit('stone', 25);
        await press(chestCell(1));
        await press(chestCell(0));
        expect((await chest(CHEST_A))!.slots[0]).toEqual(metadata[1]);
        await press(chestCell(1));
        await expect(cursor).toBeEmpty();
        expect((await chest(CHEST_A))!.slots[1]).toEqual(metadata[0]);
        await chestCell(26).scrollIntoViewIfNeeded();
        await snap(page, info, 'live27slots-merge64-remainder4-book-tool-swap-lastrow');
        await mark('live27slots-merge-remainder-swap-and-lastrow'); stage='actual-autosave-cursor-cold-recovery';
        // Real autosave owns the held Book independently; do not call a debug save/tick API.
        await press(chestCell(0));
        await expect(cursor).toContainText('Written Book');
        await page.waitForFunction(expected => { const raw = localStorage.getItem('craft.save.v1'); if (!raw)
            return false; const save = JSON.parse(raw); return JSON.stringify(save.inventoryPending) === JSON.stringify([expected]) && save.chests?.find((c: any) => c.x === 1 && c.y === 80 && c.z === 0)?.state.slots[0] === null; }, metadata[1], { timeout: 120000 });
        const pendingRaw = await page.evaluate(() => localStorage.getItem('craft.save.v1'));
        await fs.writeFile(info.outputPath('actual-autosave-open-Chest-cursor.json'), pendingRaw!);
        await resume(true);
        await expect(inv).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Saved held items', exact: true })).toBeVisible();
        expect((await chest(CHEST_A))!.slots[0]).toBeNull();
        await press(inv.locator('[data-recovery="0"]'));
        await sourceSlot(await empty());
        await close();
        await waitForTerrain(page);
        await openAt(CHEST_A, 'Chest');
        await deposit('written_book', 0);
        const loadedA = (await chest(CHEST_A))!;
        expect(loadedA.slots[0]).toEqual(metadata[1]);
        await close();
        await mark('actual-cursor-autosave-cold-recovered-book'); stage='UI-only-filler-splitting'; await fillBag();
        expect(await count('stone')).toBe(0);
        expect((await read()).bag.slots.every(s => s?.id === blockId('cobblestone') || s?.id === stackId('iron_axe') && s.damage === 3)).toBe(true);
        await mark('full36bag-created-only-by-UI-splitting'); stage='fullbag-close-refusal';
        await openAt(CHEST_A, 'Chest');
        await press(chestCell(0));
        await press(page.getByRole('button', { name: 'Close inventory', exact: true }));
        await expect(inv).toBeVisible();
        await expect(page.getByText('Inventory full. Make room for held and crafting items before closing.', { exact: true })).toBeVisible();
        await expect(cursor).toContainText('Written Book');
        await snap(page, info, 'full-bag-close-refused-held-book-safe');
        await press(chestCell(0));
        await close();
        expect(await chest(CHEST_A)).toEqual(loadedA);
        const beforeTravel = await mark('closed-Chests-full-bag-before-real-dimension-roundtrip'); stage='real-input-enter-prior-portal';
        await tp(8.5, -2.5);
        await look(page, 0, 0);
        if (mobile) {
            const box = await page.locator('.touch-stick-base').boundingBox();
            expect(box).not.toBeNull();
            const finger = await page.context().newCDPSession(page), x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
            try {
                await finger.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 171 }] });
                await finger.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 60, id: 171 }] });
                await expect.poll(() => page.evaluate(() => window.__craft.game!.body.position.z), { timeout: 45000, intervals: [50] }).toBeLessThan(-4.8);
            }
            finally {
                await finger.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await finger.detach();
            }
        }
        else {
            try {
                await page.keyboard.down('KeyW');
                await expect.poll(() => page.evaluate(() => window.__craft.game!.body.position.z), { timeout: 45000, intervals: [50] }).toBeLessThan(-4.8);
            }
            finally {
                await page.keyboard.up('KeyW');
            }
        }
        stage='actual-Main-Nether-handoff';
        await page.waitForFunction(() => window.__craft.game?.world.dimension === 'nether', undefined, { timeout: 120000 });
        await waitForTerrain(page);
        expect((await read()).chests).toEqual([]);
        expect((await read()).bag).toEqual(beforeTravel.bag);
        stage='Nether-save-cold-archived-OW-Chest'; const netherSaved = await quit('actual-Nether-cold-archived-OW-Chests');
        expect(netherSaved.dimensions?.inactive.overworld?.chests?.find(c => c.x === CHEST_A.x)?.state).toEqual(loadedA);
        await resume();
        expect((await read()).realm).toBe('nether'); expect((await read()).bag).toEqual(beforeTravel.bag); expect((await read()).loadErrors).toEqual([]); await mark('Nether-cold-restored-with-archived-Chest'); stage='real-return-portal-dwell';
        const frame = (await read()).portals.records[0];
        await tp(frame.x + .5, frame.z + .5, frame.y);
        await page.waitForFunction(() => window.__craft.game?.world.dimension === 'overworld', undefined, { timeout: 120000 });
        await waitForTerrain(page);
        expect(await chest(CHEST_A)).toEqual(loadedA);
        expect((await read()).bag).toEqual(beforeTravel.bag);
        expect((await read()).agent.slots).toEqual(initial.agent.slots);
        await snap(page, info, 'real-Main-Nether-cold-return-retained-OW-Chest-cargo');
        await mark('real-Nether-roundtrip-retained-OW-Chest'); stage='Player-fullbag-held-Chest-harvest';
        await tp(CHEST_A.x + .5, CHEST_A.z + 2.5);
        await select('iron_axe', 3);
        await lookAtCell(page, CHEST_A.x, CHEST_A.y, CHEST_A.z);
        await expect.poll(() => target(page)).toMatchObject(CHEST_A);
        const touch = mobile ? await page.context().newCDPSession(page) : null;
        try {
            if (touch) {
                const v = page.viewportSize()!;
                await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: v.width * .65, y: v.height * .42, id: 173 }] });
            }
            else
                await page.mouse.down({ button: 'left' });
            await expect.poll(() => block(CHEST_A), { timeout: 30000 }).toBe(0);
        }
        finally {
            if (touch) {
                await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await touch.detach();
            }
            else
                await page.mouse.up({ button: 'left' });
        }
        await expect.poll(() => slot('iron_axe', 4)).toBe(7);
        const expectedA = [{ id: 203, count: 1 }, ...loadedA.slots.filter((s): s is ItemStack => s !== null)];
        await expect.poll(async () => totals((await read()).drops.records.map(r => r.stack))).toEqual(totals(expectedA));
        receipts.player = { expected: totals(expectedA), actual: totals((await read()).drops.records.map(r => r.stack)) };
        expect(await chest(CHEST_A)).toBeNull();
        expect((await read()).bag.slots.filter(Boolean)).toHaveLength(36);
        await snap(page, info, 'Player-real-held-break-full-bag-complete-metadata-world-receipt');
        stage='Player-receipt-cold-save'; await quit('Player-Chest-break-cold-receipt');
        await resume();
        expect(totals((await read()).drops.records.map(r => r.stack))).toEqual(totals(expectedA));
        expect(await chest(CHEST_A)).toBeNull(); await mark('Player-fullbag-metadata-receipt-cold-restored'); stage='stashing-eight-filler-stacks';
        // Free exactly eight bag slots by storing real filler stacks in the second actual Chest.
        await openAt(CHEST_B, 'Chest');
        for (let i = 0; i < 8; i++) {
            const source = await page.evaluate(() => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.blockId('cobblestone')));
            await sourceSlot(source);
            await press(chestCell(19 + i));
        }
        await close();
        await tp(CHEST_A.x + .5, CHEST_A.z + 1.5);
        stage='actual-Player-receipt-pickup'; await collectWorldDrops(page, mobile);
        await expect.poll(async () => (await read()).drops.records.length).toBe(0);
        expect(await count('written_book')).toBe(1);
        expect(await count('chest')).toBe(1); stage='metadata-redeposit-in-second-Chest';
        await openAt(CHEST_B, 'Chest');
        for (let i = 0; i < metadata.length; i++)
            await deposit(['iron_axe', 'written_book', 'glow_stick', 'orange_sparkler', 'tonic'][i], i, i === 0 ? 13 : undefined);
        for (const dest of [17, 18]) {
            const n = await slot('stone');
            if (n >= 0) {
                await sourceSlot(n);
                await press(chestCell(dest));
            }
        }
        const loadedB = (await chest(CHEST_B))!;
        expect(totals(loadedB.slots.filter((s): s is ItemStack => s !== null && s.id !== blockId('cobblestone')))).toEqual(totals(loadedA.slots.filter((s): s is ItemStack => s !== null)));
        await close();
        await mark('all-original-cargo-picked-up-and-redeposited'); stage='Agent-chat-navigation';
        await tp(-1.5, 1.5);
        await look(page, 0, 0);
        await chat('/tp @c @s');
        await expect.poll(async () => { const a = (await read()).agent; return [a.x, a.y, a.z, a.facing]; }).toEqual([-3, 80, 1, 2]);
        expect((await read()).agent.slots).toEqual(initial.agent.slots);
        await tp(4.5, 4.5); stage='actual-CodeBuilder-Agent-Chest-destroy';
        if (mobile)
            await press(page.getByRole('button', { name: 'Code Builder', exact: true }));
        else
            await page.keyboard.press('KeyK');
        await expect(page.locator('.code-screen')).toBeVisible();
        await press(page.locator('[data-palette="destroy"]'));
        await page.getByRole('textbox', { name: 'Program name', exact: true }).fill('Destroy actual loaded Chest');
        await page.getByRole('textbox', { name: 'Program name', exact: true }).press('Tab');
        await press(page.getByRole('button', { name: '▶ Run', exact: true }));
        await expect(page.locator('.code-screen')).toBeHidden();
        await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
        expect(await block(CHEST_B)).toBe(0);
        expect(await chest(CHEST_B)).toBeNull();
        expect((await read()).agent.slots).toEqual(initial.agent.slots);
        const expectedB = [{ id: 203, count: 1 }, ...loadedB.slots.filter((s): s is ItemStack => s !== null)];
        expect(totals((await read()).drops.records.map(r => r.stack))).toEqual(totals(expectedB));
        receipts.agent = { expected: totals(expectedB), actual: totals((await read()).drops.records.map(r => r.stack)) };
        await mark('actual-Agent-full-bag-first-Chest-receipt'); stage='repeat-empty-Agent-program-no-duplicate';
        if (mobile)
            await press(page.getByRole('button', { name: 'Code Builder', exact: true }));
        else
            await page.keyboard.press('KeyK');
        await expect(page.getByRole('textbox', { name: 'Program name', exact: true })).toHaveValue('Destroy actual loaded Chest');
        await press(page.getByRole('button', { name: '▶ Run', exact: true }));
        await expect(page.locator('.code-screen')).toBeHidden();
        await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false);
        expect(totals((await read()).drops.records.map(r => r.stack))).toEqual(totals(expectedB));
        expect((await read()).agent.slots).toEqual(initial.agent.slots);
        await mark('actual-repeated-empty-Agent-destroy-no-second-receipt');
        await lookAtCell(page, CHEST_B.x, CHEST_B.y, CHEST_B.z);
        await snap(page, info, 'actual-CodeBuilder-Agent-full-bag-loaded-Chest-break-metadata-once');
        stage='Agent-receipt-cold-save'; const finalSaved = await quit('Agent-Chest-break-final-cold-receipt');
        expect(finalSaved.chests).toEqual([]);
        await resume();
        expect((await read()).chests).toEqual([]);
        expect((await read()).agent.slots).toEqual(initial.agent.slots);
        expect(totals((await read()).drops.records.map(r => r.stack))).toEqual(totals(expectedB));
        expect(await count('chest')).toBe(1);
        expect((await read()).loadErrors).toEqual([]);
        await mark('both-Chests-retired-one-Agent-receipt-cold-metadata-conserved');
        expect(errors).toEqual([]);
    }
    catch (error) {
        failure = error instanceof Error ? error.stack ?? error.message : String(error);
        throw error;
    }
    finally {
        try {
            await page.keyboard.up('KeyW');
        }
        catch { }
        await fs.writeFile(info.outputPath('single-chest-browser-proof.json'), JSON.stringify({ stage, failure, mobile, browser: page.context().browser()?.version(), viewport: page.viewportSize(), fixtureBaselineRevision: '465e60b5bfc0aff57bcbc48c227f48aa611fcb19', testedRuntimeRevision: process.env.TESTED_RUNTIME_REVISION ?? null, runtimeRevisionEvidence: 'Independent runner Git/source manifest and served payload hashes; fixture baseline is not tested runtime', actualURL: page.url(), observations, receipts, completedPhases, pageErrors: errors, fixture: 'Initial raw full36 bag/Oak12Birch4/five supported metadata cargo/miningAxe3/Stone60+8/Cobble fillers/full27Agent; prior table/pad/liveportal. NoChest/result granted; only actualUI, autosave, chatnavigation/camera, heldinput, joystick, realMaintravel andCodeBuilder afterward.', intendedCoverage: 'Mixed+Oak craft; placed live27 slots; merge/remainder/metadata swap/lastrow; actualautosavecursorcold; UI split fillers/fullbagclose refusal; archivedOWChest actualNethercold roundtrip; Playerfullbagbreak andcoldmetadata receipt; actualpickup/redeposit; AgentfullbagCodeBuilderdestroy andcoldreceipt.', uncovered: ['allnativevariants/Double54', 'nativegeometry/textures/lid/permissions/timing', 'ChestplacedinNether or samecoordinatebothrealm browser case', 'browserdeath/recovery-corruption (separateactualGamecorrectness)', 'primitiveSurvivalacquisition', 'fullEducation/performance/physicalphone'] }, null, 2));
    }
}
