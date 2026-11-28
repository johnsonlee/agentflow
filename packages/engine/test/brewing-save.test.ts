import {expect,it} from 'vitest';
import {readBrewingStandOwners} from '../src/persistence/brewing-save';
import {BrewingStand} from '../src/crafting/brewing';
import {stackId} from '../src/catalog/items';
const state=()=>new BrewingStand().snapshot();
const station=(x=0,y=80,z=0)=>({x,y,z,state:state()});
const raw=()=>({edits:[[0,80,0,201]],brewingStands:[station()]});
it('distinguishes absent and empty and does not impose new validation on unrelated legacy corruption',()=>{
 expect(readBrewingStandOwners({edits:'legacy damage'})).toEqual({stations:[],issues:[],present:false});
 expect(readBrewingStandOwners({edits:[],brewingStands:[]})).toEqual({stations:[],issues:[],present:true});
 expect(readBrewingStandOwners({edits:[],brewingStands:undefined}).issues.length).toBeGreaterThan(0);
 expect(readBrewingStandOwners({edits:[[0,80,0,201]]}).issues.length).toBeGreaterThan(0);
});
it('preserves detached legitimate partial mixed bottle work, fuel receipts and source bytes across cold load',()=>{
 const b=new BrewingStand();b.replace(0,{id:stackId('water_bottle'),count:1});b.replace(1,{id:stackId('tonic'),count:1});b.replace('ingredient',{id:stackId('nether_wart'),count:3});b.replace('fuel',{id:stackId('blaze_powder'),count:2});for(let i=0;i<7;i++)b.update(1);
 const r=raw();r.brewingStands[0].state=b.snapshot();const before=structuredClone(r),read=readBrewingStandOwners(r);
 expect(read.issues).toEqual([]);expect(r).toEqual(before);expect(read.stations[0].state).toEqual(b.snapshot());
 const cold=new BrewingStand(read.stations[0].state);for(let i=0;i<13;i++)cold.update(1);expect(cold.snapshot().bottles[0]?.id).toBe(stackId('awkward_potion'));expect(cold.snapshot().fuelUses).toBe(19);
 read.stations[0].state.bottles[0]!.count=99;expect(r).toEqual(before);
});
it('requires exact physical bijection and edits take precedence without probing overwritten cells',()=>{
 for(const r of [{edits:[[0,80,0,201]],brewingStands:[]},{edits:[[0,80,0,0]],brewingStands:[station()]},{edits:[],brewingStands:[station()]},{edits:[[0,80,0,201],[0,80,0,0]],brewingStands:[station()]},{edits:[[0,80,0,201]],brewingStands:[station(),station()]}])expect(readBrewingStandOwners(r).issues.length).toBeGreaterThan(0);
 let calls=0;expect(readBrewingStandOwners(raw(),()=>{calls++;return 201;}).issues).toEqual([]);expect(calls).toBe(0);
 expect(readBrewingStandOwners({edits:[],brewingStands:[station()]},()=>{calls++;return 201;}).issues).toEqual([]);expect(calls).toBe(1);
 calls=0;expect(readBrewingStandOwners({edits:[],brewingStands:[station(),station()]},()=>{calls++;return 201;}).issues.length).toBeGreaterThan(0);expect(calls).toBeLessThanOrEqual(1);
 expect(readBrewingStandOwners({edits:[],brewingStands:[station()]},()=>{throw Error('unknown');}).issues.length).toBeGreaterThan(0);
});
it('accepts inclusive horizontal border/current height bounds and rejects out of range/fractional coordinates',()=>{
 for(const [x,y,z] of [[-30000000,0,30000000],[30000000,95,-30000000]])expect(readBrewingStandOwners({edits:[[x,y,z,201]],brewingStands:[station(x,y,z)]}).issues).toEqual([]);
 for(const [x,y,z] of [[30000001,80,0],[0,96,0],[0,-1,0],[0,80,.5],[Infinity,80,0]])expect(readBrewingStandOwners({edits:[[x,y,z,201]],brewingStands:[station(x,y,z)]}).issues.length).toBeGreaterThan(0);
});
it('refuses malformed records, timing/version/fuel and raw array owners without repairing input',()=>{
 for(const mutate of [(r:any)=>{r.brewingStands[0].extra=true;},(r:any)=>{r.brewingStands[0].state.version=2;},(r:any)=>{r.brewingStands[0].state.fuelUses=20;},(r:any)=>{r.brewingStands[0].state.progressSeconds=1;},(r:any)=>{delete r.brewingStands[0].state.bottles[1];},(r:any)=>{r.brewingStands.extra=true;},(r:any)=>{r.edits[0].push(1);},(r:any)=>{r.brewingStands=new Array(1);},(r:any)=>{r.brewingStands=new Array(4097).fill(station());}]){const r=raw();mutate(r);const before=structuredClone(r);const result=readBrewingStandOwners(r);expect(result.issues.length).toBeGreaterThan(0);expect(result.stations).toEqual([]);expect(r).toEqual(before);}
});
it('does not invoke accessors at envelope, record, state or edit level and rejects cycles/symbols',()=>{
 let calls=0;const access=()=>{calls++;throw Error('must not run');};
 for(const make of [()=>Object.defineProperty({edits:[]},'brewingStands',{get:access,enumerable:true}),()=>{const r=raw();Object.defineProperty(r.brewingStands[0],'x',{get:access});return r;},()=>{const r=raw();Object.defineProperty(r.brewingStands[0].state,'fuelUses',{get:access});return r;},()=>{const r=raw();Object.defineProperty(r.edits[0],'3',{get:access});return r;},()=>{const r=raw();Object.defineProperty(r,'edits',{get:access});return r;}])expect(readBrewingStandOwners(make()).issues.length).toBeGreaterThan(0);
 expect(calls).toBe(0);const r:any=raw();r.brewingStands[0].state.batch=r;expect(readBrewingStandOwners(r).issues.length).toBeGreaterThan(0);
 const s:any=raw();s.brewingStands[0][Symbol('hidden')]=1;expect(readBrewingStandOwners(s).issues.length).toBeGreaterThan(0);
});
it('does not confuse the station cap with world edit count, preserves raw descriptors and refuses incomplete binding',()=>{
 const r=raw();r.edits=Array.from({length:4097},(_,x)=>[x+1,1,0,0]);r.edits.push([0,80,0,201]);expect(readBrewingStandOwners(r).issues).toEqual([]);
 const accessor=raw();let calls=0;Object.defineProperty(accessor.edits[0],'0',{get(){calls++;return 0;},enumerable:true});const descriptor=Object.getOwnPropertyDescriptor(accessor.edits[0],'0');expect(readBrewingStandOwners(accessor).issues.length).toBeGreaterThan(0);expect(Object.getOwnPropertyDescriptor(accessor.edits[0],'0')).toEqual(descriptor);expect(calls).toBe(0);
 const missing=raw() as any;delete missing.brewingStands[0].state;expect(readBrewingStandOwners(missing).issues.length).toBeGreaterThan(0);
 const stateMissing=raw() as any;stateMissing.brewingStands[0].state=undefined;expect(readBrewingStandOwners(stateMissing).issues.length).toBeGreaterThan(0);
 const unknown=raw();unknown.edits[0][3]=999999;expect(readBrewingStandOwners(unknown).issues.length).toBeGreaterThan(0);
});
