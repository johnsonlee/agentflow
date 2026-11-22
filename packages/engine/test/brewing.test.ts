import {expect,it} from 'vitest';
import {BrewingStand,sanitizeBrewingState,BREWING_PROFILE} from '../src/crafting/brewing';
import {stackId} from '../src/catalog/items';
const stack=(name:string,count=1)=>({id:stackId(name),count});
const run=(b:BrewingStand,seconds:number)=>{for(let i=0;i<seconds;i++)b.update(1);};
function water(){const b=new BrewingStand();for(const slot of [0,1,2] as const)expect(b.replace(slot,stack('water_bottle')).ok).toBe(true);b.replace('ingredient',stack('nether_wart',2));b.replace('fuel',stack('blaze_powder',2));return b;}
it('one reserved fuel use and one reagent finish three actual bottle owners without extra containers',()=>{
 const b=water();run(b,19);let s=b.snapshot();expect(s.bottles).toEqual([stack('water_bottle'),stack('water_bottle'),stack('water_bottle')]);expect(s.ingredient).toEqual(stack('nether_wart',2));expect(s.fuel).toEqual(stack('blaze_powder'));expect(s.fuelUses).toBe(19);b.update(1);s=b.snapshot();expect(s.bottles).toEqual([stack('awkward_potion'),stack('awkward_potion'),stack('awkward_potion')]);expect(s.ingredient).toEqual(stack('nether_wart'));expect(s.progressSeconds).toBe(0);run(b,40);expect(b.snapshot()).toEqual(s);expect(b.contents().reduce((n,x)=>n+x.count,0)).toBe(5);
});
it.each([['silver','antidote'],['cobalt','elixir'],['calcium','eye_drops'],['bismuth','tonic']])('brews Journal %s recipe over one eligible bottle while retaining other products', (ingredient,output)=>{
 const b=new BrewingStand();b.replace(0,stack('awkward_potion'));b.replace(1,stack('water_bottle'));b.replace(2,stack('tonic'));b.replace('ingredient',stack(ingredient,3));b.replace('fuel',stack('blaze_powder'));run(b,20);const s=b.snapshot();expect(s.bottles).toEqual([stack(output),stack('water_bottle'),stack('tonic')]);expect(s.ingredient).toEqual(stack(ingredient,2));expect(s.fuel).toBeNull();expect(s.fuelUses).toBe(19);
});
it('cold partial work retains the same reservation; input removal forfeits progress without refund or detached alias',()=>{
 const b=water();run(b,7);const raw=b.snapshot(),cold=new BrewingStand(raw);raw.bottles[0]!.id=stackId('stone');run(cold,13);expect(cold.snapshot().fuelUses).toBe(19);expect(cold.snapshot().bottles[0]).toEqual(stack('awkward_potion'));
 const old=b.replace(0,null);expect(old).toEqual({ok:true,returned:stack('water_bottle')});expect(b.snapshot().progressSeconds).toBe(0);expect(b.snapshot().fuelUses).toBe(19);b.replace(0,old.returned);b.update(1);expect(b.snapshot().fuelUses).toBe(18);expect(b.snapshot().progressSeconds).toBe(1);
});
it('idle or ineligible inputs spend neither fuel nor reagent; rejected overlimit/metadata/accessor owners remain with caller',()=>{
 const b=new BrewingStand();b.replace('fuel',stack('blaze_powder',64));b.replace('ingredient',stack('nether_wart'));run(b,30);expect(b.snapshot().fuel).toEqual(stack('blaze_powder',64));
 const invalid={id:stackId('water_bottle'),count:2};expect(b.replace(0,invalid)).toEqual({ok:false,returned:invalid});let calls=0;const accessor={get id(){calls++;return stackId('water_bottle');},count:1};expect(b.replace(0,accessor).ok).toBe(false);expect(calls).toBe(0);expect(b.replace(0,{...stack('water_bottle'),book:{pages:['x']}}).ok).toBe(false);expect(b.snapshot().bottles).toEqual([null,null,null]);
});
it('strict damaged raw owners/timing/batch provenance never export a repaired station or drop its contents',()=>{
 const b=water();b.update(1);const valid=b.snapshot();expect(sanitizeBrewingState(valid).invalid).toBe(0);
 for(const mutate of [(s:typeof valid)=>{s.bottles[0]!.count=2;},(s:typeof valid)=>{s.progressSeconds=20;},(s:typeof valid)=>{s.batch='forged';},(s:typeof valid)=>{s.ingredient!.id=stackId('stone');},(s:typeof valid)=>{s.fuelUses=-1;}]){
  const raw=structuredClone(valid);mutate(raw);const original=structuredClone(raw),bad=new BrewingStand(raw);expect(bad.loadIssues).toBe(1);expect(()=>bad.snapshot()).toThrow();expect(()=>bad.contents()).toThrow();expect(bad.replace('fuel',stack('blaze_powder')).ok).toBe(false);bad.update(10);expect(raw).toEqual(original);
 }
 expect(BREWING_PROFILE).toEqual({seconds:20,fuelUses:20,maxDt:1});
});

it('rejects an impossible full fuel counter after a batch reservation and blocks validation reentry',()=>{
 const b=water();b.update(1);const raw=b.snapshot();raw.fuelUses=20;expect(sanitizeBrewingState(raw).invalid).toBe(1);
 const idle=water(),before=idle.snapshot();let calls=0;const incoming=new Proxy(stack('water_bottle'),{getPrototypeOf(target){calls++;idle.update(1);expect(idle.replace(1,null).ok).toBe(false);return Reflect.getPrototypeOf(target);}});
 expect(idle.replace(0,incoming).ok).toBe(false);expect(calls).toBeGreaterThan(0);expect(idle.snapshot()).toEqual(before);idle.update(1);expect(idle.snapshot().progressSeconds).toBe(1);expect(idle.snapshot().fuelUses).toBe(19);
});
