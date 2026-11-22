import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Inventory, World, createHunger, stackId, freshStack, blockId } from "../src";
import { Game } from "../../../apps/web/src/application/game";
class Cell { click() {} remove() {} }
function game() {
 const g = Object.assign(Object.create(Game.prototype), { statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] }), own = () => ({ busy:false,records:[],reconcileLoadedReferences:vi.fn(),validateCrossReferences:vi.fn() });
 Object.assign(g,{world:new World(12345),inventory:new Inventory(),hunger:createHunger(),playerStatus:{},recoverySections:[],recoveryOriginal:null,drinkOwner:{elapsed:.7},leashes:own(),balloons:own(),paused:false,dead:false,stopped:false,mode:"survival",health:20,body:{position:{x:.5,y:32,z:.5},yaw:0,pitch:0},hud:{message:vi.fn(),flashDamage:vi.fn()},keyboard:{reset:vi.fn()},screenOpen:()=>false,name:"Ignition",savePayload:vi.fn(()=>'{"version":1}'),markLeashRecovery:vi.fn(),markBalloonRecovery:vi.fn(),leashContext:()=>({})});return g;
}
beforeEach(()=>vi.stubGlobal("document",{createElement:()=>new Cell(),pointerLockElement:null}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();(Game as unknown as {activeWriter:Game|null}).activeWriter=null;});
it("raw Fire recovery retains exact original and blocks real actions, commands, death, overwrite and export-original loss",async()=>{
 const original='\n{"version":1,"fire":{"version":1,"records":"bad","contactSeconds":0}}\n';vi.stubGlobal("localStorage",{getItem:()=>original,setItem:vi.fn()});const g=game();g.restoreFire({fireInvalid:true});expect(g.recoverySections).toContain("fire");expect(g.recoveryOriginal).toBe(original);expect(g.drinkOwner).toBeNull();expect(g.runChat("/give stone")).toContain("Damaged fire");expect(g.giveHeldToAgent()).toContain("Damaged fire");expect(g.dropStack({id:stackId("stone"),count:1})).toBe(false);g.deathState={phase:"pending"};expect(g.tryDeathTransfer()).toBe(false);expect(g.deathError).toContain("Damaged fire");(Game as unknown as {activeWriter:Game|null}).activeWriter=g;expect(g.save()).toBe(false);expect(g.saveError).toContain("fire");expect(g.savePayload).not.toHaveBeenCalled();
 let backup:Blob|undefined;vi.spyOn(URL,"createObjectURL").mockImplementation(b=>{backup=b as Blob;return "blob:fire";});vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});vi.useFakeTimers();g.exportSaveBackup();expect(JSON.parse(await backup!.text()).recoveryOriginalSave).toBe(original);
});
it("raw ignition wear diagnoses saved ownership before sanitation and keeps offhand unavailable",()=>{
 const original='\n{ "inventory": {"slots": [{"id":838,"count":1,"damage":64}]}}\n';vi.stubGlobal("localStorage",{getItem:()=>original});const g=game();g.markIgnitionRecovery({ignitionOwnershipIssues:[{path:"inventory.slots[0]",reason:"bad wear"}]});expect(g.recoveryOriginal).toBe(original);expect(g.recoverySections).toContain("saved items");expect(g.trySwapOffhand()).toBe(false);
});
it("actual Fire tick applies explicit fire cause only during active survival and passes creative null contact",()=>{
 const g=game(),update=vi.fn((_dt:number,_contact:unknown)=>1);g.world.fires={update};g.hurt=vi.fn();g.updateFire(.25);expect(update).toHaveBeenCalledTimes(1);expect(update.mock.calls[0][1]).not.toBeNull();expect(g.hurt).toHaveBeenCalledWith(1,"fire");g.mode="creative";g.updateFire(.25);expect(update.mock.calls[1][1]).toBeNull();
});
it("menus, pause, death, recovery, stopped and ownership lease pause Fire age and contact clocks",()=>{
 for(const state of [{paused:true},{dead:true},{stopped:true},{screenOpen:()=>true},{recoverySections:["fire"]},{leashes:{busy:true}}]){const g=game(),update=vi.fn((_dt:number,_contact:unknown)=>1);g.world.fires={update};Object.assign(g,state);g.hurt=vi.fn();g.updateFire(2);expect(update).not.toHaveBeenCalled();expect(g.hurt).not.toHaveBeenCalled();}
});
it("post-edits Fire source mismatch enters recovery rather than silently creating an immortal or fresh Fire",()=>{
 const g=game();vi.stubGlobal("localStorage",{getItem:()=>"original-fire"});g.world.fires={restore:vi.fn(()=>({invalid:true}))};g.restoreFire({fire:{version:1,records:[],contactSeconds:0}});expect(g.recoverySections).toEqual(["fire"]);expect(g.recoveryOriginal).toBe("original-fire");expect(g.world.fires.restore).toHaveBeenCalledWith({version:1,records:[],contactSeconds:0},g.world.exportEdits());
});
it("recovery refuses hotbar mutation and ignition input before target queries",()=>{
 const g=game();g.recoverySections=["fire"];g.inventory.setSlot(0,freshStack(stackId("stone")));g.selectHudHotbar(1);expect(g.inventory.selected).toBe(0);expect(()=>g.interact(false,true,true,false,1)).not.toThrow();expect(g.drinkOwner).toBeNull();
});

