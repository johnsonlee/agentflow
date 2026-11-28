import { expect, it } from "vitest";
import { readDimensionArchive } from "../src/persistence/dimension-save";
import { blockId } from "../src/catalog/blocks";
import { stackId } from "../src/catalog/items";
import { createFurnace } from "../src/crafting/smelting";
import { createMob } from "../src/simulation/entities";
import { mobSnapshot } from "../src/persistence/mob-save";
import { MobManager } from "../../../apps/web/src/simulation/mobs";

function world() {
  return { seed: 7, generatorVersion: 1, player: { position: { x: .5, y: 80, z: .5 }, yaw: 0, pitch: 0, flying: false }, edits: [] as number[][] };
}
function archive(inactive: unknown = world()) { return { version: 1, active: "overworld", inactive: { nether: inactive }, links: [] as unknown[] }; }
function fullWorld() {
  const mob = createMob(1, "pig", { x: 4.5, y: 80, z: 4.5 });
  const furnace = createFurnace(); furnace.input = { id: stackId("iron_ore"), count: 2 }; furnace.fuel = { id: stackId("coal"), count: 1 };
  return { ...world(),
    edits: [[8,80,8,blockId("furnace")],[10,80,8,blockId("chalkboard_slate")],[12,80,12,blockId("gravel")],[15,80,15,blockId("fire")],[15,79,15,blockId("stone")]],
    furnaces: [{ x: 8, y: 80, z: 8, state: furnace }],
    chalkboards: [{ x: 10, y: 80, z: 8, size: "slate", facing: 0, standing: true, text: "Archive", locked: false }],
    npcs: [], mobs: { nextId: 2, records: [mobSnapshot(mob)] },
    worldDrops: { nextKey: 2, records: [{ key: 1, stack: { id: blockId("stone"), count: 2 }, position: { x: 3, y: 80, z: 3 }, velocity: { x: 0, y: 0, z: 0 }, ageSeconds: 0, pickupDelaySeconds: .5 }] },
    leashes: { version: 1, nextKey: 2, records: [{ key: 1, targetMobId: 1, anchor: { kind: "player" }, phase: "active", lastPosition: { ...mob.position } }] },
    balloons: { version: 1, nextKey: 2, records: [{ key: 1, itemId: stackId("white_balloon"), target: { kind: "mob", mobId: 1 }, phase: "active", position: { x: 4.5, y: 82, z: 4.5 }, velocity: { x: 0, y: 0, z: 0 }, lastAnchor: { ...mob.position } }] },
    snowballProjectiles: { version: 1, nextKey: 2, records: [{ key: 1, position: { x: 20, y: 80, z: 20 }, velocity: { x: 1, y: 0, z: 0 }, ageSeconds: .3 }] },
    farming: { version: 1, tick: 0, accumulator: 0, cursor: 0 }, redstone: [],
    fire: { version: 1, records: [{ x: 15, y: 80, z: 15, remaining: 12 }], contactSeconds: .25 },
    fluids: { version: 1, contactSeconds: 0 },
    gravelHarvests: { version: 1, records: [{ x: 12, y: 80, z: 12, flint: true }] },
  };
}
function refused(raw: unknown, active: unknown = world(), path?: string) {
  const result = readDimensionArchive(raw, active);
  expect(result.kind).toBe("invalid");
  expect(result).not.toHaveProperty("data");
  if (result.kind === "invalid" && path) expect(result.issues.some(i => i.path.includes(path)), JSON.stringify(result.issues)).toBe(true);
}
it("leaves legacy absent archives absent without reading active-world getters", () => {
  let reads = 0; const active = { get seed() { reads++; throw Error("not read"); } };
  expect(readDimensionArchive(undefined, active)).toEqual({ kind: "absent" }); expect(reads).toBe(0);
});
it("accepts minimal worlds, excludes global bags from projection, and deep-copies inactive owners", () => {
  const raw = archive(), before = structuredClone(raw), active = { ...world(), inventory: { impossible: true }, agent: {} };
  const result = readDimensionArchive(raw, active); expect(result.kind).toBe("valid"); expect(raw).toEqual(before);
  if (result.kind === "valid") { expect(result.data).toEqual(raw); result.data.inactive.nether!.edits.push([1,2,3,1]); expect(raw.inactive.nether).toEqual(before.inactive.nether); }
});
it("preserves every supported nonempty archived owner without normalization", () => {
  const saved = fullWorld(), raw = archive(saved), before = structuredClone(raw);
  expect(readDimensionArchive(raw, saved)).toEqual({ kind: "valid", data: raw }); expect(raw).toEqual(before);
});
it.each([1001,1024,-101])("accepts a real modern NPC snapshot and current serializer mirror at y%s", y=>{
  const npc=createMob(1,"npc",{x:4.5,y,z:4.5},{name:"Guide",dialogue:"World-owned NPC"});
  const manager=Object.assign(Object.create(MobManager.prototype) as MobManager,{mobs:[npc]});
  const saved={...world(),mobs:{nextId:2,records:[mobSnapshot(npc)]},npcs:manager.exportNpcs()};
  expect(readDimensionArchive(archive(saved),world())).toEqual({kind:"valid",data:archive(saved)});
  // The redundant compatibility cache cannot justify accepting a different owner.
  saved.npcs[0].name="Different";refused(archive(saved),world(),"npcs");
});
it("keeps legacy-only NPC bounds strict when no validated modern actor justifies its mirror",()=>{
  refused(archive({...world(),npcs:[{x:4.5,y:1001,z:4.5,yaw:0,name:"Guide",dialogue:"World-owned NPC"}]}),world(),"npcs");
});
it.each(["inventory", "inventoryPending", "agent", "playerState", "playerStatus", "unknown"])("refuses foreign inactive owner %s", name => {
  refused(archive({ ...world(), [name]: {} }), world(), name);
});
it.each(["seed", "player", "edits"])("refuses missing inactive required owner %s", name => {
  const saved = world(); Reflect.deleteProperty(saved, name); refused(archive(saved), world(), name);
});
it.each([0,2,3,NaN,"2",null])("refuses unsupported generator %s", generatorVersion => refused(archive({ ...world(), generatorVersion }), world(), "generatorVersion"));
it("checks active world and all inactive worlds before returning any usable state", () => {
  refused(archive(), { ...world(), edits: [[1,2,3,999999]] }, "edits");
  refused({ ...archive(), inactive: { nether: world(), overworld: world() } }, world(), "overworld");
  refused({ ...archive(), inactive: { moon: world() } }, world(), "moon");
});
it("rejects duplicate edits, sparse arrays, and unknown physical blocks", () => {
  refused(archive({ ...world(), edits: [[1,2,3,1],[1,2,3,0]] }), world(), "edits");
  refused(archive({ ...world(), edits: new Array(1) }), world(), "edits");
  refused(archive({ ...world(), edits: [[1,2,3,999999]] }), world(), "edits");
});
it("refuses getters/nonenumerable/symbol/extended/cyclic data without calling saved accessors", () => {
  let reads = 0; const getter = world(); Object.defineProperty(getter, "seed", { enumerable: true, get() { reads++; return 7; } }); refused(archive(getter)); expect(reads).toBe(0);
  const hidden = world(); Object.defineProperty(hidden, "seed", { value: 7, enumerable: false }); refused(archive(hidden));
  refused(archive({ ...world(), [Symbol("owner")]: [] }));
  const extended = world(); Object.assign(extended.edits, { owner: 1 }); refused(archive(extended));
  const cyclic: Record<string, unknown> = world(); cyclic.loop = cyclic; refused(archive(cyclic));
});
it.each(["npcs","chalkboards","furnaces","redstone","farming","fire","fluids","portals","gravelHarvests","worldDrops","mobs","leashes","balloons","snowballProjectiles"])("refuses malformed present %s instead of silently dropping it", name => {
  refused(archive({ ...world(), [name]: { invalidOwner: true } }), world(), name);
});
it("refuses hidden physical portal inventory owners in furnace output and dropped stacks", () => {
  const saved = fullWorld(); saved.furnaces[0].state.output = { id: 192, count: 1 }; refused(archive(saved), world(), "furnaces");
  const dropped = fullWorld(); dropped.worldDrops.records[0].stack.id = 193; refused(archive(dropped), world(), "worldDrops");
});
it("requires physical furnace, chalkboard, cached Gravel and Fire support owners", () => {
  for (const [id, path] of [[blockId("furnace"),"furnaces"],[blockId("chalkboard_slate"),"chalkboards"],[blockId("gravel"),"gravelHarvests"],[blockId("stone"),"fire"]] as const) {
    const saved = fullWorld(); saved.edits = saved.edits.filter(e => e[3] !== id); refused(archive(saved), world(), path);
  }
});
it("refuses dangling active mob attachments while preserving pending refunds", () => {
  const saved = fullWorld(); saved.mobs.records = []; refused(archive(saved), world(), "leashes");
  const pending = fullWorld(); pending.mobs.records = [];
  Object.assign(pending.leashes.records[0], { phase: "refund-pending", reason: "actor-removed" });
  Object.assign(pending.balloons.records[0], { phase: "refund-pending", reason: "actor-removed" });
  expect(readDimensionArchive(archive(pending), world()).kind).toBe("valid");
});
it("uses only primitive generated probes, honors edited cells and refuses unknown/throwing references", () => {
  const saved = { ...world(), gravelHarvests: { version: 1, records: [{x:12,y:80,z:12,flint:true}] } }, calls: unknown[][] = [];
  const result = readDimensionArchive(archive(saved), world(), (...args) => { calls.push(args); return blockId("gravel"); });
  expect(result.kind).toBe("valid"); expect(calls).toEqual([["nether",7,1,12,80,12]]);
  expect(readDimensionArchive(archive(saved), world(), () => { throw Error("unknown"); }).kind).toBe("invalid");
  expect(readDimensionArchive(archive({ ...saved, edits: [[12,80,12,0]] }), world(), () => blockId("gravel")).kind).toBe("invalid");
});
it("caches one generated cell shared by Fire support and a cached Gravel source", () => {
  const saved = { ...world(), edits: [[15,80,15,blockId("fire")]], fire: {version:1,records:[{x:15,y:80,z:15,remaining:12}],contactSeconds:0}, gravelHarvests: {version:1,records:[{x:15,y:79,z:15,flint:false}]} };
  const calls: unknown[][] = [];
  expect(readDimensionArchive(archive(saved),world(),(...args)=>{calls.push(args);return blockId("gravel");}).kind).toBe("valid");
  expect(calls.filter(c=>c[4]===79)).toEqual([["nether",7,1,15,79,15]]);
  expect(calls.filter(c=>c[4]===81)).toEqual([["nether",7,1,15,81,15]]); // Natural Wart support above an edited source is checked separately.
});
it("keeps validated snapshots detached when the generated-block callback mutates original inputs", () => {
  const saved = { ...world(), gravelHarvests: {version:1,records:[{x:12,y:80,z:12,flint:true}]} }, raw = archive(saved), active = world(), expected = structuredClone(raw);
  const result = readDimensionArchive(raw,active,()=>{ saved.seed=99; saved.edits.push([12,80,12,0]); active.player.position.x=999; raw.links.push({invented:true}); return blockId("gravel"); });
  expect(result).toEqual({kind:"valid",data:expected});
  if(result.kind==="valid") { result.data.inactive.nether!.player.position!.x=101; expect(saved.player.position.x).toBe(.5); }
});
it("preserves a valid legacy zero-progress furnace binding rather than silently erasing it", () => {
  const saved = fullWorld(); saved.furnaces[0].state.progressInputId=stackId("iron_ore");
  expect(readDimensionArchive(archive(saved),world())).toEqual({kind:"valid",data:archive(saved)});
  saved.furnaces[0].state.progressInputId=stackId("stick"); refused(archive(saved),world(),"furnaces");
});
it.each([null,[],{}, {version:2,active:"overworld",inactive:{},links:[]}, {version:1,active:"moon",inactive:{},links:[]}, {...archive(),extra:[]}, {...archive(),links:{}}])("refuses a malformed archive envelope", raw=>refused(raw));
it("rejects malformed active data descriptors without touching unrelated global getters", () => {
  let globalReads=0,worldReads=0; const active=world();
  Object.defineProperty(active,"inventory",{enumerable:true,get(){globalReads++;throw Error("global");}});
  expect(readDimensionArchive(archive(),active).kind).toBe("valid");expect(globalReads).toBe(0);
  Object.defineProperty(active,"edits",{enumerable:true,get(){worldReads++;return [];}});
  refused(archive(),active,"edits");expect(worldReads).toBe(0);expect(globalReads).toBe(0);
});

