import { beforeAll, expect, it } from 'vitest';
import { World, blockId, canBreak, CURRENT_OVERWORLD_GENERATOR_VERSION, EYE_HEIGHT, raycast, seedFromString, tryBlockById } from '@craft/engine';
import { admitSingleSource, findSingleSourcePose, harvestCellChanges, SINGLE_SOURCE_LIMITS, type HarvestCells, type ReadHarvestBlock } from '../e2e/single-source-harvest';

let world: World;
const source = { x: 9, y: 23, z: -23 }, feet = { x: 8.5, y: 25, z: -19.5 }, aim = { x: 9.5, y: 23.5, z: -22.5 };
const state = () => ({ edits: world.exportEdits(), decisions: world.gravelHarvests.exportState(), version: world.blockMutationVersion });
const read: ReadHarvestBlock = (x, y, z) => world.getBlock(x, y, z);
beforeAll(() => { world = new World(seedFromString('12345'), CURRENT_OVERWORLD_GENERATOR_VERSION); });

it('admits a real generated ocean pose with actual engine rays and no owner/source writes', () => {
  const before = state(), proof = admitSingleSource(read, source, feet, aim, true);
  expect(proof.ok).toBe(true);
  if (!proof.ok) throw Error(proof.reason);
  expect(proof.first).toMatchObject({ ...source, id: blockId('gravel') });
  expect(proof.after).toBeNull();
  expect(world.getBlock(source.x, source.y, source.z)).toBe(blockId('gravel'));
  expect(state()).toEqual(before);
});

it('rejects the retained failed centered pose because real terrain remains breakable behind it', () => {
  const oldFeet = { x: 10.5, y: 24, z: -22.5 }, proof = admitSingleSource(read, source, oldFeet, aim, true);
  const eye = { ...oldFeet, y: oldFeet.y + EYE_HEIGHT }, direction = { x: aim.x - eye.x, y: aim.y - eye.y, z: aim.z - eye.z };
  const targetable = (id: number) => id !== 0 && tryBlockById(id)?.shape !== 'liquid';
  expect(raycast((x, y, z) => read(x, y, z)!, eye, direction, 5, targetable)).toMatchObject({ ...source, id: blockId('gravel') });
  const next = raycast((x, y, z) => x === source.x && y === source.y && z === source.z ? 0 : read(x, y, z)!, eye, direction, 5, targetable);
  expect(next).not.toBeNull(); expect(Number.isFinite(tryBlockById(next!.id)?.hardness)).toBe(true);
  expect(proof).toMatchObject({ ok: false, reason: 'another-finite-hardness-target' });
});

it('finds a current natural pose within the explicit finite query budget', () => {
  const before = state(), result = findSingleSourcePose(read, source, true);
  expect(result.proof?.ok).toBe(true);
  expect(result.queries).toBeGreaterThan(0); expect(result.queries).toBeLessThanOrEqual(SINGLE_SOURCE_LIMITS.columns * SINGLE_SOURCE_LIMITS.aims);
  expect(state()).toEqual(before);
});

it('refuses unloaded query cells instead of treating them as transparent air', () => {
  const unknown: ReadHarvestBlock = (x, y, z) => x === 8 && y === 26 && z === -21 ? undefined : read(x, y, z);
  expect(admitSingleSource(unknown, source, feet, aim, true).ok).toBe(false);
  const absent = findSingleSourcePose(() => undefined, source, true);
  expect(absent.proof).toBeNull(); expect(absent.queries).toBe(SINGLE_SOURCE_LIMITS.columns * SINGLE_SOURCE_LIMITS.aims);
});

it('refuses actual-view occlusion and a different camera direction', () => {
  const occluded: ReadHarvestBlock = (x, y, z) => x === 9 && y === 24 && z === -23 ? blockId('stone') : read(x, y, z);
  expect(admitSingleSource(occluded, source, feet, aim, true).ok).toBe(false);
  expect(admitSingleSource(read, source, feet, aim, true, { x: 0, y: 1, z: 0 }).ok).toBe(false);
});

it('refuses body collisions, unsupported feet and a non-Gravel source', () => {
  const blocked: ReadHarvestBlock = (x, y, z) => x === 8 && y === 25 && z === -20 ? blockId('stone') : read(x, y, z);
  expect(admitSingleSource(blocked, source, feet, aim, true)).toMatchObject({ ok: false, reason: 'body-collision' });
  const unsupported: ReadHarvestBlock = (x, y, z) => x === 8 && y === 24 && z === -20 ? 0 : read(x, y, z);
  expect(admitSingleSource(unsupported, source, feet, aim, true)).toMatchObject({ ok: false, reason: 'unsupported-full-body' });
  const gone: ReadHarvestBlock = (x, y, z) => x === source.x && y === source.y && z === source.z ? 0 : read(x, y, z);
  expect(admitSingleSource(gone, source, feet, aim, true)).toMatchObject({ ok: false, reason: 'not-current-gravel' });
});

it('respects portal permission and the actual nearest Allow/Deny policy without terrain mutation', () => {
  expect(canBreak(world, 'survival', source.x, source.y, source.z)).toBe(true);
  expect(admitSingleSource(read, source, feet, aim, false)).toMatchObject({ ok: false, reason: 'source-permission-refused' });
  const denied: ReadHarvestBlock = (x, y, z) => x === source.x && z === source.z && y === source.y - 1 ? blockId('deny') : read(x, y, z);
  const queryWorld = { getBlock: (x: number, y: number, z: number) => denied(x, y, z)!, portals: world.portals } as World;
  expect(canBreak(queryWorld, 'survival', source.x, source.y, source.z)).toBe(false);
  expect(admitSingleSource(denied, source, feet, aim, true)).toMatchObject({ ok: false, reason: 'source-permission-refused' });
});

it('keeps source omission local to the query and leaves all actual cells and decisions unchanged', () => {
  const before = state(), reads: Array<[number, number, number, number | undefined]> = [];
  const logged: ReadHarvestBlock = (x, y, z) => { const id = read(x, y, z); reads.push([x, y, z, id]); return id; };
  expect(admitSingleSource(logged, source, feet, aim, true).ok).toBe(true);
  expect(reads.filter(([x, y, z]) => x === source.x && y === source.y && z === source.z).every(r => r[3] === blockId('gravel'))).toBe(true);
  expect(state()).toEqual(before);
});

it('exposes extra physical removals separately from legitimate liquid changes and unknown cells', () => {
  const before: HarvestCells = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 0, z: 0 }, blocks: [blockId('gravel'), blockId('dirt'), 0] };
  const extra = harvestCellChanges(before, { ...before, blocks: [0, 0, blockId('water')] });
  expect(extra.positiveHardnessRemovals.map(c => c.x)).toEqual([0, 1]); expect(extra.changes).toHaveLength(3);
  const single = harvestCellChanges(before, { ...before, blocks: [blockId('water'), blockId('dirt'), 0] });
  expect(single.keys).toEqual(['0,0,0']); expect(single.becameUnknown).toEqual([]);
  expect(harvestCellChanges(before, { ...before, blocks: [null, blockId('dirt'), 0] }).becameUnknown).toHaveLength(1);
});
