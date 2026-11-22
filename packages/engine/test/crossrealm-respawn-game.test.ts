import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0}));
vi.mock("../../../apps/web/src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;hide(){this.open=false;}restorePending(_i:unknown,_m:unknown,stacks:unknown[]){this.pending=structuredClone(stacks);this.open=stacks.length>0;return this.open;}pending:unknown[]=[];pendingItems(){return structuredClone(this.pending);}clearTransferredPending(){this.pending=[];}resumePending(){return this.pending.length>0;}freezeForDeath(){}}}));
vi.mock("../../../apps/web/src/ui/screens",()=>({Portfolio:class{dropped=0;photos=[];},ChatInput:class{open=false;hide(){this.open=false;}},PortfolioScreen:class{hide(){}},NpcDialog:class{hide(){}},ChalkboardDialog:class{hide(){}},BookScreen:class{hide(){}}}));
vi.mock("../../../apps/web/src/ui/codeBuilder",()=>({CodeBuilderScreen:class{hide(){}}}));
vi.mock("../../../apps/web/src/ui/chalkboards",()=>({ChalkboardViews:class{dispose(){h.disposed.push("chalk");}}}));
vi.mock("../../../apps/web/src/rendering/agentView",()=>({AgentView:class{dispose(){h.disposed.push("agent");}}}));
vi.mock("../../../apps/web/src/rendering/worldDropsView",()=>({WorldDropsView:class{dispose(){h.disposed.push("drops");}}}));
vi.mock("../../../apps/web/src/rendering/snowballProjectilesView",()=>({SnowballProjectilesView:class{impact(){}dispose(){h.disposed.push("snowballs");}}}));
vi.mock("../../../apps/web/src/rendering/leash-view",()=>({LeashView:class{dispose(){h.disposed.push("leash");}}}));
vi.mock("../../../apps/web/src/rendering/balloonView",()=>({BalloonView:class{dispose(){h.disposed.push("balloon");}}}));
vi.mock("../../../apps/web/src/rendering/glow-stick-view",()=>({GlowStickView:class{dispose(){h.disposed.push("glow");}}}));
vi.mock("../../../apps/web/src/rendering/sparkler-view",()=>({SparklerView:class{dispose(){h.disposed.push("sparkler");}}}));
import { Game } from "../../../apps/web/src/application/game";
import type { TextureAtlas } from "@craft/textures";
class Element extends EventTarget{getContext(){return {fillStyle:"",fillRect(){}};}className="";hidden=false;style={};parent:Element|null=null;children:Element[]=[];appendChild(e:Element){this.children.push(e);e.parent=this;return e;}remove(){h.rootRemoved++;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}}
import { Inventory } from "../src/ownership/inventory";
import { parseSave,type SaveData } from "../src/persistence/save";
import { stackId } from "../src/catalog/items";
import { blockId } from "../src/catalog/blocks";
import { SAVE_KEY } from "../../../apps/web/src/application/game";
import { captureDimensionWorld } from "../src/persistence/dimension-world";
import { NetherGenerator } from "../src/world/nether-generator";
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
function construct(save:SaveData,world?:import("../src/world/world").World){return new Game(new Element() as unknown as HTMLElement,{} as TextureAtlas,{name:save.name,seed:save.seed,mode:save.mode,touch:false,save,preparedWorld:world},{onPause:vi.fn(),onDeath:vi.fn()},!!world);}
function addPortal(world:Pick<SaveData,"edits"|"portals">,axis:"x"|"z",x:number,y:number,z:number){
 const frame={axis,x,y,z,width:2,height:3};world.portals={version:1,records:[frame]};
 const cell=(u:number,v:number,id:number)=>world.edits.push([x+(axis==="x"?u:0),y+v,z+(axis==="z"?u:0),id]);
 for(let v=0;v<3;v++)for(let u=0;u<2;u++)cell(u,v,axis==="x"?192:193);
 for(let u=0;u<2;u++){cell(u,-1,blockId("obsidian"));cell(u,3,blockId("obsidian"));}
 for(let v=0;v<3;v++){cell(-1,v,blockId("obsidian"));cell(2,v,blockId("obsidian"));}return frame;
}

import type {MobManager} from "../../../apps/web/src/simulation/mobs";
function projectileSave():SaveData {
 const raw=saved();delete raw.dimensions;raw.mobs={nextId:2,records:[]};raw.blazeFireballs={version:1,nextKey:2,records:[{key:1,originMobId:1,position:{x:-1.5,y:80.9,z:.5},velocity:{x:8,y:0,z:0},ageSeconds:.25}]};return raw;
}
type Active=Pick<Game,keyof Game>&{mobs:MobManager;updateBlazeProjectiles(dt:number):void;updateSnowballs(dt:number):void};
function active(raw:SaveData):Active{stored=JSON.stringify(raw);const g=construct(parseSave(stored));for(let x=-3;x<=4;x++)for(let z=-1;z<=1;z++)g.world.getBlock(x,80,z);return g as unknown as Active;}

import {World} from '../src/world/world';

import {createAgent} from '../src/automation/agent';
type RespawnGame=Game&{prepareOverworldRespawn(atlas:TextureAtlas):import('../../../apps/web/src/application/game').PortalTravelHandle|null};
function netherSave(keepInventory=false):SaveData {
 const raw=saved();raw.seed=9;raw.generatorVersion=1;raw.player.position={x:10.5,y:70,z:10.5};raw.gamerules={keepInventory,doMobSpawning:false,doDaylightCycle:false};raw.agent=createAgent(10,70,11);raw.agent.slots[0]={id:stackId('stone'),count:5};raw.agent.slots[26]={id:stackId('blaze_powder'),count:2};raw.agent.selected=26;raw.mobs={nextId:2,records:[]};raw.blazeFireballs={version:1,nextKey:2,records:[{key:1,originMobId:1,position:{x:20,y:75,z:20},velocity:{x:8,y:0,z:0},ageSeconds:.25}]};
 raw.dimensions={version:1,active:'nether',inactive:{overworld:{seed:7,generatorVersion:2,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},edits:[[100,80,100,blockId('stone')]],worldDrops:{nextKey:5,records:[]},farming:{version:1,tick:13,accumulator:.4,cursor:0},fluids:{version:1,contactSeconds:.4}}},links:[]};return raw;
}
function dying(keepInventory=false,pending=false):RespawnGame {const raw=netherSave(keepInventory);if(pending)raw.inventoryPending=[{id:stackId('stone'),count:2}];stored=JSON.stringify(raw);return construct(parseSave(stored)) as RespawnGame;}
function kill(g:Game,kind='void'){(g as unknown as {hurt(n:number,k:string):void}).hurt(20,kind);expect(g.dead).toBe(true);}
it('actual Nether respawn refuses the old same-pose public path',()=>{const g=dying();kill(g);expect(g.respawn()).toBe(false);expect(g.dead).toBe(true);expect(writer.activeWriter).toBe(g);});
it.each([false,true])('actual crossrealm respawn keepInventory%s archives Nether death receipt and resets one global lifecycle',keep=>{
 const g=dying(keep,true),beforeBag=g.inventory.toJSON(),agent=structuredClone(g.agent),shots=(g as unknown as {mobs:MobManager}).mobs.exportFireballs();kill(g);const drops=(g as unknown as {worldDrops:{toJSON():unknown}}).worldDrops.toJSON();const trip=g.prepareOverworldRespawn({} as TextureAtlas);expect(trip).not.toBeNull();expect(writer.activeWriter).toBe(g);expect(g.dead).toBe(true);expect(g.save()).toBe(false);expect(g.prepareOverworldRespawn({} as TextureAtlas)).toBeNull();expect(trip!.prepareFrame()).toBe(true);expect(trip!.commit()).toBe(true);const target=trip!.target;expect(writer.activeWriter).toBe(target);expect(target.world.dimension).toBe('overworld');expect(target.dead).toBe(false);expect(target.health).toBe(20);expect(target.hunger.food).toBe(20);expect(target.playerStatus).toEqual({});expect(target.body.position.y).toBeGreaterThan(0);expect(target.agent.slots).toEqual(agent.slots);expect(target.agent.selected).toBe(26);expect(target.inventory.toJSON()).toEqual(keep?beforeBag:g.inventory.toJSON());expect(target.save()).toBe(true);const raw=JSON.parse(stored!);expect(raw.playerState).toEqual({health:20});expect(raw.dimensions.active).toBe('overworld');expect(raw.dimensions.inactive.nether.worldDrops).toEqual(drops);expect(raw.dimensions.inactive.nether.blazeFireballs).toEqual(shots);expect(raw.worldDrops).toEqual({nextKey:5,records:[]});expect(raw.farming).toEqual({version:1,tick:13,accumulator:.4,cursor:0});expect(raw.fluids).toEqual({version:1,contactSeconds:.4});expect(raw.inventoryPending).toEqual(keep?[{id:stackId('stone'),count:2}]:[]);expect(trip!.commit()).toBe(false);
});

