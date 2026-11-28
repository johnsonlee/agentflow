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

import{createAgent,type CodeProgram,type CodeBlock}from'@craft/engine';
function rawTeleport():SaveData{const raw=seed();raw.agent=createAgent(3,80,4);raw.agent.selected=26;raw.agent.slots[8]={id:stackId('diamond_pickaxe'),count:1,damage:37};raw.agent.slots[4]={id:stackId('stone'),count:5};raw.agent.slots[26]={id:stackId('written_book'),count:1,book:{title:'Keep',author:'A',pages:['Exact cargo']}};return raw;}
const teleport:CodeBlock={type:'command',cmd:{op:'teleport-to-player'}};
const runTeleport=(g:EffectGame,blocks:CodeBlock[]=[teleport])=>expect(g.runProgram({name:'Come',trigger:{type:'run'},blocks})).toBe(true);
it('actual Game dispatch teleports same Agent then executes next turn with exact cargo and cold save',()=>{const g=active(rawTeleport());try{const a=g.agent,slots=a.slots,before=structuredClone(a);runTeleport(g,[teleport,{type:'command',cmd:{op:'turn',side:'right'}}]);expect(a).toEqual(before);g.stepAgent(1);expect(g.agent).toBe(a);expect(a.slots).toBe(slots);expect(a.slots).toEqual(before.slots);expect(a.selected).toBe(26);expect({x:a.x,y:a.y,z:a.z}).toEqual({x:-1,y:80,z:3});const facing=a.facing;g.stepAgent(1);expect(a.facing).toBe((facing+1)%4);g.save();expect(parseSave(stored!).agent).toEqual(a);}finally{retire(g);}});
it('actual Game all-blocked safe search refuses without cargo/pose change and next command remains runnable',()=>{const g=active(rawTeleport());try{runTeleport(g,[teleport,{type:'command',cmd:{op:'turn',side:'left'}}]);const before=structuredClone(g.agent);vi.spyOn(g.world,'getBlock').mockReturnValue(blockId('stone'));g.stepAgent(1);expect(g.agent).toEqual(before);expect(g.programRunning).toBe(true);vi.restoreAllMocks();g.stepAgent(1);expect(g.agent.facing).toBe((before.facing+3)%4);}finally{vi.restoreAllMocks();retire(g);}});
for(const fault of['agent','world','mode','writer','player','recovery']as const)it(`actual search-time ${fault} change refuses before first original pose write`,()=>{const g=active(rawTeleport()),original={agent:g.agent,world:g.world,mode:g.mode,player:{...g.body.position}},state=g as unknown as{agent:typeof g.agent;world:typeof g.world;mode:typeof g.mode;recoverySections:string[]};try{runTeleport(g);const get=g.world.getBlock.bind(g.world);let once=false;vi.spyOn(g.world,'getBlock').mockImplementation((x,y,z)=>{if(!once){once=true;if(fault==='agent')state.agent=createAgent(6,80,4);if(fault==='world')state.world=Object.create(original.world);if(fault==='mode')state.mode='creative';if(fault==='writer')writer.activeWriter=null;if(fault==='player')g.body.position.x=2.5;if(fault==='recovery')state.recoverySections.push('code workspace');}return get(x,y,z);});const before=structuredClone(original.agent);g.stepAgent(1);expect(original.agent).toEqual(before);if(fault==='agent')expect(state.agent.x).toBe(6);}finally{vi.restoreAllMocks();Object.assign(state,{agent:original.agent,world:original.world,mode:original.mode});state.recoverySections.length=0;writer.activeWriter=g as unknown as Game;retire(g);}});
for(const action of['Run','Stop']as const)it(`reentrant ${action} during actual safe search owns its session without old teleport`,()=>{const g=active(rawTeleport());try{runTeleport(g);const before=structuredClone(g.agent),get=g.world.getBlock.bind(g.world);let once=false;vi.spyOn(g.world,'getBlock').mockImplementation((x,y,z)=>{if(!once){once=true;if(action==='Run')expect(g.runProgram({name:'New owner',trigger:{type:'run'},blocks:[{type:'command',cmd:{op:'turn',side:'right'}}]})).toBe(true);else g.stopProgram();}return get(x,y,z);});g.stepAgent(1);expect(once).toBe(true);expect(g.agent).toEqual(before);expect(g.programRunning).toBe(action==='Run');vi.restoreAllMocks();if(action==='Run'){g.stepAgent(1);expect(g.agent.facing).toBe((before.facing+1)%4);}}finally{vi.restoreAllMocks();retire(g);}});
it('genuine pending Agent lease defers then resumes without cancelling ownership',()=>{const g=active(rawTeleport());try{runTeleport(g);const before=structuredClone(g.agent),lease=reserveInventoryMutation(g.agent)!;g.stepAgent(1);expect(lease.valid()).toBe(true);expect(g.agent).toEqual(before);lease.cancel();g.stepAgent(1);expect(g.agent.x).toBe(-1);expect(g.agent.slots).toEqual(before.slots);}finally{retire(g);}});
it('existing chat helper reuses safe search and preserves exact cargo',()=>{const g=active(rawTeleport());try{const a=g.agent,before=structuredClone(a);expect(g.teleportAgent()).toBe(true);expect(g.agent).toBe(a);expect(a.x).toBe(-1);expect(a.slots).toEqual(before.slots);expect(a.selected).toBe(before.selected);}finally{retire(g);}});
it('actual Game late readonly facing refuses before any pose field write',()=>{const g=active(rawTeleport());try{runTeleport(g);const before=structuredClone(g.agent),get=g.world.getBlock.bind(g.world);let once=false;vi.spyOn(g.world,'getBlock').mockImplementation((x,y,z)=>{if(!once){once=true;Object.defineProperty(g.agent,'facing',{writable:false});}return get(x,y,z);});g.stepAgent(1);expect(once).toBe(true);expect(g.agent).toEqual(before);}finally{vi.restoreAllMocks();retire(g);}});
