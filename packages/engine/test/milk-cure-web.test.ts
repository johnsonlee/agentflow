import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Inventory, MobLootResolver, blockId, createHunger, createMob, freshStack, mobSnapshot, parseSave, stackId } from "../src";
import { Game } from "../../../apps/web/src/application/game";
import { MobManager } from "../../../apps/web/src/simulation/mobs";
import { buildCowModel } from "../../../apps/web/src/rendering/cow-model";
import { Hud, InventoryScreen } from "../../../apps/web/src/ui/hud";
class Cell {
  children: Cell[] = []; hidden = false; style = {}; dataset: Record<string, string> = {}; classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() }; className = ""; textContent = ""; listeners = new Map<string, ((e: unknown) => void)[]>();
  append(...e: Cell[]) { this.children.push(...e); } prepend(...e: Cell[]) { this.children.unshift(...e); } appendChild(e: Cell) { this.children.push(e); return e; }
  setAttribute() {} addEventListener(name: string, fn: (e: unknown) => void) { this.listeners.set(name, [...this.listeners.get(name) ?? [], fn]); } click() {} remove() {}
}
function game(cells: Record<string, number> = {}) {
  const g = Object.assign(Object.create(Game.prototype), { statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] }), ownership = () => ({ busy: false, records: [], reconcileLoadedReferences: vi.fn(), validateCrossReferences: vi.fn() });
  Object.assign(g, { inventory: new Inventory(), hunger: createHunger(), playerStatus: {}, recoverySections: [], recoveryOriginal: null, drinkOwner: null, leashes: ownership(), balloons: ownership(),
    paused: false, dead: false, stopped: false, running: true, touch: true, mode: "survival", health: 20, world: { composters: {busy:false,loadIssues:[],isDisposed:false}, getBlock: (x: number, y: number, z: number) => cells[`${x},${y},${z}`] ?? 0, setBlock: vi.fn() },
    body: { position: { x: .5, y: 32, z: .5 }, yaw: 0, pitch: 0, velocity: { x: 0, y: 0, z: 0 } }, mobs: { mobs: [], raycast: () => null }, mobLoot: new MobLootResolver(),
    hud: { message: vi.fn(), flashDamage: vi.fn() }, keyboard: { reset: vi.fn() }, screenOpen: () => false, placeCooldown: 0, creativeCooldown: 0, attackCooldown: 0, eatTimer: 0,
    redstone: { interact: () => false }, openInventory: vi.fn(), openNpcDialog: vi.fn(), markLeashRecovery: vi.fn(), markBalloonRecovery: vi.fn(), leashContext: () => ({}), name: "Milk recovery", savePayload: vi.fn(() => '{"version":1}') });
  return g;
}
function cowTarget(g: ReturnType<typeof game>, distance = 1) { const cow = createMob(1, "cow", { x: .5, y: 32, z: -1 }); g.mobs.mobs = [cow]; g.mobs.raycast = () => ({ mob: cow, distance }); return cow; }
const hold = (g: ReturnType<typeof game>, dt: number) => g.interact(false, false, true, false, dt);
beforeEach(() => vi.stubGlobal("document", { createElement: () => new Cell(), pointerLockElement: null }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); (Game as unknown as { activeWriter: Game | null }).activeWriter = null; });
it("actual place-edge milks a reachable live adult once without cow/world injury or implicit extra owner", () => {
  const g = game(), cow = cowTarget(g); g.inventory.setSlot(0, freshStack(stackId("bucket"), 2)); const originalCow = JSON.stringify(cow);
  g.interact(false, true, false, false, .01); expect(g.inventory.slots[0]).toEqual({ id: stackId("bucket"), count: 1 }); expect(g.inventory.slots[1]).toEqual({ id: stackId("milk_bucket"), count: 1 }); expect(JSON.stringify(cow)).toBe(originalCow); expect(g.world.setBlock).not.toHaveBeenCalled();
  const before = JSON.stringify(g.inventory.toJSON()); hold(g, 2); expect(JSON.stringify(g.inventory.toJSON())).toBe(before);
});
it("actual milking refuses walls, closer balloons/NPCs, unsupported or pending-death cows and invalid reach", () => {
  const wall = game({ "0,33,-1": blockId("stone") }); cowTarget(wall, 3); wall.inventory.setSlot(0, freshStack(stackId("bucket"))); wall.interact(false, true, false, false, .01); expect(wall.inventory.selectedStack().id).toBe(stackId("bucket"));
  const balloon = game(); cowTarget(balloon, 2); balloon.balloons.records = [{ key: 1, phase: "active", position: { x: .5, y: 33.4, z: -.5 } }]; balloon.inventory.setSlot(0, freshStack(stackId("bucket"))); balloon.interact(false, true, false, false, .01); expect(balloon.inventory.selectedStack().id).toBe(stackId("bucket"));
  const npc = game(); npc.mobs.raycast = () => ({ mob: createMob(2, "npc", { x: .5, y: 32, z: -1 }), distance: 1 }); npc.inventory.setSlot(0, freshStack(stackId("bucket"))); npc.interact(false, true, false, false, .01); expect(npc.openNpcDialog).toHaveBeenCalledOnce(); expect(npc.inventory.selectedStack().id).toBe(stackId("bucket"));
  for (const defect of ["baby", "dead", "duplicate", "NaN", "far", "pending-empty"]) {
    const g = game(), cow = cowTarget(g, defect === "far" ? 6 : 1); g.inventory.setSlot(0, freshStack(stackId("bucket")));
    if (defect === "baby") (cow as unknown as {cowState:{lifeStage:string}}).cowState = { lifeStage: "baby" }; if (defect === "dead") cow.health = 0; if (defect === "duplicate") g.mobs.mobs.push({ ...cow }); if (defect === "NaN") cow.position.x = NaN;
    if (defect === "pending-empty") vi.spyOn(g.mobLoot, "exportPending").mockReturnValue([]);
    g.interact(false, true, false, false, .01); expect(g.inventory.selectedStack().id).toBe(stackId("bucket"));
  }
  const pig = game(); pig.mobs.raycast = () => ({ mob: createMob(3, "pig", { x: .5, y: 32, z: -1 }), distance: 1 }); pig.inventory.setSlot(0, freshStack(stackId("bucket"))); pig.interact(false, true, false, false, .01); expect(pig.inventory.selectedStack().id).toBe(stackId("bucket"));
});
it("actual full-bag stacked milking refuses atomically, singleton succeeds in both finite-owner modes", () => {
  for (const mode of ["survival", "creative"]) {
    const g = game(); g.mode = mode; cowTarget(g); for (let i = 0; i < 36; i++) g.inventory.setSlot(i, freshStack(stackId("coal"), 64)); g.inventory.setSlot(0, freshStack(stackId("bucket"), 2));
    const before = JSON.stringify(g.inventory.toJSON()); g.interact(false, true, false, false, .01); expect(JSON.stringify(g.inventory.toJSON())).toBe(before); expect(g.hud.message).toHaveBeenCalledWith("Make room for a Milk Bucket before milking.");
    g.placeCooldown = 0; g.inventory.setSlot(0, freshStack(stackId("bucket"))); g.interact(false, true, false, false, .01); expect(g.inventory.selectedStack()).toEqual({ id: stackId("milk_bucket"), count: 1 });
  }
});
it("actual full-food held Milk cure waits1.6s and atomically clears Poison while returning a bucket without healing or food", () => {
  const g = game(); g.inventory.setSlot(0, freshStack(stackId("milk_bucket"))); g.playerStatus = { poison: { remaining: 4, elapsed: .2 } }; const before = JSON.stringify(g.hunger);
  hold(g, 1.59); expect(g.playerStatus.poison).toBeDefined(); expect(g.inventory.selectedStack().id).toBe(stackId("milk_bucket")); hold(g, .01);
  expect(g.playerStatus).toEqual({}); expect(g.inventory.selectedStack()).toEqual({ id: stackId("bucket"), count: 1 }); expect(g.health).toBe(20); expect(JSON.stringify(g.hunger)).toBe(before);
  cowTarget(g); hold(g, 2); expect(g.inventory.selectedStack().id).toBe(stackId("bucket"));
});
it("actual invalid/refused Milk cure leaves both status and source unchanged, and water never borrows partial Milk time or cures", () => {
  for (const defect of ["count", "status", "locked-slot"]) {
    const g = game(); g.inventory.setSlot(0, freshStack(stackId("milk_bucket"))); g.playerStatus = { poison: { remaining: 4, elapsed: .2 } };
    if (defect === "count") g.inventory.slots[0]!.count = 2; if (defect === "status") g.playerStatus.poison!.elapsed = 2; if (defect === "locked-slot") Object.defineProperty(g.inventory.slots, "0", { writable: false });
    const before = JSON.stringify([g.inventory.toJSON(), g.playerStatus]); hold(g, 1.6); expect(JSON.stringify([g.inventory.toJSON(), g.playerStatus])).toBe(before);
  }
  const g = game(); g.inventory.setSlot(0, freshStack(stackId("water_bottle"))); g.playerStatus = { poison: { remaining: 4, elapsed: .2 } }; hold(g, 1); g.inventory.slots[0]!.id = stackId("milk_bucket"); hold(g, .7); expect(g.playerStatus.poison).toBeDefined(); expect(g.inventory.selectedStack().id).toBe(stackId("milk_bucket")); hold(g, .9); expect(g.playerStatus).toEqual({});
  const water = game(); water.inventory.setSlot(0, freshStack(stackId("water_bottle"))); water.playerStatus = { poison: { remaining: 4, elapsed: .2 } }; hold(water, 1.6); expect(water.playerStatus.poison).toEqual({ remaining: 4, elapsed: .2 });
});
it("raw Cow adult corruption has accurate action feedback, preserves original bytes and does not trust spoofed derived flags", async () => {
  const cow = createMob(1, "cow", { x: .5, y: 32, z: -1 }), snapshot = mobSnapshot(cow); const original = `\n${JSON.stringify({ version: 1, name: "Cow", seed: 7, mode: "survival", timeOfDay: .2, player: { position: { x: .5, y: 32, z: .5 }, yaw: 0, pitch: 0 }, inventory: new Inventory().toJSON(), edits: [], mobs: { nextId: 2, records: [{ ...snapshot, cowState: { lifeStage: "baby" } }] } }, null, 2)}\n`;
  const storage = { getItem: vi.fn(() => original), setItem: vi.fn() }; vi.stubGlobal("localStorage", storage); const parsed = parseSave(original); expect(parsed.cowStateInvalid).toBe(true); const g = game(); g.markCowRecovery(parsed);
  expect(g.recoveryOriginal).toBe(original); expect(g.runChat("/give bucket")).toBe("Damaged adult cows. Export a backup before using commands"); expect(g.giveHeldToAgent()).toBe("Damaged adult cows. Export a backup before moving items"); expect(g.teleportAgent()).toBe(false);
  g.deathState = { phase: "pending" }; expect(g.tryDeathTransfer()).toBe(false); expect(g.deathError).toContain("Damaged adult cows");
  (Game as unknown as { activeWriter: Game | null }).activeWriter = g; expect(g.save()).toBe(false); expect(storage.setItem).not.toHaveBeenCalled(); expect(g.savePayload).not.toHaveBeenCalled();
  let backup: Blob | undefined; vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { backup = blob as Blob; return "blob:cow"; }); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); vi.useFakeTimers(); g.exportSaveBackup(); expect(JSON.parse(await backup!.text()).recoveryOriginalSave).toBe(original);
  const clean = JSON.parse(original); clean.mobs.records[0] = snapshot; clean.cowStateInvalid = true; expect(parseSave(JSON.stringify(clean)).cowStateInvalid).not.toBe(true);
});
it("raw Milk count corruption joins saved-item recovery before any item repair", () => {
  const original = JSON.stringify({ version: 1, name: "Milk", seed: 1, mode: "survival", player: { position: { x: .5, y: 32, z: .5 } }, inventory: { ...new Inventory().toJSON(), slots: [{ id: stackId("milk_bucket"), count: 2 }, ...Array(35).fill(null)] }, edits: [] }); vi.stubGlobal("localStorage", { getItem: () => original });
  const parsed = parseSave(original); expect(parsed.bucketOwnershipIssues?.length).toBeGreaterThan(0); const g = game(); g.markBucketRecovery(parsed); expect(g.recoverySections).toEqual(["saved items"]); expect(g.recoveryOriginal).toBe(original);
});
it("the original adult Cow model has four animated legs, horns/udder/face and nearest pixel textures", () => {
  const model = buildCowModel(), meshes: THREE.Mesh[] = []; model.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
  expect(model.userData.adultCowModel).toBe(true); expect(meshes.filter(m => m.userData.leg !== undefined)).toHaveLength(4); expect(meshes.filter(m => m.name === "horn")).toHaveLength(2); expect(meshes.some(m => m.name === "udder")).toBe(true);
  const bounds = new THREE.Box3().setFromObject(model); expect(bounds.max.y).toBeCloseTo(1.3); expect(bounds.min.y).toBeCloseTo(0);
  const material = (meshes[0].material as THREE.MeshBasicMaterial); expect(material.map).toBeInstanceOf(THREE.DataTexture); expect(material.map!.magFilter).toBe(THREE.NearestFilter);
});
it("actual Cow spawn method enforces grass/light/loaded/body/population and ID bounds without consuming old random streams", () => {
  const get = (x: number, y: number, z: number) => y === 31 ? blockId("grass") : 0;
  const world = { onBlockChanged: () => () => {}, generator: { heightAt: () => 31 }, getLoadedBlock: get, getBlock: get, getLight: () => 240 };
  const manager = new MobManager(world as never, new THREE.Scene()) as unknown as { spawnCowNear(p: { x: number; y: number; z: number }, daylight: number): void; mobs: ReturnType<typeof createMob>[]; seed: number; aquaticSeed: number; nextId: number };
  const before = [manager.seed, manager.aquaticSeed]; manager.spawnCowNear({ x: 0, y: 32, z: 0 }, 1); expect(manager.mobs.length).toBeGreaterThanOrEqual(2); expect(manager.mobs.every(m => m.kind === "cow" && m.cowState?.lifeStage === "adult")).toBe(true); expect([manager.seed, manager.aquaticSeed]).toEqual(before);
  for (let i = 0; i < 8; i++) manager.spawnCowNear({ x: 0, y: 32, z: 0 }, 1); expect(manager.mobs.length).toBeLessThanOrEqual(4);
  const darkWorld = { ...world, getLight: () => 0 }; const dark = new MobManager(darkWorld as never, new THREE.Scene()) as unknown as typeof manager; dark.spawnCowNear({ x: 0, y: 32, z: 0 }, 0); expect(dark.mobs).toEqual([]);
  const boundary = new MobManager(world as never, new THREE.Scene()) as unknown as typeof manager; boundary.nextId = Number.MAX_SAFE_INTEGER - 1; expect(() => boundary.spawnCowNear({ x: 0, y: 32, z: 0 }, 1)).not.toThrow(); expect(boundary.mobs).toHaveLength(1);
  for (const invalid of [undefined, blockId("stone")]) {
    const absentGrass = new MobManager({ ...world, getLoadedBlock: () => invalid } as never, new THREE.Scene()) as unknown as typeof manager;
    absentGrass.spawnCowNear({ x: 0, y: 32, z: 0 }, 1); expect(absentGrass.mobs).toEqual([]);
  }
  const blocked = new MobManager({ ...world, getLoadedBlock: (_x: number, y: number) => y === 31 ? blockId("grass") : blockId("stone") } as never, new THREE.Scene()) as unknown as typeof manager;
  blocked.spawnCowNear({ x: 0, y: 32, z: 0 }, 1); expect(blocked.mobs).toEqual([]);
  const capped = new MobManager(world as never, new THREE.Scene()) as unknown as typeof manager;
  for (let i = 0; i < 12; i++) capped.mobs.push(createMob(i + 1, "pig", { x: i, y: 32, z: 0 })); capped.spawnCowNear({ x: 0, y: 32, z: 0 }, 1); expect(capped.mobs).toHaveLength(12);
});
it("actual inventory capture guard displays the Cow-specific recovery notice without moving items", () => {
  const ui = new InventoryScreen(new Cell() as unknown as HTMLElement, {} as never, vi.fn(), undefined, () => false, () => "Damaged adult cows. Export a backup before moving items.") as unknown as { root: Cell; render: ReturnType<typeof vi.fn>; closeHint: string };
  ui.render = vi.fn(); const preventDefault = vi.fn(), stopImmediatePropagation = vi.fn();
  ui.root.listeners.get("click")![0]({ target: { closest: () => null }, preventDefault, stopImmediatePropagation });
  expect(ui.closeHint).toBe("Damaged adult cows. Export a backup before moving items."); expect(preventDefault).toHaveBeenCalledOnce(); expect(stopImmediatePropagation).toHaveBeenCalledOnce();
});