it('failed readiness/cancel retries the same completed death receipt without a second drop batch',()=>{
 const g=dying();kill(g);const drops=(g as unknown as {worldDrops:{toJSON():unknown}}).worldDrops.toJSON();expect(g.save()).toBe(true);const prior=stored,trip=g.prepareOverworldRespawn({} as TextureAtlas)!;h.ready=false;expect(trip.prepareFrame()).toBe(false);expect(trip.commit()).toBe(false);expect(g.dead).toBe(true);expect(writer.activeWriter).toBe(g);expect(stored).toBe(prior);expect((g as unknown as {worldDrops:{toJSON():unknown}}).worldDrops.toJSON()).toEqual(drops);h.ready=true;const retry=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(retry.prepareFrame()).toBe(true);expect(retry.commit()).toBe(true);expect(retry.target.save()).toBe(true);expect(JSON.parse(stored!).dimensions.inactive.nether.worldDrops).toEqual(drops);
});
it('late target-render callback source mutation refuses publication and keeps the already-complete death receipt',()=>{
 const g=dying();kill(g);const trip=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(trip.prepareFrame()).toBe(true);const render=trip.target.renderer.render.bind(trip.target.renderer);trip.target.renderer.render=(...args:Parameters<typeof render>)=>{g.agent.slots[2]={id:stackId('stone'),count:1};return render(...args);};expect(trip.commit()).toBe(false);expect(writer.activeWriter).toBe(g);expect(g.dead).toBe(true);expect(g.paused).toBe(false);expect(g.agent.slots[2]?.count).toBe(1);expect(g.save()).toBe(true);expect(JSON.parse(stored!).playerState.death.phase).toBe('complete');
});
it('target render exception and external cancellation preserve source ownership and allow one retry',()=>{
 const g=dying(true);kill(g);const bag=g.inventory.toJSON(),trip=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(trip.prepareFrame()).toBe(true);h.failRender=true;expect(trip.commit()).toBe(false);h.failRender=false;expect(writer.activeWriter).toBe(g);expect(g.inventory.toJSON()).toEqual(bag);const cancelled=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(cancelled.prepareFrame()).toBe(true);expect(cancelled.commit(()=>false)).toBe(false);cancelled.cancel();expect(g.dead).toBe(true);const retry=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(retry.prepareFrame()).toBe(true);expect(retry.commit()).toBe(true);expect(retry.target.inventory.toJSON()).toEqual(bag);
});
it('a refused death receiver keeps pending owners through cold restore before the first accepted transfer',()=>{
 const g=dying(),port=g as unknown as {dropSink:import('../src/ownership/world-drops').DropSink};port.dropSink=()=>null;const bag=g.inventory.toJSON();kill(g);expect(g.prepareOverworldRespawn({} as TextureAtlas)).toBeNull();expect(g.inventory.toJSON()).toEqual(bag);expect(g.save()).toBe(true);expect(JSON.parse(stored!).playerState.death.phase).toBe('pending');expect(JSON.parse(stored!).worldDrops.records).toEqual([]);const cold=construct(parseSave(stored!)) as RespawnGame;const trip=cold.prepareOverworldRespawn({} as TextureAtlas)!;expect(trip).not.toBeNull();expect(trip.prepareFrame()).toBe(true);expect(trip.commit()).toBe(true);expect(trip.target.save()).toBe(true);const archived=JSON.parse(stored!).dimensions.inactive.nether;expect(archived.worldDrops.records.map((r:{stack:unknown})=>r.stack)).toEqual(bag.slots.filter(Boolean));expect(archived.worldDrops.nextKey).toBe(2);
});
it('void death archives its negative-coordinate drop receipt and respawns on safe Overworld ground',()=>{
 const g=dying();g.body.position.y=-30;kill(g);const trip=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(trip).not.toBeNull();expect(trip.prepareFrame()).toBe(true);expect(trip.commit()).toBe(true);expect(trip.target.body.position.y).toBeGreaterThan(0);expect(trip.target.save()).toBe(true);expect(JSON.parse(stored!).dimensions.inactive.nether.worldDrops.records[0].position.y).toBe(-30);
});
it('malformed pending player ownership stays frozen and preserves exact raw recovery export',async()=>{
 const raw=netherSave();raw.playerState={health:0,death:{phase:'pending',position:{...raw.player.position!},keepInventory:false}};raw.inventoryPending=[{id:stackId('stone'),count:65}];const original=' \n'+JSON.stringify(raw)+'\n ';stored=original;const g=construct(parseSave(original)) as RespawnGame;expect(g.prepareOverworldRespawn({} as TextureAtlas)).toBeNull();expect(g.deathError).toContain('Export a backup');expect(g.save()).toBe(false);expect(writer.activeWriter).toBe(g);g.exportSaveBackup();expect(JSON.parse(await blobs[0].text()).recoveryOriginalSave).toBe(original);expect(stored).toBe(original);
});
it('staged global mutation and public dead-source portal handoff cannot publish a respawn target',()=>{
 const g=dying(true);kill(g);const trip=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(trip.prepareFrame()).toBe(true);expect(trip.target.commitPrepared(g)).toBe(false);trip.target.inventory.slots[3]={id:stackId('stone'),count:64};expect(trip.commit()).toBe(false);expect(writer.activeWriter).toBe(g);expect(g.dead).toBe(true);
});

it('a Nether-only archive can prepare its first generated Overworld without carrying the dead pose',()=>{
 const raw=netherSave();delete raw.dimensions!.inactive.overworld;stored=JSON.stringify(raw);const g=construct(parseSave(stored)) as RespawnGame;kill(g);const trip=g.prepareOverworldRespawn({} as TextureAtlas)!;expect(trip).not.toBeNull();expect(trip.prepareFrame()).toBe(true);expect(trip.commit()).toBe(true);expect(trip.target.world.dimension).toBe('overworld');expect(trip.target.world.seed).toBe(raw.seed);expect(trip.target.world.generatorVersion).toBe(2);expect(trip.target.body.position).not.toEqual(raw.player.position);expect(trip.target.save()).toBe(true);expect(JSON.parse(stored!).dimensions.inactive.nether.worldDrops.records).toHaveLength(1);
});