function portalWorld(axis: "x" | "z") {
  const saved = world(), portal = { axis, x: 30, y: 80, z: 30, width: 2, height: 3 };
  const cell = (u: number,v: number,id: number) => [30+(axis==="x"?u:0),80+v,30+(axis==="z"?u:0),id];
  for (let v=0;v<3;v++) for(let u=0;u<2;u++) saved.edits.push(cell(u,v,axis==="x"?192:193));
  for(let u=0;u<2;u++) saved.edits.push(cell(u,-1,blockId("obsidian")),cell(u,3,blockId("obsidian")));
  for(let v=0;v<3;v++) saved.edits.push(cell(-1,v,blockId("obsidian")),cell(2,v,blockId("obsidian")));
  return { ...saved, portals: { version:1, records:[portal] } };
}
it("validates cross-realm linked frames and refuses dangling, same-realm, duplicate and reverse links", () => {
  const over = portalWorld("x"), nether = portalWorld("z"), raw = archive(nether);
  const from = { dimension: "overworld", portal: over.portals.records[0] }, to = { dimension: "nether", portal: nether.portals.records[0] };
  raw.links = [{from,to}]; expect(readDimensionArchive(raw,over)).toEqual({kind:"valid",data:raw});
  refused({...raw,links:[{from,to:{...to,portal:{...to.portal,x:31}}}]},over,"links");
  refused({...raw,links:[{from,to:from}]},over,"links");
  refused({...raw,links:[{from,to},{from,to}]},over,"links");
  refused({...raw,links:[{from,to},{from:to,to:from}]},over,"links");
  const broken = structuredClone(nether); broken.edits.pop(); refused(archive(broken),over,"portals");
});
