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
import {createPlayerStatus,applyPoison,applyTimedStatus,parseCommand,serializeSave,TIMED_STATUS,reservePlayerStatus,type PlayerStatus,type TimedStatusKind} from '@craft/engine';
type EffectGame=Pick<Game,keyof Game>&{interact(breaking:boolean,place:boolean,using:boolean,pick:boolean,dt:number):void;updatePlayerStatus(dt:number):void;statusVisualSeconds:number;statusOwner:import('@craft/engine').PlayerStatusOwner;recoverySections:string[];drinkOwner:unknown;stopped:boolean;mode:'survival'|'creative';dead:boolean};
function effects():PlayerStatus{const status=createPlayerStatus();applyPoison(status);for(const kind of ['weakness','blindness','nausea']as const)expect(applyTimedStatus(status,kind,30,1)).toBe(true);return status;}
function active(){const r=saved();delete r.dimensions;r.playerState={health:20};r.gamerules={doMobSpawning:false,doDaylightCycle:false};r.edits=[];for(let x=-3;x<=3;x++)for(let z=-5;z<=3;z++){r.edits.push([x,79,z,blockId('stone')]);for(let y=80;y<=83;y++)r.edits.push([x,y,z,0]);}stored=JSON.stringify(r);return construct(parseSave(stored)) as unknown as EffectGame;}
function hold(g:EffectGame,dt:number){g.interact(false,false,true,false,dt);}
it.each([['antidote','poison'],['elixir','weakness'],['eye_drops','blindness'],['tonic','nausea'],['awkward_potion',null]]as const)('actual held %s consumes one whole bottle and cures only %s while preserving health/hunger/other owners', (name,cure)=>{
 const g=active();g.playerStatus=effects();g.inventory.slots.fill(null);g.inventory.slots[0]={id:stackId(name),count:1};g.inventory.select(0);const before=structuredClone(g.playerStatus),hunger=structuredClone(g.hunger),health=g.health;hold(g,.8);hold(g,.7);expect(g.inventory.selectedStack()?.id).toBe(stackId(name));expect(g.playerStatus).toEqual(before);hold(g,.1);const expected=structuredClone(before);if(cure)delete expected[cure];expect(g.playerStatus).toEqual(expected);expect(g.inventory.selectedStack()).toEqual({id:stackId('glass_bottle'),count:1});expect(g.health).toBe(health);expect(g.hunger).toEqual(hunger);expect(g.drinkOwner).toBeNull();
});
it('full bag and finite Creative use source cell only; Milk clears all four and retains one Bucket',()=>{
 const g=active();g.mode='creative';g.playerStatus=effects();g.inventory.slots.fill(null);for(let i=0;i<36;i++)g.inventory.slots[i]={id:blockId('stone'),count:64};g.inventory.slots[0]={id:stackId('milk_bucket'),count:1};const other=structuredClone(g.inventory.slots.slice(1));hold(g,1.6);expect(g.inventory.slots[0]).toEqual({id:stackId('bucket'),count:1});expect(g.inventory.slots.slice(1)).toEqual(other);expect(g.playerStatus).toEqual({});
 g.inventory.slots[0]={id:stackId('tonic'),count:1};hold(g,1.6);expect(g.inventory.slots[0]).toEqual({id:stackId('glass_bottle'),count:1});expect(g.inventory.slots.slice(1)).toEqual(other);
});
it('release, selection replacement and mode changes cancel or restart actual medicine held ownership',()=>{
 const g=active();g.playerStatus=effects();g.inventory.slots[0]={id:stackId('elixir'),count:1};hold(g,1);g.interact(false,false,false,false,.1);hold(g,.7);expect(g.inventory.slots[0]?.id).toBe(stackId('elixir'));g.inventory.slots[0]={id:stackId('elixir'),count:1};hold(g,.9);expect(g.inventory.slots[0]?.id).toBe(stackId('elixir'));g.mode='creative';hold(g,.8);expect(g.inventory.slots[0]?.id).toBe(stackId('elixir'));hold(g,.8);expect(g.inventory.slots[0]?.id).toBe(stackId('glass_bottle'));expect(g.playerStatus.weakness).toBeUndefined();
});
it.each(['paused','dead','stopped']as const)('actual %s lifecycle gate cancels medicine without debit or cure',key=>{
 const g=active();g.playerStatus=effects();g.inventory.slots[0]={id:stackId('tonic'),count:1};hold(g,.8);const before=structuredClone(g.playerStatus);g[key]=true;hold(g,2);expect(g.inventory.slots[0]?.id).toBe(stackId('tonic'));expect(g.playerStatus).toEqual(before);expect(g.drinkOwner).toBeNull();
});
it('commands grant supported timed effects, clear one/all and cancel held drinks; finite bounds and unsupported syntax refuse',()=>{
 const g=active();expect(g.runChat('/effect @s weakness')).toBe('Applied weakness for 30s.');expect(g.playerStatus).toEqual({weakness:{remaining:30,amplifier:0}});expect(g.runChat('/effect @p minecraft:blindness 60 2')).toBe('Applied blindness for 60s.');expect(g.runChat('/effect @a nausea 20 0')).toContain('Applied');g.inventory.slots[0]={id:stackId('elixir'),count:1};hold(g,.7);g.runChat('/effect @s clear blindness');expect(g.playerStatus.blindness).toBeUndefined();expect(g.playerStatus.weakness).toBeDefined();expect(g.drinkOwner).toBeNull();
 for(const command of ['/effect @s weakness -1','/effect @s weakness 1.5','/effect @s weakness NaN','/effect @s weakness 1 256','/effect @s weakness infinite','/effect @s future 30','/effect @e weakness 10','/effect @s clear future'])expect(parseCommand(command).type).toBe('error');expect(parseCommand(`/effect @s nausea ${TIMED_STATUS.maximumSeconds} ${TIMED_STATUS.maximumAmplifier}`)).toMatchObject({type:'effect',action:'apply'});g.runChat('/effect @s weakness 0');expect(g.playerStatus.weakness).toBeUndefined();g.runChat('/effect @s clear');expect(g.playerStatus).toEqual({});
});
it('all new statuses save without Poison, remain global instead of inactive-world owned, and cold timers preserve relative active play',()=>{
 const g=active();for(const kind of ['weakness','blindness','nausea']as const)g.runChat(`/effect @s ${kind} 30 1`);const before=structuredClone(g.playerStatus);expect(g.save()).toBe(true);const savedRaw=JSON.parse(stored!);expect(savedRaw.playerStatus).toEqual(before);expect(savedRaw.playerStatus.poison).toBeUndefined();expect(captureDimensionWorld(savedRaw)).not.toHaveProperty('playerStatus');const cold=construct(parseSave(stored!))as unknown as EffectGame;expect(cold.playerStatus).toEqual(before);cold.paused=true;cold.updatePlayerStatus(5);expect(cold.playerStatus).toEqual(before);cold.paused=false;cold.updatePlayerStatus(2);for(const kind of ['weakness','blindness','nausea']as const)expect(cold.playerStatus[kind]).toEqual({remaining:28,amplifier:1});expect(cold.statusVisualSeconds).toBe(2);
});
it('invalid raw future/effect owner refuses storage overwrite and original recovery remains exact',async()=>{
 for(const state of [{weakness:{remaining:0,amplifier:0}},{nausea:{remaining:30,amplifier:256}},{blindness:{remaining:30,amplifier:0,extra:true}},{future:{remaining:1}}]){const r:any=saved();delete r.dimensions;r.playerStatus=state;stored=' \n'+JSON.stringify(r)+'\n ';const original=stored,cold=construct(parseSave(stored));expect(cold.save()).toBe(false);expect(stored).toBe(original);expect(cold.runChat('/give stone')).toContain('Export a backup');cold.exportSaveBackup();expect(JSON.parse(await blobs.at(-1)!.text()).recoveryOriginalSave).toBe(original);}
});
it('reserved private status blocks setter/commands/drink progression without false recovery, then releases cleanly',()=>{
 const g=active();g.playerStatus=effects();g.inventory.slots[0]={id:stackId('tonic'),count:1};const before=structuredClone(g.playerStatus),lease=reservePlayerStatus(g.statusOwner)!;expect(lease).not.toBeNull();g.playerStatus={};expect(g.playerStatus).toEqual(before);expect(g.runChat('/effect @s clear')).toContain('transferred');hold(g,2);expect(g.inventory.slots[0]?.id).toBe(stackId('tonic'));expect(g.recoverySections).toEqual([]);lease.cancel();hold(g,1.6);expect(g.playerStatus.nausea).toBeUndefined();
});
