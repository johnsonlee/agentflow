import { expect, it } from 'vitest';
import { blockId, blockDrops, stackId, WorldDrops, Inventory, type WorldDropsData } from '@craft/engine';
import { assertCoverBaseline, assertCoverInput, assertCoverProgress, assertCoverTransfer, reconcileCoverHold, COVER_PLAN, COVER_REGION, coverKey, type CoverSnapshot, type CoverPublicFrame } from '../e2e/cover-harvest-ledger';

function baseline(): CoverSnapshot {
  const cells: CoverSnapshot['cells'] = [];
  for (let y = 0; y <= COVER_REGION.max.y; y++) for (let z = COVER_REGION.min.z; z <= COVER_REGION.max.z; z++) for (let x = COVER_REGION.min.x; x <= COVER_REGION.max.x; x++) cells.push({ x, y, z, id: COVER_PLAN.find(p => p.x === x && p.y === y && p.z === z)?.id ?? 0, revision: 0 });
  const slots: CoverSnapshot['inventory']['slots'] = Array.from({ length: 36 }, () => null);
  for (const [i, name] of ['iron_shovel', 'iron_axe', 'iron_pickaxe'].entries()) slots[i] = { id: stackId(name), count: 1 };
  const value:Omit<CoverSnapshot,'frame'|'frames'> = { cells, edits: [], version: 0, generatorVersion: 3, seed: 12345, inventory: { slots, selected: 0, offhand: null, equipment: { head: null, chest: null, legs: null, feet: null } }, agent: { slots: Array(27).fill(null), x: 0, y: 0, z: 0 }, agentSlots: Array(27).fill(null), pending: [], cursor: null, ground: { nextKey: 1, records: [] }, decisions: { records: [] }, target: { ...COVER_PLAN[0] }, body: { position: { x: -59.5, y: 33, z: -59.5 } }, permissions: COVER_PLAN.map(p => ({ key: coverKey(p), allowed: true, loaded: true })), browserTime: 1 };
  value.inventory=Inventory.fromJSON(value.inventory).toJSON();return{...value,frame:frameFor(value,0),frames:[]};
}
function frameFor(s:Omit<CoverSnapshot,'frame'|'frames'>,time:number,deltaSeconds=0):CoverPublicFrame{return{deltaSeconds,sequence:Math.round(time/20),clock:time/1000,lastTime:time,frameCount:Math.round(time/20),fpsTimer:time/1000,rafTime:time,position:{x:-59.5,y:33,z:-59.5},inventory:structuredClone(s.inventory),ground:structuredClone(s.ground),version:s.version,planned:COVER_PLAN.map(p=>{const c=s.cells.find(c=>coverKey(c)===coverKey(p))!;return{key:coverKey(p),id:c.id,revision:c.revision};}),regionLoaded:true,dropsActive:true,pickupActive:true};}
function sync(s:CoverSnapshot){s.frame.version=s.version;s.frame.planned=COVER_PLAN.map(p=>{const c=s.cells.find(c=>coverKey(c)===coverKey(p))!;return{key:coverKey(p),id:c.id,revision:c.revision};});s.frame.inventory=structuredClone(s.inventory);s.frame.ground=structuredClone(s.ground);if(s.frames.length)s.frames[s.frames.length-1]=structuredClone(s.frame);}

