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
 return {version:1,name:"Program recovery world",seed:7,generatorVersion:2,mode:"survival",timeOfDay:.1,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},edits:[],inventory:bag.toJSON(),playerState:{health:7},dimensions:{version:1,active:"overworld",inactive:{nether:{seed:9,generatorVersion:1,player:{position:{x:12.5,y:45,z:13.5},yaw:0,pitch:0,flying:false},edits:[[12,44,13,blockId("stone")]],worldDrops:{nextKey:1,records:[]}}},links:[]}};
}
function construct(save:SaveData){return new Game(new Element() as unknown as HTMLElement,{} as TextureAtlas,{name:save.name,seed:save.seed,mode:save.mode,touch:false,save},{onPause:vi.fn(),onDeath:vi.fn()});}
import type {CodeProgram} from "@craft/engine";
const branchProgram:CodeProgram={name:"Inspect Stone",trigger:{type:"run"},blocks:[{type:"if",dir:"up",condition:{type:"block-is",name:"stone"},then:[{type:"command",cmd:{op:"turn",side:"right"}}],else:[{type:"command",cmd:{op:"turn",side:"left"}}]}]};
function codeSave():SaveData{const raw=saved();delete raw.dimensions;raw.generatorVersion=3;raw.playerState={health:20};raw.agent={x:0,y:80,z:0,facing:2,slots:Array(27).fill(null),selected:0};raw.programs=[structuredClone(branchProgram)];raw.edits=[[0,81,0,blockId('stone')]];return raw;}

import {CodeProgramWorkspace} from "../src/ui/codeProgramWorkspace";
function editFixture(){const g=construct(codeSave()),workspace=new CodeProgramWorkspace(g.programs);workspace.open();const x=g as unknown as Record<string,any>;x.codeBuilder.prepareProgramSnapshot=()=>workspace.prepareSnapshot();x.codeBuilder.uncommittedProgramIssue=()=>workspace.unsavedIssue();g.start();return{g,workspace,x};}
it("actual world save includes pending valid edits, acknowledges replacement and cold opens without explicit Save program",()=>{const{g,workspace:w}=editFixture(),old=g.programs[0];w.program.name="Implicit world save";expect(g.save()).toBe(true);expect(parseSave(stored!).programs![0].name).toBe("Implicit world save");expect(g.programs[0]).not.toBe(old);expect(old.name).toBe("Inspect Stone");w.program.name="SaveQuit latest";expect(g.stop()).toBe(true);const cold=construct(parseSave(stored!));expect(cold.programs[0].name).toBe("SaveQuit latest");(cold as any).retireWithoutSave();});
it("actual failed browser write does not acknowledge or discard valid private editing",()=>{const{g,workspace:w,x}=editFixture(),old=g.programs[0];w.program.name="Retry edit";vi.stubGlobal("localStorage",{setItem(){throw Error("quota");}});expect(g.save()).toBe(false);expect(g.programs[0]).toBe(old);expect(w.program.name).toBe("Retry edit");expect(g.stop()).toBe(false);expect(x.stopped).toBe(false);x.retireWithoutSave();});
it("invalid private edits do not block critical save, preserve owned AST and prevent only voluntary alive SaveQuit",()=>{const{g,workspace:w,x}=editFixture(),old=JSON.stringify(g.programs);w.program.trigger={type:"chat",command:"$invalid"};expect(g.save()).toBe(true);expect(JSON.stringify(parseSave(stored!).programs)).toBe(old);expect(g.stop()).toBe(false);expect(x.stopped).toBe(false);expect(w.program.trigger).toEqual({type:"chat",command:"$invalid"});g.health=0;x.dead=true;expect(g.stop()).toBe(true);expect(JSON.stringify(parseSave(stored!).programs)).toBe(old);});
it("storage callback newer edit keeps successful world receipt true and leaves SaveQuit alive until retried",()=>{const{g,workspace:w,x}=editFixture();w.program.name="Written snapshot";let change=true;vi.stubGlobal("localStorage",{setItem(_key:string,value:string){stored=value;if(change)w.program.name="Newer edit";}});expect(g.save()).toBe(true);expect(parseSave(stored!).programs![0].name).toBe("Written snapshot");expect(w.program.name).toBe("Newer edit");w.program.name="Next snapshot";expect(g.stop()).toBe(false);expect(x.stopped).toBe(false);expect(g.saveError).toContain("World saved");expect(parseSave(stored!).programs![0].name).toBe("Next snapshot");change=false;expect(g.stop()).toBe(true);expect(parseSave(stored!).programs![0].name).toBe("Newer edit");});
it("post-write stale owned-reference acknowledgment cannot convert successful disk checkpoint into item rollback signal",()=>{const{g,workspace:w,x}=editFixture();w.program.name="Written";vi.stubGlobal("localStorage",{setItem(_key:string,value:string){stored=value;g.programs[0]=structuredClone(branchProgram);g.programs[0].name="External";}});expect(g.save()).toBe(true);expect(parseSave(stored!).programs![0].name).toBe("Written");expect(g.programs[0].name).toBe("External");expect(w.program.name).toBe("Written");x.retireWithoutSave();});
it("backup capture is pure and includes valid working changes without acknowledging them",()=>{const{g,workspace:w,x}=editFixture(),old=g.programs[0];w.program.name="Backup working copy";const data=x.captureSaveData();expect(data.programs[0].name).toBe("Backup working copy");expect(g.programs[0]).toBe(old);expect(old.name).toBe("Inspect Stone");x.retireWithoutSave();});

