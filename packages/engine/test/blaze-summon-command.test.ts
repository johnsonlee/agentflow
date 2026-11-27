import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0}));
vi.mock("../../../apps/web/src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{setCameraAction(){}flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}}}));
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
class Element extends EventTarget{getContext(){return {fillStyle:"",fillRect(){},measureText:(text:string)=>({width:text.length*8}),fillText(){}};}className="";hidden=false;style={};parent:Element|null=null;children:Element[]=[];appendChild(e:Element){this.children.push(e);e.parent=this;return e;}remove(){h.rootRemoved++;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}}
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
import {COMMAND_HELP,parseCommand} from '../src/automation/commands';
import {MOB_SPECS,type MobKind} from '../src/simulation/entities';
it.each(Object.keys(MOB_SPECS) as MobKind[])('every registered mob %s parses from plain/case-insensitive namespaced command and appears in matching help and error usage',kind=>{
 expect(parseCommand(`/summon ${kind}`)).toEqual({type:'summon',kind});expect(parseCommand(`/SuMmOn MINECRAFT:${kind.toUpperCase()} Friendly Name`)).toEqual({type:'summon',kind,name:'Friendly Name'});
 const help=COMMAND_HELP.find(line=>line.startsWith('/summon '))!,usage=parseCommand('/summon unsupported');expect(usage.type).toBe('error');expect(help.split(/[<>]/)[1].split('|')).toContain(kind);if(usage.type==='error')expect(usage.message).toBe(`Usage: ${help}`);
});
it.each(['','constructor','__proto__','toString','minecraft:unknown'])('rejects unregistered/prototype summon identity %s without allocating a kind',kind=>{expect(parseCommand(`/summon ${kind}`)).toEqual({type:'error',message:`Usage: ${COMMAND_HELP.find(line=>line.startsWith('/summon '))}`});});
it('preserves command aliases, non-summon forms, NPC names and bounded optional summon names',()=>{
 expect(parseCommand('/gm s')).toEqual({type:'gamemode',mode:'survival'});expect(parseCommand('/teleport ~1 80 ~-2')).toEqual({type:'tp',x:1,y:80,z:-2,relative:[true,false,true]});expect(parseCommand('/gamerule keepinventory true')).toEqual({type:'gamerule',rule:'keepInventory',value:true});expect(parseCommand('/agent summon')).toEqual({type:'agent',action:'tp'});expect(parseCommand('/summon npc Teacher Lee')).toEqual({type:'summon',kind:'npc',name:'Teacher Lee'});expect(parseCommand('/summon blaze '+'a'.repeat(80))).toEqual({type:'summon',kind:'blaze',name:'a'.repeat(64)});
});
it('actual Game.runChat summons initialized Blaze and each old catalog kind, publishes one allocation per command and cold saves Blaze state',()=>{
 const raw=saved();delete raw.dimensions;raw.gamerules={doMobSpawning:false,doDaylightCycle:false};stored=JSON.stringify(raw);const g=construct(parseSave(stored));
 for(let x=-4;x<=4;x++)for(let z=-7;z<=2;z++){g.world.setBlock(x,79,z,blockId("stone"));for(let y=80;y<=84;y++)g.world.setBlock(x,y,z,0);}
 for(const kind of Object.keys(MOB_SPECS) as MobKind[]){expect(g.save()).toBe(true);const before=g.mobs.mobs.length,next=JSON.parse(stored!).mobs.nextId;expect(g.runChat(`/summon ${kind}`)).toContain('Summoned new');expect(g.mobs.mobs.length).toBe(before+1);const actor=g.mobs.mobs.at(-1)!;expect(actor.kind).toBe(kind);expect(actor.id).toBe(next);if(kind==='blaze')expect(actor.blazeState).toBeDefined();}
 expect(g.save()).toBe(true);const savedRaw=JSON.parse(stored!),blaze=savedRaw.mobs.records.find((r:{kind:string})=>r.kind==='blaze');expect(blaze.blazeState).toBeDefined();const cold=construct(parseSave(stored!));expect(cold.mobs.mobs.find(m=>m.kind==='blaze')!.blazeState).toEqual(blaze.blazeState);expect(cold.runChat('/help')).toContain('blaze');
});