function batch(before: CoverSnapshot, indices = [0, 1, 2]) {
  const after = structuredClone(before);after.frames=[];
  const model=new WorldDrops({getLoadedBlock:(x,y,z)=>after.cells.find(c=>c.x===x&&c.y===y&&c.z===z)?.id??undefined},before.ground);
  const inventory=Inventory.fromJSON(before.inventory);
  for (const [i,index] of indices.entries()) {
    const p=COVER_PLAN[index],cell=after.cells.find(c=>coverKey(c)===coverKey(p))!;cell.id=0;cell.revision=++after.version;after.edits.push([p.x,p.y,p.z,0]);
    model.spawnBatch(blockDrops(p.id,()=>{throw Error('unexpected RNG');}),{x:p.x+.5,y:p.y+.5,z:p.z+.5});
    inventory.slots[before.inventory.selected]!.damage=(inventory.slots[before.inventory.selected]!.damage??0)+1;
    model.update(.02);model.tryPickup(before.frame.position,stack=>inventory.addStack(stack));
    after.inventory=inventory.toJSON();after.ground=model.toJSON();after.frame=frameFor(after,before.frame.lastTime+(i+1)*20,.02);after.frame.position={...before.frame.position};after.frames.push(structuredClone(after.frame));
  }
  after.browserTime=before.browserTime+indices.length*20;return after;
}
const fail = (fn: () => unknown, message: string) => expect(fn).toThrow(message);
const mutateBatch = (mutate: (s: CoverSnapshot) => void) => { const before = baseline(), after = batch(before); mutate(after); sync(after); return () => reconcileCoverHold(before, after, new Set(), COVER_PLAN[0]); };

