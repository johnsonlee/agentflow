import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0,shown:[] as unknown[]}));
vi.mock("../../../apps/web/src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{setCameraAction(){}flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;show(...args:unknown[]){this.open=true;h.shown=args;}refresh(){}hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}clearTransferredPending(){}resumePending(){return false;}}}));
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


function caneSave():SaveData {
 const raw=saved();delete raw.dimensions;raw.name='Cane support Game integration';raw.generatorVersion=3;raw.playerState={health:20};raw.player.position={x:2.5,y:80,z:2.5};raw.edits=[];
 for(let x=6;x<=10;x++)for(let z=6;z<=10;z++)raw.edits.push([x,79,z,blockId('stone')]);
 raw.edits.push([8,79,8,blockId('sand')],[9,79,8,blockId('water')]);for(let y=80;y<=82;y++)raw.edits.push([8,y,8,204]);
 for(let i=0;i<36;i++)raw.inventory.slots[i]={id:blockId('stone'),count:64};return raw;
}
const caneCells=(g:Game)=>[80,81,82].map(y=>g.world.getLoadedBlock(8,y,8));
it('actual Game receiver refusal, source lease, full bag and cold receipt conserve all three Cane owners',()=>{
 const g=construct(caneSave());g.start();const bag=structuredClone(g.inventory.toJSON()),normal=g.worldDrops.planSpawnBatch.bind(g.worldDrops);let calls=0;
 const staged=vi.spyOn(g.worldDrops,'planSpawnBatch').mockImplementation((items,at,velocity)=>{calls++;expect(items).toEqual(Array(3).fill({id:850,count:1}));expect(g.save()).toBe(false);g.caneSupport.update(.1);return null;});
 g.world.setBlock(9,79,8,0);g.caneSupport.update(.1);expect(calls).toBe(1);expect(caneCells(g)).toEqual([204,204,204]);expect(g.worldDrops.records).toEqual([]);expect(g.inventory.toJSON()).toEqual(bag);
 staged.mockImplementation((items,at,velocity)=>{expect(g.save()).toBe(false);return normal(items,at,velocity);});g.caneSupport.update(.1);
 expect(caneCells(g)).toEqual([0,0,0]);expect(g.worldDrops.records.map(r=>r.stack)).toEqual(Array(3).fill({id:850,count:1}));expect(g.inventory.toJSON()).toEqual(bag);const receipt=g.worldDrops.toJSON();expect(g.save()).toBe(true);const raw=parseSave(stored!);expect(raw.worldDrops).toEqual(receipt);g.stop();
 const cold=construct(raw);cold.start();cold.caneSupport.update(.1);expect(caneCells(cold)).toEqual([0,0,0]);expect(cold.worldDrops.toJSON()).toEqual(receipt);expect(cold.inventory.toJSON()).toEqual(bag);cold.stop();
});
it('actual Game cleanup disposes pending Cane settlement and cold source reconstructs it',()=>{
 const g=construct(caneSave());g.start();g.world.setBlock(9,79,8,0);expect(g.save()).toBe(true);const raw=parseSave(stored!);g.stop();g.caneSupport.update(1);expect(caneCells(g)).toEqual([204,204,204]);expect(g.worldDrops.records).toEqual([]);
 const cold=construct(raw);cold.start();cold.caneSupport.update(.1);expect(caneCells(cold)).toEqual([0,0,0]);expect(cold.worldDrops.records.reduce((n,r)=>n+r.stack.count,0)).toBe(3);cold.stop();
});
