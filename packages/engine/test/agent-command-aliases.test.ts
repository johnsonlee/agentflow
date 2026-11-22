import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0}));
vi.mock("../../../apps/web/src/rendering/renderer",async()=>{const {Scene}=await import("three");return {WorldRenderer:class{scene=new Scene();camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}};});
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;hide(){this.open=false;}},Hud:class{flashDamage(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;hide(){this.open=false;}restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}}}));
vi.mock("../../../apps/web/src/ui/screens",()=>({Portfolio:class{dropped=0;photos=[];},ChatInput:class{open=false;hide(){this.open=false;}},PortfolioScreen:class{hide(){}},NpcDialog:class{hide(){}},ChalkboardDialog:class{hide(){}},BookScreen:class{hide(){}}}));
vi.mock("../../../apps/web/src/ui/codeBuilder",()=>({CodeBuilderScreen:class{hide(){}}}));
vi.mock("../../../apps/web/src/ui/chalkboards",()=>({ChalkboardViews:class{dispose(){h.disposed.push("chalk");}}}));
vi.mock("../../../apps/web/src/rendering/agentView",()=>({AgentView:class{snap(){}dispose(){h.disposed.push("agent");}}}));
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

import { COMMAND_HELP, parseCommand } from '../src/automation/commands';
import { MOB_SPECS } from '../src/simulation/entities';
import { createAgent } from '../src/automation/agent';
import { reserveInventoryMutation } from '../src/ownership/inventory-lease';
import type { CodeProgram } from '../src/automation/codebuilder';
const aliases=['/summon agent','/tp @c @s','/teleport @c @s'];
it.each(['/summon agent','/SUMMON AGENT','/SuMmOn MINECRAFT:AGENT','/tp @c @s','/TP @c @s','/teleport @c @s'])('parses only documented own-Agent teleport alias %s',text=>{
 expect(parseCommand(text)).toEqual({type:'agent',action:'tp'});
});
it.each(['/summon agent extra','/summon agent 0 80 0','/summon minecraft:agent Named','/summon Agent @s','/summon agent constructor','/summon agent __proto__','/summon agents','/summon constructor','/summon __proto__','/tp @C @s','/tp @c @S','/tp @v @s','/tp @e @s','/tp @c @p','/tp @s @c','/tp @c','/tp @c @s extra','/tp @c @s 0','/teleport @c @s extra'])('rejects unsupported Agent grammar %s',text=>{
 expect(parseCommand(text).type).toBe('error');
});
it('keeps all nine MobKinds, their exact help and old local extensions separate from the owned Agent',()=>{
 expect(Object.keys(MOB_SPECS)).toEqual(['pig','sheep','chicken','npc','zombie','spider','squid','cow','blaze']);
 expect(COMMAND_HELP.find(s=>s.startsWith('/summon '))).toBe('/summon <pig|sheep|chicken|npc|zombie|spider|squid|cow|blaze> [name]');
 expect(COMMAND_HELP).toContain('/summon agent  (bring your Agent to you)');expect(COMMAND_HELP).toContain('/tp @c @s  (bring your Agent to you)');
 for(const kind of Object.keys(MOB_SPECS))expect(parseCommand(`/summon ${kind} Named`)).toEqual({type:'summon',kind,name:'Named'});
 expect(parseCommand('/agent summon')).toEqual({type:'agent',action:'tp'});expect(parseCommand('/code build')).toEqual({type:'code',command:'build'});
 expect(parseCommand('/tp ~1 80 ~-2')).toEqual({type:'tp',x:1,y:80,z:-2,relative:[true,false,true]});
});
const program:CodeProgram={name:'Owned build',trigger:{type:'chat',command:'build'},blocks:[{type:'repeat',times:3,body:[{type:'command',cmd:{op:'turn',side:'left'}}]}]};
function active(){
 const raw=saved();delete raw.dimensions;raw.playerState={health:20};raw.gamerules={doMobSpawning:false,doDaylightCycle:false};raw.edits=[];
 for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){raw.edits.push([x,79,z,blockId('stone')]);for(let y=80;y<=84;y++)raw.edits.push([x,y,z,0]);}
 raw.agent=createAgent(8,80,8,1);raw.agent.slots[0]={id:blockId('stone'),count:64};raw.agent.slots[7]={id:stackId('diamond_pickaxe'),count:1,damage:13};raw.agent.slots[26]={id:stackId('tonic'),count:1};raw.agent.selected=7;raw.programs=[structuredClone(program)];stored=JSON.stringify(raw);return construct(parseSave(stored));
}
function owners(g:Game){return structuredClone({agent:g.agent,bag:g.inventory.toJSON(),programs:g.programs,edits:g.world.exportEdits(),drops:g.worldDrops.toJSON(),mobs:g.mobs.exportState((g as unknown as{mobLoot:import('../src/simulation/mob-loot').MobLootResolver}).mobLoot)});}
it.each(aliases)('actual Game alias %s moves the same owned Agent once while preserving cargo, runner, player and world owners',text=>{
 const g=active(),agent=g.agent,slots=g.agent.slots;expect(g.runProgram(g.programs[0])).toBe(true);const runner=(g as unknown as{runner:unknown}).runner,before=owners(g);
 const view=vi.spyOn((g as unknown as{agentView:{snap(a:unknown):void}}).agentView,'snap');expect(g.runChat(text)).toBe('Teleported the Agent to you');expect(view).toHaveBeenCalledTimes(1);expect(view).toHaveBeenCalledWith(agent);expect(g.agent).toBe(agent);expect(g.agent.slots).toBe(slots);expect(g.agent.slots).toEqual(before.agent.slots);expect(g.agent.selected).toBe(7);expect(g.agent).toMatchObject({x:-1,y:80,z:0,facing:2});expect((g as unknown as{runner:unknown}).runner).toBe(runner);expect(g.programRunning).toBe(true);
 const after=owners(g);expect({...after,agent:before.agent}).toEqual(before);expect(g.save()).toBe(true);expect(JSON.parse(stored!).agent).toEqual(g.agent);
});
it('aliases preserve the Agent and program definitions through actual save, stop and cold reconstruction',()=>{
 const g=active();expect(g.runChat('/summon agent')).toBe('Teleported the Agent to you');const before=owners(g);expect(g.stop()).toBe(true);const raw=stored!,cold=construct(parseSave(raw));expect(owners(cold)).toEqual(before);const owner=cold.agent,slots=structuredClone(owner.slots);expect(cold.runChat('/tp @c @s')).toBe('Teleported the Agent to you');expect(cold.agent).toBe(owner);expect(cold.agent.slots).toEqual(slots);expect(cold.save()).toBe(true);expect(JSON.parse(stored!).agent.slots).toEqual(slots);
});
it.each(aliases)('real inventory transfer reservation refuses %s without moving or debiting any owner',text=>{
 const g=active(),before=owners(g),lease=reserveInventoryMutation(g.inventory)!;expect(lease).not.toBeNull();expect(g.runChat(text)).toBe('Items are being transferred. Retry the command afterward');expect(owners(g)).toEqual(before);lease.cancel();expect(g.runChat(text)).toBe('Teleported the Agent to you');expect(g.agent.slots).toEqual(before.agent.slots);
});
it.each(aliases)('no safe loaded or generated cell refuses %s without replacing or emptying the owned Agent',text=>{
 const g=active();for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)for(let y=77;y<=84;y++)g.world.setBlock(x,y,z,blockId('stone'));const owner=g.agent,before=owners(g);expect(g.runChat(text)).toBe('No open space nearby for the Agent');expect(g.agent).toBe(owner);expect(owners(g)).toEqual(before);
});
it('actual prepared and retired Game contexts refuse aliases without touching either source or saved owners',()=>{
 const g=active();expect(g.save()).toBe(true);const source=owners(g),raw=stored!,target=Game.prepare(new Element()as unknown as HTMLElement,{}as TextureAtlas,{name:parseSave(raw).name,seed:g.world.seed,mode:g.mode,touch:false,save:parseSave(raw)},{onPause:vi.fn(),onDeath:vi.fn()});const staged=owners(target);
 for(const alias of aliases){expect(target.runChat(alias)).toBe('World is not active.');expect(owners(target)).toEqual(staged);expect(owners(g)).toEqual(source);expect(stored).toBe(raw);}
 expect(target.discardPrepared()).toBe(true);expect(g.stop()).toBe(true);const savedRaw=stored;for(const alias of aliases){expect(g.runChat(alias)).toBe('World is not active.');expect(owners(g)).toEqual(source);expect(stored).toBe(savedRaw);}
});
it('malformed aliases produce feedback without moving Agent, creating mobs, losing cargo or changing stored state',()=>{
 const g=active(),before=owners(g),raw=stored;for(const text of ['/summon agent Named','/summon agent 0 80 0','/tp @v @s','/tp @c @s extra','/tp @C @s']){expect(g.runChat(text)).not.toBe('Teleported the Agent to you');expect(owners(g)).toEqual(before);expect(stored).toBe(raw);}
});
