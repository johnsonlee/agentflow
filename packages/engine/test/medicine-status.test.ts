import {expect,it} from 'vitest';
import {POISON,TIMED_STATUS,PlayerStatusOwner,createPlayerStatus,sanitizePlayerStatus,applyPoison,applyTimedStatus,clearPlayerStatus,tickPlayerStatus,hasPlayerStatus,outgoingMeleeDamage,type PlayerStatus} from '../src/simulation/status-effects';
import {Inventory} from '../src/ownership/inventory';
import {stackId} from '../src/catalog/items';
import {finishMedicineDrink,finishOwnedMilkDrink,isMedicineId,isDrinkablePotionId,MEDICINE_DRINK_SECONDS} from '../src/ownership/medicine-drink';
import {reserveInventoryMutation} from '../src/ownership/inventory-lease';
const all=():PlayerStatus=>({poison:{remaining:5,elapsed:.3},weakness:{remaining:30,amplifier:1},blindness:{remaining:30,amplifier:0},nausea:{remaining:15,amplifier:0}});
const bag=(name:string)=>{const inv=new Inventory();inv.slots[0]={id:stackId(name),count:1};return inv;};
it('strict finite named four-effect owner refuses getters/symbols/extra metadata/timer bounds without repair and detaches cold state',()=>{
 const source=all(),read=sanitizePlayerStatus(source);expect(read.invalid).toBe(0);read.data.weakness!.remaining=4;expect(source.weakness!.remaining).toBe(30);expect(hasPlayerStatus({blindness:{remaining:3,amplifier:0}})).toBe(true);expect(hasPlayerStatus({})).toBe(false);
 for(const raw of [{weakness:{remaining:0,amplifier:0}},{weakness:{remaining:1e6+1,amplifier:0}},{nausea:{remaining:1,amplifier:256}},{blindness:{remaining:1,amplifier:-1}},{blindness:{remaining:NaN,amplifier:0}},{blindness:{remaining:1,amplifier:.5}},{nausea:{remaining:1,amplifier:0,extra:1}},{version:1},Object.assign(all(),{[Symbol('x')]:1})])expect(sanitizePlayerStatus(raw).invalid).toBe(1);
 let reads=0;expect(sanitizePlayerStatus({get weakness(){reads++;return{};}}).invalid).toBe(1);expect(reads).toBe(0);expect(sanitizePlayerStatus(undefined)).toEqual({data:{},invalid:0,present:false});
});
it('preserves exact prior Poison formula, phase refresh, nonlethal floor and Creative while advancing independent timers',()=>{
 expect(POISON).toEqual({duration:5,interval:1.25});
 for(const dt of [.1,1.25,2.7,8])for(const health of [1,2,20])for(const damageEnabled of [false,true]){const s=all(),duration=Math.min(dt,5),total=.3+duration,ticks=Math.floor((total+1e-10)/1.25),expected=damageEnabled?Math.min(ticks,Math.max(0,health-1)):0;expect(tickPlayerStatus(s,dt,health,damageEnabled)).toBe(expected>0?-expected:0);expect(s.poison).toEqual(dt>=5?undefined:{remaining:5-duration,elapsed:Math.max(0,total-ticks*1.25)});expect(s.weakness?.remaining).toBe(30-dt);}
 const s=createPlayerStatus();applyPoison(s);tickPlayerStatus(s,1,20);applyPoison(s);expect(s.poison).toEqual({remaining:5,elapsed:1});tickPlayerStatus(s,.25,20);expect(s.poison).toEqual({remaining:4.75,elapsed:0});
});
it('validates grants/default30/amp255/caps, expires independently and applies bounded outgoing melee reduction only',()=>{
 const s=createPlayerStatus();for(const kind of ['weakness','blindness','nausea'] as const)expect(applyTimedStatus(s,kind)).toBe(true);expect(s).toEqual({weakness:{remaining:30,amplifier:0},blindness:{remaining:30,amplifier:0},nausea:{remaining:30,amplifier:0}});expect(applyTimedStatus(s,'weakness',1e6,255)).toBe(true);expect(outgoingMeleeDamage(s,7)).toBe(0);for(const n of [0,-1,Infinity,1e6+1])expect(applyTimedStatus(s,'blindness',n)).toBe(false);expect(applyTimedStatus(s,'weakness',1,256)).toBe(false);expect(TIMED_STATUS.defaultSeconds).toBe(30);tickPlayerStatus(s,30,20);expect(s.blindness).toBeUndefined();expect(s.weakness?.remaining).toBe(1e6-30);clearPlayerStatus(s);expect(s).toEqual({});
});
it('frozen/late locked timed properties cause no partial tick/cure/grant or health debit',()=>{
 const s=all(),before=structuredClone(s);Object.defineProperty(s,'nausea',{configurable:false,writable:false});expect(tickPlayerStatus(s,40,20)).toBe(0);expect(s).toEqual(before);clearPlayerStatus(s);expect(s).toEqual(before);expect(applyTimedStatus(Object.freeze({}),'weakness')).toBe(false);
});
it.each([['antidote','poison'],['elixir','weakness'],['eye_drops','blindness'],['tonic','nausea']] as const)('actual %s dual-owner cure removes only %s and returns exactly one empty Bottle even in a full bag',(name,effect)=>{
 const inv=bag(name);for(let i=1;i<36;i++)inv.slots[i]={id:stackId('stone'),count:64};const owner=new PlayerStatusOwner(all()),before=structuredClone(owner.current),others=inv.slots.slice(1);expect(finishMedicineDrink(inv,owner)).toBe(true);expect(inv.slots[0]).toEqual({id:stackId('glass_bottle'),count:1});expect(owner.current[effect]).toBeUndefined();for(const key of ['poison','weakness','blindness','nausea'] as const)if(key!==effect)expect(owner.current[key]).toEqual(before[key]);expect(inv.slots.slice(1)).toEqual(others);expect(inv.busy).toBe(false);expect(owner.busy).toBe(false);expect(finishMedicineDrink(inv,owner)).toBe(false);
});
it('Awkward consumes to emptyBottle without cure, fourmedicine identity stays accurate, milk clears all through private publication',()=>{
 const owner=new PlayerStatusOwner(all()),inv=bag('awkward_potion'),before=structuredClone(owner.current);expect(isMedicineId(stackId('awkward_potion'))).toBe(false);expect(isDrinkablePotionId(stackId('awkward_potion'))).toBe(true);expect(finishMedicineDrink(inv,owner)).toBe(true);expect(owner.current).toEqual(before);expect(inv.slots[0]?.id).toBe(stackId('glass_bottle'));inv.slots[0]={id:stackId('milk_bucket'),count:1};expect(finishOwnedMilkDrink(inv,owner)).toBe(true);expect(owner.current).toEqual({});expect(inv.slots[0]?.id).toBe(stackId('bucket'));expect(MEDICINE_DRINK_SECONDS).toBe(1.6);
});
it('no-effect medicine consumes under explicit policy, but malformed stack/status/frozen slot/Proxy bag refuse without debit',()=>{
 const inv=bag('tonic'),owner=new PlayerStatusOwner();expect(finishMedicineDrink(inv,owner)).toBe(true);expect(owner.current).toEqual({});
 for(const mutate of [(i:Inventory,o:PlayerStatusOwner)=>{i.slots[0]!.count=2;},(i:Inventory)=>{i.slots[0]!.book={pages:[]};},(i:Inventory)=>{Object.defineProperty(i.slots,'0',{writable:false});},(_i:Inventory,o:PlayerStatusOwner)=>{o.replace({weakness:{remaining:-1,amplifier:0}});},(i:Inventory)=>{Object.defineProperty(i,'slots',{value:new Proxy(i.slots,{})});}]){const i=bag('elixir'),o=new PlayerStatusOwner(all());mutate(i,o);const before=structuredClone({slots:Array.from(i.slots),status:o.current});expect(finishMedicineDrink(i,o)).toBe(false);expect({slots:Array.from(i.slots),status:o.current}).toEqual(before);expect(i.busy).toBe(false);expect(o.busy).toBe(false);}
});
it('owner replace retains detached plain corruption for recovery and refuses accessor/Proxy input without publishing it',()=>{
 const owner=new PlayerStatusOwner(),raw={unknown:{remaining:3}};expect(owner.replace(raw)).toBe(true);raw.unknown.remaining=7;expect((owner.current as any).unknown.remaining).toBe(3);expect(sanitizePlayerStatus(owner.current).invalid).toBe(1);let called=0;expect(owner.replace({get poison(){called++;return{};}})).toBe(false);expect(called).toBe(0);expect(owner.replace(new Proxy({},{}))).toBe(false);
});
it('all Inventory mutation methods refuse during reservation; cancellation restores normal behavior without touching owners',()=>{
 const inv=bag('tonic'),lease=reserveInventoryMutation(inv)!;expect(inv.busy).toBe(true);const before=inv.toJSON();expect(inv.add(stackId('stone'),2)).toBe(2);expect(inv.addStack({id:stackId('stone'),count:2})).toBe(2);inv.select(1);inv.scroll(1);expect(inv.setSlot(1,{id:stackId('stone'),count:1})).toBe(false);expect(inv.takeSelected()).toBeNull();inv.pick(stackId('stone'));inv.swap(0,1);expect(inv.damageSelected()).toBe(false);expect(inv.swapEquipment('head',null).ok).toBe(false);expect(inv.setOffhand(null)).toBe(false);expect(inv.swapSelectedOffhand()).toBe(false);expect(inv.activateSelectedGlow().ok).toBe(false);expect(inv.fillSelectedBottle().ok).toBe(false);expect(inv.drinkSelectedWaterBottle().ok).toBe(false);expect(inv.fillSelectedMilkBucket().ok).toBe(false);expect(inv.activateSelectedSparkler().ok).toBe(false);expect(inv.activateOffhandSparkler().ok).toBe(false);expect(inv.equipFromSlot(0)).toBe(false);expect(inv.unequip('head')).toBe(false);expect(inv.toJSON()).toEqual(before);lease.cancel();expect(inv.setSlot(1,{id:stackId('stone'),count:1})).toBe(true);
});
it('Proxy validation reentry cannot tick/replace/cure/grant/edit either owner and no getter or delete trap executes',()=>{
 const inv=bag('elixir'),owner=new PlayerStatusOwner(all()),before=structuredClone(owner.current);let calls=0;
 inv.slots[1]=new Proxy({id:stackId('stone'),count:1},{getPrototypeOf(target){calls++;expect(inv.busy).toBe(true);expect(owner.busy).toBe(true);expect(inv.takeSelected()).toBeNull();expect(inv.setSlot(0,null)).toBe(false);expect(owner.replace({})).toBe(false);expect(finishMedicineDrink(inv,owner)).toBe(false);tickPlayerStatus(owner.current,3,20);clearPlayerStatus(owner.current);expect(applyTimedStatus(owner.current,'nausea',1)).toBe(false);return Reflect.getPrototypeOf(target);}});
 expect(finishMedicineDrink(inv,owner)).toBe(false);expect(calls).toBeGreaterThan(0);expect(owner.current).toEqual(before);expect(inv.slots[0]?.id).toBe(stackId('elixir'));expect(inv.busy).toBe(false);expect(owner.busy).toBe(false);
 let reads=0;Object.defineProperty(inv.slots[0],'count',{get(){reads++;return 1;}});expect(finishMedicineDrink(inv,owner)).toBe(false);expect(reads).toBe(0);
});

