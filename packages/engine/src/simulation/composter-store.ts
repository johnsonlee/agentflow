import{COMPOSTER_ID,COMPOSTER_APP_PROFILE,composterLevel}from'../catalog/composter';import{readComposterOwners,type ComposterRecord,type CompostersData,type ComposterIssue}from'../persistence/composter-state';import type{World,BlockEdit,WorldCellSnapshot}from'../world/world';
export interface ComposterWorldPlan{valid():boolean;commit():void}
export interface ComposterLease{readonly record:Readonly<ComposterRecord>;readonly cell:WorldCellSnapshot;valid():boolean;commit(next:ComposterRecord,finalize:()=>void,valid?:()=>boolean,expected?:readonly WorldCellSnapshot[]):boolean;cancel():void}
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const ordered=(records:readonly ComposterRecord[])=>records.map(r=>({...r})).sort((a,b)=>a.x-b.x||a.y-b.y||a.z-b.z);
/** Physical per-realm stations. No wall-clock catchup, renderer ownership or offline work. */
export class ComposterStore{
 private records=new Map<string,Readonly<ComposterRecord>>();private readonly leases=new Map<string,symbol>();private readonly intents=new Map<string,{row:Readonly<ComposterRecord>;valid:()=>boolean}>();private issues:ComposterIssue[]=[];private worldReservation:{cells:string[];plan:ComposterWorldPlan}|undefined;private disposed=false;private updating=false;private importing:{allowed:Map<string,number>;data?:CompostersData;issues:ComposterIssue[]}|undefined;
 constructor(private readonly world:World){}
 get busy():boolean{return this.leases.size>0||this.updating||!!this.importing||!!this.worldReservation;}
 get loadIssues():ComposterIssue[]{return this.issues.map(r=>({...r}));}
 get isDisposed():boolean{return this.disposed;}
 dispose():void{this.disposed=true;}
 toJSON():CompostersData{if(this.issues.length)throw Error('Damaged Composter ownership');return{version:1,records:ordered([...this.records.values()])};}
 get(x:number,y:number,z:number):ComposterRecord|undefined{const row=this.records.get(key(x,y,z));return row?{...row}:undefined;}
 /** World.importEdits only. Existing stations cannot have counters reset by a metadata-less
  * import; an exact co-state reimport is harmless. Invalid fresh input stays quarantined
  * while its physical cells remain available for exact-original backup recovery. */
 beginImport(raw:unknown,edits:readonly BlockEdit[]):{scoped:boolean;finish(success:boolean):void}|null{
  if(this.disposed||this.busy||this.issues.length)return null;const read=readComposterOwners({composters:raw,edits}),allowed=new Map<string,number>();for(const[x,y,z,id]of edits)if(composterLevel(id)!==null)allowed.set(key(x,y,z),id);
  if(this.records.size&&(raw===undefined||read.kind==='invalid'||JSON.stringify(ordered(read.data.records))!==JSON.stringify(ordered([...this.records.values()]))))return null;
  const scoped=raw!==undefined||allowed.size>0||this.records.size>0;if(!scoped)return{scoped:false,finish:()=>{}};
  const context={allowed,...(read.kind==='invalid'?{}:{data:read.data}),issues:read.issues};this.importing=context;let done=false;
  return{scoped:true,finish:(success)=>{if(done)return;done=true;if(this.importing!==context)return;if(success&&context.data){this.records=new Map(context.data.records.map(r=>[key(r.x,r.y,r.z),Object.freeze({...r})]));this.issues=[];}else{this.issues=[...context.issues,...(!success?[{path:'composters',reason:'Composter world import did not finish'}]:[])];}this.importing=undefined;}};
 }
 /** Plan ordinary physical writes before any block is applied. External hidden progress
  * minting refuses; canonical reset retains attempts; actual station removal retires progress. */
 planChanges(edits:readonly BlockEdit[]):ComposterWorldPlan|null{return this.makePlan(edits,false);}
 private makePlan(edits:readonly BlockEdit[],reserved:boolean):ComposterWorldPlan|null{
  const changes=edits.filter(([x,y,z,id])=>composterLevel(id)!==null||composterLevel(this.world.getLoadedBlock(x,y,z)??-1)!==null||this.records.has(key(x,y,z)));if(!changes.length)return{valid:()=>true,commit:()=>{}};
  const signature=changes.map(e=>`${key(e[0],e[1],e[2])}:${e[3]}`).sort();if(this.worldReservation)return JSON.stringify(signature)===JSON.stringify(this.worldReservation.cells)?this.worldReservation.plan:null;
  if(this.importing){const context=this.importing;if(changes.some(([x,y,z,id])=>composterLevel(id)!==null&&context.allowed.get(key(x,y,z))!==id))return null;return{valid:()=>this.importing===context&&!this.disposed,commit:()=>{}};}
  if(this.disposed||this.issues.length)return null;let size=this.records.size;const pending:{key:string;before:Readonly<ComposterRecord>|undefined;after:Readonly<ComposterRecord>|undefined;intent?:{row:Readonly<ComposterRecord>;valid:()=>boolean}}[]=[];
  for(const[x,y,z,id]of changes){const k=key(x,y,z),before=this.records.get(k),level=composterLevel(id),intent=this.intents.get(k);if(this.leases.has(k)&&!intent||this.updating&&!intent)return null;
   let after:Readonly<ComposterRecord>|undefined;if(intent){if(level!==intent.row.level||!intent.valid())return null;after=intent.row;}else if(level!==null){if(level!==0)return null;after=Object.freeze({x,y,z,level:0,attempts:before?.attempts??0,remaining:0});}
   if(!before&&after)size++;if(before&&!after)size--;pending.push({key:k,before,after,intent});
  }
  if(size>COMPOSTER_APP_PROFILE.maximumStations)return null;
  return{valid:()=>(reserved||!this.disposed)&&!this.issues.length&&pending.every(p=>this.records.get(p.key)===p.before&&(!p.intent||this.intents.get(p.key)===p.intent&&p.intent.valid())),commit:()=>{for(const p of pending)if(p.after)this.records.set(p.key,p.after);else this.records.delete(p.key);}};
 }
 /** World source reservation precedes legacy receiver acknowledgement. Once accepted,
  * its exact retirement finalizer remains valid through cleanup disposal; no new work does. */
 reserveWorldChanges(edits:readonly BlockEdit[]):{valid():boolean;release():void}|null{
  if(this.worldReservation)return null;const touches=edits.filter(([x,y,z,id])=>composterLevel(id)!==null||composterLevel(this.world.getLoadedBlock(x,y,z)??-1)!==null||this.records.has(key(x,y,z)));if(!touches.length)return{valid:()=>true,release:()=>{}};if(touches.some(e=>composterLevel(e[3])!==null))return null;
  const plan=this.makePlan(edits,true);if(!plan||!plan.valid())return null;const reservation={cells:touches.map(e=>`${key(e[0],e[1],e[2])}:${e[3]}`).sort(),plan};this.worldReservation=reservation;let active=true;return{valid:()=>active&&this.worldReservation===reservation&&plan.valid(),release:()=>{if(!active)return;active=false;if(this.worldReservation===reservation)this.worldReservation=undefined;}};
 }
 reserve(x:number,y:number,z:number,internalTick=false):ComposterLease|null{
  if(this.disposed||this.issues.length||this.importing||this.worldReservation||this.world.blockSourceLeaseBusy||this.updating&&!internalTick)return null;const k=key(x,y,z);if(this.leases.has(k))return null;const cell=this.world.captureCell(x,y,z),level=cell?composterLevel(cell.id):null;if(!cell||level===null)return null;const before=this.records.get(k);if(!before&&level!==0||before&&before.level!==level)return null;if(!before&&this.records.size>=COMPOSTER_APP_PROFILE.maximumStations)return null;
  const record=before??Object.freeze({x,y,z,level:0,attempts:0,remaining:0}),token=Symbol('Composter station');this.leases.set(k,token);let active=true,published=false;
  const cancel=()=>{if(!active)return;active=false;if(this.leases.get(k)===token)this.leases.delete(k);this.intents.delete(k);};
  const valid=()=>active&&!this.disposed&&!this.issues.length&&this.leases.get(k)===token&&this.records.get(k)===before&&this.world.cellUnchanged(cell);
  return{record,cell,valid,cancel,commit:(next,finalize,ownerValid=()=>true,expected=[])=>{
   if(!valid()||next.x!==x||next.y!==y||next.z!==z)return false;const read=readComposterOwners({edits:[[x,y,z,COMPOSTER_ID+next.level]],composters:{version:1,records:[next]}});if(read.kind==='invalid')return false;const row=Object.freeze({...read.data.records[0]}),guard=()=>valid()&&ownerValid()&&valid();
   try{if(next.level===record.level){return this.world.commitOwnedState([cell,...expected],guard,()=>{this.records.set(k,row);published=true;finalize();})||published;}
    const intent={row,valid};this.intents.set(k,intent);return this.world.commitBlockBatch([[x,y,z,COMPOSTER_ID+next.level]],()=>{published=true;finalize();},[cell,...expected],guard)||published;
   }catch{return published;}finally{this.intents.delete(k);}
  }};
 }
 /** At most4096 existing stations, each pending loaded station gets its own actual dt.
  * Paused/title/inactive callers do not invoke this; unloaded cells do not catch up. */
 update(dt:number):void{
  if(this.disposed||this.busy||this.issues.length||!Number.isFinite(dt)||dt<=0||dt>1||this.world.blockSourceLeaseBusy)return;this.updating=true;
  try{for(const source of [...this.records.values()]){if(this.disposed)break;if(source.level!==7||this.world.getLoadedBlock(source.x,source.y,source.z)!==COMPOSTER_ID+7)continue;const lease=this.reserve(source.x,source.y,source.z,true);if(!lease)continue;try{const remaining=Math.max(0,lease.record.remaining-dt),next={...lease.record,remaining,level:remaining===0?8:7};lease.commit(next,()=>{});}finally{lease.cancel();}}}finally{this.updating=false;}
 }
}