it('accepts a strict synthetic Grass+Dirt+Dirt three-removal receipt and grants later AIR credit only to those exact cells', () => {
  const before = baseline(), after = batch(before); assertCoverBaseline(before);
  const original = JSON.stringify({ before, after });
  const receipt = reconcileCoverHold(before, after, new Set(), COVER_PLAN[0]);
  expect(receipt.removed.map(coverKey)).toEqual([COVER_PLAN[2], COVER_PLAN[1], COVER_PLAN[0]].map(coverKey));
  expect(receipt.expectedDrops).toEqual(Array(3).fill({ id: blockId('dirt'), count: 1 })); expect(receipt.toolWear).toBe(3);
  const proven = new Set(receipt.removed.map(coverKey)); assertCoverProgress(after, proven); const unchanged=structuredClone(after);unchanged.frames=[];assertCoverTransfer(after, unchanged, proven);
  fail(() => assertCoverProgress(after, new Set([coverKey(COVER_PLAN[0])])), 'unexplained AIR');
  expect(JSON.stringify({ before, after })).toBe(original);
});
it('requires all15 exact baseline cells before the first cover input, including all three Iron sources', () => {
  for (const index of [0, 1, 4, 9, 14]) { const before = baseline(); before.cells.find(c => coverKey(c) === coverKey(COVER_PLAN[index]))!.id = 0; fail(() => assertCoverBaseline(before), 'unexplained AIR'); }
});
it('rejects unknown/unloaded and missing or remapped finite-region cells', () => {
  const a = baseline(); a.cells[0].id = null; fail(() => assertCoverBaseline(a), 'unknown cell');
  const b = baseline(); b.cells.pop(); fail(() => assertCoverBaseline(b), 'incomplete region');
  const c = baseline(); c.cells[0] = { ...c.cells[1] }; fail(() => assertCoverBaseline(c), 'duplicate cell');
});
it('rejects an unplanned neighbor even if material total and tool wear would balance', () => {
  const before = baseline(); const c = before.cells.find(c => c.x === -63 && c.y === 32 && c.z === -60)!; c.id = blockId('dirt');
  const after = batch(before, [0]); const next = after.cells.find(c => c.x === -63 && c.y === 32 && c.z === -60)!; next.id = 0; next.revision = ++after.version; after.edits.push([-63, 32, -60, 0]); after.inventory.slots[0]!.damage = 2; after.ground.records.push(record(after.ground.nextKey++,{x:-62.5,y:32.5,z:-59.5},.5));sync(after);
  fail(() => reconcileCoverHold(before, after, new Set(), COVER_PLAN[0]), 'unplanned');
});
it('rejects premature Ore with a shovel even when the Ore drops and wear are otherwise conserved', () => {
  const before = baseline(), after = batch(before, [0, 4]); fail(() => reconcileCoverHold(before, after, new Set(), COVER_PLAN[0]), 'premature Ore');
});
it('rejects wrong tool selection or target before physical Down', () => {
  const before = baseline(); before.inventory.selected = 2; sync(before); fail(() => assertCoverInput(before, new Set(), COVER_PLAN[0]), 'wrong selected tool');
  before.inventory.selected = 0; sync(before); before.target = { ...COVER_PLAN[1] }; fail(() => assertCoverInput(before, new Set(), COVER_PLAN[0]), 'target mismatch');
});
it('rejects missing tool wear and tool metadata substitution', () => {
  fail(mutateBatch(a => { a.inventory.slots[0]!.damage = 2; }), 'wrong tool wear');
  fail(mutateBatch(a => { a.inventory.slots[0]!.book = { pages: [] }; }), 'wrong tool wear');
});
it('rejects owner loss, surplus material, changed drop metadata and ground key resurrection', () => {
  fail(mutateBatch(a => { a.ground.records.pop(); }), 'cover-ledger:');
  fail(mutateBatch(a => { a.ground.records[0].stack.count = 2; }), 'cover-ledger:');
  fail(mutateBatch(a => { a.ground.records[0].stack.book = { pages: [] }; }), 'cover-ledger:');
  const before = baseline(); before.ground.nextKey = 5; sync(before); const after = batch(before); after.ground.records[0].key = 2; sync(after); fail(() => reconcileCoverHold(before, after, new Set(), COVER_PLAN[0]), 'public ground');
});
it('rejects Agent, cursor/pending, offhand and equipment changes', () => {
  fail(mutateBatch(a => { a.agentSlots[0] = { id: blockId('dirt'), count: 1 }; }), 'Agent slots');
  fail(mutateBatch(a => { a.pending.push({ id: blockId('dirt'), count: 1 }); }), 'pending/cursor');
  fail(mutateBatch(a => { a.cursor = { id: blockId('dirt'), count: 1 }; }), 'pending/cursor');
  fail(mutateBatch(a => { a.inventory.offhand = { id: blockId('dirt'), count: 1 }; }), 'offhand');
  fail(mutateBatch(a => { a.inventory.equipment!.head = { id: blockId('dirt'), count: 1 }; }), 'equipment');
});
function transferFrame(before:CoverSnapshot,position=before.frame.position,dt=.02):CoverSnapshot{
 const after=structuredClone(before),model=new WorldDrops({getLoadedBlock:(x,y,z)=>after.cells.find(c=>c.x===x&&c.y===y&&c.z===z)?.id??undefined},before.ground),inventory=Inventory.fromJSON(before.inventory);
 model.update(dt);model.tryPickup(position,stack=>inventory.addStack(stack));after.inventory=inventory.toJSON();after.ground=model.toJSON();after.frame=frameFor(after,before.frame.lastTime+dt*1000,dt);after.frame.position={...position};after.body={...(before.body as object),position:{...position}};after.frames=[structuredClone(after.frame)];after.browserTime+=dt*1000;return after;
}
const record=(key:number,position={x:-59.5,y:33,z:-59.5},delay=0)=>({key,stack:{id:blockId('dirt'),count:1},position,velocity:{x:0,y:0,z:0},ageSeconds:1,pickupDelaySeconds:delay});
function withGround(records:WorldDropsData['records']):CoverSnapshot{const s=baseline();s.ground={nextKey:Math.max(...records.map(r=>r.key))+1,records};sync(s);return s;}
it('accepts genuine public-rule motion, eligible pickup and compatible nearby merging using complete frame records',()=>{
 const motion=withGround([record(1,{x:-63.5,y:35,z:-60.5},10)]),moved=transferFrame(motion);expect(moved.ground.records[0].position.y).toBeLessThan(35);assertCoverTransfer(motion,moved,new Set());
 const pickup=withGround([record(1)]),picked=transferFrame(pickup);expect(picked.ground.records).toEqual([]);expect(picked.inventory.slots.some(s=>s?.id===blockId('dirt'))).toBe(true);assertCoverTransfer(pickup,picked,new Set());
 const merge=withGround([record(1,{x:-63.5,y:35,z:-60.5},10),record(2,{x:-63.4,y:35,z:-60.5},10)]),merged=transferFrame(merge);expect(merged.ground.records).toHaveLength(1);expect(merged.ground.records[0].stack.count).toBe(2);assertCoverTransfer(merge,merged,new Set());
});
it('rejects missing/invalid public ground metadata and capacity overflow',()=>{
 const before=withGround([record(1)]);
 for(const field of ['position','velocity','ageSeconds','pickupDelaySeconds']){const after=structuredClone(before);delete(after.ground.records[0]as unknown as Record<string,unknown>)[field];sync(after);fail(()=>assertCoverTransfer(before,after,new Set()),'public ground');}
 const bad=structuredClone(before);bad.ground.records[0].velocity.y=NaN;sync(bad);fail(()=>assertCoverBaseline(bad),'public ground');
 const overflow=structuredClone(before);overflow.ground.records[0].stack.count=65;sync(overflow);fail(()=>assertCoverBaseline(overflow),'public ground');
});
it('rejects the original unchanged-time distant delay-active pickup counterexample and unobserved endpoint changes',()=>{
 const before=withGround([record(1,{x:1000,y:30,z:1000},10)]),after=structuredClone(before);after.ground.records=[];after.inventory.slots[5]={id:blockId('dirt'),count:1};sync(after);
 fail(()=>assertCoverTransfer(before,after,new Set()),'public frame');
});
it('rejects delay-active and distant pickup even when material totals balance and a complete next frame is claimed',()=>{
 for(const before of [withGround([record(1,undefined,10)]),withGround([record(1,{x:-63.5,y:35,z:-60.5})])]){
  const after=transferFrame(before);after.ground.records=[];after.inventory.slots[5]={id:blockId('dirt'),count:1};sync(after);fail(()=>assertCoverTransfer(before,after,new Set()),'public ground');
 }
});
it('rejects an impossible distant merge, public motion/timing remap and missing/out-of-order frame evidence',()=>{
 const before=withGround([record(1,{x:-63.5,y:35,z:-60.5},10),record(2,{x:-60.5,y:35,z:-60.5},10)]),after=transferFrame(before);after.ground.records[0].stack.count=2;after.ground.records.pop();sync(after);fail(()=>assertCoverTransfer(before,after,new Set()),'public ground');
 const one=withGround([record(1,{x:-63.5,y:35,z:-60.5},10)]);
 for(const change of [(s:CoverSnapshot)=>{s.ground.records[0].position.x+=10;},(s:CoverSnapshot)=>{s.ground.records[0].pickupDelaySeconds=0;}]){const remap=transferFrame(one);change(remap);sync(remap);fail(()=>assertCoverTransfer(one,remap,new Set()),'public ground');}
 const body=transferFrame(one);(body.body as {position:{x:number}}).position.x+=10;fail(()=>assertCoverTransfer(one,body,new Set()),'body/frame');
 const time=transferFrame(one);time.browserTime=-1;fail(()=>assertCoverTransfer(one,time,new Set()),'observation time');
 const gap=transferFrame(one);gap.frames[0].sequence++;gap.frame.sequence++;fail(()=>assertCoverTransfer(one,gap,new Set()),'missing observer sequence');
 const missing=transferFrame(one);missing.frames=[];fail(()=>assertCoverTransfer(one,missing,new Set()),'final public frame');
 const unloaded=transferFrame(one);unloaded.frames[0].regionLoaded=false;fail(()=>assertCoverTransfer(one,unloaded,new Set()),'loaded/after-Game');
 const order=transferFrame(one);order.frames[0].rafTime-=1;fail(()=>assertCoverTransfer(one,order,new Set()),'after-Game RAF');
});
it('rejects same-ID remove/reinsert, extra world mutations and unaccounted edits', () => {
  fail(mutateBatch(a => { a.cells[0].revision = 4; }), 'same-ID source remapped');
  fail(mutateBatch(a => { a.version++; }), 'world mutation');
  fail(mutateBatch(a => { a.edits.push([1, 1, 1, 0]); }), 'world edit');
});
it('rejects permission refusal, wrong seed and missing original tools', () => {
  const a = baseline(); a.permissions[0].allowed = false; fail(() => assertCoverBaseline(a), 'permission');
  const b = baseline(); b.seed = 123; fail(() => assertCoverBaseline(b), 'seed');
  const c = baseline(); c.inventory.slots[1] = null; sync(c); fail(() => assertCoverBaseline(c), 'tool missing');
});
it('requires proper Pickaxe and previously proven four covers for an exact one-Ore receipt', () => {
  const initial = baseline(), covers = batch(initial, [0, 1, 2, 3]);
  const receipt = reconcileCoverHold(initial, covers, new Set(), COVER_PLAN[0]), proven = new Set(receipt.removed.map(coverKey));
  const oreBefore = structuredClone(covers); oreBefore.inventory.selected = 2; oreBefore.target = { ...COVER_PLAN[4] }; sync(oreBefore);
  const after = batch(oreBefore, [4]);
  expect(reconcileCoverHold(oreBefore, after, proven, COVER_PLAN[4]).expectedDrops).toEqual([{ id: blockId('iron_ore'), count: 1 }]);
  fail(() => assertCoverInput(oreBefore, new Set(), COVER_PLAN[4]), 'unexplained AIR');
});

