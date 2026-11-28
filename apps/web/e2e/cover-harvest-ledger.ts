import { blockId, blockDrops, toolOf, stackId, tryBlockById, Inventory, WorldDrops, sanitizeWorldDrops, type WorldDropsData, type Vec3, type InventoryData, type ItemStack } from '@craft/engine';

export type CoverCell = { x: number; y: number; z: number };
export const COVER_SITES = Object.freeze([{ x: -62, z: -60 }, { x: -61, z: -64 }, { x: -58, z: -59 }]);
export const COVER_PLAN = COVER_SITES.flatMap((site, siteIndex) => [32, 31, 30, 29, 28].map(y => ({ ...site, y, siteIndex, id: blockId(y === 32 ? 'grass' : y === 28 ? 'iron_ore' : 'dirt') })));
export const COVER_REGION = Object.freeze({ min: { x: -68, y: 0, z: -70 }, max: { x: -52, y: 40, z: -53 } });
export interface CoverSnapshot {
  cells: Array<CoverCell & { id: number | null; revision: number | null }>;
  edits: number[][]; version: number; generatorVersion: number; seed: number;
  inventory: InventoryData; agent: unknown; agentSlots: (ItemStack | null)[];
  pending: ItemStack[]; cursor: ItemStack | null;
  ground: WorldDropsData;
  frame: CoverPublicFrame; frames: CoverPublicFrame[];
  decisions: unknown; target: (CoverCell & { id: number }) | null;
  body: unknown; permissions: Array<{ key: string; allowed: boolean; loaded: boolean }>;
  browserTime: number;
}
/** After-Game RAF observations; private identity/birth is deliberately unavailable.
 * Physics is checked against the real PUBLIC WorldDrops model on detached copies only. */