function aimedGame(support="stone") {
 const g=game();g.body.position={x:.5,y:33,z:.5};g.body.pitch=-Math.PI/2;g.body.velocity={x:0,y:0,z:0};
 for(let y=33;y<=38;y++)g.world.setBlock(0,y,0,0);g.world.setBlock(0,32,0,blockId(support));g.inventory.setSlot(0,freshStack(stackId("flint_and_steel")));
 Object.assign(g,{mobs:{raycast:()=>null},attackCooldown:0,placeCooldown:0,creativeCooldown:0,redstone:{interact:()=>false},breakProgress:0,eatTimer:0});return g;
}
it("actual use handler lights a supported top face with one wear, and real breaking extinguishes with no loot or extra wear",()=>{
 const g=aimedGame();g.interact(false,true,true,false,.01);expect(g.world.getBlock(0,33,0)).toBe(blockId("fire"));expect(g.inventory.selectedStack()?.damage).toBe(1);expect(g.world.fires.exportState().records).toHaveLength(1);g.interact(true,false,false,false,.01);expect(g.world.getBlock(0,33,0)).toBe(0);expect(g.world.fires.exportState().records).toEqual([]);expect(g.inventory.selectedStack()?.damage).toBe(1);
});
it("actual station priority opens inventory and never lights a crafting table while holding ignition tool",()=>{
 const g=aimedGame("crafting_table");g.openInventory=vi.fn();g.interact(false,true,true,false,.01);expect(g.openInventory).toHaveBeenCalledWith("crafting_table");expect(g.world.getBlock(0,33,0)).toBe(0);expect(g.inventory.selectedStack()?.damage??0).toBe(0);
});
it("actual payload saves Fire age/contact and worn tool, restores after edits, and omits absent legacy Fire and derived flags",()=>{
 const g=aimedGame();g.interact(false,true,true,false,.01);g.world.fires.update(.4,null);
 Object.assign(g,{timeOfDay:.2,inventoryScreen:{pendingItems:()=>[]},snowballProjectiles:{toJSON:()=>({version:1,nextKey:1,records:[]})},worldDrops:{toJSON:()=>({nextKey:1,records:[]})},leashes:{...g.leashes,toJSON:()=>({version:1,nextKey:1,records:[]})},balloons:{...g.balloons,toJSON:()=>({version:1,nextKey:1,records:[]})},mobs:{exportFireballs:()=>({version:1,nextKey:1,records:[]}),fireballBusy:false,exportState:()=>({nextId:1,records:[]}),exportNpcs:()=>[],spawning:false},chalkboards:new Map(),agent:{x:0,y:34,z:0,facing:0,slots:Array(27).fill(null),selected:0},programs:[],furnaces:new Map(),redstone:{exportScheduled:()=>[]},farming:{toJSON:()=>({version:1,crops:[]})}});
 const raw=(Game.prototype as unknown as {savePayload():string}).savePayload.call(g),saved=JSON.parse(raw);expect(saved.fire).toEqual(g.world.fires.exportState());expect(saved.fire.records[0].remaining).toBeCloseTo(14.6);expect(saved.inventory.slots[0]).toEqual({id:stackId("flint_and_steel"),count:1,damage:1});expect(saved).not.toHaveProperty("fireInvalid");expect(saved).not.toHaveProperty("ignitionOwnershipIssues");const cold=game();cold.world.importEdits(saved.edits);cold.restoreFire(saved);expect(cold.recoverySections).toEqual([]);expect(cold.world.fires.exportState()).toEqual(saved.fire);g.world.setBlock(0,33,0,0);const empty=JSON.parse((Game.prototype as unknown as {savePayload():string}).savePayload.call(g));expect(empty).not.toHaveProperty("fire");
});
it("actual hurt handler uses fire bypass with unchanged armor rather than melee protection or wear",()=>{
 const g=game();g.inventory.equipment.chest=freshStack(stackId("diamond_chestplate"));const before=g.inventory.toJSON();g.hurt(1,"fire");expect(g.health).toBe(19);expect(g.inventory.toJSON()).toEqual(before);expect(g.hud.flashDamage).toHaveBeenCalledTimes(1);g.mode="creative";g.hurt(1,"fire");expect(g.health).toBe(19);expect(g.inventory.toJSON()).toEqual(before);
});
