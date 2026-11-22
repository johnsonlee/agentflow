import {expect,it} from 'vitest';
import {parseSave,serializeSave,type SaveData} from '../src/persistence/save';
import {captureDimensionWorld} from '../src/persistence/dimension-world';
import {createMob} from '../src/simulation/entities';
import {mobSnapshot} from '../src/persistence/mob-save';
import {Inventory} from '../src/ownership/inventory';
function base():any{return {version:1,name:'Blaze owners',seed:7,generatorVersion:1,mode:'survival',timeOfDay:.2,player:{position:{x:8.5,y:90,z:8.5},yaw:0,pitch:0,flying:false},inventory:new Inventory().toJSON(),edits:[],mobs:{nextId:2,records:[]}};}
function shots():any{return {version:1,nextKey:2,records:[{key:1,originMobId:1,position:{x:8,y:90,z:8},velocity:{x:8,y:0,z:0},ageSeconds:.25}]};}
it('roundtrips active orphan-origin projectiles and captures them only in the world partition',()=>{
 const raw=base();raw.blazeFireballs=shots();const before=structuredClone(raw),loaded=parseSave(serializeSave(raw)) as any;expect(loaded.blazeFireballs).toEqual(raw.blazeFireballs);expect(loaded.blazeOwnershipIssues).toBeUndefined();expect((captureDimensionWorld(loaded) as any).blazeFireballs).toEqual(raw.blazeFireballs);loaded.blazeFireballs.records[0].ageSeconds=.5;expect(raw).toEqual(before);
});
it('diagnoses malformed or future-origin active projectiles before repair and refuses serialization',()=>{
 for(const mutate of [(s:any)=>{s.records[0].velocity.x=0;},(s:any)=>{s.records[0].originMobId=2;},(s:any)=>{s.records[0].ageSeconds=5;}]){
  const raw=base();raw.blazeFireballs=shots();mutate(raw.blazeFireballs);const loaded=parseSave(JSON.stringify(raw)) as any;expect(loaded.blazeOwnershipIssues?.length).toBeGreaterThan(0);expect(()=>serializeSave(loaded)).toThrow(/Blaze/);expect(()=>serializeSave(raw)).toThrow(/Blaze/);
 }
});
it('diagnoses known malformed Blaze snapshots on marker-absent flat saves while leaving legacy saves alone',()=>{
 const raw=base(),mob:any=mobSnapshot(createMob(1,'blaze',{x:8,y:90,z:8}));delete mob.blazeState;raw.mobs.records=[mob];const loaded=parseSave(JSON.stringify(raw)) as any;expect(loaded.blazeOwnershipIssues?.some((i:any)=>i.path.startsWith('mobs'))).toBe(true);expect(()=>serializeSave(raw)).toThrow(/Blaze/);expect((parseSave(JSON.stringify(base())) as any).blazeOwnershipIssues).toBeUndefined();
});
it('keeps inactive projectile clocks and originating-ID counters in their own realm and rejects corrupted archives',()=>{
 const raw=base();raw.dimensions={version:1,active:'overworld',inactive:{nether:{seed:9,generatorVersion:1,player:raw.player,edits:[],mobs:{nextId:2,records:[]},blazeFireballs:shots()}},links:[]};
 const loaded=parseSave(serializeSave(raw)) as any;expect(loaded.dimensionsInvalid).toBeUndefined();expect(loaded.dimensions.inactive.nether.blazeFireballs).toEqual(raw.dimensions.inactive.nether.blazeFireballs);expect(loaded.blazeFireballs).toBeUndefined();
 raw.dimensions.inactive.nether.blazeFireballs.records[0].ageSeconds=5;const bad=parseSave(JSON.stringify(raw));expect(bad.dimensionsInvalid).toBe(true);expect(bad.dimensionOwnershipIssues?.some(i=>i.path.includes('blazeFireballs'))).toBe(true);expect(()=>serializeSave(raw)).toThrow(/dimension/);
});
