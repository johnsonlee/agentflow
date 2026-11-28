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

import {createAgent,World,type CodeProgram} from '@craft/engine';
const lower=(open=false)=>blockId(`door_wooden_lower_0_${open?1:0}`),upper=(open=false)=>blockId(`door_wooden_upper_0_${open?1:0}`);
function doorRaw():SaveData{const raw=seed();raw.name='Agent door';raw.agent=createAgent(0,80,0,0);raw.agent.slots[0]={id:stackId('stone'),count:64};raw.agent.slots[26]={id:stackId('written_book'),count:1,book:{title:'Kept',pages:['Do not replay']}};raw.agent.selected=26;raw.edits.push([0,80,1,lower()],[0,81,1,upper()]);raw.programs=[{name:'Door',trigger:{type:'chat',command:'door'},blocks:[{type:'command',cmd:{op:'interact',dir:'forward'}}]}];return unique(raw);}
const owners=(g:EffectGame)=>structuredClone({agent:g.agent,bag:g.inventory.toJSON(),drops:g.worldDrops.toJSON(),status:g.playerStatus,chests:[...g.chests].map(([key,chest])=>[key,chest.contents()]),furnaceKeys:[...g.furnaces.keys()],brewingKeys:[...g.brewingStands.keys()]});
it('actual named-chat dispatch opens coherent pair with owners intact, saves and cold-loads inertly',()=>{const g=active(doorRaw()),before=owners(g);let calls=0;const off=g.world.onBlockChanged((x,y,z)=>{if(x===0&&z===1&&(y===80||y===81)){calls++;expect(g.world.getLoadedBlock(0,80,1)).toBe(lower(true));expect(g.world.getLoadedBlock(0,81,1)).toBe(upper(true));expect(owners(g)).toEqual(before);expect(g.save()).toBe(true);}});try{expect(g.runChat('/code door')).toContain('Running');expect(g.world.getLoadedBlock(0,80,1)).toBe(lower());g.stepAgent(1);expect(calls).toBe(2);expect(owners(g)).toEqual(before);expect(g.save()).toBe(true);const cold=parseSave(stored!);retire(g);const next=active(cold);try{expect(next.world.getLoadedBlock(0,80,1)).toBe(lower(true));expect(next.world.getLoadedBlock(0,81,1)).toBe(upper(true));expect(next.programRunning).toBe(false);next.stepAgent(1);expect(next.world.getLoadedBlock(0,80,1)).toBe(lower(true));expect(owners(next)).toEqual(before);expect(next.loadErrors).toEqual([]);}finally{retire(next);}}finally{off();retire(g);}});
it('actual inventory lease pauses the unconsumed step; release permits the original action once',()=>{const g=active(doorRaw());try{expect(g.runProgram(g.programs[0])).toBe(true);const lease=reserveInventoryMutation(g.inventory)!;expect(lease).not.toBeNull();g.stepAgent(1);expect(g.world.getLoadedBlock(0,80,1)).toBe(lower());lease.cancel();g.stepAgent(1);expect(g.world.getLoadedBlock(0,80,1)).toBe(lower(true));g.stepAgent(1);expect(g.programRunning).toBe(false);}finally{retire(g);}});
// EffectGame exposes private dispatch only at this CPU fixture boundary; active() still
// constructs a real Game. Restoring its private active-writer test seam uses that real
// constructor identity through unknown, not a fabricated public-only Game implementation.
for(const fault of ['Stop','prepared','writer','mode','Agent','world','paused','dead','photoBusy','photoRecovery','notRunning']as const)it(`actual Game ${fault} change during loaded plan refuses old dispatch`,()=>{const g=active(doorRaw()),originalAgent=g.agent,originalWorld=g.world,originalMode=g.mode,capture=g.world.captureCell.bind(g.world);let hit=false;vi.spyOn(g.world,'captureCell').mockImplementation((x,y,z)=>{const cell=capture(x,y,z);if(!hit&&x===0&&y===80&&z===1){hit=true;if(fault==='Stop')g.stopProgram();if(fault==='prepared')(g as unknown as{prepared:boolean}).prepared=true;if(fault==='writer')writer.activeWriter=null;if(fault==='mode')g.mode='creative';if(fault==='Agent')g.agent=createAgent(5,80,5);if(fault==='world')(g as unknown as {world:World}).world=new World(7);if(fault==='paused')g.paused=true;if(fault==='dead')g.dead=true;if(fault==='photoBusy')(g as unknown as{heldPhotoBusy:boolean}).heldPhotoBusy=true;if(fault==='photoRecovery')(g as unknown as{heldPhotoRecovery:boolean}).heldPhotoRecovery=true;if(fault==='notRunning')(g as unknown as{running:boolean}).running=false;}return cell;});try{expect(g.runProgram(g.programs[0])).toBe(true);g.stepAgent(1);expect(hit).toBe(true);expect(originalWorld.getLoadedBlock(0,80,1)).toBe(lower());expect(originalWorld.getLoadedBlock(0,81,1)).toBe(upper());}finally{g.agent=originalAgent;(g as unknown as {world:World}).world=originalWorld;g.mode=originalMode;g.paused=false;g.dead=false;(g as unknown as{heldPhotoBusy:boolean;heldPhotoRecovery:boolean;running:boolean}).heldPhotoBusy=false;(g as unknown as{heldPhotoRecovery:boolean}).heldPhotoRecovery=false;(g as unknown as{running:boolean}).running=true;(g as unknown as{prepared:boolean}).prepared=false;writer.activeWriter=g as unknown as Game;retire(g);}});
it('actual Stop before dispatch stays inert; replacement Run while Agent action owns its lease refuses without stealing continuation',()=>{const g=active(doorRaw());try{expect(g.runProgram(g.programs[0])).toBe(true);g.stopProgram();g.stepAgent(1);expect(g.world.getLoadedBlock(0,80,1)).toBe(lower());expect(g.runProgram(g.programs[0])).toBe(true);const originalRunner=(g as unknown as{runner:unknown}).runner,original=g.world.captureCell.bind(g.world);let once=false,replacement:boolean|undefined;vi.spyOn(g.world,'captureCell').mockImplementation((x,y,z)=>{const cell=original(x,y,z);if(!once){once=true;replacement=g.runProgram({name:'New owner',trigger:{type:'run'},blocks:[{type:'command',cmd:{op:'turn',side:'left'}}]});}return cell;});g.stepAgent(1);expect(replacement).toBe(false);expect((g as unknown as{runner:unknown}).runner).toBe(originalRunner);expect(g.world.getLoadedBlock(0,80,1)).toBe(lower(true));expect(g.agent.facing).toBe(0);g.stepAgent(1);expect(g.programRunning).toBe(false);expect(g.agent.facing).toBe(0);}finally{retire(g);}});
it('refused malformed Agent pose is not reread for animation',()=>{const g=active(doorRaw());let reads=0;try{expect(g.runProgram(g.programs[0])).toBe(true);Object.defineProperty(g.agent,'x',{get(){reads++;return 0;},enumerable:true,configurable:true});g.stepAgent(1);expect(reads).toBe(0);expect(g.world.getLoadedBlock(0,80,1)).toBe(lower());}finally{Object.defineProperty(g.agent,'x',{value:0,writable:true,enumerable:true,configurable:true});retire(g);}});
