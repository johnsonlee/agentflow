import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach,expect,it,vi } from "vitest";
import { Game } from "../../../apps/web/src/application/game";
const writer=Game as unknown as {activeWriter:Game|null};
afterEach(()=>{writer.activeWriter=null;vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each(["root-allocation","root-attachment"])("a failed destination %s preserves the previous world's public save authority",failure=>{
 const setItem=vi.fn();vi.stubGlobal("localStorage",{getItem:()=>null,setItem});
 const original=Object.assign(Object.create(Game.prototype), { markComposterStoreRecovery:vi.fn(), statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] }),payload='{"name":"Original world","inventory":{"slots":[{"id":191,"count":1}]}}';
 const owners=()=>({busy:false,reconcileLoadedReferences:vi.fn(),validateCrossReferences:vi.fn()});
 Object.assign(original,{stopped:false,leashes:owners(),balloons:owners(),recoverySections:[],markPlayerStatusRecovery:vi.fn(),markLeashRecovery:vi.fn(),markBalloonRecovery:vi.fn(),leashContext:()=>({}),savePayload:()=>payload,hud:{message:vi.fn()}});
 writer.activeWriter=original;expect(original.save()).toBe(true);setItem.mockClear();
 vi.stubGlobal("document",{createElement:()=>{if(failure==="root-allocation")throw Error("Destination root allocation failed");return {className:""};}});
 const host={appendChild:()=>{throw Error("Destination root attachment failed");}};
 expect(()=>new Game(host as unknown as HTMLElement,{} as ConstructorParameters<typeof Game>[1],{name:"Other realm",seed:9,mode:"survival",touch:false},{onPause:vi.fn(),onDeath:vi.fn()})).toThrow(/Destination root/);
 expect(original.save()).toBe(true);expect(setItem).toHaveBeenCalledOnce();expect(setItem).toHaveBeenCalledWith("craft.save.v1",payload);
});
