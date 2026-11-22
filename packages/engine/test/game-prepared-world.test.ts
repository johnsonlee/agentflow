import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0}));
vi.mock("../../../apps/web/src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}}}));
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
it('prepared Game attaches the exact private physical world without invalidating portal ownership identity',()=>{
 const raw=saved();delete raw.dimensions;const frame=addPortal(raw,'x',2,80,2),world=new World(raw.seed,raw.generatorVersion);world.importEdits(raw.edits);expect(world.portals.restore(raw.portals,raw.edits).invalid).toBe(false);const cell=world.captureCell(2,80,2)!;const game=construct(raw,world);expect(game.world===world).toBe(true);expect(world.cellUnchanged(cell)).toBe(true);expect(world.portals.exportState().records).toEqual([frame]);expect(game.discardPrepared()).toBe(true);
});
it('prepared attachment refuses a world already owned by another Game and mismatched realm or edits',()=>{
 const raw=saved();delete raw.dimensions;const world=new World(raw.seed,raw.generatorVersion);world.importEdits(raw.edits);const original=construct(raw,world);expect(()=>construct(raw,world)).toThrow();const wrong=new World(raw.seed,raw.generatorVersion);wrong.setBlock(5,80,5,blockId('stone'));expect(()=>construct(raw,wrong)).toThrow();expect(original.world===world).toBe(true);expect(original.discardPrepared()).toBe(true);expect(()=>construct(raw,world)).toThrow();
});

import {PortalContact} from '../src/simulation/portal-contact';
function sourceTrip(){
 const raw=saved();delete raw.dimensions;raw.player.position={x:2.5,y:80,z:2.5};addPortal(raw,'x',2,80,2);for(let x=0;x<=6;x++)for(let z=0;z<=4;z++)if(!raw.edits.some(e=>e[0]===x&&e[1]===79&&e[2]===z))raw.edits.push([x,79,z,blockId('stone')]);const source=construct(raw);const contact=new PortalContact();let ticket=null;for(let i=0;i<4;i++)ticket=contact.update(source.world,source.body.position,1);expect(ticket).not.toBeNull();return {source,ticket:ticket!};
}
it('actual travel stages target while source retains sole writer and hands off only a ready guarded frame',()=>{
 const {source,ticket}=sourceTrip(),bag=source.inventory.toJSON();const trip=source.preparePortalTravel(ticket,{} as TextureAtlas);expect(!!trip).toBe(true);expect(writer.activeWriter===source).toBe(true);expect(source.save()).toBe(false);expect(source.runChat('/give stone')).toContain('transferred');expect(source.inventory.toJSON()).toEqual(bag);expect(trip!.prepareFrame()).toBe(true);expect(trip!.commit()).toBe(true);expect(writer.activeWriter===trip!.target).toBe(true);expect(trip!.target.world.dimension).toBe('nether');expect(trip!.target.inventory.toJSON()).toEqual(bag);expect(trip!.target.save()).toBe(true);const saved=JSON.parse(stored!);expect(saved.dimensions.active).toBe('nether');expect(saved.dimensions.inactive.overworld.portals.records).toHaveLength(1);expect(saved.dimensions.links).toHaveLength(1);expect(trip!.commit()).toBe(false);
});
it('actual travel cancellation and source mutation refuse publication and preserve source writer',()=>{
 const {source,ticket}=sourceTrip(),trip=source.preparePortalTravel(ticket,{} as TextureAtlas)!;expect(trip).not.toBeNull();expect(trip.prepareFrame()).toBe(true);source.inventory.slots[2]={id:stackId('stone'),count:1};expect(trip.commit()).toBe(false);expect(writer.activeWriter===source).toBe(true);expect(source.paused).toBe(false);expect(source.save()).toBe(true);expect(source.inventory.slots[2]?.count).toBe(1);
});

it('actual round trip retains one global bag and both world partitions with one symmetric link',()=>{
 const {source,ticket}=sourceTrip(),bag=source.inventory.toJSON(),trip=source.preparePortalTravel(ticket,{} as TextureAtlas)!;expect(trip.prepareFrame()).toBe(true);expect(trip.commit()).toBe(true);const nether=trip.target;expect(nether.save()).toBe(true);const frame=nether.world.portals.exportState().records[0];Object.assign(nether.body.position,{x:frame.x+.5,y:frame.y,z:frame.z+.5});const contact=new PortalContact();let back=null;for(let i=0;i<4;i++)back=contact.update(nether.world,nether.body.position,1);expect(back).not.toBeNull();const returned=nether.preparePortalTravel(back!,{} as TextureAtlas);expect(!!returned).toBe(true);expect(returned!.prepareFrame()).toBe(true);expect(returned!.commit()).toBe(true);expect(returned!.target.world.dimension).toBe('overworld');expect(returned!.target.inventory.toJSON()).toEqual(bag);expect(returned!.target.save()).toBe(true);const raw=JSON.parse(stored!);expect(raw.dimensions.active).toBe('overworld');expect(raw.dimensions.inactive.nether.portals.records).toHaveLength(1);expect(raw.dimensions.links).toHaveLength(1);expect(raw.edits.some((e:number[])=>e[0]===0&&e[1]===79&&e[2]===0&&e[3]===blockId('stone'))).toBe(true);
});
