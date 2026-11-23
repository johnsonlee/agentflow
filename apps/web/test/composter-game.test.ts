// Actual Game Composter regressions. DOM/render/input are fixtures; physical, inventory, recovery and save owners are real.
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0,shown:[] as unknown[]}));
vi.mock("../src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;show(...args:unknown[]){this.open=true;h.shown=args;}refresh(){}hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}}}));
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
type EffectGame=Pick<Game,keyof Game>&{interact(breaking:boolean,place:boolean,using:boolean,pick:boolean,dt:number):void;};


import {reserveInventoryMutation} from '../../../packages/engine/src/ownership/inventory-lease';
function seed(count=2,mode:'survival'|'creative'='survival'):SaveData{
 const bag=new Inventory();bag.slots[0]={id:211,count};bag.slots[1]={id:214,count:3};
 const save:SaveData={version:1,name:'Slab actual Game fixture',seed:7,generatorVersion:3,mode,timeOfDay:.25,player:{position:{x:.5,y:80,z:3.5},yaw:0,pitch:Math.atan2(-1.62,3),flying:false},inventory:bag.toJSON(),playerState:{health:20},edits:[],mobs:{nextId:1,records:[]},gamerules:{doMobSpawning:false,doDaylightCycle:false}};
 for(let x=-3;x<=4;x++)for(let z=-1;z<=5;z++){save.edits.push([x,79,z,blockId('stone')]);for(let y=80;y<=84;y++)save.edits.push([x,y,z,0]);}
 return save;
}
const unique=(s:SaveData)=>{s.edits=[...new Map(s.edits.map(e=>[e.slice(0,3).join(','),e])).values()];return s;};
function active(raw=seed(),original?:string){stored=original??serializeSave(raw);const g=construct(parseSave(stored))as unknown as EffectGame;g.world.getChunk(0,0);g.start();return g;}
const use=(g:EffectGame)=>g.interact(false,true,false,false,.16),retire=(g:EffectGame)=>(g as unknown as{retireWithoutSave():void}).retireWithoutSave();
function aim(g:EffectGame,x:number,y:number,z:number){const dx=x-g.body.position.x,dy=y-g.body.position.y-1.62,dz=z-g.body.position.z;g.body.yaw=Math.atan2(-dx,-dz);g.body.pitch=Math.atan2(dy,Math.hypot(dx,dz));}
function compRaw(level=0){const s=seed();s.inventory.slots[0]={id:stackId('wheat'),count:2};s.edits.push([0,80,0,217+level]);s.composters={version:1,records:[{x:0,y:80,z:0,level,attempts:11,remaining:level===7?.5:0}]};return unique(s);}
it('actual Game use publishes station/source coherently and observer save refuses busy without rewriting disk',()=>{const g=active(compRaw());g.agent.x=7;g.agent.z=7;aim(g,.5,80.8,.5);const disk=stored,before=g.inventory.slots[0]!.count;let calls=0;const off=g.world.onBlockChanged((x,y,z,id)=>{if(x!==0||y!==80||z!==0||id<217||id>225)return;calls++;expect(g.inventory.slots[0]!.count).toBe(before-1);expect(g.save()).toBe(false);expect(stored).toBe(disk);});try{use(g);expect(g.inventory.slots[0]!.count).toBe(1);expect(g.world.composters.get(0,80,0)!.attempts).toBe(12);expect(g.save()).toBe(true);expect(parseSave(stored!).composters).toEqual(g.world.composters.toJSON());}finally{off();retire(g);}});
it('actual Game optional actors refuse Agent intersecting new Composter placement',()=>{const raw=seed();raw.inventory.slots[0]={id:217,count:1};raw.agent={x:0,y:80,z:0,facing:0,selected:0,slots:Array(27).fill(null)};const g=active(raw);try{use(g);expect(g.world.getLoadedBlock(0,80,0)).toBe(0);expect(g.inventory.slots[0]).toEqual({id:217,count:1});}finally{retire(g);}});
it('single raw malformed empty Composter preserves exact backup and blocks sibling actions/save',async()=>{const raw=compRaw();raw.composters!.records[0].attempts=-1;const original=JSON.stringify(raw,null,2)+'\n',g=active(raw,original);try{expect(g.loadErrors.some(x=>x.includes('composters.records[0]'))).toBe(true);const before=g.inventory.toJSON();use(g);expect(g.inventory.toJSON()).toEqual(before);expect(g.save()).toBe(false);expect(stored).toBe(original);g.exportSaveBackup();expect(blobs).toHaveLength(1);expect(JSON.parse(await blobs[0].text()).recoveryOriginalSave).toBe(original);}finally{retire(g);}});
it('combined malformed Composter and Chest still exports exact original instead of failing fallback',async()=>{const raw=compRaw();raw.composters!.records[0].attempts=-1;raw.edits.push([2,80,2,203]);raw.chests=[{x:2,y:80,z:2,state:{slots:[{id:3,count:65},...Array(26).fill(null)]}}];const original=JSON.stringify(raw,null,2)+'\n',g=active(raw,original);try{expect(g.loadErrors.some(x=>x.includes('composters'))).toBe(true);expect(g.loadErrors.some(x=>x.toLowerCase().includes('chest'))).toBe(true);expect(()=>g.exportSaveBackup()).not.toThrow();expect(blobs).toHaveLength(1);expect(JSON.parse(await blobs[0].text()).recoveryOriginalSave).toBe(original);expect(stored).toBe(original);}finally{retire(g);}});
it('combined nonempty malformed Composter and Chest exports original even when live normalized snapshot cannot be captured',async()=>{const raw=compRaw(8);raw.composters!.records[0].attempts=-1;raw.edits.push([2,80,2,203]);raw.chests=[{x:2,y:80,z:2,state:{slots:[{id:3,count:65},...Array(26).fill(null)]}}];const original=JSON.stringify(raw,null,2)+'\n',g=active(raw,original);try{expect(g.world.composters.loadIssues.length).toBeGreaterThan(0);expect(g.loadErrors.some(x=>x.toLowerCase().includes('chest'))).toBe(true);expect(()=>g.exportSaveBackup()).not.toThrow();expect(blobs).toHaveLength(1);expect(JSON.parse(await blobs[0].text()).recoveryOriginalSave).toBe(original);expect(stored).toBe(original);}finally{retire(g);}});
it('ready station empty-main-hand collection retains unrelated inactive offhand instead of lighting it',()=>{const raw=compRaw(8);raw.inventory.slots[0]=null;raw.inventory.offhand={id:824,count:1,sparkler:{state:'inactive'}};const g=active(raw);g.agent.x=7;g.agent.z=7;(g as any).sparklerView.update=()=>{};try{aim(g,.5,80.8,.5);use(g);expect(g.world.composters.get(0,80,0)!.level).toBe(0);expect(g.worldDrops.toJSON().records.map(r=>r.stack)).toEqual([{id:859,count:1}]);expect(g.inventory.offhand).toEqual(raw.inventory.offhand);}finally{retire(g);}});
import{composterRoll}from'../../../packages/engine/src/ownership/composter-use';
it('actual raised-fill observer sees exact debit and save busy refusal; later quota failure keeps coherent RAM retry',()=>{const raw=compRaw();const attempt=Array.from({length:30},(_,i)=>i).find(i=>composterRoll({seed:7,dimension:'overworld'},0,80,0,i)<.65)!;raw.composters!.records[0].attempts=attempt;const g=active(raw);g.agent.x=7;g.agent.z=7;aim(g,.5,80.8,.5);const disk=stored;let calls=0;const off=g.world.onBlockChanged((x,y,z,id)=>{if(x===0&&y===80&&z===0&&id===218){calls++;expect(g.inventory.slots[0]).toEqual({id:stackId('wheat'),count:1});expect(g.world.composters.get(x,y,z)).toMatchObject({level:1,attempts:attempt+1});expect(g.save()).toBe(false);expect(stored).toBe(disk);}});try{use(g);expect(calls).toBe(1);const bag=g.inventory.toJSON(),state=g.world.composters.toJSON();vi.stubGlobal('localStorage',{getItem:()=>stored,setItem:()=>{throw Error('quota');}});expect(g.save()).toBe(false);expect(stored).toBe(disk);expect(g.inventory.toJSON()).toEqual(bag);expect(g.world.composters.toJSON()).toEqual(state);vi.stubGlobal('localStorage',{getItem:()=>stored,setItem:(_k:string,v:string)=>stored=v});expect(g.save()).toBe(true);const cold=parseSave(stored!);expect(cold.composters).toEqual(state);expect(cold.inventory).toEqual(bag);}finally{off();retire(g);}});