it("actual Cow model removal disposes shared generated textures/materials once and every geometry", () => {
  const unsubscribe = vi.fn(), manager = new MobManager({ onBlockChanged: () => unsubscribe } as never, new THREE.Scene());
  const cow = manager.spawn("cow", { x: 0, y: 32, z: 0 });
  const model = (manager as unknown as { models: Map<number, THREE.Group> }).models.get(cow.id)!;
  const materials = new Set<THREE.MeshBasicMaterial>(), textures = new Set<THREE.Texture>(), geometries: THREE.BufferGeometry[] = [];
  model.traverse(o => { if (o instanceof THREE.Mesh) { geometries.push(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const mat = m as THREE.MeshBasicMaterial; materials.add(mat); if (mat.map) textures.add(mat.map); } } });
  const spies = [...materials, ...textures, ...geometries].map(resource => vi.spyOn(resource, "dispose")); manager.dispose();
  expect(unsubscribe).toHaveBeenCalledOnce(); spies.forEach(spy => expect(spy).toHaveBeenCalledOnce());
});

it("actual HUD pointerdown permits readonly saved-item inspection while mutations and medical/Cow/death recovery remain blocked", () => {
  for (const recovery of ["saved items", "player status", "adult cows", "dead"]) {
    const g = game(), original = " untouched original save "; const storage = { getItem: vi.fn(() => original), setItem: vi.fn() }; vi.stubGlobal("localStorage", storage);
    g.inventory.setSlot(0, freshStack(stackId("glow_stick"))); g.inventory.setSlot(1, freshStack(stackId("blue_sparkler"))); if (recovery === "dead") g.dead = true; else g.recoverySections = [recovery];
    g.recoveryOriginal = original; g.drinkOwner = { elapsed: .7 }; const before = JSON.stringify([g.inventory.slots, g.inventory.offhand, g.inventory.equipment]);
    const callbacks = { onSelectSlot: (slot: number) => g.selectHudHotbar(slot), onOpenInventory: vi.fn(), onPause: vi.fn(), onChat: vi.fn(), onCamera: vi.fn(), onPortfolio: vi.fn(), onCodeBuilder: vi.fn(), onShakeGlow: vi.fn(), onLightSparkler: vi.fn(), onSwapOffhand: vi.fn() };
    const hud = new Hud(new Cell() as unknown as HTMLElement, {} as never, callbacks, false) as unknown as { hotbar: Cell };
    hud.hotbar.children[1].listeners.get("pointerdown")![0]({ stopPropagation: vi.fn() });
    expect(g.inventory.selected).toBe(recovery === "saved items" ? 1 : 0); if (recovery === "saved items") expect(g.drinkOwner).toBeNull();
    expect(JSON.stringify([g.inventory.slots, g.inventory.offhand, g.inventory.equipment])).toBe(before); expect(g.tryLightSparkler()).toBe(false); expect(g.tryShakeSelectedGlow()).toBe(false); expect(storage.setItem).not.toHaveBeenCalled(); expect(g.recoveryOriginal).toBe(original);
  }
});
