import{COMPOSTER_APP_PROFILE,COMPOSTER_ID,readComposterOwners,type ComposterRecord,type Inventory,type ItemStack}from'@craft/engine';
export interface ComposterFeedObservation{caneClock:{tick:number;accumulator:number};paused:boolean;dead:boolean;recovery:boolean;cell:number|undefined;station:unknown;bag:ReturnType<Inventory['toJSON']>;agentSlots:readonly(ItemStack|null)[];pending:readonly ItemStack[];drops:{nextKey:number;records:readonly{key:number;stack:ItemStack}[]}}
const canonical=(v:unknown):string=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,JSON.parse(canonical(x))])):v);
function need(v:unknown,message:string):asserts v{if(!v)throw Error('Composter feed oracle: '+message);}
function station(s:ComposterFeedObservation,cell:{x:number;y:number;z:number}):ComposterRecord{
 const read=readComposterOwners({edits:[[cell.x,cell.y,cell.z,s.cell]],composters:s.station});need(read.kind==='valid'&&read.data.records.length===1,'one exact valid physical station owner');const row=read.data.records[0];need(row.x===cell.x&&row.y===cell.y&&row.z===cell.z&&s.cell===COMPOSTER_ID+row.level,'station/cell identity');return row;
}
function receivers(s:ComposterFeedObservation):string{return canonical({agentSlots:s.agentSlots,pending:s.pending,drops:{nextKey:s.drops.nextKey,records:s.drops.records.map(r=>({key:r.key,stack:r.stack})).sort((a,b)=>a.key-b.key)}});}
function loadedClock(s:ComposterFeedObservation):number{const{tick,accumulator}=s.caneClock;need(Number.isSafeInteger(tick)&&tick>=0&&tick<=1e9&&Number.isFinite(accumulator)&&accumulator>=0&&accumulator<=86400&&s.paused===false&&s.dead===false&&s.recovery===false,'active source-backed loaded clock witness');return tick+accumulator;}
function enoughTime(before:ComposterFeedObservation,after:ComposterFeedObservation,minimum:number):void{const elapsed=loadedClock(after)-loadedClock(before);need(elapsed>=-1e-7&&elapsed+1e-6>=minimum,'actual loaded interval insufficient for timer transition');}
/** A single finite Survival feed, followed only by ComposterStore.update's loaded7→8.
 * Bounded to the positive fixture's single station. Timer observations need not be adjacent frames.
 * No RNG or application clock is written; loaded clock is read from captured observations. */
export function assertSingleComposterFeed(before:ComposterFeedObservation,inputBefore:ComposterFeedObservation,immediate:ComposterFeedObservation,observed:ComposterFeedObservation,cell:{x:number;y:number;z:number},hayID:number):{raised:boolean;matured:boolean}{
 for(const s of[before,inputBefore,immediate,observed])loadedClock(s);enoughTime(before,inputBefore,0);enoughTime(inputBefore,immediate,0);enoughTime(immediate,observed,0);
 const b=station(before,cell),start=station(inputBefore,cell),a=station(immediate,cell),last=station(observed,cell);need(b.level>=0&&b.level<7,'feed starts below pending/ready');need(canonical(start)===canonical(b)&&canonical(inputBefore.bag)===canonical(before.bag)&&receivers(inputBefore)===receivers(before),'pre-input owner changed');
 const expectedBag=structuredClone(before.bag),slot=expectedBag.selected,held=expectedBag.slots[slot];need(held&&held.id===hayID&&Number.isSafeInteger(held.count)&&held.count>0,'finite selected Hay source');expectedBag.slots[slot]=held.count===1?null:{...held,count:held.count-1};
 for(const s of[immediate,observed]){need(canonical(s.bag)===canonical(expectedBag),'exact one source debit; other inventory unchanged');need(receivers(s)===receivers(before),'Agent/pending/ground owner changed');}
 need(a.attempts===b.attempts+1&&last.attempts===b.attempts+1,'exactly one feed attempt');
 // Failed roll preserves level; successful roll adds exactly1, whose level7 timer
 // may already have elapsed before the first asynchronous observation.
 const raised=a.level>b.level;need(a.level===b.level||a.level===b.level+1||b.level===6&&a.level===8,'single feed projection');
 if(!raised||a.level<7)need(a.remaining===0,'nonpending feed has no timer');
 else if(a.level===7)need(a.remaining>0&&a.remaining<=COMPOSTER_APP_PROFILE.matureSeconds,'pending timer bounded by source profile');
 else need(a.level===8&&a.remaining===0,'mature ready has no timer');
 if(a.level===7)enoughTime(inputBefore,immediate,COMPOSTER_APP_PROFILE.matureSeconds-a.remaining);
 if(a.level===8)enoughTime(inputBefore,immediate,COMPOSTER_APP_PROFILE.matureSeconds);
 if(a.level===7){enoughTime(immediate,observed,last.level===8?a.remaining:a.remaining-last.remaining);need(last.level===7&&last.remaining>0&&last.remaining<=a.remaining||last.level===8&&last.remaining===0,'only forward pending maturity after feed');}
 else need(canonical(last)===canonical(a),'no autonomous level/attempt change outside pending7');
 return{raised,matured:a.level===8||a.level===7&&last.level===8};
}