it("direct prepared handoff refuses stale valid pending editor view and accepts exactly staged program snapshot",()=>{const{g,workspace:w,x}=editFixture();g.paused=true;w.program.name="Pending world editor";const stale=Game.prepare(new Element() as unknown as HTMLElement,{}as TextureAtlas,{name:codeSave().name,seed:g.world.seed,mode:g.mode,touch:false,save:codeSave()},{onPause:vi.fn(),onDeath:vi.fn()});expect(stale.prepareFrame()).toBe(true);expect(stale.commitPrepared(g)).toBe(false);stale.discardPrepared();const snapshot=x.captureSaveData(),target=Game.prepare(new Element() as unknown as HTMLElement,{}as TextureAtlas,{name:codeSave().name,seed:g.world.seed,mode:g.mode,touch:false,save:snapshot},{onPause:vi.fn(),onDeath:vi.fn()});expect(target.prepareFrame()).toBe(true);expect(target.commitPrepared(g)).toBe(true);expect(target.programs[0].name).toBe("Pending world editor");expect(target.save()).toBe(true);target.stop();});
it("voluntary portal preflight refuses invalid session draft before any portal owner read",()=>{const{g,workspace:w,x}=editFixture();w.program.trigger={type:"chat",command:"$bad"};x.screenOpen=()=>false;const owner=vi.spyOn(g.world.portals,"captureOwner");const ticket={unchanged:()=>true,frame:{x:0,y:80,z:0,width:2,height:3,axis:"x"}};expect(g.preparePortalTravel(ticket as any,{}as TextureAtlas)).toBeNull();expect(owner).not.toHaveBeenCalled();expect(g.programs[0].trigger).toEqual({type:"run"});expect(w.program.trigger).toEqual({type:"chat",command:"$bad"});x.retireWithoutSave();});

it("actual mandatory Nether death staging and handoff use last valid program rather than softlocking on an invalid private draft",()=>{const raw=codeSave();raw.generatorVersion=1;raw.dimensions={version:1,active:"nether",inactive:{},links:[]};const g=construct(raw),w=new CodeProgramWorkspace(g.programs);w.open();const x=g as any;x.codeBuilder.prepareProgramSnapshot=()=>w.prepareSnapshot();x.codeBuilder.uncommittedProgramIssue=()=>w.unsavedIssue();w.program.trigger={type:"chat",command:"$bad"};g.start();x.hurt(30,"void");expect(g.dead).toBe(true);const transfer=g.prepareOverworldRespawn({}as TextureAtlas);expect(transfer).not.toBeNull();expect(transfer!.prepareFrame()).toBe(true);expect(transfer!.commit()).toBe(true);expect(transfer!.target.programs).toEqual(raw.programs);expect(transfer!.target.save()).toBe(true);expect(transfer!.target.stop()).toBe(true);});