it('untrusted proxied status effect is refused without calling delete traps or consuming container',()=>{
 const inv=bag('elixir'),owner=new PlayerStatusOwner(all());let deletes=0,inspections=0;owner.current.weakness=new Proxy({remaining:30,amplifier:1},{getPrototypeOf(target){inspections++;expect(inv.takeSelected()).toBeNull();return Reflect.getPrototypeOf(target);},deleteProperty(){deletes++;throw Error('foreign deletion');}});
 expect(finishMedicineDrink(inv,owner)).toBe(false);expect(inspections).toBeGreaterThan(0);expect(deletes).toBe(0);expect(inv.slots[0]?.id).toBe(stackId('elixir'));expect(owner.current.weakness?.remaining).toBe(30);expect(inv.busy).toBe(false);expect(owner.busy).toBe(false);
});
it('once-only inventory registration cannot unlock a live lease or register Proxy identities/arrays',async()=>{
 const {registerInventoryOwner}=await import('../src/ownership/inventory-lease');const inv=bag('elixir'),lease=reserveInventoryMutation(inv)!;registerInventoryOwner(inv,inv.slots);expect(inv.busy).toBe(true);expect(inv.takeSelected()).toBeNull();expect(lease.valid()).toBe(true);lease.cancel();
 const fake={slots:new Array(36).fill(null),selected:0,offhand:null,equipment:{head:null,chest:null,legs:null,feet:null}},proxy=new Proxy(fake,{});registerInventoryOwner(proxy,fake.slots);expect(reserveInventoryMutation(proxy as unknown as Inventory)).toBeNull();
 const proxiedSlots=new Proxy(fake.slots,{}),other={...fake,slots:proxiedSlots};registerInventoryOwner(other,proxiedSlots);expect(reserveInventoryMutation(other as unknown as Inventory)).toBeNull();
});

it('registration preflight rejects fake accessor owners without getter calls',async()=>{
 const {registerInventoryOwner}=await import('../src/ownership/inventory-lease');let reads=0;const fake={slots:new Array(36).fill(null),get selected(){reads++;return 0;}};registerInventoryOwner(fake,fake.slots);expect(reads).toBe(0);expect(reserveInventoryMutation(fake as unknown as Inventory)).toBeNull();
});
it('outgoing melee reads only the detached validated snapshot and never invokes a raw Proxy property get trap',()=>{
 let reads=0;const raw=new Proxy({weakness:{remaining:30,amplifier:1}},{get(){reads++;throw Error('foreign status property get');}});expect(()=>outgoingMeleeDamage(raw,7)).not.toThrow();expect(outgoingMeleeDamage(raw,7)).toBe(3);expect(reads).toBe(0);
});
