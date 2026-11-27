import { afterEach,beforeEach,expect,it,vi } from "vitest";
const h=vi.hoisted(()=>({disposed:[] as string[],failMessage:false,failRender:false,throwRendererDispose:false,throwKeyboardDispose:false,ready:true,readyCameraX:null as number|null,onKeyboardDispose:null as (()=>void)|null,rootRemoved:0,frames:0}));
vi.mock("../../../apps/web/src/rendering/renderer",()=>({WorldRenderer:class{scene={add(){}};camera={position:{x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;}},rotation:{set(){}}};resize(){}isAreaReady(){return h.ready&&(h.readyCameraX===null||this.camera.position.x===h.readyCameraX);}updateChunks(){}render(){if(h.failRender)throw Error("target render failed");}dispose(){h.disposed.push("renderer");if(h.throwRendererDispose)throw Error("renderer dispose");}}}));
vi.mock("../../../apps/web/src/simulation/mobs",()=>({MobManager:class{mobs=[];spawning=true;dispose(){h.disposed.push("mobs");}exportFireballs(){return {version:1,nextKey:1,records:[]};}exportState(){return {nextId:1,records:[]};}exportNpcs(){return [];}}}));
vi.mock("@craft/input",()=>({KeyboardMouseInput:class{enabled=true;reset(){}dispose(){h.disposed.push("keyboard");h.onKeyboardDispose?.();if(h.throwKeyboardDispose)throw Error("keyboard dispose");}requestPointerLock(){}},TouchControls:class{enabled=true;setVisible(){}dispose(){h.disposed.push("touch");}},mergeFrames:()=>({})}));
vi.mock("../../../apps/web/src/ui/hud",()=>({ChatInput:class{open=false;},Hud:class{setCameraAction(){}dispose(){h.disposed.push("hud");}message(){if(h.failMessage)throw Error("late HUD failure");}},InventoryScreen:class{open=false;restorePending(){return false;}pendingItems(){return [];}freezeForDeath(){}}}));
vi.mock("../../../apps/web/src/ui/screens",()=>({Portfolio:class{dropped=0;photos=[];},ChatInput:class{open=false;},PortfolioScreen:class{},NpcDialog:class{},ChalkboardDialog:class{},BookScreen:class{}}));
vi.mock("../../../apps/web/src/ui/codeBuilder",()=>({CodeBuilderScreen:class{}}));
vi.mock("../../../apps/web/src/ui/chalkboards",()=>({ChalkboardViews:class{dispose(){h.disposed.push("chalk");}}}));
vi.mock("../../../apps/web/src/rendering/agentView",()=>({AgentView:class{dispose(){h.disposed.push("agent");}}}));
vi.mock("../../../apps/web/src/rendering/worldDropsView",()=>({WorldDropsView:class{dispose(){h.disposed.push("drops");}}}));
vi.mock("../../../apps/web/src/rendering/snowballProjectilesView",()=>({SnowballProjectilesView:class{dispose(){h.disposed.push("snowballs");}}}));
vi.mock("../../../apps/web/src/rendering/leash-view",()=>({LeashView:class{dispose(){h.disposed.push("leash");}}}));
vi.mock("../../../apps/web/src/rendering/balloonView",()=>({BalloonView:class{dispose(){h.disposed.push("balloon");}}}));
vi.mock("../../../apps/web/src/rendering/glow-stick-view",()=>({GlowStickView:class{dispose(){h.disposed.push("glow");}}}));
vi.mock("../../../apps/web/src/rendering/sparkler-view",()=>({SparklerView:class{dispose(){h.disposed.push("sparkler");}}}));
import { Game } from "../../../apps/web/src/application/game";
import type { TextureAtlas } from "@craft/textures";
class Element extends EventTarget{className="";hidden=false;style={};parent:Element|null=null;children:Element[]=[];appendChild(e:Element){this.children.push(e);e.parent=this;return e;}remove(){h.rootRemoved++;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}}
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
it("actual Game save retains the inactive archive and the one current global bag",()=>{
 const input=saved(),expected=structuredClone(input.dimensions),g=construct(input);expect(g.save()).toBe(true);const raw=JSON.parse(stored!);
 expect(raw.dimensions).toEqual(expected);expect(raw.inventory).toEqual(input.inventory);expect(raw.playerState.health).toBe(7);expect(raw.dimensions.inactive.nether).not.toHaveProperty("inventory");expect(input.dimensions).toEqual(expected);
 const loaded=parseSave(stored!);expect(loaded.dimensionsInvalid).toBeUndefined();expect(loaded.dimensions).toEqual(expected);
});
it("actual Game refuses overwrite, commands, mode and HUD selection for a damaged inactive archive",()=>{
 const raw=JSON.parse(JSON.stringify(saved()));raw.dimensions.inactive.nether.inventory={slots:[{id:192,count:1}]};const original='\n'+JSON.stringify(raw)+'\n';stored=original;const g=construct(parseSave(original));const before=g.inventory.toJSON();
 expect(g.save()).toBe(false);expect(stored).toBe(original);expect(g.runChat("/give stone")).toContain("Export a backup");g.setMode("creative");expect(g.mode).toBe("survival");
 expect(g.loadErrors.some(error=>error.includes("dimensions.inactive.nether.inventory")&&error.includes("Foreign global owner"))).toBe(true);
 const select=g as unknown as {selectHudHotbar(slot:number):void};select.selectHudHotbar(1);expect(g.inventory.toJSON()).toEqual(before);expect(g.stop()).toBe(false);expect(stored).toBe(original);
});
it("actual Game recovery download retains exact original archive without writing browser storage",async()=>{
 const raw=JSON.parse(JSON.stringify(saved()));raw.dimensions.version=99;const original=' \n'+JSON.stringify(raw)+'\n ';stored=original;const g=construct(parseSave(original));g.exportSaveBackup();
 expect(blobs).toHaveLength(1);const backup=JSON.parse(await blobs[0].text());expect(backup.recoveryOriginalSave).toBe(original);expect(backup).not.toHaveProperty("dimensions");expect(stored).toBe(original);expect(g.save()).toBe(false);
});
it("actual live frame collapse removes stale link metadata while preserving the other world",()=>{
 const input=saved(),other=input.dimensions!.inactive.nether!,from=addPortal(input,"x",30,80,30),to=addPortal(other,"z",40,40,40);
 input.dimensions!.links=[{from:{dimension:"overworld",portal:from},to:{dimension:"nether",portal:to}}];const retained=structuredClone(other),g=construct(parseSave(JSON.stringify(input)));
 expect(g.save()).toBe(true);expect(JSON.parse(stored!).dimensions.links).toHaveLength(1);
 // The isolated renderer fixture does not mesh/load chunks; explicitly load
 // the actual frame dependencies before invoking the real guarded mutation.
 for(const [x,y,z] of input.edits)g.world.getBlock(x,y,z);
 g.world.setBlock(from.x-1,from.y,from.z,0);expect(g.world.portals.exportState().records).toEqual([]);
 expect(g.save()).toBe(true);const loaded=parseSave(stored!);expect(loaded.dimensionsInvalid).toBeUndefined();expect(loaded.dimensions!.links).toEqual([]);expect(loaded.dimensions!.inactive.nether).toEqual(retained);
 expect(loaded.edits.every(e=>e[3]!==192&&e[3]!==193)).toBe(true);expect(loaded.inventory).toEqual(input.inventory);
});
it("actual Game independently refuses direct malformed archive options before any save",()=>{
 const input=saved();Object.assign(input,{dimensions:null});stored=JSON.stringify(input);const before=stored,g=construct(input);expect(g.save()).toBe(false);expect(stored).toBe(before);expect(g.runChat("/give stone")).toContain("Export a backup");
});
it("actual Game loads and saves the selected Nether world while retaining its Overworld and global bag",()=>{
 const input=saved(),overworld=captureDimensionWorld(input),pose=new NetherGenerator(9).findNaturalSpawn(0,0,32)!;expect(pose).not.toBeNull();
 input.seed=9;input.generatorVersion=1;input.player={position:{...pose},yaw:.4,pitch:.1,flying:false};input.dimensions={version:1,active:"nether",inactive:{overworld},links:[]};
 const g=construct(parseSave(JSON.stringify(input)));expect(g.world.dimension).toBe("nether");expect(g.world.seed).toBe(9);expect(g.world.generatorVersion).toBe(1);expect(g.body.position).toEqual(pose);
 expect(g.save()).toBe(true);const loaded=parseSave(stored!);expect(loaded.dimensionsInvalid).toBeUndefined();expect(loaded.dimensions?.active).toBe("nether");expect(loaded.dimensions?.inactive.overworld).toEqual(overworld);expect(loaded.inventory).toEqual(input.inventory);expect(loaded.playerState?.health).toBe(7);
});

