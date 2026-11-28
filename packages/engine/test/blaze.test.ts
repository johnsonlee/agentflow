import {expect,it} from "vitest";
import {MOB_SPECS,createMob,mobAttack,stepMob,damageMob,type MobKind} from "../src/simulation/entities";
import {mobDrops} from "../src/simulation/mob-loot";
import {mobSnapshot,restoreMobSnapshot} from "../src/persistence/mob-save";
import {BlazeFireballs} from "../src/simulation/blaze-fireballs";
import {World} from "../src/world/world";
import {bodyBox} from "../src/simulation/physics";
import {itemId} from "../src/catalog/items";
const kind="blaze" as MobKind;
it("has a distinct hostile flying Blaze and never invokes the old melee profile",()=>{
 expect(Object.values(MOB_SPECS).find(s=>s.kind===kind)?.maxHealth).toBe(20);const b=createMob(1,kind,{x:.5,y:60,z:.5});expect(mobAttack(b,{...b.position},1)).toBe(0);
});
it("flies in real collision space and cold-roundtrips its attack phase",()=>{
 const b=createMob(1,kind,{x:.5,y:60,z:.5});for(let i=0;i<60;i++)stepMob(()=>0,b,1/60,()=>.5,{x:5,y:62,z:.5});expect(b.position.y).toBeGreaterThan(60);expect(b.onGround).toBe(false);const raw=mobSnapshot(b);expect(restoreMobSnapshot(raw)).toMatchObject({kind,position:b.position});
});
it("resolves the retained credited0..1 Rod range and never rolls environment loot",()=>{
 expect(mobDrops(kind,()=>0,"player")).toEqual([]);expect(mobDrops(kind,()=>1,"player")).toEqual([{id:itemId("blaze_rod"),count:1}]);let calls=0;expect(mobDrops(kind,()=>{calls++;return 1;},"environment")).toEqual([]);expect(calls).toBe(0);
});
it("emits an actual saved projectile and returns a real swept player impact",()=>{
 const w=new World(7,1,"nether");for(let x=0;x<8;x++)for(let y=59;y<63;y++)for(let z=0;z<2;z++)w.setBlock(x,y,z,0);const f=new BlazeFireballs(w);expect(f.trySpawn(1,{x:.5,y:60.8,z:.5},{x:1,y:0,z:0})).toBe(true);expect(f.exportState().records).toHaveLength(1);f.update(.5,bodyBox({x:3.5,y:60,z:.5}));expect(f.drainImpacts()).toHaveLength(1);expect(f.exportState().records).toEqual([]);
});
it("keeps Blaze combat phase strict and detached while ordinary mob snapshots stay unchanged",()=>{
 const b=createMob(1,kind,{x:.5,y:60,z:.5}),saved=mobSnapshot(b);expect(saved.blazeState).toEqual({attackSeconds:2,hoverSeconds:0});for(const state of [undefined,null,{attackSeconds:-1,hoverSeconds:0},{attackSeconds:2,hoverSeconds:0,inventory:[]},{attackSeconds:NaN,hoverSeconds:0}])expect(()=>restoreMobSnapshot({...saved,blazeState:state as typeof saved.blazeState})).toThrow();expect(()=>restoreMobSnapshot({...saved,inventory:[]} as unknown as typeof saved)).toThrow();
 const cold=restoreMobSnapshot(saved);cold.blazeState!.attackSeconds=1;expect(saved.blazeState?.attackSeconds).toBe(2);const pig=mobSnapshot(createMob(2,"pig",{x:0,y:80,z:0}));expect(pig).not.toHaveProperty("blazeState");
});
it("Blaze damage rules reject Fire/Lava and invalid combat without granting health",()=>{
 const b=createMob(1,kind,{x:.5,y:60,z:.5});for(const cause of ["fire","lava"] as const)expect(damageMob(b,3,0,cause)).toBe(false);expect(b.health).toBe(20);
 for(const amount of [NaN,Infinity,-1,0]){damageMob(b,amount,0);expect(b.health).toBe(20);}damageMob(b,3,0);expect(b.health).toBe(17);
});