/** Recorded schedule controls, not writes to any Game clock or requestFrame method. */
function observedStep(before:CoverSnapshot,rafTime:number,dt:number,position=before.frame.position):CoverSnapshot{
 const after=transferFrame(before,position,dt),reset=before.frame.fpsTimer+dt>=1;
 after.frame={...after.frame,deltaSeconds:dt,sequence:before.frame.sequence+1,clock:before.frame.clock+dt,lastTime:rafTime,rafTime,
  frameCount:reset?0:before.frame.frameCount+1,fpsTimer:reset?0:before.frame.fpsTimer+dt};
 after.frames=[structuredClone(after.frame)];after.browserTime=rafTime+1;return after;
}
function atPriorRaf():CoverSnapshot{
 const before=withGround([record(1,{x:-63.5,y:35,z:-60.5},10)]);
 before.frame={...before.frame,sequence:50,clock:7.5,lastTime:1000,rafTime:1000,frameCount:10,fpsTimer:.25};
 before.browserTime=1001;return before;
}
it('accepts actual simulation .010 after prior RAF1000, chat resume reset1010, next RAF1020, with matching fresh body evidence',()=>{
 const before=atPriorRaf(),after=observedStep(before,1020,.010,{x:-61.5,y:32,z:-59.5});
 expect(after.frame.clock-before.frame.clock).toBeCloseTo(.010,12);
 expect((after.frame.rafTime-before.frame.rafTime)/1000).toBe(.020);
 assertCoverTransfer(before,after,new Set());assertCoverInput(after,new Set(),COVER_PLAN[0]);
 expect((after.body as {position:unknown}).position).toEqual(after.frame.position);
});
it('accepts ordinary, FPS-counter-reset and .1-clamped observed simulation intervals',()=>{
 const ordinary=atPriorRaf();assertCoverTransfer(ordinary,observedStep(ordinary,1020,.020),new Set());
 const reset=atPriorRaf();reset.frame.fpsTimer=.995;assertCoverTransfer(reset,observedStep(reset,1020,.010),new Set());
 const clamped=atPriorRaf();assertCoverTransfer(clamped,observedStep(clamped,1200,.100),new Set());
 const exactReset=atPriorRaf();exactReset.frame.fpsTimer=.9;assertCoverTransfer(exactReset,observedStep(exactReset,1200,.100),new Set());
});
it('rejects decreasing, nonfinite, excessive or RAF-exceeding simulation-clock evidence without weakening frame guards',()=>{
 for(const value of [-.01,NaN,.101,.021]){
  const before=atPriorRaf(),after=observedStep(before,1020,.010);after.frame.clock=before.frame.clock+value;after.frames=[structuredClone(after.frame)];
  fail(()=>assertCoverTransfer(before,after,new Set()),value!==value?'invalid public frame numbers':'simulation clock');
 }
 const before=atPriorRaf(),counter=observedStep(before,1020,.010);counter.frame.frameCount++;counter.frames=[structuredClone(counter.frame)];fail(()=>assertCoverTransfer(before,counter,new Set()),'counter evidence');
 const timer=observedStep(before,1020,.010);timer.frame.fpsTimer+=.01;timer.frames=[structuredClone(timer.frame)];fail(()=>assertCoverTransfer(before,timer,new Set()),'counter evidence');
 const stale=observedStep(before,1020,.010,{x:-61.5,y:32,z:-59.5});stale.body=structuredClone(before.body);fail(()=>assertCoverTransfer(before,stale,new Set()),'body/frame');
});

