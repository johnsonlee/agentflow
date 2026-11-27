import {CameraStore}from "../src/education/placed-camera";
import { CaneGrowthSystem } from "../src/simulation/cane-growth";
import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { Inventory,World,createHunger,stackId,blockId,tryUsePortalIgnition } from "../src";
import { Game } from "../../../apps/web/src/application/game";
class Anchor { click(){} remove(){} }
function game(frame=true){
 const g=Object.assign(Object.create(Game.prototype), { cameras:new CameraStore(), statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] }),own=()=>({busy:false,records:[],reconcileLoadedReferences:vi.fn(),validateCrossReferences:vi.fn(),toJSON:()=>({version:1,nextKey:1,records:[]})});
 Object.assign(g,{world:new World(12345),inventory:new Inventory(),hunger:createHunger(),playerStatus:{},recoverySections:[],recoveryOriginal:null,drinkOwner:null,leashes:own(),balloons:own(),paused:false,dead:false,stopped:false,mode:"survival",health:20,body:{position:{x:.5,y:33,z:.5},yaw:0,pitch:-1.45},hud:{setCameraAction:vi.fn(),message:vi.fn(),flashDamage:vi.fn()},keyboard:{reset:vi.fn()},screenOpen:()=>false,mobs:{raycast:()=>null,exportFireballs:()=>({version:1,nextKey:1,records:[]}),fireballBusy:false,exportState:()=>({nextId:1,records:[]}),exportNpcs:()=>[],spawning:false},attackCooldown:0,placeCooldown:0,creativeCooldown:0,redstone:{interact:()=>false,exportScheduled:()=>[]},breakProgress:0,eatTimer:0,name:"Portals",timeOfDay:.2,inventoryScreen:{pendingItems:()=>[]},snowballProjectiles:{toJSON:()=>({version:1,nextKey:1,records:[]})},worldDrops:{toJSON:()=>({nextKey:1,records:[]})},chalkboards:new Map(),agent:{x:0,y:38,z:0,facing:0,selected:0,slots:Array(27).fill(null)},programs:[],furnaces:new Map(),farming:{toJSON:()=>({version:1,tick:0,accumulator:0,cursor:0})},markLeashRecovery:vi.fn(),markBalloonRecovery:vi.fn(),leashContext:()=>({})});
 for(let y=32;y<=37;y++)for(let x=-1;x<=2;x++)g.world.setBlock(x,y,0,frame&&(y===32||y===36)&&x>=0&&x<=1||frame&&(x===-1||x===2)&&y>=33&&y<=35?blockId("obsidian"):0);
 if(!frame)g.world.setBlock(0,32,0,blockId("stone"));g.inventory.setSlot(0,{id:stackId("flint_and_steel"),count:1});g.caneGrowth=new CaneGrowthSystem(g.world);return g;
}
beforeEach(()=>{vi.stubGlobal("document",{createElement:()=>new Anchor(),pointerLockElement:null});vi.stubGlobal("localStorage",{getItem:()=>null,setItem:vi.fn()});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();(Game as unknown as {activeWriter:Game|null}).activeWriter=null;});
it("actual mainhand use activates the complete frame instead of ordinary Fire",()=>{
 const g=game();g.interact(false,true,true,false,.01);for(let y=33;y<=35;y++)for(let x=0;x<=1;x++)expect(g.world.getBlock(x,y,0)).toBe(192);expect(g.world.portals.exportState().records).toHaveLength(1);expect(g.world.fires.exportState().records).toEqual([]);expect(g.inventory.selectedStack()?.damage).toBe(1);
});
it("actual use finds a valid Z frame even when the alternate X direction is unloaded",()=>{
 const g=game(false);
 for(let y=32;y<=36;y++)for(let z=-1;z<=2;z++)g.world.setBlock(0,y,z,(y===32||y===36)&&z>=0&&z<=1||(z===-1||z===2)&&y>=33&&y<=35?blockId("obsidian"):0);
 g.world.unloadChunk(-1,0);g.interact(false,true,true,false,.01);
 for(let y=33;y<=35;y++)for(let z=0;z<=1;z++)expect(g.world.getBlock(0,y,z)).toBe(193);
 expect(g.world.portals.exportState().records[0].axis).toBe("z");expect(g.inventory.selectedStack()?.damage).toBe(1);
});
it("a denied portal interior refuses every cell and wear rather than falling back to Fire",()=>{
 const g=game();g.world.setBlock(1,31,0,blockId("deny"));const before=g.world.exportEdits(),bag=g.inventory.toJSON();g.interact(false,true,true,false,.01);expect(g.world.exportEdits()).toEqual(before);expect(g.inventory.toJSON()).toEqual(bag);expect(g.world.portals.exportState().records).toEqual([]);
});
it("actual Game payload persists records and worn owner, restores after physical edits",()=>{
 const g=game();expect(tryUsePortalIgnition(g.world,g.inventory,"survival",{x:0,y:32,z:0,normal:{x:0,y:1,z:0}}).ok).toBe(true);
 const saved=JSON.parse(g.savePayload());expect(saved.portals).toEqual(g.world.portals.exportState());expect(saved.inventory.slots[0].damage).toBe(1);expect(saved).not.toHaveProperty("portalsInvalid");
 const cold=game(false);cold.world.importEdits(saved.edits);cold.restorePortals(saved);expect(cold.recoverySections).toEqual([]);expect(cold.world.portals.exportState()).toEqual(saved.portals);
});
it("portal raw recovery freezes actual use, commands, selection, death and storage overwrite",()=>{
 const original='\n{"portals":{"version":9,"records":[]}}\n';vi.stubGlobal("localStorage",{getItem:()=>original,setItem:vi.fn()});const g=game();g.restorePortals({portalsInvalid:true});expect(g.recoveryOriginal).toBe(original);expect(g.recoverySections).toContain("portals");const before=g.world.exportEdits();g.interact(false,true,true,false,.01);expect(g.world.exportEdits()).toEqual(before);g.selectHudHotbar(1);expect(g.inventory.selected).toBe(0);expect(g.runChat("/give stone")).toContain("Damaged portals");g.deathState={phase:"pending"};expect(g.tryDeathTransfer()).toBe(false);(Game as unknown as {activeWriter:Game|null}).activeWriter=g;expect(g.save()).toBe(false);expect(localStorage.setItem).not.toHaveBeenCalled();
});
it("actual recovery export preserves exact original while detaching invalid portal cells only from its backup snapshot",async()=>{
 const original='\n{"portals":{"version":1,"records":"bad"},"edits":[[0,33,0,192]]}\n';vi.stubGlobal("localStorage",{getItem:()=>original,setItem:vi.fn()});const g=game(false);g.world.setBlock(0,33,0,192);g.restorePortals({portalsInvalid:true});const before=g.world.exportEdits();let blob:Blob|undefined;vi.spyOn(URL,"createObjectURL").mockImplementation(value=>{blob=value as Blob;return"blob:portal";});vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});vi.useFakeTimers();g.exportSaveBackup();const backup=JSON.parse(await blob!.text());expect(backup.recoveryOriginalSave).toBe(original);expect(backup.edits.some((e:number[])=>e[3]===192||e[3]===193)).toBe(false);expect(backup).not.toHaveProperty("portals");expect(g.world.exportEdits()).toEqual(before);expect(localStorage.setItem).not.toHaveBeenCalled();
});
it("actual postcommit observers see all cells, record and wear while save and selection are guarded",()=>{
 const g=game();(Game as unknown as {activeWriter:Game|null}).activeWriter=g;g.savePayload=vi.fn(()=>"{}");const observed:unknown[]=[];
 g.world.onBlockChanged((x:number,y:number,z:number,id:number)=>{
  if(x!==0||y!==33||z!==0||id!==192)return;
  const cells=[];for(let cy=33;cy<=35;cy++)for(let cx=0;cx<=1;cx++)cells.push(g.world.getBlock(cx,cy,0));
  const busy=g.ownershipBusy,saved=g.save();g.selectHudHotbar(1);
  observed.push({cells,records:g.world.portals.exportState().records.length,wear:g.inventory.selectedStack()?.damage,busy,saved,selected:g.inventory.selected});
 });
 g.interact(false,true,true,false,.01);expect(observed).toEqual([{cells:[192,192,192,192,192,192],records:1,wear:1,busy:true,saved:false,selected:0}]);expect(g.savePayload).not.toHaveBeenCalled();expect(localStorage.setItem).not.toHaveBeenCalled();expect(g.ownershipBusy).toBe(false);
});
it("raw hidden portal item diagnostics retain original before item repair and use shared owner freeze",()=>{
 const original=' {"inventory":{"slots":[{"id":192,"count":1}]}}\n';vi.stubGlobal("localStorage",{getItem:()=>original});const g=game();g.markPortalRecovery({portalOwnershipIssues:[{path:"inventory.slots[0]",reason:"hidden portal cell"}]});expect(g.recoveryOriginal).toBe(original);expect(g.recoverySections).toContain("saved items");expect(g.actionsNeedRecovery).toBe(true);expect(g.trySwapOffhand()).toBe(false);
});