it("actual Game freezes hidden Wart raw owners and preserves exact original in backup",async()=>{
 const raw=saved();raw.inventory.slots[0]={id:197,count:1};const original=' \n'+JSON.stringify(raw)+'\n ';stored=original;const g=construct(parseSave(original));
 expect(g.save()).toBe(false);expect(g.runChat('/give stone')).toContain('Export a backup');expect(g.loadErrors.some(e=>e.includes('inventory.slots[0]')&&e.includes('hidden Wart'))).toBe(true);expect(stored).toBe(original);
 g.exportSaveBackup();expect(blobs).toHaveLength(1);expect(JSON.parse(await blobs[0].text()).recoveryOriginalSave).toBe(original);expect(stored).toBe(original);
});
it('actual orphan Wart recovery exports original-only evidence when normalized world serialization refuses',async()=>{
 const raw=saved();delete raw.dimensions;raw.edits=[[8,90,8,197],[8,89,8,blockId('stone')]];const original=' \n'+JSON.stringify(raw)+'\n ';stored=original;const g=construct(parseSave(original));
 expect(g.save()).toBe(false);expect(()=>g.exportSaveBackup()).not.toThrow();expect(blobs).toHaveLength(1);const backup=JSON.parse(await blobs[0].text());expect(backup.recoveryOriginalSave).toBe(original);expect(backup.recoveryBackupFormat).toBe('original-only-v1');expect(stored).toBe(original);expect(g.runChat('/give stone')).toContain('Export a backup');
});