it('accepts a genuinely zero-time RAF without advancing public drop motion, age or delay',()=>{
 const before=atPriorRaf(),after=observedStep(before,1020,0);
 expect(after.frame.clock).toBe(before.frame.clock);
 expect(after.frame.frameCount).toBe(before.frame.frameCount+1);
 expect(after.frame.fpsTimer).toBe(before.frame.fpsTimer);
 expect(after.ground).toEqual(before.ground);
 assertCoverTransfer(before,after,new Set());assertCoverInput(after,new Set(),COVER_PLAN[0]);
});
it('allows an already eligible public pickup on a zero-time frame, but not a delayed pickup or unearned material',()=>{
 const before=withGround([record(1)]),after=observedStep(before,20,0);
 expect(after.ground.records).toEqual([]);
 expect(after.inventory.slots.some(s=>s?.id===blockId('dirt')&&s.count===1)).toBe(true);
 assertCoverTransfer(before,after,new Set());
 const delayed=withGround([record(1,undefined,10)]),stolen=observedStep(delayed,20,0);
 stolen.ground.records=[];stolen.inventory.slots[5]={id:blockId('dirt'),count:1};sync(stolen);
 fail(()=>assertCoverTransfer(delayed,stolen,new Set()),'public ground');
 const surplus=observedStep(before,20,0);surplus.inventory.slots[5]={id:blockId('dirt'),count:2};sync(surplus);
 fail(()=>assertCoverTransfer(before,surplus,new Set()),'pickup/bag');
});
it('zero simulated time still refuses duplicate/missing frames, counter/timer changes, source changes and owner motion',()=>{
 const before=atPriorRaf();
 const duplicate=observedStep(before,1000,0);fail(()=>assertCoverTransfer(before,duplicate,new Set()),'simulation clock');
 const missing=observedStep(before,1020,0);missing.frames=[];fail(()=>assertCoverTransfer(before,missing,new Set()),'final public frame');
 const gap=observedStep(before,1020,0);gap.frame.sequence++;sync(gap);fail(()=>assertCoverTransfer(before,gap,new Set()),'observer sequence');
 const counter=observedStep(before,1020,0);counter.frame.frameCount=before.frame.frameCount;sync(counter);fail(()=>assertCoverTransfer(before,counter,new Set()),'counter evidence');
 const timer=observedStep(before,1020,0);timer.frame.fpsTimer+=.01;sync(timer);fail(()=>assertCoverTransfer(before,timer,new Set()),'counter evidence');
 const source=observedStep(before,1020,0);source.frame.planned[0].id=0;source.frames=[structuredClone(source.frame)];fail(()=>assertCoverTransfer(before,source,new Set()),'per-frame mutation');
 const moved=observedStep(before,1020,0);moved.ground.records[0].position.x+=1;sync(moved);fail(()=>assertCoverTransfer(before,moved,new Set()),'public ground motion');
});

