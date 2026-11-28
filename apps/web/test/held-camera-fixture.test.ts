import {describe,it,expect} from 'vitest';
import {blockId,stackId,serializeSave,parseSave} from '@craft/engine';
import {readChestOwners} from '../../../packages/engine/src/persistence/chest-save';
import {heldCameraFixture} from '../e2e/held-camera-fixture';

describe('controlled held Camera archive fixtures',()=>{
 for(const refusal of [false,true])it(`strictly roundtrips ${refusal?'occluded refusal':'valid photo'} owners with unique physical cells`,()=>{
  const fixture=heldCameraFixture(refusal);
  const keys=fixture.edits.map(([x,y,z])=>`${x},${y},${z}`);
  expect(new Set(keys).size).toBe(keys.length);
  expect(readChestOwners(fixture).issues).toEqual([]);
  const decoded=parseSave(serializeSave(fixture));
  expect(decoded.chestOwnershipIssues??[]).toEqual([]);
  expect(decoded.inventory).toEqual(fixture.inventory);
  expect(decoded.agent).toEqual(fixture.agent);
  expect(decoded.worldDrops).toEqual(fixture.worldDrops);
  expect(decoded.edits).toEqual(fixture.edits);
  expect(serializeSave(parseSave(serializeSave(decoded)))).toBe(serializeSave(decoded));
  expect(decoded.inventory.slots.filter(s=>s?.id===stackId('camera')).reduce((n,s)=>n+(s?.count??0),0)).toBe(3);
  for(let y=80;y<=82;y++)expect(decoded.edits.filter(([x,yy,z])=>x===8&&yy===y&&z===11)).toEqual([[8,y,11,refusal?blockId('stone'):0]]);
  expect(decoded.worldDrops?.records.length).toBe(refusal?1:0);
 });
 it('continues to refuse a duplicate-cell archive instead of normalizing it',()=>{
  const fixture=heldCameraFixture(true);fixture.edits.push([8,80,11,0]);
  expect(readChestOwners(fixture).issues.some(i=>i.reason==='Duplicate physical cell')).toBe(true);
  expect(()=>serializeSave(fixture)).toThrow('Cannot serialize invalid Chest ownership');
 });
});