it("real paused tick autosaves valid pending block edits without explicit program commit or running commands",()=>{const{g,workspace:w,x}=editFixture();w.program.name="Autosaved working edit";g.paused=true;x.keyboard.poll=()=>({});for(const name of["agentView","worldDropsView","leashView","balloonView","snowballProjectilesView","glowStickView","sparklerView"])x[name].update=()=>{};for(const name of["setUnderwater","setPlayerStatus","update","setDebug"])x.hud[name]=()=>{};for(const name of["setSelection","setHeldLight"])x.renderer[name]=()=>{};x.renderer.renderDistance=2;x.renderer.meshedChunkCount=()=>0;const agent=structuredClone(g.agent),save=vi.spyOn(g,"save");for(let i=0;i<101;i++)x.tick(.3);expect(save).toHaveBeenCalledTimes(1);expect(parseSave(stored!).programs![0].name).toBe("Autosaved working edit");expect(g.agent).toEqual(agent);expect(g.programRunning).toBe(false);x.retireWithoutSave();});

import {emptyCodeWorkspace,type CodeWorkspaceData} from "@craft/engine";
function sourceFixture(){
 const f=editFixture();let text=emptyCodeWorkspace();text.language="python";text.drafts.python={source:"import unsupported\n\tbroken(\u0000)",name:"n".repeat(81)};
 const accept=vi.fn();f.x.codeBuilder.prepareProgramSnapshot=()=>{const stage=f.workspace.prepareSnapshot();return stage.ok?{...stage,codeWorkspace:structuredClone(text),accept:()=>{accept();return stage.accept();}}:stage;};
 return{...f,accept,get text(){return text;},set text(v:CodeWorkspaceData){text=v;}};
}
it("world save and cold Game restore inert invalid source separately from valid AST and item owners",()=>{
 const f=sourceFixture(),agent=structuredClone(f.g.agent),bag=f.g.inventory.toJSON(),programs=structuredClone(f.g.programs);expect(f.g.save()).toBe(true);
 const raw=stored!,saved=parseSave(raw);expect(saved.codeWorkspace).toEqual(f.text);expect(saved.programs).toEqual(programs);expect(f.g.agent).toEqual(agent);expect(f.g.inventory.toJSON()).toEqual(bag);expect(f.g.programRunning).toBe(false);expect(f.accept).toHaveBeenCalledTimes(1);
 expect(f.g.stop()).toBe(true);const cold=construct(parseSave(stored!));cold.start();expect(cold.save()).toBe(true);expect(parseSave(stored!).codeWorkspace).toEqual(f.text);expect(cold.programRunning).toBe(false);expect(cold.stop()).toBe(true);
});
it("failed source workspace storage never acknowledges text or loses current input",()=>{
 const f=sourceFixture(),before=structuredClone(f.text);vi.stubGlobal("localStorage",{setItem(){throw Error("quota");}});expect(f.g.save()).toBe(false);expect(f.accept).not.toHaveBeenCalled();expect(f.text).toEqual(before);expect(f.g.stop()).toBe(false);expect(f.x.stopped).toBe(false);f.x.retireWithoutSave();
});
it("text-only edits during a successful disk write keep quit alive even if acknowledgment throws",()=>{
 const f=sourceFixture();f.accept.mockImplementation(()=>{throw Error("UI acknowledgment failed");});let mutate=true;
 vi.stubGlobal("localStorage",{setItem(_k:string,value:string){stored=value;if(mutate)f.text.drafts.python.source+="x";}});
 const first=structuredClone(f.text);expect(f.g.save()).toBe(true);expect(parseSave(stored!).codeWorkspace).toEqual(first);expect(f.text).not.toEqual(first);
 expect(f.g.stop()).toBe(false);expect(f.x.stopped).toBe(false);expect(f.g.saveError).toContain("World saved");mutate=false;expect(f.g.stop()).toBe(true);expect(parseSave(stored!).codeWorkspace).toEqual(f.text);
});
it("prepared Game handoff compares source drafts as well as the otherwise identical AST",()=>{
 const f=sourceFixture();f.g.paused=true;
 const stale=Game.prepare(new Element()as unknown as HTMLElement,{}as TextureAtlas,{name:codeSave().name,seed:f.g.world.seed,mode:f.g.mode,touch:false,save:codeSave()},{onPause:vi.fn(),onDeath:vi.fn()});expect(stale.prepareFrame()).toBe(true);expect(stale.commitPrepared(f.g)).toBe(false);stale.discardPrepared();
 const snapshot=f.x.captureSaveData();expect(snapshot.codeWorkspace).toEqual(f.text);const target=Game.prepare(new Element()as unknown as HTMLElement,{}as TextureAtlas,{name:codeSave().name,seed:f.g.world.seed,mode:f.g.mode,touch:false,save:snapshot},{onPause:vi.fn(),onDeath:vi.fn()});expect(target.prepareFrame()).toBe(true);expect(target.commitPrepared(f.g)).toBe(true);expect(target.save()).toBe(true);expect(parseSave(stored!).codeWorkspace).toEqual(f.text);expect(target.stop()).toBe(true);
});
it("malformed stored source workspace preserves exact original through write refusal and backup",async()=>{
 const raw="  "+JSON.stringify({...codeSave(),codeWorkspace:{version:9,language:"python",drafts:{}}})+"\n";stored=raw;const g=construct(parseSave(raw)),x=g as any;g.start();expect(g.loadErrors).toContain("Damaged source workspace (original save preserved)");expect(g.save()).toBe(false);expect(stored).toBe(raw);expect(g.stop()).toBe(false);g.exportSaveBackup();const backup=JSON.parse(await blobs[0].text());expect(backup.recoveryOriginalSave).toBe(raw);expect(backup.codeWorkspace).toBeUndefined();expect(stored).toBe(raw);x.retireWithoutSave();
});
it("source draft backup is pure and includes current bounded text without acknowledging or running it",async()=>{
 const f=sourceFixture(),before=structuredClone(f.text),agent=structuredClone(f.g.agent);f.g.exportSaveBackup();const backup=JSON.parse(await blobs[0].text());expect(backup.codeWorkspace).toEqual(before);expect(f.accept).not.toHaveBeenCalled();expect(f.text).toEqual(before);expect(f.g.agent).toEqual(agent);expect(f.g.programRunning).toBe(false);f.x.retireWithoutSave();
});
it("mandatory Nether death handoff retains the last persistable source even when current RAM text is oversized",()=>{
 const raw=codeSave(),last=emptyCodeWorkspace();last.drafts.javascript.source="agent.turn(LEFT_TURN);";raw.codeWorkspace=last;raw.generatorVersion=1;raw.dimensions={version:1,active:"nether",inactive:{},links:[]};
 const g=construct(raw),x=g as any;g.start();x.codeBuilder.prepareProgramSnapshot=()=>({ok:true,programs:structuredClone(g.programs),codeWorkspace:structuredClone(last),warning:"Unpersistable text stays in session",accept:()=>true});x.codeBuilder.uncommittedProgramIssue=()=>"Source draft exceeds storage limits; repair before quitting";
 expect(g.stop()).toBe(false);x.hurt(30,"void");expect(g.dead).toBe(true);const trip=g.prepareOverworldRespawn({}as TextureAtlas);expect(trip).not.toBeNull();expect(trip!.prepareFrame()).toBe(true);expect(trip!.commit()).toBe(true);expect(trip!.target.save()).toBe(true);expect(parseSave(stored!).codeWorkspace).toEqual(last);expect(trip!.target.programRunning).toBe(false);expect(trip!.target.stop()).toBe(true);
});