it('uses exact observed dt across controlled fractional steps without cumulative-clock cancellation changing pickup eligibility',()=>{
 // Controlled25×.020 timeline, not a reconstruction of the failed run's hidden dt.
 const before=withGround([record(1,undefined,.5)]);
 before.cells.find(c=>c.x===-60&&c.y===32&&c.z===-60)!.id=blockId('stone');
 before.frame={...before.frame,sequence:50,deltaSeconds:.02,clock:7.5,lastTime:1000,rafTime:1000,frameCount:10,fpsTimer:.25};before.browserTime=1001;
 const get=(x:number,y:number,z:number)=>before.cells.find(c=>c.x===x&&c.y===y&&c.z===z)?.id??undefined;
 const exact=new WorldDrops({getLoadedBlock:get},before.ground),oldClockModel=new WorldDrops({getLoadedBlock:get},before.ground);
 const inventory=Inventory.fromJSON(before.inventory),oldInventory=Inventory.fromJSON(before.inventory),after=structuredClone(before);after.frames=[];
 let previous=before.frame;
 for(let i=0;i<25;i++){
  const dt=.02,clock=previous.clock+dt;
  exact.update(dt);exact.tryPickup(previous.position,stack=>inventory.addStack(stack));
  oldClockModel.update(clock-previous.clock);oldClockModel.tryPickup(previous.position,stack=>oldInventory.addStack(stack));
  after.inventory=inventory.toJSON();after.ground=exact.toJSON();
  after.frame={...previous,sequence:previous.sequence+1,deltaSeconds:dt,clock,lastTime:previous.lastTime+20,rafTime:previous.rafTime+20,frameCount:previous.frameCount+1,fpsTimer:previous.fpsTimer+dt,inventory:structuredClone(after.inventory),ground:structuredClone(after.ground)};
  after.frames.push(structuredClone(after.frame));previous=after.frame;
 }
 after.browserTime=after.frame.rafTime+1;
 expect(after.ground.records).toEqual([]);expect(after.inventory.slots.some(s=>s?.id===blockId('dirt')&&s.count===1)).toBe(true);
 expect(oldClockModel.records).toHaveLength(1);expect(oldClockModel.records[0].pickupDelaySeconds).toBeGreaterThan(0);
 expect(oldInventory.slots.some(s=>s?.id===blockId('dirt'))).toBe(false);
 assertCoverTransfer(before,after,new Set());
});
it('retains strict public pickup boundaries for tiny positive recorded delays and explicit controlled last-step intervals',()=>{
 // These retained raw delay/derivedinterval numbers are starting/control data only;
 // neither candidate code nor this test recovers the failed run's unobserved dt/reset.
 const tiny=withGround([record(1,undefined,5.995204332975845e-15)]),zero=observedStep(tiny,20,0);
 expect(zero.ground.records).toHaveLength(1);expect(zero.ground.records[0].pickupDelaySeconds).toBe(5.995204332975845e-15);
 assertCoverTransfer(tiny,zero,new Set());
 const forced=structuredClone(zero);forced.ground.records=[];forced.inventory.slots[5]={id:blockId('dirt'),count:1};sync(forced);
 fail(()=>assertCoverTransfer(tiny,forced,new Set()),'public ground');
 for(const dt of [.016600000000000364,.016600000000000392]){
  const before=withGround([record(1,undefined,.016599999999998324)]),after=observedStep(before,20,dt);
  expect(after.ground.records).toEqual([]);assertCoverTransfer(before,after,new Set());
 }
});
it('refuses missing, forged, nonfinite, negative, excessive or clock-inconsistent exact-delta telemetry',()=>{
 const before=atPriorRaf();
 for(const value of [undefined,null,NaN,Infinity,-.0014,.1000000001,.03]){
  const after=observedStep(before,1020,.02);(after.frame as unknown as Record<string,unknown>).deltaSeconds=value;after.frames=[structuredClone(after.frame)];
  fail(()=>assertCoverTransfer(before,after,new Set()),value===.03?'simulation clock':'frame delta telemetry');
 }
 const missing=observedStep(before,1020,.02);delete(missing.frames[0]as unknown as Record<string,unknown>).deltaSeconds;
 fail(()=>assertCoverTransfer(before,missing,new Set()),'public frame numbers');
 const busy=observedStep(before,1020,.02);busy.frame.clock=before.frame.clock;busy.frame.frameCount=before.frame.frameCount;busy.frame.fpsTimer=before.frame.fpsTimer;busy.frames=[structuredClone(busy.frame)];
 fail(()=>assertCoverTransfer(before,busy,new Set()),'simulation clock');
});
