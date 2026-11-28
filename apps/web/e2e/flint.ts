import fs from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { blockAt, collectWorldDrops, command, countStack, createWorld, parkMouse, snap, target, waitForTerrain } from "./helpers";
import { blockId, lookDirection, stackId } from '@craft/engine';
import { admitSingleSource, findSingleSourcePose, harvestCellChanges, readHarvestCells, SINGLE_SOURCE_LIMITS, type HarvestCell as Cell } from './single-source-harvest';
/** Actual source acquisition, with disclosed shovel/navigation, receiver-fault and Agent-pose fixtures.
 * No terrain Gravel, Flint, random roll or loot outcome is injected. */
export async function flintRoute(page: Page, info: TestInfo, mobile: boolean) {
  let stage = "create", failure: string | null = null, errors: string[] = [];
  const observations: unknown[] = [], attempts: unknown[] = [];
  const finger = mobile ? await page.context().newCDPSession(page) : null;
  try {
    errors = await createWorld(page, { mode: "survival", seed: "12345" });
    const press = (l: Locator) => mobile ? l.tap() : l.click(), inv = page.locator(".inventory-screen");
    const hold = async (until: () => Promise<unknown>, input: Array<{event:string;time:number}> = []) => { const vp = page.viewportSize()!; try { input.push({event:'down-dispatch',time:performance.now()}); if (mobile) await finger!.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: vp.width * .65, y: vp.height * .42, id: 127 }] }); else await page.mouse.down({ button: "left" }); input.push({event:'down-return',time:performance.now()}); await until(); input.push({event:'source-wait-return',time:performance.now()}); } finally { input.push({event:'up-dispatch',time:performance.now()}); if (mobile) await finger!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up({ button: "left" }); input.push({event:'up-return',time:performance.now()}); } };
    const teleport = async (p: Cell) => { await command(page, `/tp ${p.x} ${p.y} ${p.z}`); await waitForTerrain(page); };
    const read = () => page.evaluate(() => { const g = window.__craft.game!, ids = [window.__craft.blockId("gravel"), window.__craft.stackId("flint")], inventory = g.inventory.toJSON(), ground = g.worldDrops.records, agent = structuredClone(g.agent); const owners = [...inventory.slots.filter(s => s !== null), ...agent.slots.filter(s => s !== null), ...ground.map(r => r.stack), ...(g as unknown as { inventoryScreen: { pendingItems(): { id: number; count: number }[] } }).inventoryScreen.pendingItems()]; const pending = structuredClone((g as unknown as { inventoryScreen: { pendingItems(): { id: number; count: number }[] } }).inventoryScreen.pendingItems()); return { inventory, ground, agent, pending, counts: ids.map(id => owners.filter(s => s.id === id).reduce((n, s) => n + s.count, 0)), decisions: g.world.gravelHarvests.exportState(), position: { ...g.body.position }, errors: [...g.loadErrors], rawStorage: localStorage.getItem("craft.save.v1") }; });
    const record = async (label: string) => { const value = await read(); observations.push({ stage, label, value }); return value; };
    const select = async (name: string) => { const i = await page.evaluate(n => window.__craft.game!.inventory.slots.findIndex(s => s?.id === window.__craft.stackId(n)), name); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(9); if (mobile) await press(page.locator(`.hotbar [data-slot="${i}"]`)); else { await page.keyboard.press(`Digit${i + 1}`); await parkMouse(page); } await expect.poll(() => page.evaluate(() => window.__craft.game!.inventory.selected)).toBe(i); };
    const pause = async () => { if (mobile) await press(page.getByRole("button", { name: "Pause", exact: true })); else await page.keyboard.press("Escape"); await expect(page.locator(".pause-screen")).toBeVisible(); };
    const quit = async () => { await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.getByRole("heading", { name: "AgentFlow Craft", exact: true })).toBeVisible(); return page.evaluate(() => localStorage.getItem("craft.save.v1")!); };
    const open = async () => { if (mobile) await press(page.getByRole("button", { name: "Open inventory" })); else await page.keyboard.press("KeyE"); await expect(inv).toBeVisible(); };
    const close = async () => { await press(page.getByRole("button", { name: "Close inventory" })); await expect(inv).toBeHidden(); };
    await command(page, "/time set noon"); await command(page, "/gamerule doDaylightCycle false"); await command(page, "/give iron_shovel");
    const pad = await page.evaluate(() => { const g = window.__craft.game!, p = g.body.position, x = Math.floor(p.x), y = Math.floor(p.y) - 1, z = Math.floor(p.z); for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { g.world.setBlock(x + dx, y, z + dz, window.__craft.blockId("bedrock")); for (let dy = 1; dy <= 5; dy++) g.world.setBlock(x + dx, y + dy, z + dz, 0); } return { x: x + .5, y: y + 1, z: z + .5 }; });
    const candidates = await page.evaluate(() => { const g = window.__craft.game!, out: { x: number; y: number; z: number }[] = []; for (let x = 7; x <= 19; x++) for (let z = -30; z <= -18; z++) { const y = g.world.generator.heightAt(x, z); if (y < 24 && g.world.getBlock(x, y, z) === window.__craft.blockId("gravel")) out.push({ x, y, z }); } return out.slice(0, 96); });
    expect(candidates.length).toBe(96); expect((await read()).counts).toEqual([0, 0]); await select("iron_shovel");
    // These queries return detached loaded cells and owners only. They never alter Game methods,
    // terrain, harvest outcomes, input owners or simulation time.
    const cells = (cell: Cell) => page.evaluate(p => {
      const g = window.__craft.game!, min = {x:p.x-9,y:0,z:p.z-9}, max = {x:p.x+9,y:Math.min(95,p.y+8),z:p.z+9}, blocks:Array<number|null>=[];
      for(let y=min.y;y<=max.y;y++)for(let z=min.z;z<=max.z;z++)for(let x=min.x;x<=max.x;x++)blocks.push(g.world.getLoadedBlock(x,y,z)??null);
      return {min,max,blocks,portalCanChange:g.world.portals.canChange(p.x,p.y,p.z),pose:{...g.body.position},yaw:g.body.yaw,pitch:g.body.pitch,version:g.world.blockMutationVersion,edits:g.world.exportEdits(),browserTime:performance.now()};
    }, cell);
    const lookAtPoint = (point:Cell) => page.evaluate(p => {
      const b=window.__craft.game!.body,dx=p.x-b.position.x,dz=p.z-b.position.z,dy=p.y-(b.position.y+1.62);
      b.yaw=Math.atan2(-dx,-dz);b.pitch=Math.atan2(dy,Math.hypot(dx,dz));
    },point);
    const approach = async (cell: Cell) => {
      const sample=await cells(cell), planned=findSingleSourcePose(readHarvestCells(sample),cell,sample.portalCanChange);
      if(!planned.proof){observations.push({stage,label:'natural-source-not-admitted',cell,sample,queries:planned.queries,reasons:planned.reasons});return null;}
      await teleport(planned.proof.feet);if(!mobile)await parkMouse(page);await lookAtPoint(planned.proof.aim);
      const hit=await target(page),current=await cells(cell),proof=admitSingleSource(readHarvestCells(current),cell,current.pose,planned.proof.aim,current.portalCanChange,lookDirection(current.yaw,current.pitch));
      observations.push({stage,label:'natural-pose-actual-revalidation',cell,planned,current,proof,hit});
      if(!proof.ok)return null;
      expect(hit).toMatchObject({...cell,id:blockId('gravel')});
      return {planned,proof,current};
    };
    const materialTotals = (state:Awaited<ReturnType<typeof read>>) => {
      const totals:Record<string,number>={};const bag=state.inventory;
      for(const stack of [...bag.slots,...Object.values(bag.equipment??{}),...('offhand'in bag?[bag.offhand]:[]),...state.agent.slots,...state.pending,...state.ground.map(r=>r.stack)])if(stack){const item=stack as {id:number;count:number};totals[item.id]=(totals[item.id]??0)+item.count;}
      return totals;
    };
    let actualHarvests=0, examined=0;
    const mine = async (cell: Cell) => {
      const pose=await approach(cell);if(!pose)return false;
      const before=await read(),beforeCells=await cells(cell),input:Array<{event:string;time:number}>=[];
      const finalProof=admitSingleSource(readHarvestCells(beforeCells),cell,beforeCells.pose,pose.proof.aim,beforeCells.portalCanChange,lookDirection(beforeCells.yaw,beforeCells.pitch));
      const attempt={cell,pose,before,beforeCells,finalProof,input,after:null as Awaited<ReturnType<typeof read>>|null,afterCells:null as Awaited<ReturnType<typeof cells>>|null,cellChanges:null as ReturnType<typeof harvestCellChanges>|null,actualAlternative:null as string|null};attempts.push(attempt);
      expect(finalProof.ok,'Actual loaded pose/ray changed before physical input').toBe(true);
      try{await hold(()=>page.waitForFunction(p=>window.__craft.game!.world.getBlock(p.x,p.y,p.z)!==window.__craft.blockId('gravel'),cell,{timeout:15_000}),input);}
      finally{attempt.after=await read();attempt.afterCells=await cells(cell);attempt.cellChanges=harvestCellChanges(beforeCells,attempt.afterCells);}
      const after=attempt.after!,afterCells=attempt.afterCells!,delta=after.counts.map((n,i)=>n-before.counts[i]);
      // Store both states before every assertion, including the unsuccessful single-source attempt.
      expect([[1,0],[0,1]]).toContainEqual(delta);
      expect(attempt.cellChanges!.becameUnknown).toEqual([]);
      expect(attempt.cellChanges!.positiveHardnessRemovals.map(c=>({x:c.x,y:c.y,z:c.z,before:c.before}))).toEqual([{...cell,before:blockId('gravel')}]);
      expect([0,blockId('water')]).toContain(readHarvestCells(afterCells)(cell.x,cell.y,cell.z));
      const beforeTool=before.inventory.slots[before.inventory.selected]!,afterTool=after.inventory.slots[before.inventory.selected]!;
      expect(afterTool).toEqual({...beforeTool,damage:(beforeTool.damage??0)+1});
      expect(after.agent).toEqual(before.agent);expect(after.pending).toEqual(before.pending);expect(after.inventory.equipment).toEqual(before.inventory.equipment);
      const totalsBefore=materialTotals(before),totalsAfter=materialTotals(after);
      for(const id of new Set([...Object.keys(totalsBefore),...Object.keys(totalsAfter)]))if(Number(id)!==blockId('gravel')&&Number(id)!==stackId('flint'))expect(totalsAfter[id]??0).toBe(totalsBefore[id]??0);
      expect(after.decisions.records).toEqual(before.decisions.records);attempt.actualAlternative=delta[1]?'flint':'gravel';actualHarvests++;return true;
    };
    stage='finite-genuine-natural-harvest';
    for(;examined<Math.min(candidates.length,SINGLE_SOURCE_LIMITS.sources)&&(await read()).counts[1]===0;examined++)if(await mine(candidates[examined]))await collectWorldDrops(page);
    observations.push({stage,label:'finite-natural-source-accounting',candidateCap:96,examined,actualHarvests,skipped:examined-actualHarvests});
    expect((await read()).counts[1],`No genuine Flint in ${actualHarvests} actual harvests from ${examined} examined natural candidates; preserve failure`).toBeGreaterThan(0); expect(await countStack(page,'flint')).toBeGreaterThan(0); await record('genuine-natural-gravel-flint-owned'); await snap(page,info,'genuine-natural-ocean-gravel-yields-flint-without-injected-roll');
    // Refuse only delivery for a separate natural source. No outcome/RNG/source state is changed.
    stage = "receiver-refusal-first-decision";
    // A separate still-natural source, not an assumed block below the first harvested candidate.
    let refusedCell:Cell|null=null;
    for(const cell of candidates){if(await blockAt(page,cell.x,cell.y,cell.z)!==blockId('gravel'))continue;if(await approach(cell)){refusedCell=cell;break;}}
    if(!refusedCell)throw Error('No separate admitted natural source for receiver-refusal proof');
    const beforeRefusal = await record("before-receiver-fault");
    await page.evaluate(() => { const store = window.__craft.game!.worldDrops, original = store.planSpawnBatch.bind(store); store.planSpawnBatch = (stacks, at, velocity) => stacks.some(s => s.id === window.__craft.stackId("flint") || s.id === window.__craft.blockId("gravel")) ? null : original(stacks, at, velocity); });
    await hold(() => page.waitForFunction(p => window.__craft.game!.world.gravelHarvests.exportState().records.some(r => r.x === p.x && r.y === p.y && r.z === p.z), refusedCell));
    const refused = await record("actual-refused-source-and-first-decision"); expect(refused.inventory).toEqual(beforeRefusal.inventory); expect(refused.counts).toEqual(beforeRefusal.counts); expect(await blockAt(page, refusedCell.x, refusedCell.y, refusedCell.z)).toBe(await page.evaluate(() => window.__craft.blockId("gravel"))); const decision = refused.decisions.records.find(r => r.x === refusedCell.x && r.y === refusedCell.y && r.z === refusedCell.z)!; expect(typeof decision.flint).toBe("boolean");
    await pause(); const pendingRaw = await quit(); expect(JSON.parse(pendingRaw).gravelHarvests.records).toContainEqual(decision); await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page); expect((await read()).decisions.records).toContainEqual(decision);
    stage = "actual-agent-cached-decision-retry"; expect(await approach(refusedCell!),'Cold natural refusal source must remain targetable').not.toBeNull(); const beforeAgent = await record("cold-first-decision-before-agent");
    // Agent pose is navigation setup only; natural source and action run through the real Code Builder.
    await page.evaluate(p => Object.assign(window.__craft.game!.agent, { x: p.x, y: p.y + 1, z: p.z }), refusedCell);
    if (mobile) await press(page.getByRole("button", { name: "Code Builder", exact: true })); else await page.keyboard.press("KeyK"); await expect(page.getByRole("heading", { name: "Code Builder", exact: true })).toBeVisible(); await press(page.locator('[data-palette="destroy"]')); await page.locator('.cb-block[data-type="destroy"] select[aria-label="Direction"]').selectOption("down"); await press(page.getByRole("button", { name: "▶ Run" })); await expect.poll(() => page.evaluate(() => window.__craft.game!.programRunning)).toBe(false); expect(await blockAt(page, refusedCell.x, refusedCell.y, refusedCell.z)).toBe(0);
    const afterAgent = await record("actual-agent-committed-same-cold-result"); expect(afterAgent.counts.map((n, i) => n - beforeAgent.counts[i])).toEqual(decision.flint ? [0, 1] : [1, 0]); expect(afterAgent.inventory.slots[0]).toEqual(beforeAgent.inventory.slots[0]); expect(afterAgent.decisions.records).toEqual([]); await collectWorldDrops(page);
    stage = "actual-flint-drop-cold-pickup"; await teleport(pad);
    const flintId = await page.evaluate(() => window.__craft.stackId("flint"));
    type Stack = { id: number; count: number };
    const flintOwners = (s: { inventory: { slots: (Stack | null)[] }; agent: { slots: (Stack | null)[] }; pending: Stack[]; ground: { key: number; stack: Stack }[] }) => ({
      bag: s.inventory.slots.flatMap((stack, slot) => stack?.id === flintId ? [{ slot, stack }] : []),
      agent: s.agent.slots.flatMap((stack, slot) => stack?.id === flintId ? [{ slot, stack }] : []),
      pending: s.pending.flatMap((stack, index) => stack.id === flintId ? [{ index, stack }] : []),
      ground: s.ground.filter(r => r.stack.id === flintId).map(r => ({ key: r.key, stack: r.stack })).sort((a, b) => a.key - b.key),
    });
    const totalFlint = (s: ReturnType<typeof flintOwners>) => [...s.bag, ...s.agent, ...s.pending, ...s.ground].reduce((n, owner) => n + owner.stack.count, 0);
    const preDropState = await record("actual-ui-before-flint-drop"), preDropOwners = flintOwners(preDropState);
    expect(preDropOwners.bag).toHaveLength(1); expect(preDropOwners.pending).toEqual([]);
    const { slot: flintSlot, stack: sourceFlint } = preDropOwners.bag[0], originalFlintTotal = totalFlint(preDropOwners);
    await open(); await press(inv.locator(`[data-slot="${flintSlot}"]`));
    const cursorState = await record("actual-ui-flint-cursor-before-drop"), cursorOwners = flintOwners(cursorState);
    expect(cursorOwners.bag).toEqual([]); expect(cursorOwners.pending.map(o => o.stack)).toEqual([sourceFlint]);
    expect(cursorOwners.agent).toEqual(preDropOwners.agent); expect(cursorOwners.ground).toEqual(preDropOwners.ground); expect(totalFlint(cursorOwners)).toBe(originalFlintTotal);
    await press(page.getByRole("button", { name: "Drop held item", exact: true }));
    const afterDropState = await record("actual-ui-flint-dropped-before-close"), afterDropOwners = flintOwners(afterDropState);
    expect(afterDropOwners.bag).toEqual([]); expect(afterDropOwners.pending).toEqual([]); expect(afterDropOwners.agent).toEqual(preDropOwners.agent);
    const newFlintGround = afterDropOwners.ground.filter(r => !preDropOwners.ground.some(old => old.key === r.key));
    expect(newFlintGround).toHaveLength(1); expect(newFlintGround[0].stack).toEqual(sourceFlint);
    expect(afterDropOwners.ground.filter(r => r.key !== newFlintGround[0].key)).toEqual(preDropOwners.ground); expect(totalFlint(afterDropOwners)).toBe(originalFlintTotal);
    const droppedKey = newFlintGround[0].key;
    await close(); await teleport({ x: pad.x + 4, y: pad.y, z: pad.z + 4 });
    const dropped = await record("actual-flint-ground-owner"); expect(flintOwners(dropped)).toEqual(afterDropOwners);
    await pause(); const finalRaw = await quit(), finalSave = JSON.parse(finalRaw);
    const savedOwners = flintOwners({ inventory: finalSave.inventory, agent: finalSave.agent, pending: finalSave.inventoryPending ?? [], ground: finalSave.worldDrops.records });
    expect(savedOwners).toEqual(afterDropOwners); expect(savedOwners.ground.find(r => r.key === droppedKey)?.stack).toEqual(sourceFlint);
    await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await waitForTerrain(page);
    const restored = await record("actual-flint-ground-and-decisions-cold-restored"), coldOwners = flintOwners(restored);
    expect(coldOwners).toEqual(savedOwners); expect(restored.decisions.records).toEqual([]); expect(totalFlint(coldOwners)).toBe(originalFlintTotal);
    await collectWorldDrops(page);
    const picked = await record("actual-specific-cold-flint-owner-picked-once"), pickupOwners = flintOwners(picked);
    expect(pickupOwners.ground.some(r => r.key === droppedKey)).toBe(false);
    expect(pickupOwners.ground).toEqual(coldOwners.ground.filter(r => r.key !== droppedKey));
    expect(pickupOwners.bag).toEqual(preDropOwners.bag); expect(pickupOwners.agent).toEqual(coldOwners.agent); expect(pickupOwners.pending).toEqual(coldOwners.pending);
    expect(pickupOwners.bag.reduce((n, o) => n + o.stack.count, 0) - coldOwners.bag.reduce((n, o) => n + o.stack.count, 0)).toBe(sourceFlint.count);
    expect(totalFlint(pickupOwners)).toBe(originalFlintTotal);
    const flintOwnership = { sourceSlot: flintSlot, sourceStack: sourceFlint, droppedKey, originalFlintTotal, preDrop: preDropOwners, cursorBeforeDrop: cursorOwners, afterDrop: afterDropOwners, saved: savedOwners, cold: coldOwners, afterPickup: pickupOwners };
    await snap(page, info, "actual-dropped-flint-cold-restores-and-is-picked-up-once");
    stage = "malformed-decision-original-recovery"; await pause(); await quit(); const corrupt = await page.evaluate(raw => { const d = JSON.parse(raw); d.gravelHarvests.records[0].flint = "yes"; const bad = `\n${JSON.stringify(d, null, 2)}\n`; localStorage.setItem("craft.save.v1", bad); return bad; }, pendingRaw); await page.reload(); await press(page.getByRole("button", { name: /Continue/ })); await expect(page.locator(".chat-log")).toContainText("Damaged gravel harvest decisions"); await page.waitForFunction(() => window.__craft.game!.renderer.isAreaReady(2)); const frozen = await record("raw-malformed-decision-frozen"); await command(page, "/give flint"); await expect(page.locator(".chat-log")).toContainText("Damaged gravel harvest decisions. Export a backup before using commands"); await page.waitForTimeout(31_000); const still = await read(); expect(still.position).toEqual(frozen.position); expect(still.inventory).toEqual(frozen.inventory); expect(still.rawStorage).toBe(corrupt);
    await pause(); await press(page.getByRole("button", { name: "Save & Quit to Title" })); await expect(page.locator(".pause-screen")).toBeVisible(); await expect(page.locator(".save-status")).toContainText("gravel harvest decisions"); const download = page.waitForEvent("download"); await press(page.getByRole("button", { name: "Export world backup" })); const backup = info.outputPath("invalid-gravel-decision-original.json"); await (await download).saveAs(backup); expect(JSON.parse(await fs.readFile(backup, "utf8")).recoveryOriginalSave).toBe(corrupt); await snap(page, info, "malformed-gravel-decision-freezes-and-preserves-exact-original");
    await fs.writeFile(info.outputPath("flint-coverage.json"), JSON.stringify({ observations, attempts, candidates, pendingRaw, finalRaw, decision, flintOwnership, errors, fixtures: "PreownedIronShovel; initialBedrockworkpad; sourcequery/chatteleport/camera/Agentpose navigation; separateworldreceiverfault; separatecorruptstoredpendingdata fromactualrefusalsave. No Gravel/Flint/RNG/outcome injection.", actual: ["finite96naturalcandidates; actualharvests/skipsrecorded; genuineFlintrequired", "oneFlintORoneGravelwholecounts", "actualpickup", "receiverrefusal/source+toolunchanged/firstdecisioncold", "CodeBuilderAgentactualretry samecachedresultonce", "actualFlintUIdrop/groundcold/pickup", "rawpendingguard/31sautosave/command/quit/exactoriginalbackup"], notCovered: ["primitive shovel acquisition/fullSurvival", "naturalcapacityexhaustion (receiverfaultfixture only)", "FlintAndSteel/Fire/Nether/brewing/Antidote", "nativechance/Fortune/SilkTouch/gravelgravity/breath calibration", "Educationexactgraphics/performance/physicalphone"] }, null, 2)); expect(errors).toEqual([]); stage = "complete";
  } catch (error) { failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error); throw error; }
  finally { await finger?.detach().catch(() => undefined); const state = await page.evaluate(() => { const g = window.__craft?.game; return { inventory: g?.inventory.toJSON(), decisions: g?.world.gravelHarvests.exportState(), drops: g?.worldDrops.records, position: g?.body.position, errors: g?.loadErrors, saveError: g?.saveError, rawStorage: localStorage.getItem("craft.save.v1") }; }).catch(error => ({ readbackFailure: String(error) })); await fs.writeFile(info.outputPath("flint-final.json"), JSON.stringify({ stage, failure, observations, attempts, state, errors }, null, 2)); }
}
