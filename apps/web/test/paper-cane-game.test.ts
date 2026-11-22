import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0,shown:[] as unknown[]}));
vi.mock("../../../apps/web/src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;show(...args:unknown[]){this.open=true;h.shown=args;}refresh(){}hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}clearTransferredPending(){}resumePending(){return false;}}}));
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

import {createAgent}from '@craft/engine';
it('actual Game uses3 only for new worlds, retains flat versionless1 and explicit legacy1/2',()=>{
 const fresh=new Game(new Element()as unknown as HTMLElement,{}as TextureAtlas,{name:'Fresh',seed:7,mode:'survival',touch:false},{onPause:vi.fn(),onDeath:vi.fn()});expect(fresh.world.generatorVersion).toBe(3);fresh.stop();
 for(const version of[undefined,1,2,3]){const raw=saved();delete raw.dimensions;if(version===undefined)delete raw.generatorVersion;else raw.generatorVersion=version as 1|2|3;const g=construct(raw);expect(g.world.generatorVersion).toBe(version??1);expect(g.save()).toBe(true);expect(parseSave(stored!).generatorVersion).toBe(version??1);g.stop();}
});
it('actual Game retains raw invalid canonical/physical owners and exact original backup before sanitizer repair',async()=>{
 for(const item of[{id:204,count:1},{id:850,count:1,damage:0},{id:851,count:65}]){const raw=saved();delete raw.dimensions;raw.inventory.slots[0]=item;stored=' \n'+JSON.stringify(raw)+'\n ';const original=stored,g=construct(parseSave(stored));expect(g.save()).toBe(false);expect(stored).toBe(original);expect(g.loadErrors.some(x=>x.includes('inventory.slots[0]'))).toBe(true);g.exportSaveBackup();expect(JSON.parse(await blobs.at(-1)!.text()).recoveryOriginalSave).toBe(original);g.stop();}
});
it('actual Game saves canonical Player/pending/Agent cargo with v3 static edits and archived v3 Overworld unchanged',()=>{
 const raw=saved();raw.generatorVersion=3;raw.edits=[[8,90,8,204]];raw.inventory.slots[1]={id:850,count:64};raw.inventoryPending=[{id:851,count:3}];raw.agent=createAgent(8,91,8);raw.agent.slots[26]={id:851,count:64};const g=construct(raw);expect(g.world.getBlock(8,90,8)).toBe(204);expect(g.save()).toBe(true);const cold=parseSave(stored!);expect(cold.generatorVersion).toBe(3);expect(cold.agent?.slots[26]).toEqual({id:851,count:64});expect(cold.inventory.slots[1]).toEqual({id:850,count:64});g.stop();
 const realm=saved();realm.dimensions={version:1,active:'nether',inactive:{overworld:captureDimensionWorld(raw)},links:[]};realm.generatorVersion=1;const n=construct(realm);expect(n.save()).toBe(true);expect(parseSave(stored!).dimensions!.inactive.overworld!.generatorVersion).toBe(3);expect(parseSave(stored!).dimensions!.inactive.overworld!.edits).toEqual(raw.edits);n.stop();
});

it('missing archived Overworld respawn retains historical generator2 fallback, separate from flat1',()=>{
 const raw=saved();raw.generatorVersion=1;raw.dimensions={version:1,active:'nether',inactive:{},links:[]};const g=construct(raw);g.start();(g as any).hurt(20,'void');expect(g.dead).toBe(true);const prep=g.prepareOverworldRespawn({}as TextureAtlas);expect(prep).not.toBeNull();expect(prep!.target.world.generatorVersion).toBe(2);prep!.cancel();g.stop();
});
