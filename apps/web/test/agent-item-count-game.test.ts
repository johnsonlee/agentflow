// Actual Game ray/effect/owner regressions. DOM/renderer/input are fixtures; World, Inventory and save receipts are real.
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0,shown:[] as unknown[]}));
vi.mock("../src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{setCameraAction(){}flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;show(...args:unknown[]){this.open=true;h.shown=args;}refresh(){}hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}}}));
vi.mock("../src/ui/screens",()=>({Portfolio:class{dropped=0;photos=[];},ChatInput:class{open=false;hide(){this.open=false;}},PortfolioScreen:class{hide(){}},NpcDialog:class{hide(){}},ChalkboardDialog:class{hide(){}},BookScreen:class{open=false;show(){this.open=true;}hide(){this.open=false;}}}));
vi.mock("../src/ui/codeBuilder",()=>({CodeBuilderScreen:class{hide(){}}}));
vi.mock("../src/ui/chalkboards",()=>({ChalkboardViews:class{dispose(){h.disposed.push("chalk");}}}));
vi.mock("../src/rendering/agentView",()=>({AgentView:class{moveTo(){}snap(){}dispose(){h.disposed.push("agent");}}}));
vi.mock("../src/rendering/worldDropsView",()=>({WorldDropsView:class{dispose(){h.disposed.push("drops");}}}));
vi.mock("../src/rendering/snowballProjectilesView",()=>({SnowballProjectilesView:class{impact(){}dispose(){h.disposed.push("snowballs");}}}));
vi.mock("../src/rendering/leash-view",()=>({LeashView:class{dispose(){h.disposed.push("leash");}}}));
vi.mock("../src/rendering/balloonView",()=>({BalloonView:class{dispose(){h.disposed.push("balloon");}}}));
vi.mock("../src/rendering/glow-stick-view",()=>({GlowStickView:class{dispose(){h.disposed.push("glow");}}}));
vi.mock("../src/rendering/sparkler-view",()=>({SparklerView:class{dispose(){h.disposed.push("sparkler");}}}));
import { Game } from "../src/application/game";
import type { TextureAtlas } from "@craft/textures";
class Element extends EventTarget{getContext(){return {fillStyle:"",fillRect(){}};}className="";hidden=false;style={};parent:Element|null=null;children:Element[]=[];appendChild(e:Element){this.children.push(e);e.parent=this;return e;}remove(){h.rootRemoved++;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}}
import { Inventory } from "../../../packages/engine/src/ownership/inventory";
import { parseSave,type SaveData } from "../../../packages/engine/src/persistence/save";
import { stackId } from "../../../packages/engine/src/catalog/items";
import { blockId } from "../../../packages/engine/src/catalog/blocks";
import { SAVE_KEY } from "../src/application/game";
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
function construct(save:SaveData){return new Game(new Element() as unknown as HTMLElement,{} as TextureAtlas,{name:save.name,seed:save.seed,mode:save.mode,touch:false,save},{onPause:vi.fn(),onDeath:vi.fn()});}
import {serializeSave} from '@craft/engine';
type EffectGame=Pick<Game,keyof Game>&{interact(breaking:boolean,place:boolean,using:boolean,pick:boolean,dt:number):void;stepAgent(dt:number):void;};


import {reserveInventoryMutation} from '../../../packages/engine/src/ownership/inventory-lease';
function seed(count=2,mode:'survival'|'creative'='survival'):SaveData{
 const bag=new Inventory();bag.slots[0]={id:211,count};bag.slots[1]={id:214,count:3};
 const save:SaveData={version:1,name:'Slab actual Game fixture',seed:7,generatorVersion:3,mode,timeOfDay:.25,player:{position:{x:.5,y:80,z:3.5},yaw:0,pitch:Math.atan2(-1.62,3),flying:false},inventory:bag.toJSON(),playerState:{health:20},edits:[],mobs:{nextId:1,records:[]},gamerules:{doMobSpawning:false,doDaylightCycle:false}};
 for(let x=-3;x<=4;x++)for(let z=-1;z<=5;z++){save.edits.push([x,79,z,blockId('stone')]);for(let y=80;y<=84;y++)save.edits.push([x,y,z,0]);}
 return save;
}
const unique=(s:SaveData)=>{s.edits=[...new Map(s.edits.map(e=>[e.slice(0,3).join(','),e])).values()];return s;};
function active(raw=seed(),original?:string){stored=original??serializeSave(raw);const g=construct(parseSave(stored))as unknown as EffectGame;g.world.getChunk(0,0);g.start();return g;}
const use=(g:EffectGame)=>g.interact(false,true,false,false,.26),retire=(g:EffectGame)=>(g as unknown as{retireWithoutSave():void}).retireWithoutSave();
function aim(g:EffectGame,x:number,y:number,z:number){const dx=x-g.body.position.x,dy=y-g.body.position.y-1.62,dz=z-g.body.position.z;g.body.yaw=Math.atan2(-dx,-dz);g.body.pitch=Math.atan2(dy,Math.hypot(dx,dz));}

import{createAgent,farmlandId,wheatId,type CodeProgram,type AgentCommand,type AgentDirection}from'@craft/engine';
function farmRaw(count=1,agentSeed=false):SaveData{const raw=seed();const inv=new Inventory();inv.slots[0]={id:agentSeed?blockId('stone'):stackId('wheat_seeds'),count:agentSeed?1:count};inv.slots[1]={id:blockId('stone'),count:1};raw.inventory=inv.toJSON();raw.agent=createAgent(agentSeed?0:3,80,agentSeed?0:4);raw.agent.slots[0]={id:blockId('stone'),count:1};raw.agent.slots[26]={id:stackId('wheat_seeds'),count};raw.agent.selected=26;raw.edits.push([0,79,0,farmlandId(0)]);return unique(raw);}
const cmd=(op:'move'|'place'|'till',dir:AgentDirection):CodeProgram['blocks'][number]=>({type:'command',cmd:{op,dir}as AgentCommand});
function run(g:EffectGame,commands:CodeProgram['blocks']){expect(g.runProgram({name:'Actual finite farming commands',trigger:{type:'run'},blocks:commands})).toBe(true);}

function transferRaw(){const raw=farmRaw(1,true);raw.agent!.slots[26]=null;raw.agent!.slots[4]={id:stackId('stone'),count:5};return raw;}
const transferCommand:CodeProgram['blocks']=[{type:'command',cmd:{op:'transfer',quantity:5,sourceSlot:4,destinationSlot:0}}];

function conditional(equals=0):CodeProgram['blocks'][number]{return{type:'if-item-count',slot:4,equals,then:[{type:'command',cmd:{op:'transfer',quantity:2,sourceSlot:0,destinationSlot:4}}],else:[{type:'command',cmd:{op:'transfer',quantity:1,sourceSlot:0,destinationSlot:4}}]};}
for(const expected of[0,5])it(`actual Game query after real transfer selects ${expected===0?'then':'else'} without ownlease`,()=>{const raw=transferRaw();raw.agent!.slots[0]=null;const g=active(raw);try{run(g,[...transferCommand,conditional(expected)]);expect(g.agent.slots[4]?.count).toBe(5);g.stepAgent(1);expect(g.agent.slots[4]).toBeNull();g.stepAgent(1);expect(g.agent.slots[4]?.count).toBe(expected===0?2:1);expect(g.agent.slots[0]?.count).toBe(expected===0?3:4);}finally{retire(g);}});
for(const which of['agent','world','mode','runner','dead','paused','recovery','stopped']as const)it(`actual captured Game count callback refuses late ${which} change`,()=>{const raw=transferRaw();raw.agent!.slots[0]=null;const g=active(raw);const state=g as unknown as {screenOpen():boolean;agent:typeof g.agent;world:typeof g.world;mode:typeof g.mode;runner:unknown;dead:boolean;paused:boolean;recoverySections:string[];stopped:boolean};const original={agent:g.agent,world:g.world,mode:g.mode};try{run(g,[conditional(5)]);vi.spyOn(state,'screenOpen').mockImplementation(()=>{if(which==='agent')state.agent=createAgent(0,80,0);if(which==='world')state.world=Object.create(original.world);if(which==='mode')state.mode='creative';if(which==='runner')state.runner=null;if(which==='dead')state.dead=true;if(which==='paused')state.paused=true;if(which==='recovery')state.recoverySections.push('code workspace');if(which==='stopped')state.stopped=true;return false;});g.stepAgent(1);expect(original.agent.slots[4]?.count).toBe(5);expect(original.agent.slots[0]).toBeNull();expect(g.programRunning).toBe(false);}finally{Object.assign(state,original,{dead:false,paused:false,stopped:false});state.recoverySections.length=0;vi.restoreAllMocks();retire(g);}});
it('actual Game pending count defers for genuine busyAgent then resumes without cancelling lease',()=>{const raw=transferRaw();raw.agent!.slots[0]={id:stackId('stone'),count:2};const g=active(raw);try{run(g,[conditional(5)]);const lease=reserveInventoryMutation(g.agent)!;g.stepAgent(1);expect(lease.valid()).toBe(true);expect(g.programRunning).toBe(true);expect(g.agent.slots[4]?.count).toBe(5);lease.cancel();g.stepAgent(1);expect(g.agent.slots[4]?.count).toBe(7);}finally{retire(g);}});
it('actual Game original27 readonly proof refuses impostor rather than selecting empty0 branch',()=>{const raw=transferRaw();raw.agent!.slots[0]=null;const g=active(raw);const state=g as unknown as{agent:typeof g.agent};const original=g.agent;state.agent=structuredClone(original);try{run(g,[conditional(0)]);g.stepAgent(1);expect(g.programRunning).toBe(false);expect(state.agent.slots).toEqual(original.slots);}finally{state.agent=original;retire(g);}});
it('actual replacement Run during readonly count keeps new session and executes only its own next command',()=>{const raw=transferRaw();raw.agent!.slots[0]=null;const g=active(raw);let replaced=false;const hud=g as unknown as{hud:{message(text:string):void}};try{run(g,[conditional(5)]);const messages=vi.spyOn(hud.hud,'message');vi.spyOn(g as unknown as{screenOpen():boolean},'screenOpen').mockImplementation(()=>{if(!replaced){replaced=true;expect(g.runProgram({name:'Replacement runner',trigger:{type:'run'},blocks:[{type:'command',cmd:{op:'turn',side:'right'}}]})).toBe(true);}return false;});const facing=g.agent.facing;g.stepAgent(1);expect(replaced).toBe(true);expect(g.agent.slots[4]?.count).toBe(5);expect(g.agent.slots[0]).toBeNull();expect(g.programRunning).toBe(true);expect(messages.mock.calls).toEqual([['Running "Replacement runner"']]);vi.restoreAllMocks();g.stepAgent(1);expect(g.agent.facing).toBe((facing+1)%4);expect(g.agent.slots[4]?.count).toBe(5);}finally{vi.restoreAllMocks();retire(g);}});
for(const fault of['throw','stale-command']as const)it(`reentrant replacement ${fault} from old next cannot clear, report over, or dispatch through the new runner`,()=>{const raw=transferRaw();raw.agent!.slots[0]=null;const g=active(raw);const state=g as unknown as{runner:import('@craft/engine').ProgramRunner;hud:{message(text:string):void}};try{run(g,transferCommand);const old=state.runner,messages=vi.spyOn(state.hud,'message'),facing=g.agent.facing;vi.spyOn(old,'next').mockImplementationOnce(()=>{expect(g.runProgram({name:'Replacement runner',trigger:{type:'run'},blocks:[{type:'command',cmd:{op:'turn',side:'right'}}]})).toBe(true);if(fault==='throw')throw Error('old next failed after replacement');return transferCommand[0].type==='command'?transferCommand[0].cmd:null;});g.stepAgent(1);expect(g.programRunning).toBe(true);expect(state.runner).not.toBe(old);expect(g.agent.slots[4]?.count).toBe(5);expect(g.agent.slots[0]).toBeNull();expect(messages.mock.calls).toEqual([['Running "Replacement runner"']]);g.stepAgent(1);expect(g.agent.facing).toBe((facing+1)%4);}finally{vi.restoreAllMocks();retire(g);}});
