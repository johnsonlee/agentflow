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
function construct(save:SaveData){return new Game(new Element() as unknown as HTMLElement,{} as TextureAtlas,{name:save.name,seed:save.seed,mode:save.mode,touch:false,save},{onPause:vi.fn(),onDeath:vi.fn()});}
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
it('actual Game persists world-owned orphan-origin projectiles without a living Blaze and restores the allocation cursor',()=>{
 const raw=projectileSave(),g=active(raw);expect(g.save()).toBe(true);const savedRaw=JSON.parse(stored!);expect(savedRaw.blazeFireballs).toEqual(raw.blazeFireballs);expect(savedRaw.mobs.nextId).toBe(2);
});
it('actual Game drains one swept Blaze impact into player damage once and keeps pause/Creative policies',()=>{
 const g=active(projectileSave());const before=g.mobs.exportFireballs();g.paused=true;g.updateBlazeProjectiles(.5);expect(g.mobs.exportFireballs()).toEqual(before);g.paused=false;g.updateBlazeProjectiles(.5);expect(g.health).toBe(4);expect(g.mobs.exportFireballs().records).toEqual([]);g.updateBlazeProjectiles(.5);expect(g.health).toBe(4);expect(g.save()).toBe(true);expect(JSON.parse(stored!).blazeFireballs.nextKey).toBe(2);
 const raw=projectileSave();raw.mode='creative';const creative=active(raw);creative.updateBlazeProjectiles(.5);expect(creative.health).toBe(7);expect(creative.mobs.exportFireballs().records[0].ageSeconds).toBeCloseTo(.75);
});
it('actual Blaze damage uses the equipped armor and durability before the current hit completes',()=>{
 const raw=projectileSave();raw.inventory.equipment={head:{id:stackId('diamond_helmet'),count:1},chest:{id:stackId('diamond_chestplate'),count:1},legs:{id:stackId('diamond_leggings'),count:1},feet:{id:stackId('diamond_boots'),count:1}};const g=active(raw);g.updateBlazeProjectiles(.5);expect(g.health).toBeCloseTo(6.4);for(const piece of Object.values(g.inventory.equipment))expect(piece?.damage).toBe(1);
});
it('known malformed flat Blaze state freezes Game actions and exact original export before any actor is repaired away',async()=>{
 const {createMob}=await import('../src/simulation/entities'),{mobSnapshot}=await import('../src/persistence/mob-save');const raw=projectileSave();delete raw.blazeFireballs;const actor=mobSnapshot(createMob(1,'blaze',{x:8,y:80,z:8}));delete actor.blazeState;raw.mobs!.records=[actor];const original=' \n'+JSON.stringify(raw)+'\n ';stored=original;const g=construct(parseSave(original));const before=g.inventory.toJSON();expect(g.save()).toBe(false);expect(g.runChat('/give stone')).toContain('Export a backup');g.setMode('creative');expect(g.mode).toBe('survival');expect(g.inventory.toJSON()).toEqual(before);expect(g.loadErrors.some(e=>e.includes('mobs')&&e.includes('Blaze'))).toBe(true);g.exportSaveBackup();expect(JSON.parse(await blobs[0].text()).recoveryOriginalSave).toBe(original);expect(stored).toBe(original);
});

it('actual swept snowball damages only Blaze and consumes one projectile once',()=>{
 const raw=projectileSave();delete raw.blazeFireballs;const g=active(raw);const blaze=g.mobs.spawn('blaze',{x:2.5,y:80,z:.5});
 expect(g.snowballProjectiles.spawn({x:.5,y:80.9,z:.5},{x:1,y:0,z:0})).not.toBeNull();g.updateSnowballs(.1);expect(blaze.health).toBe(17);expect(g.snowballProjectiles.records).toHaveLength(0);g.updateSnowballs(.1);expect(blaze.health).toBe(17);
 const pig=g.mobs.spawn('pig',{x:-1.5,y:80,z:.5}),health=pig.health;g.snowballProjectiles.spawn({x:.5,y:80.9,z:.5},{x:-1,y:0,z:0});g.updateSnowballs(.1);expect(pig.health).toBe(health);expect(g.snowballProjectiles.records).toHaveLength(0);
});
it('fatal swept Blaze fireball drains before death and leaves a serializable receipt once',()=>{
 const raw=projectileSave();raw.playerState={health:3};const g=active(raw);g.updateBlazeProjectiles(.5);expect(g.health).toBe(0);expect(g.mobs.exportFireballs()).toEqual({version:1,nextKey:2,records:[]});expect(g.save()).toBe(true);const before=JSON.stringify(g.worldDrops.records);g.updateBlazeProjectiles(.5);expect(JSON.stringify(g.worldDrops.records)).toBe(before);
});

it('fatal snowball credits the player and publishes one real rod receipt without replay',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.99);const raw=projectileSave();delete raw.blazeFireballs;const g=active(raw),blaze=g.mobs.spawn('blaze',{x:2.5,y:80,z:.5});blaze.health=3;
 g.snowballProjectiles.spawn({x:.5,y:80.9,z:.5},{x:1,y:0,z:0});g.updateSnowballs(.1);expect(g.mobs.mobs).not.toContain(blaze);expect(g.worldDrops.records.map(r=>r.stack)).toEqual([{id:stackId('blaze_rod'),count:1}]);g.updateSnowballs(.1);expect(g.worldDrops.records).toHaveLength(1);expect(g.save()).toBe(true);expect(JSON.parse(stored!).worldDrops.records[0].stack).toEqual({id:stackId('blaze_rod'),count:1});
});
