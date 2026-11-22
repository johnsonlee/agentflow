import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0,shown:[] as unknown[]}));
vi.mock("../../../apps/web/src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;show(...args:unknown[]){this.open=true;h.shown=args;}refresh(){}hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}}}));
vi.mock("../../../apps/web/src/ui/screens",()=>({Portfolio:class{dropped=0;photos=[];},ChatInput:class{open=false;hide(){this.open=false;}},PortfolioScreen:class{hide(){}},NpcDialog:class{hide(){}},ChalkboardDialog:class{hide(){}},BookScreen:class{open=false;show(){this.open=true;}hide(){this.open=false;}}}));
vi.mock("../../../apps/web/src/ui/codeBuilder",()=>({CodeBuilderScreen:class{hide(){}}}));
vi.mock("../../../apps/web/src/ui/chalkboards",()=>({ChalkboardViews:class{dispose(){h.disposed.push("chalk");}}}));
vi.mock("../../../apps/web/src/rendering/agentView",()=>({AgentView:class{moveTo(){}snap(){}dispose(){h.disposed.push("agent");}}}));
vi.mock("../../../apps/web/src/rendering/worldDropsView",()=>({WorldDropsView:class{dispose(){h.disposed.push("drops");}}}));
vi.mock("../../../apps/web/src/rendering/snowballProjectilesView",()=>({SnowballProjectilesView:class{impact(){}dispose(){h.disposed.push("snowballs");}}}));
vi.mock("../../../apps/web/src/rendering/leash-view",()=>({LeashView:class{dispose(){h.disposed.push("leash");}}}));
vi.mock("../../../apps/web/src/rendering/balloonView",()=>({BalloonView:class{dispose(){h.disposed.push("balloon");}}}));
vi.mock("../../../apps/web/src/rendering/glow-stick-view",()=>({GlowStickView:class{dispose(){h.disposed.push("glow");}}}));
vi.mock("../../../apps/web/src/rendering/sparkler-view",()=>({SparklerView:class{dispose(){h.disposed.push("sparkler");}}}));
import { Game } from "../../../apps/web/src/application/game";
import type { TextureAtlas } from "@craft/textures";
class Element extends EventTarget{getContext(){return {fillStyle:"",fillRect(){}};}className="";hidden=false;style={};parent:Element|null=null;children:Element[]=[];appendChild(e:Element){this.children.push(e);e.parent=this;return e;}remove(){h.rootRemoved++;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}}
import { Inventory } from "../../../packages/engine/src/ownership/inventory";
import { parseSave,type SaveData } from "../../../packages/engine/src/persistence/save";
import { stackId } from "../../../packages/engine/src/catalog/items";
import { blockId } from "../../../packages/engine/src/catalog/blocks";
import { SAVE_KEY } from "../../../apps/web/src/application/game";
import { captureDimensionWorld } from "../../../packages/engine/src/persistence/dimension-world";
import { NetherGenerator } from "../../../packages/engine/src/world/nether-generator";
const writer=Game as unknown as {activeWriter:Game|null};
const blobs:Blob[]=[];let stored:string|null=null;
beforeEach(()=>{
 Object.assign(h,{disposed:[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null,onKeyboardDispose:null,rootRemoved:0,frames:0});
 blobs.length=0;stored=null;vi.useFakeTimers();
 vi.stubGlobal("document",Object.assign(new EventTarget(),{createElement:()=>Object.assign(new Element(),{click(){},download:"",href:""}),pointerLockElement:null}));
 vi.stubGlobal("window",Object.assign(new EventTarget(),{innerWidth:800,innerHeight:600}));
 vi.stubGlobal("localStorage",{getItem:(key:string)=>key===SAVE_KEY?stored:null,setItem:(key:string,value:string)=>{if(key===SAVE_KEY)stored=value;}});
 vi.stubGlobal("URL",{createObjectURL:(blob:Blob)=>{blobs.push(blob);return "blob:test";},revokeObjectURL:vi.fn()});
 vi.stubGlobal("requestAnimationFrame",vi.fn(()=>++h.frames));vi.stubGlobal("cancelAnimationFrame",vi.fn());writer.activeWriter=null;
});
afterEach(()=>{vi.runOnlyPendingTimers();vi.useRealTimers();writer.activeWriter=null;vi.unstubAllGlobals();vi.restoreAllMocks();});
function saved():SaveData{
 const bag=new Inventory();bag.slots[0]={id:stackId("diamond_pickaxe"),count:1,damage:12};
 return {version:1,name:"Archived world",seed:7,generatorVersion:2,mode:"survival",timeOfDay:.1,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},edits:[],inventory:bag.toJSON(),playerState:{health:7},dimensions:{version:1,active:"overworld",inactive:{nether:{seed:9,generatorVersion:1,player:{position:{x:12.5,y:45,z:13.5},yaw:0,pitch:0,flying:false},edits:[[12,44,13,blockId("stone")]],worldDrops:{nextKey:1,records:[]}}},links:[]}};
}
function construct(save:SaveData){return new Game(new Element() as unknown as HTMLElement,{} as TextureAtlas,{name:save.name,seed:save.seed,mode:save.mode,touch:false,save},{onPause:vi.fn(),onDeath:vi.fn()});}
import {BrewingStand} from '@craft/engine';
type BrewingGame=Pick<Game,keyof Game>&{updateBrewingStations(dt:number):void;breakAt(t:unknown):void;openInventory(kind:string):void;openBrewing:string|null;actionsNeedRecovery:boolean;transferBusy:boolean;captureSaveData(recovery?:boolean):SaveData;interact(breaking:boolean,place:boolean,using:boolean,pick:boolean,dt:number):void;drinkOwner:unknown;stepAgent(dt:number):void;beginBlockRelease(x:number,y:number,z:number):import('@craft/engine').ReleaseAttempt};
function brewingSave(){const r=saved();delete r.dimensions;r.edits=[[0,79,0,blockId('stone')],[0,80,0,201],[0,81,0,0]];const b=new BrewingStand();b.replace(0,{id:stackId('water_bottle'),count:1});b.replace(1,{id:stackId('tonic'),count:1});b.replace('ingredient',{id:stackId('nether_wart'),count:2});b.replace('fuel',{id:stackId('blaze_powder'),count:2});b.update(1);r.brewingStands=[{x:0,y:80,z:0,state:b.snapshot()}];return r;}
function active(r=brewingSave()){stored=JSON.stringify(r);return construct(parseSave(stored)) as unknown as BrewingGame;}
const hit={x:0,y:80,z:0,id:201,normal:{x:0,y:1,z:0}};
it('actual constructor restores strict partial owners; live tick, pause and save cold continuation conserve all containers',()=>{
 const r=brewingSave(),g=active(r),s=g.brewingStands.get('0,80,0')!;expect(s.snapshot()).toEqual(r.brewingStands![0].state);g.paused=true;g.updateBrewingStations(10);expect(s.snapshot().progressSeconds).toBe(1);g.paused=false;g.updateBrewingStations(1);expect(s.snapshot().progressSeconds).toBe(2);expect(g.save()).toBe(true);const cold=active(JSON.parse(stored!));expect(cold.brewingStands.get('0,80,0')!.snapshot()).toEqual(s.snapshot());
 for(let i=0;i<18;i++)cold.updateBrewingStations(1);expect(cold.brewingStands.get('0,80,0')!.snapshot().bottles[0]?.id).toBe(stackId('awkward_potion'));expect(cold.brewingStands.get('0,80,0')!.snapshot().fuelUses).toBe(19);
});
it('actual new placement owns an empty station and fifth inventory argument receives exact live owner',()=>{
 const g=active();g.world.setBlock(2,80,0,201);const owner=g.brewingStands.get('2,80,0');expect(owner?.contents()).toEqual([]);g.openBrewing='2,80,0';g.openInventory('brewing_stand');expect(h.shown[4]).toBe(owner);expect(h.shown[2]).toBe('brewing_stand');
});
it('unloaded station never generates or progresses; inactive dimension station snapshots remain unchanged',()=>{
 const r=brewingSave();r.edits=r.edits.map(e=>[e[0]+4096,e[1],e[2]] .concat(e[3]) as [number,number,number,number]);r.brewingStands![0].x=4096;const g=active(r);g.world.unloadChunk(256,0);const s=g.brewingStands.get('4096,80,0')!,before=s.snapshot(),chunks=g.world.loadedChunkCount();g.updateBrewingStations(1);expect(g.world.loadedChunkCount()).toBe(chunks);expect(s.snapshot()).toEqual(before);expect(g.save()).toBe(true);
 const archived=saved();archived.dimensions!.inactive.nether!.brewingStands=[{x:12,y:45,z:13,state:new BrewingStand().snapshot()}];archived.dimensions!.inactive.nether!.edits.push([12,45,13,201]);const cold=active(archived),original=structuredClone(archived.dimensions!.inactive.nether);cold.updateBrewingStations(1);expect(cold.save()).toBe(true);expect(JSON.parse(stored!).dimensions.inactive.nether).toEqual(original);
});
it('damaged raw station/progress/physical orphan freezes actual Game before normalization and exports exact original',async()=>{
 const r=brewingSave();r.brewingStands![0].state.fuelUses=20;const original=' \n'+JSON.stringify(r)+'\n ';stored=original;const g=construct(parseSave(original)) as unknown as BrewingGame;expect(g.actionsNeedRecovery).toBe(true);expect(g.save()).toBe(false);expect(g.runChat('/give stone')).toContain('Export a backup');expect(stored).toBe(original);g.exportSaveBackup();expect(JSON.parse(await blobs[0].text()).recoveryOriginalSave).toBe(original);
});
it('unexpected external nonempty removal retains live cargo plus original backup and freezes all actions',async()=>{
 const g=active(),original=stored;g.inventory.addStack({id:stackId('diamond'),count:3});const station=g.brewingStands.get('0,80,0')!,before=station.snapshot();g.world.setBlock(0,80,0,0);expect(g.actionsNeedRecovery).toBe(true);expect(g.save()).toBe(false);expect(station.snapshot()).toEqual(before);g.exportSaveBackup();const backup=JSON.parse(await blobs[0].text());expect(backup.recoveryOriginalSave).toBe(original);expect(backup.recoveryLiveSave.brewingStands[0].state).toEqual(before);expect(backup.recoveryLiveSave.inventory).toEqual(g.inventory.toJSON());expect(stored).toBe(original);
});
it('failed drop publication cancels reservation; successful Player break retires stale owner and transfers contents once',()=>{
 const g=active(),stand=g.brewingStands.get('0,80,0')!,before=stand.snapshot();const fail=vi.spyOn(g.worldDrops,'planSpawnBatch').mockReturnValue(null);g.breakAt(hit);expect(g.world.getBlock(0,80,0)).toBe(201);expect(stand.snapshot()).toEqual(before);expect(stand.busy).toBe(false);expect(g.transferBusy).toBe(false);fail.mockRestore();g.breakAt(hit);expect(g.world.getBlock(0,80,0)).toBe(0);expect(stand.removed).toBe(true);expect(g.brewingStands.has('0,80,0')).toBe(false);expect(g.worldDrops.records.flatMap(r=>r.stack).reduce((n,s)=>n+s.count,0)).toBe(6);expect(stand.replace(0,{id:stackId('water_bottle'),count:1}).ok).toBe(false);expect(g.save()).toBe(true);
});
it('receiver reentry cannot tick, save or edit station cargo while the full destroy lease is held',()=>{
 const g=active(),stand=g.brewingStands.get('0,80,0')!,before=stand.snapshot(),original=g.worldDrops.planSpawnBatch.bind(g.worldDrops);let called=0;
 vi.spyOn(g.worldDrops,'planSpawnBatch').mockImplementation((...args)=>{called++;expect(g.transferBusy).toBe(true);g.updateBrewingStations(10);expect(stand.snapshot()).toEqual(before);expect(g.save()).toBe(false);expect(stand.replace('fuel',null).ok).toBe(false);return original(...args);});g.breakAt(hit);expect(called).toBe(1);expect(stand.removed).toBe(true);expect(g.transferBusy).toBe(false);
});
it('actual CodeBuilder runner passes Agent destroy through the joint brewing lease and preserves all cargo on failed publication',()=>{
 const g=active(),stand=g.brewingStands.get('0,80,0')!,before=stand.snapshot();Object.assign(g.agent,{x:0,y:80,z:1,facing:2});
 const program={name:'Destroy brewing stand',trigger:{type:'run' as const},blocks:[{type:'command' as const,cmd:{op:'destroy' as const,dir:'forward' as const}}]};
 const fail=vi.spyOn(g.worldDrops,'planSpawnBatch').mockReturnValue(null);expect(g.runProgram(program)).toBe(true);g.stepAgent(.3);expect(g.world.getBlock(0,80,0)).toBe(201);expect(stand.snapshot()).toEqual(before);expect(stand.busy).toBe(false);fail.mockRestore();expect(g.runProgram(program)).toBe(true);g.stepAgent(.3);expect(g.world.getBlock(0,80,0)).toBe(0);expect(stand.removed).toBe(true);expect(g.brewingStands.size).toBe(0);expect(g.worldDrops.records.reduce((n,r)=>n+r.stack.count,0)).toBe(6);expect(g.save()).toBe(true);
});
it('source World reservation refuses receiver edits/removal/unload without duplicating station cargo',()=>{
 const g=active(),stand=g.brewingStands.get('0,80,0')!,original=g.worldDrops.planSpawnBatch.bind(g.worldDrops);let observed=false;
 vi.spyOn(g.worldDrops,'planSpawnBatch').mockImplementation((...args)=>{g.world.setBlock(0,80,0,0);g.world.unloadChunk(0,0);expect(g.world.getLoadedBlock(0,80,0)).toBe(201);expect(g.save()).toBe(false);observed=true;return original(...args);});g.breakAt(hit);expect(observed).toBe(true);expect(stand.removed).toBe(true);expect(g.actionsNeedRecovery).toBe(false);expect(g.worldDrops.records.reduce((n,r)=>n+r.stack.count,0)).toBe(6);
});
it('an unsaved live station removal still exports live owners when no original storage exists',async()=>{
 const g=active(),before=g.brewingStands.get('0,80,0')!.snapshot();stored=null;g.world.setBlock(0,80,0,0);g.exportSaveBackup();const backup=JSON.parse(await blobs[0].text());expect(backup.recoveryBackupFormat).toBe('original-and-live-v1');expect(backup.recoveryOriginalSave).toBeNull();expect(backup.recoveryLiveSave.brewingStands[0].state).toEqual(before);expect(stored).toBeNull();
});
it.each(['water_bottle','milk_bucket','bread','book_and_quill'])('actual interact opens targeted Brewing Stand before using held %s and cancels an existing drink',name=>{
 const g=active();Object.assign(g.body.position,{x:.5,y:79,z:3.5});g.body.pitch=0;g.body.yaw=Math.PI;
 for(let z=1;z<=9;z++)for(let y=80;y<=81;y++)g.world.setBlock(0,y,z,0);
 g.inventory.setSlot(0,{id:stackId(name),count:1});g.inventory.selected=0;g.hunger.food=8;g.playerStatus.poison={remaining:10,elapsed:0};
 if(name==='water_bottle'||name==='milk_bucket'){g.interact(false,false,true,false,.7);expect(g.drinkOwner).not.toBeNull();}
 const before=structuredClone({inventory:g.inventory.toJSON(),hunger:g.hunger,status:g.playerStatus,station:g.brewingStands.get('0,80,0')!.snapshot()});g.body.yaw=0;h.shown=[];
 g.interact(false,true,true,false,2);
 expect(h.shown[2]).toBe('brewing_stand');expect(h.shown[4]).toBe(g.brewingStands.get('0,80,0'));expect(g.drinkOwner).toBeNull();expect({inventory:g.inventory.toJSON(),hunger:g.hunger,status:g.playerStatus,station:g.brewingStands.get('0,80,0')!.snapshot()}).toEqual(before);
});