export interface CoverPublicFrame {
  sequence: number; deltaSeconds: number; clock: number; lastTime: number; frameCount: number; fpsTimer: number; rafTime: number;
  position: Vec3; inventory: InventoryData; ground: WorldDropsData; version: number;
  planned: Array<{ key: string; id: number | null; revision: number | null }>;
  regionLoaded: boolean; dropsActive: boolean; pickupActive: boolean;
}
export interface CoverReceipt { removed: Array<CoverCell & { id: number; revisionBefore: number; revisionAfter: number }>; expectedDrops: ItemStack[]; toolSlot: number; toolWear: number; beforeVersion: number; afterVersion: number }
export const coverKey = (p: CoverCell) => `${p.x},${p.y},${p.z}`;
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
function requireThat(value: unknown, reason: string): asserts value { if (!value) throw new Error(`cover-ledger: ${reason}`); }
const equal = (a: unknown, b: unknown, reason: string) => requireThat(canonical(a) === canonical(b), reason);
const stackKind = (s: ItemStack) => { const { count: _count, ...metadata } = s; return canonical(metadata); };
function totals(stacks: (ItemStack | null)[]) {
  const result: Record<string, number> = {};
  for (const s of stacks) if (s) { requireThat(Number.isSafeInteger(s.count) && s.count > 0 && Number.isSafeInteger(s.id), 'invalid stack'); const k = stackKind(s); result[k] = (result[k] ?? 0) + s.count; }
  return result;
}
function allStacks(s: CoverSnapshot): (ItemStack | null)[] {
  // pendingItems ALREADY includes cursor; retain cursor separately but never double-count it.
  return [...s.inventory.slots, ...Object.values(s.inventory.equipment ?? {}), s.inventory.offhand ?? null, ...s.agentSlots, ...s.pending, ...s.ground.records.map(r => r.stack)].map(x => x ?? null);
}
function valid(s: CoverSnapshot) {
  requireThat(s.seed === 12345 && s.generatorVersion === 3, 'wrong seed/generator');
  requireThat(s.inventory.slots.length === 36 && s.agentSlots.length === 27, 'incomplete owners');
  requireThat(s.pending.length === 0 && s.cursor === null, 'unexpected pending/cursor owner');
  const count = (COVER_REGION.max.x - COVER_REGION.min.x + 1) * (COVER_REGION.max.y - COVER_REGION.min.y + 1) * (COVER_REGION.max.z - COVER_REGION.min.z + 1);
  requireThat(s.cells.length === count, 'incomplete region');
  const keys = new Set<string>();
  for (const c of s.cells) { requireThat(c.id !== null && !!tryBlockById(c.id) && c.revision !== null && Number.isSafeInteger(c.revision), 'unknown cell/revision'); requireThat(!keys.has(coverKey(c)), 'duplicate cell'); keys.add(coverKey(c)); requireThat([c.x,c.y,c.z].every(Number.isSafeInteger), 'noninteger cell'); requireThat(c.x >= COVER_REGION.min.x && c.x <= COVER_REGION.max.x && c.y >= 0 && c.y <= COVER_REGION.max.y && c.z >= COVER_REGION.min.z && c.z <= COVER_REGION.max.z, 'region remapped'); }
  requireThat(s.permissions.length === COVER_PLAN.length && new Set(s.permissions.map(p => p.key)).size === COVER_PLAN.length, 'incomplete permission ledger');
  for (const p of COVER_PLAN) requireThat(s.permissions.some(q => q.key === coverKey(p) && q.loaded && q.allowed), 'permission refused/unknown');
  const clean = sanitizeWorldDrops(s.ground);
  requireThat(clean.invalid === 0, 'invalid public ground metadata/stack');
  equal(clean.data,s.ground,'incomplete/noncanonical public ground metadata');
  requireThat(typeof s.frame?.deltaSeconds==='number'&&Number.isFinite(s.frame.deltaSeconds)&&s.frame.deltaSeconds>=0&&s.frame.deltaSeconds<=.1,'invalid frame delta telemetry');
  requireThat(Number.isFinite(s.browserTime)&&s.browserTime>=s.frame.rafTime, 'invalid observation time');
  equal((s.body as {position?:Vec3}|null)?.position,s.frame.position,'body/frame position mismatch');
  requireThat(s.frame && Array.isArray(s.frames), 'missing public frame observations');
  equal(s.frame.inventory,s.inventory,'frame/bag mismatch');equal(s.frame.ground,s.ground,'frame/ground mismatch');
  requireThat(s.frame.version===s.version,'frame/world version mismatch');
  const groundKeys = new Set<number>();
  requireThat(Number.isSafeInteger(s.ground.nextKey) && s.ground.nextKey > 0, 'invalid ground nextKey');
  for (const r of s.ground.records) { requireThat(Number.isSafeInteger(r.key) && r.key > 0 && r.key < s.ground.nextKey && !groundKeys.has(r.key), 'ground key invalid/duplicate'); groundKeys.add(r.key); }
  totals(allStacks(s));
}
export function assertCoverProgress(s: CoverSnapshot, proven: ReadonlySet<string>) {
  valid(s); const cells = new Map(s.cells.map(c => [coverKey(c), c]));
  for (const key of proven) requireThat(COVER_PLAN.some(p => coverKey(p) === key), 'foreign proven cell');
  for (const p of COVER_PLAN) requireThat(cells.get(coverKey(p))?.id === (proven.has(coverKey(p)) ? 0 : p.id), 'unexplained AIR/changed planned source');
}
export function assertCoverBaseline(s: CoverSnapshot) {
  assertCoverProgress(s, new Set());
  for (const name of ['iron_shovel', 'iron_axe', 'iron_pickaxe']) requireThat(s.inventory.slots.slice(0, 9).some(stack => stack?.id === stackId(name) && stack.count === 1), 'original tool missing');
}
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-8;
function samePublicGround(actual:WorldDropsData,expected:WorldDropsData) {
  requireThat(actual.nextKey===expected.nextKey && actual.records.length===expected.records.length,'public ground transition/key mismatch');
  for(let i=0;i<actual.records.length;i++){
    const a=actual.records[i],b=expected.records[i];requireThat(a.key===b.key,'public ground key/order mismatch');equal(a.stack,b.stack,'public ground stack transition');
    for(const axis of ['x','y','z']as const)requireThat(near(a.position[axis],b.position[axis])&&near(a.velocity[axis],b.velocity[axis]),'unsupported public ground motion');
    requireThat(near(a.ageSeconds,b.ageSeconds)&&near(a.pickupDelaySeconds,b.pickupDelaySeconds),'unsupported public ground timing');
  }
}
/** Conservative finite observation proof, NOT a claim about unobserved continuous/native
 * trajectories. Missing/out-of-order frames or any query beyond the loaded snapshot refuse.
 * Game order is interact -> WorldDrops.update(dt) -> tryPickup(observed body). */
function publicTransitions(before:CoverSnapshot,after:CoverSnapshot,allowed:ReadonlyArray<CoverCell & {id:number}>) {
  const terrain=new Map(before.cells.map(c=>[coverKey(c),c.id!])),remaining=new Map(allowed.map(c=>[coverKey(c),c]));
  let unknown=false,previous=before.frame;
  const model=new WorldDrops({getLoadedBlock:(x,y,z)=>{const id=terrain.get(`${x},${y},${z}`);if(id===undefined)unknown=true;return id;}} ,before.ground);
  requireThat(model.loadIssues===0,'invalid public ground before replay');
  let inventory=Inventory.fromJSON(before.inventory);
  equal(previous.planned,COVER_PLAN.map(p=>{const c=before.cells.find(c=>coverKey(c)===coverKey(p))!;return{key:coverKey(p),id:c.id,revision:c.revision};}),'initial frame/source mismatch');
  for(const frame of after.frames){
    requireThat(Number.isSafeInteger(frame.sequence)&&frame.sequence===previous.sequence+1,'missing observer sequence/frame');
    requireThat(frame.regionLoaded&&frame.rafTime===frame.lastTime,'missing loaded/after-Game RAF evidence');
    requireThat([frame.deltaSeconds,frame.clock,frame.lastTime,frame.fpsTimer,frame.rafTime,...Object.values(frame.position)].every(Number.isFinite),'invalid public frame numbers');
    // Use the exact Number supplied to tick. Differencing cumulative clock values
    // loses bits and can change a strict pickup-delay branch after repeated steps.
    const dt=frame.deltaSeconds,clockDelta=frame.clock-previous.clock,rafGap=(frame.rafTime-previous.rafTime)/1000;
    // A real RAF may clamp an ahead-of-RAF resume timestamp to zero. It still
    // has a new observer sequence/frame counter and may perform eligible pickup.
    requireThat(dt>=0&&dt<=.1&&clockDelta>=0&&near(clockDelta,dt)&&rafGap>0&&dt<=rafGap+1e-8,'missing/duplicate/out-of-order Game frame or invalid simulation clock');
    // Bind the observed FPS reset/increment branch to the exact supplied dt,
    // retaining the existing numerical consistency tolerance.
    const elapsed=previous.fpsTimer+dt,reset=frame.frameCount===0&&frame.fpsTimer===0;
    requireThat(reset?elapsed>=1-1e-8:frame.frameCount===previous.frameCount+1&&elapsed<1+1e-8&&near(frame.fpsTimer,elapsed),'missing Game frame counter evidence');
    requireThat(frame.planned.length===15&&new Set(frame.planned.map(p=>p.key)).size===15,'incomplete per-frame planned cells');
    const changes=frame.planned.filter(p=>{const prior=previous.planned.find(q=>q.key===p.key);requireThat(prior,'frame source remapped');if(p.id===prior.id){requireThat(p.revision===prior.revision,'frame same-ID remap');return false;}return true;});
    requireThat(changes.length<=1&&frame.version-previous.version===changes.length,'unobserved/extra per-frame mutation');
    inventory.selected=frame.inventory.selected; // observed normal selection, detached receiver only
    for(const change of changes){
      const source=remaining.get(change.key),prior=previous.planned.find(p=>p.key===change.key)!;
      requireThat(source&&prior.id===source.id&&change.id===0&&change.revision===frame.version,'unapproved per-frame source removal');
      const selected=inventory.selectedStack(),tool=selected&&toolOf(selected.id);
      requireThat(selected&&tool&&selected.id===stackId(source.y===28?'iron_pickaxe':'iron_shovel'),'per-frame wrong tool');
      selected.damage=(selected.damage??0)+1;requireThat(selected.damage<tool.durability,'per-frame tool breaks unsupported');
      terrain.set(change.key,0);
      const drops=blockDrops(source.id,()=>{throw Error('cover-ledger: unexpected random source');});
      requireThat(model.spawnBatch(drops,{x:source.x+.5,y:source.y+.5,z:source.z+.5}),'detached public birth refused');
      remaining.delete(change.key);
    }
    if(frame.dropsActive){model.update(dt);if(frame.pickupActive)model.tryPickup(frame.position,stack=>inventory.addStack(stack));}
    requireThat(!unknown,'public physics query outside captured loaded region');
    samePublicGround(frame.ground,model.toJSON());equal(frame.inventory,inventory.toJSON(),'unsupported public pickup/bag transition');
    previous=frame;
  }
  requireThat(remaining.size===0,'missing actual source frame witness');
  equal(previous,after.frame,'endpoint missing final public frame');
  samePublicGround(after.ground,model.toJSON());equal(after.inventory,inventory.toJSON(),'unobserved endpoint bag transition');
}
function conservedOwners(before: CoverSnapshot, after: CoverSnapshot, expectedDrops: ItemStack[], toolSlot?: number, wear = 0, removals:ReadonlyArray<CoverCell & {id:number}>=[]) {
  equal(after.agent, before.agent, 'Agent owner changed'); equal(after.agentSlots, before.agentSlots, 'Agent slots changed');
  equal(after.pending, before.pending, 'pending owner changed'); equal(after.cursor, before.cursor, 'cursor changed');
  equal(after.inventory.equipment, before.inventory.equipment, 'equipment changed'); equal(after.inventory.offhand, before.inventory.offhand, 'offhand changed');
  equal(after.decisions, before.decisions, 'harvest decisions changed');
  const adjusted = structuredClone(before);
  if (toolSlot !== undefined) {
    const old = before.inventory.slots[toolSlot], next = after.inventory.slots[toolSlot];
    requireThat(old && toolOf(old.id) && (old.damage ?? 0) + wear < toolOf(old.id)!.durability, 'tool missing/broken');
    equal(next, { ...old, damage: (old.damage ?? 0) + wear }, 'wrong tool wear/metadata');
    adjusted.inventory.slots[toolSlot] = structuredClone(next);
    requireThat(after.inventory.selected === before.inventory.selected, 'selection changed during hold');
  }
  publicTransitions(before,after,removals);
  const wanted = totals([...allStacks(adjusted), ...expectedDrops]); equal(totals(allStacks(after)), wanted, 'material/metadata conservation failed');
  // Bag-ground transfer and compatible ground merging are permitted. Existing surviving keys
  // cannot change stack metadata, and newly visible keys must belong to the actual birth range.
  for (const r of after.ground.records) { const old = before.ground.records.find(a => a.key === r.key); if (old) equal(stackKind(r.stack), stackKind(old.stack), 'ground key metadata remapped'); else requireThat(r.key >= before.ground.nextKey, 'old ground key resurrected'); }
  requireThat(after.ground.nextKey === before.ground.nextKey + expectedDrops.length, 'ground birth count mismatch');
  // No inventory UI is used here: only the tool and pickup destinations may change.
  for (let i = 0; i < 36; i++) if (i !== toolSlot) { const a = before.inventory.slots[i], b = after.inventory.slots[i]; if (a) requireThat(b && stackKind(a) === stackKind(b) && b.count >= a.count, 'bag item removed/remapped'); }
}
/** Navigation/selection/pickup between holds cannot grant removal credit or consume owners. */
export function assertCoverTransfer(before: CoverSnapshot, after: CoverSnapshot, proven: ReadonlySet<string>) {
  assertCoverProgress(before, proven); assertCoverProgress(after, proven);
  equal(after.cells, before.cells, 'cell/revision changed outside receipt'); equal(after.edits, before.edits, 'edits changed outside receipt'); requireThat(after.version === before.version, 'world changed outside receipt');
  conservedOwners(before, after, []);
}
/** Preflight runs BEFORE physical Down; the same checks are repeated when reconciling. */
export function assertCoverInput(before: CoverSnapshot, proven: ReadonlySet<string>, intended: CoverCell) {
  assertCoverProgress(before, proven);
  const planned = COVER_PLAN.find(p => coverKey(p) === coverKey(intended)); requireThat(planned && !proven.has(coverKey(planned)), 'source not eligible');
  equal(before.target && { x: before.target.x, y: before.target.y, z: before.target.z, id: before.target.id }, { x: planned.x, y: planned.y, z: planned.z, id: planned.id }, 'target mismatch');
  const orePhase = planned.y === 28, selected = before.inventory.selected, tool = before.inventory.slots[selected];
  requireThat(selected >= 0 && selected < 9 && tool?.id === stackId(orePhase ? 'iron_pickaxe' : 'iron_shovel') && tool.count === 1, 'wrong selected tool');
  if (orePhase) requireThat(COVER_PLAN.filter(p => p.siteIndex === planned.siteIndex && p.y > 28).every(p => proven.has(coverKey(p))), 'Ore before all covers proven');
  return { planned, orePhase, selected };
}
/** Exact bounded batch, never arbitrary AIR skipping. This function returns credit only after
 * every changed physical cell, drop, owner and selected tool is reconciled successfully. */
export function reconcileCoverHold(before: CoverSnapshot, after: CoverSnapshot, proven: ReadonlySet<string>, intended: CoverCell): CoverReceipt {
  assertCoverProgress(before, proven); valid(after);
  const { planned, orePhase, selected } = assertCoverInput(before, proven, intended);
  const afterCells = new Map(after.cells.map(c => [coverKey(c), c]));
  const removed: CoverReceipt['removed'] = [];
  for (const cell of before.cells) {
    const next = afterCells.get(coverKey(cell)); requireThat(next, 'cell remapped');
    if (cell.id === next.id) { requireThat(cell.revision === next.revision, 'same-ID source remapped'); continue; }
    const p = COVER_PLAN.find(p => coverKey(p) === coverKey(cell));
    requireThat(p && !proven.has(coverKey(p)) && p.siteIndex === planned.siteIndex && p.id === cell.id && next.id === 0, 'unplanned/unknown physical change');
    requireThat(orePhase ? p.y === 28 : p.y > 28, 'premature Ore/incorrect phase');
    requireThat(tryBlockById(cell.id!)!.hardness > 0 && Number.isFinite(tryBlockById(cell.id!)!.hardness) && next.revision! > cell.revision!, 'invalid physical removal');
    removed.push({ x: cell.x, y: cell.y, z: cell.z, id: cell.id!, revisionBefore: cell.revision!, revisionAfter: next.revision! });
  }
  requireThat(removed.some(p => coverKey(p) === coverKey(intended)), 'intended source not removed');
  requireThat(after.version - before.version === removed.length, 'extra/remapped world mutation');
  const beforeEdits = new Map(before.edits.map(e => [e.slice(0, 3).join(','), e[3]]));
  const expectedEdits = new Map(beforeEdits); for (const c of removed) expectedEdits.set(coverKey(c), 0);
  equal([...new Map(after.edits.map(e => [e.slice(0, 3).join(','), e[3]]))].sort(), [...expectedEdits].sort(), 'unaccounted world edit');
  const expectedDrops = removed.flatMap(c => blockDrops(c.id, () => { throw new Error('cover-ledger: random drop unexpected'); }));
  requireThat(expectedDrops.length === removed.length && expectedDrops.every(s => s.count === 1 && Object.keys(s).length === 2), 'non-deterministic cover drop');
  conservedOwners(before, after, expectedDrops, selected, removed.length,removed);
  const nextProven = new Set([...proven, ...removed.map(coverKey)]); assertCoverProgress(after, nextProven);
  return { removed, expectedDrops, toolSlot: selected, toolWear: removed.length, beforeVersion: before.version, afterVersion: after.version };
}
