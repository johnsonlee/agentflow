import {
  LeashStore, joinLeashRefundSink, type LeashContext, LEASH_PROFILE,
  SnowballProjectiles, tryThrowSnowball, bodyBox, boxIntersectsFences, type SnowballImpact, AIR, MAX_PLAYER_HEALTH, PlayerDeathTransfer, sanitizePlayerState, validatePlayerDeathOwnership, type PlayerDeathState, MobLootResolver, WorldDrops, type DropSink, type ItemStack, FarmingSystem, tillSoil, wheatAge, canBuildAt, skyDarken, ARMOR_SLOTS, applyArmorDamage, baseStackId, isItem, isKnownId, tryBlockById, COMMAND_HELP, MOB_SPECS, SEA_LEVEL, WORLD_HEIGHT, DAY_LENGTH, EYE_HEIGHT, Inventory, World, blockAtEyes, blockById, blockId, breakBlock, displayNameOf, toolOf,
  breakTime, canBreak, createPlayerBody, creativeBlocks, lookDirection, parseCommand, placeBlock, raycast,
  sanitizeInventoryPending, serializeSave, skyAt, stepPlayer, toChunkCoord, type GameMode, type Mob, type PlayerBody, type RaycastHit, type SaveData,
  EAT_SECONDS, EXHAUSTION, addExhaustion, canEat, createFurnace, createHunger, eat, furnaceContents, tickFurnace,
  tickHunger, knockbackFrom, mobAttack, findSummonSpot, canPlaceChalkboard, chalkboardCells, chalkboardKey, chalkboardSizeOf,
  facingTowards, findAgentPosition, useLabProduct, Redstone, sanitizeScheduled, isWritableBook, isWrittenBook, stackId, type Chalkboard, ProgramRunner, createAgent, runAgentCommand,
  type AgentState, type CodeProgram, giveAgent, maxStackOf, loadPrograms, startProgram, type AgentCommand,
  clampPosition, sanitizeMobState, sanitizeAgent, sanitizeChalkboards, sanitizeEdits, sanitizeFurnaces, sanitizeHunger, sanitizeNpcs, type FurnaceState, type HungerState,
} from "@craft/engine";
import { KeyboardMouseInput, TouchControls, mergeFrames } from "@craft/input";
import type { TextureAtlas } from "@craft/textures";
import { ChatInput, Hud, InventoryScreen, type ChemistryKind, type InventoryKind } from "./hud";
import { MobManager } from "./mobs";
import { BookScreen, ChalkboardDialog, NpcDialog, Portfolio, PortfolioScreen } from "./screens";
import { ChalkboardViews } from "./chalkboards";
import { AgentView } from "./agentView";
import { CodeBuilderScreen } from "./codeBuilder";
import { WorldRenderer } from "./renderer";
import { WorldDropsView } from "./worldDropsView";
import { SnowballProjectilesView } from "./snowballProjectilesView";
import { LeashView } from "./leash-view";

export const SAVE_KEY = "craft.save.v1";
const REACH = 5;
const MAX_HEALTH = MAX_PLAYER_HEALTH;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const CREATIVE_REPEAT = 0.25;
const CRAFTING_TABLE = blockId("crafting_table");
const FURNACE = blockId("furnace");
/** Chemistry station blocks and the screen each opens. */
const CHEMISTRY_STATIONS = new Map<number, ChemistryKind>(
  (["element_constructor", "compound_creator", "material_reducer", "lab_table"] as const).map((k) => [blockId(k), k]),
);

const SNOWBALL = stackId("snowball");
const LEAD = stackId("lead_rope");
const OAK_FENCE = blockId("oak_fence");
const GLOW_STICK = stackId("glow_stick");
const SUPER_FERTILIZER = stackId("super_fertilizer");
/** Light level of a held glow stick (as when placed). */
const HELD_GLOW_LIGHT = blockById(blockId("placed_glow_stick")).light ?? 0;

const furnaceKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
/** Seconds per Agent action (Education Edition animates each step). */
export const AGENT_STEP_SECONDS = 0.3;
const PROGRAM_TIMEOUT_SECONDS = 300;

export interface GameOptions {
  name: string;
  seed: number;
  mode: GameMode;
  touch: boolean;
  /** doMobSpawning game rule for new worlds (default true). */
  spawnAnimals?: boolean;
  save?: SaveData;
}

export interface GameEvents {
  onPause(): void;
  onDeath(): void;
}

/** Owns the world simulation, player, input and HUD for one play session. */
export class Game {
  private static activeWriter: Game | null = null;
  readonly snowballProjectiles: SnowballProjectiles;
  private readonly snowballProjectilesView: SnowballProjectilesView;
  private snowballImpacts: SnowballImpact[] = [];
  /** Bounded actual simulation outcomes for read-only diagnostics; detached from store/view ownership. */
  get recentSnowballImpacts(): readonly SnowballImpact[] { return structuredClone(this.snowballImpacts); }
  readonly leashes: LeashStore;
  private readonly leashView: LeashView;
  private readonly leashOriginalRaw: string | null;
  readonly worldDrops: WorldDrops;
  private readonly worldDropsView: WorldDropsView;
  saveError = "";
  deathError = "";
  private deathState: PlayerDeathState | undefined;
  private readonly deathTransfer = new PlayerDeathTransfer();
  private keepInventory = false;
  private recoveryOriginal: string | null = null;
  private recoverySections: string[] = [];
  private stopped = false;
  private readonly handleKey = (e: KeyboardEvent) => this.onKey(e);
  private readonly handleResize = () => { if (!this.stopped) this.resize(); };
  private readonly handlePageHide = () => { if (Game.activeWriter === this && !this.stopped) this.save(); };
  private readonly handlePointerLock = () => {
    if (this.keyboard.pointerLocked) this.hadPointerLock = true;
    else if (this.hadPointerLock && this.running && !this.screenOpen() && !this.dead) this.pause();
  };
  private readonly mobLoot = new MobLootResolver();
  private readonly dropSink: DropSink = (stacks, at, velocity) => this.worldDrops.planSpawnBatch(stacks, at, velocity);

  readonly world: World;
  readonly redstone: Redstone;
  readonly body: PlayerBody;
  readonly renderer: WorldRenderer;
  readonly hud: Hud;
  readonly mobs: MobManager;
  readonly portfolio = new Portfolio();
  inventory: Inventory;
  mode: GameMode;
  timeOfDay: number;
  health = MAX_HEALTH;
  /** Survival hunger (food bar, saturation, exhaustion). */
  hunger: HungerState;
  /** Furnace contents by block position ("x,y,z"); they keep smelting while the world runs. */
  readonly furnaces = new Map<string, FurnaceState>();
  /** Loaded-area crop hydration and growth; its scheduler is persisted with the world. */
  readonly farming: FarmingSystem;
  private openFurnace: string | null = null;
  /** Seconds the use button has been held on food. */
  private eatTimer = 0;
  private lastPos = { x: 0, z: 0 };
  paused = false;
  dead = false;
  fps = 0;
  /** Light level carried by the player this frame (a held glow stick), 0 = none. */
  heldLight = 0;

  private readonly name: string;
  private readonly keyboard: KeyboardMouseInput;
  private readonly touch: TouchControls | null;
  private readonly inventoryScreen: InventoryScreen;
  private readonly chat: ChatInput;
  private readonly portfolioScreen: PortfolioScreen;
  private readonly npcDialog: NpcDialog;
  private readonly chalkDialog: ChalkboardDialog;
  private readonly bookScreen: BookScreen;
  /** Chalkboards by anchor key, and each occupied cell -> its board's anchor key. */
  readonly chalkboards = new Map<string, Chalkboard>();
  private readonly chalkCells = new Map<string, string>();
  private readonly chalkViews: ChalkboardViews;
  /** Education Edition Agent and Code Builder programs. */
  agent: AgentState;
  programs: CodeProgram[];
  private readonly agentView: AgentView;
  private readonly codeBuilder: CodeBuilderScreen;
  private runner: ProgramRunner | null = null;
  private runnerName = "";
  private stepTimer = 0;
  private runnerStarted = 0;
  /** Problems found while loading the save (also shown as chat messages, which fade after 7 s). */
  loadErrors: string[] = [];
  private mobTarget: Mob | null = null;
  private attackCooldown = 0;
  private clock = 0;
  private daylightCycle = true;
  private readonly spawn: { x: number; y: number; z: number };
  private target: RaycastHit | null = null;
  private breakProgress = 0;
  private breakKey = "";
  private creativeCooldown = 0;
  private placeCooldown = 0;
  private fallStart: number | null = null;
  private lastTime = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private autosaveTimer = 0;
  private hadPointerLock = false;
  private running = false;
  private readonly root: HTMLElement;

  constructor(
    container: HTMLElement,
    atlas: TextureAtlas,
    options: GameOptions,
    private readonly events: GameEvents,
  ) {
    Game.activeWriter = this;
    this.root = document.createElement("div");
    this.root.className = "game";
    container.appendChild(this.root);
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    this.root.appendChild(canvas);

    const save = options.save;
    this.name = save?.name ?? options.name;
    this.world = new World(save?.seed ?? options.seed);
    if (save) this.world.importEdits(sanitizeEdits(save.edits));
    this.farming = new FarmingSystem(this.world, save?.farming);
    this.snowballProjectiles = new SnowballProjectiles(this.world, save?.snowballProjectiles);
    if (this.snowballProjectiles.loadIssues) { this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("snowball projectiles"); }
    this.worldDrops = new WorldDrops(this.world, save?.worldDrops);
    this.leashes = new LeashStore(save?.leashes);
    this.leashOriginalRaw = save?.leashes === undefined ? null : localStorage.getItem(SAVE_KEY);
    if (this.worldDrops.loadIssues) { this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("world drops"); }
    // Redstone: component states are blocks (in the edits); pending ticks are saved separately.
    this.redstone = new Redstone(this.world);
    if (save) this.redstone.restore(sanitizeScheduled(save.redstone), this.world.exportEdits());
    this.mode = save?.mode ?? options.mode;
    this.timeOfDay = save?.timeOfDay ?? 0.05;
    this.renderer = new WorldRenderer(canvas, this.world, atlas);
    this.worldDropsView = new WorldDropsView(this.renderer.scene, atlas, this.worldDrops);
    this.snowballProjectilesView = new SnowballProjectilesView(this.renderer.scene, atlas, this.snowballProjectiles);
    this.mobs = new MobManager(this.world, this.renderer.scene, (mob) => this.transferMobDeath(mob),
      (mob) => this.mobLoot.exportPending(mob) !== undefined,
      (mob) => this.leashes.protectsMob(mob.id), () => this.leashes.busy,
      (mob) => this.leashes.movementBias(mob, this.leashContext()));
    this.leashView = new LeashView(this.renderer.scene);
    const creatures = sanitizeMobState(save?.mobs);
    if (creatures.present) this.mobs.restore(creatures.data, this.mobLoot);
    else for (const npc of sanitizeNpcs(save?.npcs)) this.mobs.spawn("npc", npc, npc);
    if (creatures.invalid) {
      this.recoveryOriginal = localStorage.getItem(SAVE_KEY);
      this.recoverySections.push("creatures");
    }
    this.hunger = sanitizeHunger(save?.hunger) ?? createHunger();
    const furnaces = sanitizeFurnaces(save?.furnaces);
    for (const f of furnaces.furnaces) this.furnaces.set(furnaceKey(f.x, f.y, f.z), f.state);
    this.mobs.spawning = save?.gamerules?.doMobSpawning ?? options.spawnAnimals ?? true;
    this.daylightCycle = save?.gamerules?.doDaylightCycle ?? true;
    this.keepInventory = save?.gamerules?.keepInventory ?? false;
    const playerState = sanitizePlayerState(save?.playerState);
    this.health = playerState.data.health; this.deathState = playerState.data.death; this.dead = this.health === 0;
    if (playerState.invalid) {
      this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("player state");
    }

    this.spawn = this.findSpawn();
    this.body = createPlayerBody(save?.player.position ?? this.spawn);
    this.lastPos = { x: this.body.position.x, z: this.body.position.z };
    this.body.yaw = save?.player.yaw ?? 0;
    this.body.pitch = save?.player.pitch ?? 0;
    this.body.flying = save?.player.flying ?? false;
    this.inventory = save ? Inventory.fromJSON(save.inventory) : this.starterInventory();
    this.leashes.validateCrossReferences(this.leashContext());
    this.markLeashRecovery();
    if (this.dead && (save?.playerStateOwnershipInvalid || !validatePlayerDeathOwnership(save?.inventory, save?.inventoryPending))) {
      this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("player state");
    }

    this.keyboard = new KeyboardMouseInput(canvas, { mouseButtons: !options.touch });
    this.touch = options.touch ? new TouchControls(canvas, this.root) : null;
    this.hud = new Hud(this.root, atlas, {
      onSelectSlot: (slot) => { if (!this.dead) this.inventory.select(slot); },
      onOpenInventory: () => this.toggleInventory(),
      onPause: () => this.pause(),
      onChat: () => this.openChat(),
      onCamera: () => this.takePhoto(),
      onPortfolio: () => this.togglePortfolio(),
      onCodeBuilder: () => this.openCodeBuilder(),
    }, options.touch);
    this.inventoryScreen = new InventoryScreen(this.root, atlas, () => this.toggleInventory(), (stack) => this.dropStack(stack));
    this.chat = new ChatInput(this.root, (text) => this.runChat(text), () => this.resumeInput());
    this.portfolioScreen = new PortfolioScreen(this.root, this.portfolio, () => this.togglePortfolio());
    this.npcDialog = new NpcDialog(this.root, () => this.closeNpcDialog(), (mob) => this.mobs.refresh(mob));
    this.chalkDialog = new ChalkboardDialog(this.root, () => this.closeDialog(this.chalkDialog), (board) => this.chalkViews.update(board));
    this.bookScreen = new BookScreen(this.root, () => this.closeDialog(this.bookScreen));
    this.chalkViews = new ChalkboardViews(this.renderer.scene);
    const boards = sanitizeChalkboards(save?.chalkboards);
    for (const b of boards.boards) this.addChalkboard(b);
    this.agent = sanitizeAgent(save?.agent) ?? this.agentNearPlayer() ?? this.agentNearPlayer(this.spawn)
      ?? createAgent(this.spawn.x, this.spawn.y, this.spawn.z, facingTowards(this.body.yaw + Math.PI));
    // Saved programs are validated (a total function): invalid ones are dropped and reported.
    const loaded = loadPrograms(save?.programs);
    this.programs = loaded.programs;
    this.loadErrors = loaded.errors;
    if (this.leashes.loadIssues) this.loadErrors.push("Damaged leashes (original save preserved)");
    if (playerState.invalid) this.loadErrors.push("Damaged player state (original save preserved)");
    if (creatures.invalid) this.loadErrors.push(`${creatures.invalid} damaged creature entries (original save preserved)`);
    if (this.snowballProjectiles.loadIssues) this.loadErrors.push(`${this.snowballProjectiles.loadIssues} damaged snowball-projectile entries (original save preserved)`);
    if (this.worldDrops.loadIssues) this.loadErrors.push(`${this.worldDrops.loadIssues} damaged world-drop entries`);
    if (boards.dropped + furnaces.dropped > 0) this.loadErrors.push(`${boards.dropped + furnaces.dropped} damaged chalkboard/furnace entries`);
    this.agentView = new AgentView(this.renderer.scene, this.agent);
    this.codeBuilder = new CodeBuilderScreen(
      this.root,
      {
        programs: this.programs,
        run: (p) => this.runProgram(p),
        stop: () => this.stopProgram(),
        running: () => this.programRunning,
        giveHeldToAgent: () => this.giveHeldToAgent(),
        save: () => this.save(),
      },
      () => this.closeDialog(this.codeBuilder),
    );

    canvas.addEventListener("click", () => {
      if (!this.touch && !this.paused && !this.dead) this.keyboard.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", this.handlePointerLock);
    window.addEventListener("keydown", this.handleKey);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pagehide", this.handlePageHide);
    this.resize();
    if (this.inventoryScreen.restorePending(this.inventory, this.mode, sanitizeInventoryPending(save?.inventoryPending))) this.suspendInput();
    if (this.dead) {
      this.inventoryScreen.freezeForDeath(); this.suspendInput();
      if (this.deathState?.phase === "complete" && !this.deathState.keepInventory &&
          (this.inventory.slots.some(Boolean) || ARMOR_SLOTS.some(slot => this.inventory.equipment[slot]) || this.inventoryScreen.pendingItems().length > 0)) {
        this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("player state");
        this.loadErrors.push("Completed death still owns player items (original save preserved)");
      }
      if (this.deathState?.phase === "pending") this.deathError = "Items await transfer. Respawn retries it; your carried items remain preserved until then.";
    }

    if (this.portfolio.dropped > 0) this.loadErrors.push(`${this.portfolio.dropped} damaged portfolio photos`);
    for (const err of this.loadErrors) this.hud.message(`Saved data needs attention: ${err}`);
    this.hud.message(this.touch
      ? "Move with the left stick, drag to look, tap to place, hold to break."
      : "Click to play. WASD move, mouse look, left click break, right click place, E inventory, / commands.");
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): boolean {
    if (this.stopped) return true;
    if (!this.save()) return false;
    this.running = false; this.stopped = true;
    if (Game.activeWriter === this) Game.activeWriter = null;
    document.removeEventListener("pointerlockchange", this.handlePointerLock);
    window.removeEventListener("keydown", this.handleKey);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pagehide", this.handlePageHide);
    this.runner?.stop(); this.keyboard.dispose(); this.farming.dispose();
    this.snowballProjectilesView.dispose(); this.snowballProjectiles.dispose();
    this.leashView.dispose(); this.leashes.dispose();
    this.worldDropsView.dispose(); this.worldDrops.dispose(); this.mobs.dispose();
    this.agentView.dispose(); this.chalkViews.dispose();
    this.root.remove(); this.renderer.dispose();
    return true;
  }

  /** Requests a complete-world backup; requesting a download never bypasses failed browser storage. */
  exportSaveBackup(): void {
    if (this.leashes.busy) { this.hud.message("Items are being transferred. Retry the backup afterward."); return; }
    this.paused = true; this.keyboard.reset();
    this.leashes.reconcileLoadedReferences(this.leashContext()); this.markLeashRecovery();
    const payload = this.savePayload(true);
    const backup = this.recoveryOriginal === null ? payload : JSON.stringify({ ...JSON.parse(payload), recoveryOriginalSave: this.recoveryOriginal });
    const url = URL.createObjectURL(new Blob([backup], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${this.name.replace(/[^a-z0-9_-]/gi, "_") || "world"}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  pause(): void {
    if (this.paused || this.dead) return;
    this.paused = true;
    this.keyboard.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.save();
    this.events.onPause();
  }

  resume(): void {
    if (this.dead) return;
    this.paused = false;
    this.lastTime = performance.now();
    if (!this.touch) this.keyboard.requestPointerLock();
  }

  setMode(mode: GameMode): void {
    if (this.dead || this.leashes.busy) return;
    this.mode = mode;
    if (mode === "survival") this.body.flying = false;
    this.health = MAX_HEALTH;
    this.hud.message(`Game mode set to ${mode === "creative" ? "Creative" : "Survival"}`);
  }

  /** A failed item transfer keeps the same death overlay and all original owners. */
  respawn(): boolean {
    if (this.leashes.busy || !this.dead || !this.deathState || !this.tryDeathTransfer()) return false;
    this.dead = false; this.paused = false; this.deathState = undefined; this.deathError = "";
    this.health = MAX_HEALTH; this.hunger = createHunger();
    this.body.position = { ...this.spawn }; this.body.velocity = { x: 0, y: 0, z: 0 };
    this.fallStart = null; this.lastPos = { x: this.spawn.x, z: this.spawn.z }; this.lastTime = performance.now();
    if (this.inventoryScreen.resumePending()) this.suspendInput(); else this.resumeInput();
    return true;
  }

  private tryDeathTransfer(): boolean {
    if (this.leashes.busy || !this.deathState) return false;
    if (this.recoverySections.includes("player state")) { this.deathError = "Damaged player state. Export a backup and repair the saved data before respawning."; return false; }
    let validOwners = false;
    try { validOwners = validatePlayerDeathOwnership(this.inventory.toJSON(), this.inventoryScreen.pendingItems()); } catch { /* Retain uncloneable live ownership for recovery. */ }
    if (!validOwners) {
      this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
      this.recoverySections.push("player state");
      this.deathError = "Damaged player items. Export a backup and repair them before respawning.";
      return false;
    }
    let ok = false;
    try {
      ok = this.deathTransfer.tryTransfer(this.inventory, this.inventoryScreen.pendingItems(), this.deathState,
        this.dropSink, () => this.inventoryScreen.clearTransferredPending());
    } catch { ok = false; }
    this.deathError = ok ? "" : "Items could not be transferred. They remain safe here. Respawn retries the transfer; you can also export a backup.";
    return ok;
  }

  private leashContext(): LeashContext {
    return { mobs: this.mobs.mobs, player: this.body.position, getLoadedBlock: (x, y, z) => this.world.getLoadedBlock(x, y, z) };
  }

  private markLeashRecovery(): void {
    if (!this.leashes.loadIssues || this.recoverySections.includes("leashes")) return;
    this.recoveryOriginal ??= this.leashOriginalRaw ?? localStorage.getItem(SAVE_KEY);
    this.recoverySections.push("leashes");
    this.loadErrors?.push("Damaged leashes (original save preserved)");
  }

  private fenceLeashKeys(x: number, y: number, z: number): number[] {
    return this.leashes.records.filter(r => r.phase === "active" && r.anchor.kind === "fence" &&
      r.anchor.x === x && r.anchor.y === y && r.anchor.z === z).map(r => r.key);
  }

  private releaseLeashes(keys: readonly number[]): boolean {
    const attempt = this.leashes.beginRelease(keys, this.leashContext());
    if (attempt.kind === "refused") return false;
    if (attempt.kind === "none") return true;
    const lease = attempt.lease;
    try {
      const record = this.leashes.records.find(r => keys.includes(r.key));
      const at = record?.lastPosition ?? this.body.position;
      const batch = joinLeashRefundSink(lease, this.dropSink)([], { ...at, y: at.y + .3 });
      return Boolean(batch && batch.commit());
    } catch { return false; }
    finally { lease.cancel(); }
  }

  private transferMobDeath(mob: Mob): boolean {
    const attempt = this.leashes.beginRelease(this.leashes.records.filter(r => r.targetMobId === mob.id).map(r => r.key), this.leashContext());
    if (attempt.kind === "refused") return false;
    const lease = attempt.kind === "ready" ? attempt.lease : null;
    const health = mob.health, at = { ...mob.position, y: mob.position.y + .3 };
    try {
      const sink = lease ? joinLeashRefundSink(lease, this.dropSink, () => this.mobs.mobs.includes(mob) && mob.health === health) : this.dropSink;
      const ok = this.mobLoot.tryDrop(mob, sink, at);
      if (!ok) this.hud?.message("Could not preserve mob drops and Leads; the mob remains");
      return ok;
    } catch { return false; }
    finally { lease?.cancel(); }
  }

  private savePayload(recoveryBackup = false): string {
    if (this.leashes.busy) throw new Error("An ownership transfer is in progress");
    return serializeSave({
        name: this.name,
        seed: this.world.seed,
        mode: this.mode,
        timeOfDay: this.timeOfDay,
        player: { position: { ...this.body.position }, yaw: this.body.yaw, pitch: this.body.pitch, flying: this.body.flying },
        inventory: this.inventory.toJSON(),
        inventoryPending: this.inventoryScreen.pendingItems(),
        playerState: { health: this.health, ...(this.deathState ? { death: this.deathState } : {}) },
        snowballProjectiles: this.snowballProjectiles.toJSON(),
        worldDrops: this.worldDrops.toJSON(),
        ...(recoveryBackup && this.leashes.loadIssues ? {} : { leashes: this.leashes.toJSON() }),
        edits: this.world.exportEdits(),
        mobs: this.mobs.exportState(this.mobLoot),
        npcs: this.mobs.exportNpcs(),
        hunger: { ...this.hunger },
        chalkboards: [...this.chalkboards.values()].map((b) => ({ ...b })),
        agent: { ...this.agent, slots: this.agent.slots.map((s) => (s ? { ...s } : null)) },
        programs: this.programs,
        furnaces: [...this.furnaces].map(([key, state]) => {
          const [x, y, z] = key.split(",").map(Number);
          return { x, y, z, state };
        }),
        gamerules: { doMobSpawning: this.mobs.spawning, doDaylightCycle: this.daylightCycle, keepInventory: this.keepInventory },
        redstone: this.redstone.exportScheduled(),
        farming: this.farming.toJSON(),
      });
  }

  save(): boolean {
    if (this.stopped || Game.activeWriter !== this) return false;
    if (this.leashes.busy) { this.saveError = "Items are being transferred. Retry saving afterward."; return false; }
    this.leashes.reconcileLoadedReferences(this.leashContext());
    this.leashes.validateCrossReferences(this.leashContext()); this.markLeashRecovery();
    if (this.recoverySections.length > 0) {
      this.saveError = `Damaged ${[...new Set(this.recoverySections)].join(" and ")}. Original save preserved. Export a backup; repair the saved data before saving or quitting.`;
      this.hud.message(this.saveError); return false;
    }
    try {
      localStorage.setItem(SAVE_KEY, this.savePayload());
      this.saveError = ""; return true;
    } catch {
      this.saveError = "World could not be saved. Keep this game open, retry, or export a backup before leaving.";
      this.hud.message(this.saveError); return false;
    }
  }

  private dropStack(stack: ItemStack): boolean {
    const dir = lookDirection(this.body.yaw, 0);
    return this.worldDrops.spawnBatch([structuredClone(stack)], {
      x: this.body.position.x + dir.x * .4, y: this.body.position.y + 1, z: this.body.position.z + dir.z * .4,
    }, { x: dir.x * 2, y: 1, z: dir.z * 2 });
  }

  private dropSelected(all: boolean): void {
    const held = this.inventory.selectedStack(); if (!held) return;
    const count = all ? held.count : 1;
    if (this.dropStack({ ...structuredClone(held), count })) {
      held.count -= count; if (!held.count) this.inventory.slots[this.inventory.selected] = null;
    }
  }

  /** The block currently under the crosshair. */
  get targetBlock(): RaycastHit | null {
    return this.target;
  }

  /** The mob currently under the crosshair (closer than any block). */
  get targetMob(): Mob | null {
    return this.mobTarget;
  }

  private screenOpen(): boolean {
    return (
      this.inventoryScreen.open || this.chat.open || this.portfolioScreen.open || this.npcDialog.open || this.chalkDialog.open || this.bookScreen.open ||
      this.codeBuilder.open
    );
  }

  private tick(dt: number): void {
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    this.clock += dt;
    const active = !this.paused && !this.dead && !this.screenOpen();
    const frames = [this.keyboard.poll()];
    if (this.touch) frames.push(this.touch.poll());
    const input = mergeFrames(frames);

    if (active) {
      this.body.yaw += input.lookYaw;
      this.body.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.body.pitch + input.lookPitch));
      if (input.hotbarSlot !== null) this.inventory.select(input.hotbarSlot);
      if (input.hotbarScroll !== 0) this.inventory.scroll(input.hotbarScroll);
      if (input.toggleFly && this.mode === "creative") this.body.flying = !this.body.flying;

      const wasOnGround = this.body.onGround;
      stepPlayer((x, y, z) => this.world.getBlock(x, y, z), this.body, {
        forward: input.forward,
        strafe: input.strafe,
        jump: input.jump,
        descend: input.descend,
        sprint: input.sprint,
        autoJump: this.touch !== null,
      }, dt);
      this.updateFall(wasOnGround);
      if (!this.dead && this.mode === "survival") this.updateHunger(input.sprint, wasOnGround, dt);
      if (!this.dead && this.body.position.y < -20) this.hurt(MAX_HEALTH, "void");
      if (!this.dead && this.daylightCycle) this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
      const light = skyAt(this.timeOfDay).light;
      // Hostile mobs ignore creative players (as in Minecraft).
      const target = this.mode === "survival" ? this.body.position : null;
      if (!this.dead) { this.leashes.update(dt, this.leashContext(), this.dropSink); this.markLeashRecovery(); }
      if (!this.dead) this.mobs.update(dt, this.body.position, light, this.clock, target, (light - 0.2) / 0.8);
      if (!this.dead && target) this.takeMobHits(dt, (light - 0.2) / 0.8);
      if (!this.dead) this.interact(input.breaking, input.place, input.using, input.pick, dt);
      if (!this.dead && !this.screenOpen()) {
        const impacts = this.snowballProjectiles.update(dt, this.mobs.mobs.filter(m => m.health > 0).map(m => ({ id: m.id, box: bodyBox(m.position, MOB_SPECS[m.kind].width, MOB_SPECS[m.kind].height) })));
        if (impacts.length) {
          this.snowballImpacts = [...this.snowballImpacts, ...impacts].slice(-16);
          this.snowballProjectilesView.impact(impacts);
        }
      }
    } else {
      this.target = null;
      this.mobTarget = null;
      this.breakProgress = 0;
      this.eatTimer = 0;
    }
    this.lastPos = { x: this.body.position.x, z: this.body.position.z };
    if (!this.paused) {
      this.worldDrops.update(dt);
      if (!this.dead && !this.screenOpen()) this.worldDrops.tryPickup(this.body.position, (stack) => this.inventory.addStack(stack));
      this.stepAgent(dt);
    }
    this.agentView.update(dt, AGENT_STEP_SECONDS, this.clock);
    // Furnaces keep smelting while the world runs, even with their screen closed.
    if (!this.paused) {
      // Pressure plates under the player and mobs, then redstone ticks (10 per second).
      const feet = (p: { x: number; y: number; z: number }) => `${Math.floor(p.x)},${Math.floor(p.y + 0.05)},${Math.floor(p.z)}`;
      this.redstone.updatePlates(new Set([feet(this.body.position), ...this.mobs.mobs.map((m) => feet(m.position))]));
      this.redstone.update(dt);
      this.farming.update(dt, 15 - skyDarken(skyAt(this.timeOfDay).light));
      for (const f of this.furnaces.values()) tickFurnace(f, dt);
      this.inventoryScreen.refresh();
    }

    const cam = this.renderer.camera;
    cam.position.set(this.body.position.x, this.body.position.y + EYE_HEIGHT, this.body.position.z);
    cam.rotation.set(this.body.pitch, this.body.yaw, 0);
    this.renderer.updateChunks(this.renderer.isAreaReady(1) ? 6 : 30);
    this.worldDropsView.update(this.clock, cam.position, this.renderer.renderDistance * 16);
    this.leashView.update(this.leashes.records, this.mobs.mobs, this.body.position);
    this.snowballProjectilesView.update(active && !this.dead && !this.screenOpen() ? dt : 0, cam, this.renderer.renderDistance * 16);

    const underwater = blockAtEyes((x, y, z) => this.world.getBlock(x, y, z), this.body) === "water";
    this.hud.setUnderwater(underwater);
    this.hud.update(this.inventory, this.mode, this.health, this.hunger.food, dt);
    this.renderer.setSelection(this.target, this.breakProgress);
    // A held glow stick lights the area around the player (Education Edition).
    this.heldLight = this.inventory.selectedStack()?.id === GLOW_STICK ? HELD_GLOW_LIGHT : 0;
    this.renderer.setHeldLight(this.heldLight, cam.position);
    this.renderer.render(skyAt(this.timeOfDay), underwater, dt);
    this.hud.setDebug(this.debugText());

    this.autosaveTimer += dt;
    if (this.autosaveTimer > 30) {
      this.autosaveTimer = 0;
      this.save();
    }
  }

  private interact(breaking: boolean, place: boolean, using: boolean, pick: boolean, dt: number): void {
    if (this.leashes.busy) return;
    const eye = { x: this.body.position.x, y: this.body.position.y + EYE_HEIGHT, z: this.body.position.z };
    const dir = lookDirection(this.body.yaw, this.body.pitch);
    const targetable = (id: number) => id !== AIR && blockById(id).shape !== "liquid";
    this.target = raycast((x, y, z) => this.world.getBlock(x, y, z), eye, dir, REACH, targetable);
    this.creativeCooldown = Math.max(0, this.creativeCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // Mobs in front of the targeted block take priority, as in Minecraft.
    const mobHit = this.mobs.raycast(eye, dir, REACH);
    this.mobTarget = mobHit && (!this.target || mobHit.distance < this.target.distance) ? mobHit.mob : null;

    // Eating: hold use (right button, or a touch hold) with food in hand. Using a crafting table,
    // furnace or NPC still takes precedence over eating.
    const held = this.inventory.selectedStack();
    // Using a chalkboard opens its editor; using a book opens it for writing or reading.
    if (place && this.placeCooldown === 0 && this.target && !this.mobTarget && chalkboardSizeOf(this.target.id)) {
      const board = this.chalkboardAt(this.target.x, this.target.y, this.target.z);
      if (board) {
        this.suspendInput();
        this.chalkDialog.show(board, this.mode);
        return;
      }
    }
    if (place && held && (isWritableBook(held) || isWrittenBook(held)) && !(this.target && (this.target.id === CRAFTING_TABLE || this.target.id === FURNACE))) {
      this.suspendInput();
      this.bookScreen.show(held);
      return;
    }
    const usesBlock = this.target !== null && !this.mobTarget && (this.target.id === CRAFTING_TABLE || this.target.id === FURNACE);
    const usesNpc = this.mobTarget?.kind === "npc";
    if (using && !(place && (usesBlock || usesNpc)) && this.mode === "survival" && canEat(this.hunger, held?.id)) {
      this.eatTimer += dt;
      this.breakProgress = 0;
      if (this.eatTimer >= EAT_SECONDS) {
        eat(this.hunger, held!.id);
        this.inventory.takeSelected();
        this.eatTimer = 0;
      }
      return;
    }
    this.eatTimer = 0;
    // A non-NPC actor does not consume the use edge: snowballs can be aimed at supported mobs.
    if (place && held?.id === SNOWBALL && this.placeCooldown === 0 && this.mobTarget && this.mobTarget.kind !== "npc") {
      this.throwSnowball(); return;
    }
    if (place && this.placeCooldown === 0 && this.mobTarget && this.mobTarget.kind !== "npc" && (held?.id === LEAD || !held)) {
      const mob = this.mobTarget;
      const keys = this.leashes.records.filter(r => r.targetMobId === mob.id).map(r => r.key);
      const withinReach = Math.hypot(mob.position.x - this.body.position.x, mob.position.y - this.body.position.y, mob.position.z - this.body.position.z) <= LEASH_PROFILE.attachReach;
      const ok = held?.id === LEAD
        ? this.leashes.attachFromInventory(this.inventory, this.mode, mob, this.leashContext())
        : keys.length > 0 && withinReach && this.releaseLeashes(keys);
      this.placeCooldown = .25;
      this.hud.message(ok ? (held?.id === LEAD ? "Lead attached" : "Lead released") : "No Lead action is available for that creature here");
      return;
    }
    if (this.mobTarget) {
      this.target = null;
      this.breakProgress = 0;
      const mob = this.mobTarget;
      if (breaking && this.attackCooldown === 0) {
        this.attackCooldown = 0.4;
        // Held tools hit harder (swords most); the bare-hand damage keeps the game's balance.
        const tool = toolOf(this.inventory.selectedStack()?.id);
        const damage = tool?.attack ?? (this.mode === "creative" ? 4 : 2);
        const killed = this.mobs.attack(mob, damage, this.body.yaw);
        if (this.mode === "survival") addExhaustion(this.hunger, EXHAUSTION.attack);
        // Minecraft: a hit wears a sword by one use and other tools by two.
        if (tool && this.mode === "survival") this.wearTool(tool.kind === "sword" ? 1 : 2);
        if (killed) this.hud.message(`${MOB_SPECS[mob.kind].displayName} was defeated`);
      }
      if (place && mob.kind === "npc") this.openNpcDialog(mob);
      return;
    }
    const t = this.target;
    const tool = toolOf(this.inventory.selectedStack()?.id);
    // Minecraft: swords cannot break blocks in creative.
    const canSwing = !(this.mode === "creative" && tool?.kind === "sword");

    if (breaking && canSwing && t && canBreak(this.world, this.mode, t.x, t.y, t.z)) {
      const key = `${t.x},${t.y},${t.z}`;
      if (key !== this.breakKey) {
        this.breakKey = key;
        this.breakProgress = 0;
      }
      const needed = breakTime(this.mode, t.id, tool);
      if (needed === 0) {
        if (this.creativeCooldown === 0) {
          this.breakAt(t);
          this.creativeCooldown = CREATIVE_REPEAT;
        }
        this.breakProgress = 0;
      } else {
        this.breakProgress += dt / needed;
        if (this.breakProgress >= 1) {
          const before = this.inventory.selectedStack();
          this.breakAt(t);
          if (before && tool && !this.inventory.selectedStack()) this.hud.message(`${displayNameOf(before.id)} broke`);
          this.breakProgress = 0;
          this.breakKey = "";
        }
      }
    } else {
      this.breakProgress = 0;
      this.breakKey = "";
      if (!breaking) this.creativeCooldown = 0;
    }

    if (place && t && this.placeCooldown === 0 && t.id === CRAFTING_TABLE) {
      this.openInventory("crafting_table");
      return;
    }
    // Levers, buttons, repeaters and wooden doors react to use instead of having a block placed on them.
    if (place && t && this.placeCooldown === 0 && this.redstone.interact(t.x, t.y, t.z)) {
      this.placeCooldown = 0.25;
      return;
    }
    const station = t ? CHEMISTRY_STATIONS.get(t.id) : undefined;
    if (place && t && this.placeCooldown === 0 && station) {
      this.openInventory(station);
      return;
    }
    if (place && t && this.placeCooldown === 0 && t.id === FURNACE) {
      const key = furnaceKey(t.x, t.y, t.z);
      if (!this.furnaces.has(key)) this.furnaces.set(key, createFurnace());
      this.openFurnace = key;
      this.openInventory("furnace");
      return;
    }

    // Interactive blocks above keep priority; otherwise a snowball also throws into empty sky.
    if (place && held?.id === SNOWBALL && this.placeCooldown === 0) { this.throwSnowball(); return; }

    // Held blocks still place normally; only a Lead or an empty hand selects the fence tether action.
    if (place && t?.id === OAK_FENCE && this.placeCooldown === 0 && (held?.id === LEAD || !held)) {
      const context = this.leashContext();
      const playerKeys = this.leashes.records.filter(r => r.phase === "active" && r.anchor.kind === "player").map(r => r.key);
      const fenceKeys = this.fenceLeashKeys(t.x, t.y, t.z);
      const coord = { x: t.x, y: t.y, z: t.z };
      // Attaching the last held Lead leaves an empty hand; tying needs no second item.
      const withinReach = Math.hypot(t.x + .5 - this.body.position.x, t.y + .75 - this.body.position.y, t.z + .5 - this.body.position.z) <= LEASH_PROFILE.retieReach;
      const ok = playerKeys.length > 0 ? this.leashes.retieToFence(playerKeys, coord, context)
        : !held && fenceKeys.length > 0 && withinReach && this.releaseLeashes(fenceKeys);
      const refusal = !withinReach && (playerKeys.length > 0 || fenceKeys.length > 0) ? "Move closer to tie or release Leads"
        : playerKeys.length > 0 || (!held && fenceKeys.length > 0) ? "Could not tie or release Leads" : "There are no Leads to tie or release here";
      this.placeCooldown = .25; this.hud.message(ok ? (playerKeys.length ? "Leads tied to fence" : "Leads released") : refusal); return;
    }

    // Hoe use precedes generic placement; authorization and successful-use wear are engine-owned.
    if (place && t && this.placeCooldown === 0 && tool?.kind === "hoe") {
      if (tillSoil(this.world, this.inventory, this.mode, t)) this.placeCooldown = 0.25;
      return;
    }

    // Lab Table products with a use effect: the ice bomb freezes water, super fertilizer grows plants.
    if (place && t && this.placeCooldown === 0 && held) {
      if (held.id === SUPER_FERTILIZER && wheatAge(t.id) !== null && !canBuildAt(this.world, this.mode, t.x, t.y, t.z)) {
        this.placeCooldown = 0.25;
        this.hud.message("Building is not allowed here");
        return;
      }
      const changed = useLabProduct(this.world, held.id, t);
      if (changed >= 0) {
        this.placeCooldown = 0.25;
        if (changed > 0 && this.mode === "survival") this.inventory.takeSelected();
        if (changed === 0) this.hud.message(`The ${displayNameOf(held.id)} has nothing to act on here`);
        return;
      }
    }

    if (place && t && this.placeCooldown === 0 && held && chalkboardSizeOf(held.id)) {
      if (this.placeChalkboard(t, held.id)) this.placeCooldown = 0.15;
      return;
    }

    if (place && t && this.placeCooldown === 0) {
      // Plants and other replaceable blocks are replaced in place; otherwise place against the hit face.
      const replace = blockById(t.id).replaceable === true;
      const px = replace ? t.x : t.x + t.normal.x;
      const py = replace ? t.y : t.y + t.normal.y;
      const pz = replace ? t.z : t.z + t.normal.z;
      // Repeaters point, and doors open, the way the player looks.
      const look = (facingTowards(this.body.yaw) + 2) % 4;
      if (placeBlock(this.world, this.inventory, this.mode, px, py, pz, this.body.position, look)) this.placeCooldown = 0.15;
    }

    if (pick && t && this.mode === "creative") {
      // Hidden world states (including element cubes) pick their established inventory identity.
      const canonical = baseStackId(t.id);
      if (isKnownId(canonical) && (isItem(canonical) || tryBlockById(canonical)?.creative)) this.inventory.pick(canonical);
    }
  }

  /** One use edge allocates a consumed projectile owner before removing its source item. */
  private throwSnowball(): boolean {
    const held = this.inventory.selectedStack();
    if (this.dead || this.paused || this.screenOpen() || held?.id !== SNOWBALL || held.count < 1) return false;
    const direction = lookDirection(this.body.yaw, this.body.pitch);
    // Eye offset follows one native variant; forward muzzle distance/cooldown are explicit application choices.
    const origin = { x: this.body.position.x + direction.x * .3, y: this.body.position.y + EYE_HEIGHT - .1 + direction.y * .3, z: this.body.position.z + direction.z * .3 };
    const key = tryThrowSnowball(this.inventory, this.mode, origin, direction, this.snowballProjectiles);
    if (key === null) return false;
    this.placeCooldown = .25;
    this.breakProgress = 0; this.breakKey = "";
    return true;
  }

  /**
   * Places a chalkboard against the targeted face: on a wall it hangs facing out of the wall; on a
   * block top it stands facing the player. It spans w x h cells to the viewer's right and up.
   */
  private placeChalkboard(t: RaycastHit, id: number): boolean {
    const size = chalkboardSizeOf(id)!;
    const standing = t.normal.y === 1;
    if (!standing && t.normal.y !== 0) return false;
    const facing = standing ? facingTowards(this.body.yaw) : [[0, 1], [-1, 0], [0, -1], [1, 0]].findIndex(([fx, fz]) => fx === t.normal.x && fz === t.normal.z);
    const board: Chalkboard = { x: t.x + t.normal.x, y: t.y + t.normal.y, z: t.z + t.normal.z, size, facing, standing, text: "", locked: false };
    const get = (x: number, y: number, z: number) => this.world.getBlock(x, y, z);
    if (!canPlaceChalkboard(get, board)) return false;
    for (const c of chalkboardCells(board)) this.world.setBlock(c.x, c.y, c.z, id);
    this.addChalkboard(board);
    if (this.mode === "survival") this.inventory.takeSelected();
    return true;
  }

  private addChalkboard(board: Chalkboard): void {
    const key = chalkboardKey(board.x, board.y, board.z);
    this.chalkboards.set(key, board);
    for (const c of chalkboardCells(board)) this.chalkCells.set(chalkboardKey(c.x, c.y, c.z), key);
    this.chalkViews.update(board);
  }

  /** The chalkboard covering a cell, if any. */
  chalkboardAt(x: number, y: number, z: number): Chalkboard | null {
    const key = this.chalkCells.get(chalkboardKey(x, y, z));
    return key ? (this.chalkboards.get(key) ?? null) : null;
  }

  /** A spot next to the player (on their left, Education Edition style), facing where they look. */
  private agentNearPlayer(position = this.body.position): AgentState | null {
    const p = findAgentPosition(this.world, position, this.body.yaw);
    if (!p) return null;
    const facing = facingTowards(this.body.yaw + Math.PI);
    return createAgent(p.x, p.y, p.z, facing);
  }

  /** /agent tp: brings the Agent next to the player. */
  teleportAgent(): boolean {
    const next = this.agentNearPlayer();
    if (!next) return false;
    Object.assign(this.agent, { x: next.x, y: next.y, z: next.z, facing: next.facing });
    this.agentView.snap(this.agent);
    return true;
  }

  openCodeBuilder(): void {
    if (this.dead) return;
    if (this.screenOpen()) return;
    this.suspendInput();
    this.codeBuilder.show();
  }

  /** Moves the selected hotbar stack into the Agent's inventory (creative: a copy). */
  giveHeldToAgent(): string {
    if (this.dead) return "Respawn before giving items to the Agent";
    const held = this.inventory.selectedStack();
    if (!held) return "Select a stack in your hotbar first";
    // Creative has unlimited blocks: give a full stack without taking any.
    const count = this.mode === "creative" ? maxStackOf(held.id) : held.count;
    const left = giveAgent(this.agent, { ...held, count });
    const given = count - left;
    if (this.mode === "survival") {
      held.count = left;
      if (left === 0) this.inventory.slots[this.inventory.selected] = null;
    }
    return `Gave the Agent ${given} ${displayNameOf(held.id)}`;
  }

  /** Starts a Code Builder program (stopping any running one). Invalid programs are refused with a message. */
  runProgram(program: CodeProgram): boolean {
    if (this.dead) return false;
    this.runner?.stop();
    this.runner = null;
    const started = startProgram(program, undefined, (dir) => runAgentCommand(this.world, this.agent, { op: "detect", dir }).value === true);
    if ("error" in started) {
      this.hud.message(`Can't run "${String((program as { name?: unknown })?.name ?? "program")}": ${started.error}`);
      return false;
    }
    this.runner = started.runner;
    this.runnerName = program.name;
    this.stepTimer = 0;
    this.runnerStarted = this.clock;
    this.hud.message(`Running "${program.name}"`);
    return true;
  }

  stopProgram(): void {
    if (!this.runner) return;
    this.runner.stop();
    this.runner = null;
    this.hud.message(`Stopped "${this.runnerName}"`);
  }

  get programRunning(): boolean {
    return this.runner !== null;
  }

  /** Executes one Agent command every AGENT_STEP_SECONDS while a program runs. */
  private stepAgent(dt: number): void {
    const runner = this.runner;
    if (!runner || this.leashes.busy) return;
    if (this.clock - this.runnerStarted > PROGRAM_TIMEOUT_SECONDS) {
      this.runner = null;
      this.hud.message(`"${this.runnerName}" stopped: it ran for more than ${PROGRAM_TIMEOUT_SECONDS} s`);
      return;
    }
    this.stepTimer -= dt;
    if (this.stepTimer > 0) return;
    this.stepTimer = AGENT_STEP_SECONDS;
    let cmd: ReturnType<ProgramRunner["next"]>;
    try {
      cmd = runner.next();
    } catch (e) {
      // Defence in depth: a broken program must never break the game loop.
      this.runner = null;
      this.hud.message(`"${this.runnerName}" stopped: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!cmd) {
      this.runner = null;
      this.hud.message(runner.error ? `"${this.runnerName}": ${runner.error}` : `"${this.runnerName}" finished`);
      return;
    }
    let result: ReturnType<typeof runAgentCommand>;
    try {
      result = runAgentCommand(this.world, this.agent, cmd as AgentCommand, {
      attack: (x, y, z) => {
        const mob = this.mobs.mobs.find((m) => Math.floor(m.position.x) === x && Math.floor(m.position.z) === z && Math.abs(m.position.y - y) < 1.5);
        if (!mob) return false;
        this.mobs.attack(mob, 4, this.body.yaw, "agent");
        return true;
      },
      giveToPlayer: (stack) => this.dead ? stack.count : this.inventory.addStack(stack),
      worldDrop: this.dropSink,
      playerFeet: () => this.body.position,
      beginDestroyOwnership: (x, y, z) => this.leashes.beginRelease(this.fenceLeashKeys(x, y, z), this.leashContext()),
      collect: (agent, filterId) => this.worldDrops.tryPickup({ x: agent.x + .5, y: agent.y, z: agent.z + .5 }, (stack) => giveAgent(agent, stack), filterId),
      destroyContents: (x, y, z) => {
        const furnace = this.furnaces.get(furnaceKey(x, y, z)); return furnace ? furnaceContents(furnace) : [];
      },
      afterDestroy: (x, y, z) => { this.furnaces.delete(furnaceKey(x, y, z)); },
      });
      // Defence in depth: anything but a result object stops the program.
      if (typeof result !== "object" || result === null || typeof result.ok !== "boolean") throw new Error("invalid Agent command");
      this.agentView.moveTo(this.agent);
      // Like Education Edition, a failed action (e.g. a blocked move) doesn't stop the program.
      if (!result.ok && result.message) this.hud.message(`Agent: ${result.message}`);
    } catch (e) {
      this.runner = null;
      this.hud.message(`"${this.runnerName}" stopped: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }

  private closeDialog(dialog: { hide(): void }): void {
    dialog.hide();
    this.resumeInput();
  }

  /** Breaks the targeted block; a broken furnace gives back its contents (Minecraft drops them). */
  private breakAt(t: RaycastHit): void {
    if (this.leashes.busy) return;
    const furnace = t.id === FURNACE ? this.furnaces.get(furnaceKey(t.x, t.y, t.z)) : undefined;
    const contents = furnace ? furnaceContents(furnace) : [];
    // Breaking any cell of a chalkboard removes the whole board (one item drops, from the broken cell).
    const board = chalkboardSizeOf(t.id) ? this.chalkboardAt(t.x, t.y, t.z) : null;
    const release = this.leashes.beginRelease(this.fenceLeashKeys(t.x, t.y, t.z), this.leashContext());
    if (release.kind === "refused") { this.hud.message("Leads could not be released; the block remains"); return; }
    const lease = release.kind === "ready" ? release.lease : null;
    const sourceContents = JSON.stringify(contents);
    const sourceValid = () => this.world.getBlock(t.x, t.y, t.z) === t.id &&
      JSON.stringify(t.id === FURNACE ? furnaceContents(this.furnaces.get(furnaceKey(t.x, t.y, t.z)) ?? createFurnace()) : []) === sourceContents;
    let broken = false;
    try {
      const sink = lease ? joinLeashRefundSink(lease, this.dropSink, sourceValid) : this.dropSink;
      broken = breakBlock(this.world, this.inventory, this.mode, t.x, t.y, t.z, Math.random, contents, sink,
        lease ? { valid: () => lease.valid() && sourceValid(), afterReceiverCommit: () => {} } : undefined);
    } catch { broken = false; }
    finally { lease?.cancel(); }
    if (!broken) { this.hud.message("Could not preserve world drops; the block and its contents remain"); return; }
    if (board) {
      for (const c of chalkboardCells(board)) {
        this.chalkCells.delete(chalkboardKey(c.x, c.y, c.z));
        if (c.x !== t.x || c.y !== t.y || c.z !== t.z) this.world.setBlock(c.x, c.y, c.z, AIR);
      }
      this.chalkboards.delete(chalkboardKey(board.x, board.y, board.z));
      this.chalkViews.remove(board);
    }
    if (this.mode === "survival") addExhaustion(this.hunger, EXHAUSTION.breakBlock);
    if (t.id !== FURNACE) return;
    this.furnaces.delete(furnaceKey(t.x, t.y, t.z));
  }

  /** Aggressive mobs in reach apply their per-kind damage and knockback. */
  private takeMobHits(dt: number, daylight: number): void {
    for (const mob of this.mobs.mobs) {
      if (this.dead) break;
      const damage = mobAttack(mob, this.body.position, dt, this.mobs.effectiveLight(mob, daylight));
      if (damage === 0 || this.dead) continue;
      const kb = knockbackFrom(mob, this.body.position);
      this.body.velocity = { x: this.body.velocity.x + kb.x, y: Math.max(this.body.velocity.y, kb.y), z: this.body.velocity.z + kb.z };
      this.hurt(damage);
      this.hud.message(`${MOB_SPECS[mob.kind].displayName} hit you`);
    }
  }

  /** Minecraft exhaustion from sprinting, swimming and jumping, then regen or starvation. */
  private updateHunger(sprinting: boolean, wasOnGround: boolean, dt: number): void {
    const p = this.body.position;
    const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    if (this.body.inWater) addExhaustion(this.hunger, EXHAUSTION.swimPerBlock * moved);
    else if (sprinting) addExhaustion(this.hunger, EXHAUSTION.sprintPerBlock * moved);
    if (wasOnGround && !this.body.onGround && this.body.velocity.y > 0) {
      addExhaustion(this.hunger, sprinting ? EXHAUSTION.sprintJump : EXHAUSTION.jump);
    }
    const change = tickHunger(this.hunger, dt, this.health, MAX_HEALTH);
    if (change > 0) this.health = Math.min(MAX_HEALTH, this.health + change);
    else if (change < 0) this.hurt(-change, "starvation");
  }

  private wearTool(uses: number): void {
    const held = this.inventory.selectedStack();
    if (held && this.inventory.damageSelected(uses)) this.hud.message(`${displayNameOf(held.id)} broke`);
  }

  private updateFall(wasOnGround: boolean): void {
    const y = this.body.position.y;
    if (this.body.flying || this.body.inWater || this.mode === "creative") {
      this.fallStart = null;
      return;
    }
    if (!this.body.onGround) {
      if (this.fallStart === null || wasOnGround) this.fallStart = y;
      this.fallStart = Math.max(this.fallStart, y);
    } else if (this.fallStart !== null) {
      const distance = this.fallStart - y;
      this.fallStart = null;
      const damage = Math.floor(distance - 3);
      if (damage > 0) this.hurt(damage, "fall");
    }
  }

  private hurt(amount: number, kind: "melee" | "fall" | "starvation" | "void" = "melee"): void {
    if (this.leashes.busy || this.dead || !Number.isFinite(amount) || amount <= 0 || (this.mode === "creative" && kind !== "void")) return;
    const worn = ARMOR_SLOTS.map((slot) => [slot, this.inventory.equipment[slot]?.id] as const);
    const damage = applyArmorDamage(this.inventory, amount, kind);
    for (const [slot, id] of worn) {
      if (id !== undefined && !this.inventory.equipment[slot]) this.hud.message(`${displayNameOf(id)} broke`);
    }
    this.health = Math.max(0, this.health - damage);
    this.hud.flashDamage();
    if (this.health === 0 || this.body.position.y < -20) {
      this.dead = true;
      this.health = 0;
      this.deathState = { phase: "pending", position: { ...this.body.position }, keepInventory: this.keepInventory };
      // Flush the editor while its book still belongs to the player, then freeze every modal.
      this.bookScreen.hide(); this.inventoryScreen.freezeForDeath();
      this.npcDialog.hide(); this.chalkDialog.hide(); this.portfolioScreen.hide(); this.codeBuilder.hide();
      this.chat.hide(); this.suspendInput();
      this.breakProgress = 0; this.eatTimer = 0; this.target = null; this.mobTarget = null;
      this.tryDeathTransfer();
      this.events.onDeath();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.running || this.dead || this.chat.open) return;
    if (this.chalkDialog.open || this.bookScreen.open || this.codeBuilder.open) {
      if (e.code === "Escape") this.closeDialog(this.chalkDialog.open ? this.chalkDialog : this.bookScreen.open ? this.bookScreen : this.codeBuilder);
      return;
    }
    // Education Edition opens Code Builder with C; C is the camera here, so K opens it.
    if (e.code === "KeyQ" && !e.repeat && !this.paused && !this.dead && !this.screenOpen()) {
      e.preventDefault(); this.dropSelected(e.ctrlKey); return;
    }
    if (e.code === "KeyK" && !this.paused && !this.dead && !this.inventoryScreen.open) {
      this.openCodeBuilder();
      return;
    }
    if (this.npcDialog.open) {
      if (e.code === "Escape") this.closeNpcDialog();
      return;
    }
    if (this.portfolioScreen.open) {
      if (e.code === "Escape" || e.code === "KeyP") this.togglePortfolio();
      return;
    }
    if (e.code === "KeyE" && !this.paused && !this.dead) this.toggleInventory();
    else if (e.code === "Escape" && this.inventoryScreen.open) this.toggleInventory();
    else if (e.code === "KeyC" && !this.paused && !this.dead && !this.inventoryScreen.open) this.takePhoto();
    else if (e.code === "KeyP" && !this.paused && !this.dead && !this.inventoryScreen.open) this.togglePortfolio();
    // Browsers usually consume Escape to release pointer lock (handled in pointerlockchange); if it
    // reaches us, pause directly so the menu always opens.
    else if (e.code === "Escape" && !this.paused && !this.dead) this.pause();
    else if ((e.code === "Slash" || e.code === "KeyT") && !this.paused && !this.dead && !this.inventoryScreen.open) {
      e.preventDefault();
      this.openChat(e.code === "Slash" ? "/" : "");
    } else if (e.code === "F3") {
      e.preventDefault();
      this.hud.toggleDebug();
    }
  }

  private toggleInventory(): void {
    if (this.dead) return;
    if (this.inventoryScreen.open) {
      if (this.inventoryScreen.hide()) this.resumeInput();
    } else {
      this.openInventory("inventory");
    }
  }

  private openInventory(kind: InventoryKind): void {
    if (this.dead) return;
    this.suspendInput();
    const furnace = kind === "furnace" && this.openFurnace ? (this.furnaces.get(this.openFurnace) ?? null) : null;
    this.inventoryScreen.show(this.inventory, this.mode, kind, furnace);
  }

  private suspendInput(): void {
    this.keyboard.reset();
    this.keyboard.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private openNpcDialog(mob: Mob): void {
    this.suspendInput();
    this.npcDialog.show(mob, this.mode === "creative");
  }

  private closeNpcDialog(): void {
    this.npcDialog.hide();
    this.resumeInput();
  }

  private togglePortfolio(): void {
    if (this.dead) return;
    if (this.portfolioScreen.open) {
      this.portfolioScreen.hide();
      this.resumeInput();
    } else {
      this.suspendInput();
      this.portfolioScreen.show();
    }
  }

  /** Education Edition camera: captures the current view (without the HUD) into the portfolio. */
  takePhoto(): void {
    if (this.dead) return;
    const r = this.renderer;
    r.render(skyAt(this.timeOfDay), false, 0);
    const src = r.canvas;
    const width = 480;
    const height = Math.round((src.height / Math.max(1, src.width)) * width);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    c.getContext("2d")!.drawImage(src, 0, 0, width, height);
    this.portfolio.add(c.toDataURL("image/jpeg", 0.8));
    this.hud.flashCamera();
    this.hud.message(`Photo saved to portfolio (${this.portfolio.photos.length}). Press P to view.`);
  }

  private openChat(prefix = ""): void {
    if (this.dead) return;
    this.keyboard.reset();
    this.keyboard.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.chat.show(prefix);
  }

  private resumeInput(): void {
    if (this.dead) return;
    this.keyboard.enabled = true;
    this.lastTime = performance.now();
    if (!this.touch && !this.paused) this.keyboard.requestPointerLock();
  }

  /** Executes a chat line; returns the feedback shown to the player. */
  runChat(text: string): string {
    if (this.dead) return "Respawn before using commands";
    if (!text.startsWith("/")) {
      this.hud.message(`<Player> ${text}`);
      return text;
    }
    const cmd = parseCommand(text);
    let reply: string;
    switch (cmd.type) {
      case "gamemode":
        this.setMode(cmd.mode);
        reply = `Set own game mode to ${cmd.mode}`;
        break;
      case "time":
        this.timeOfDay = cmd.timeOfDay;
        reply = `Set the time to ${Math.round(cmd.timeOfDay * 24000)}`;
        break;
      case "tp": {
        const p = this.body.position;
        const wanted = {
          x: cmd.relative[0] ? p.x + cmd.x : cmd.x,
          y: cmd.relative[1] ? p.y + cmd.y : cmd.y,
          z: cmd.relative[2] ? p.z + cmd.z : cmd.z,
        };
        // Relative moves can still land past the border: clamp, and say so.
        const q = clampPosition({ ...wanted });
        this.body.position = q;
        this.body.velocity = { x: 0, y: 0, z: 0 };
        const clamped = q.x !== wanted.x || q.y !== wanted.y || q.z !== wanted.z;
        reply = `Teleported to ${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${q.z.toFixed(1)}${clamped ? " (clamped to the world border)" : ""}`;
        break;
      }
      case "give": {
        const left = this.inventory.add(cmd.id, cmd.count);
        reply = `Gave ${cmd.count - left} [${displayNameOf(cmd.id)}]`;
        break;
      }
      case "summon": {
        const dir = lookDirection(this.body.yaw, 0);
        const x = this.body.position.x + dir.x * 3;
        const z = this.body.position.z + dir.z * 3;
        // A ground spot near that point at about the player's level, never inside or on top of a tree.
        const get = (bx: number, by: number, bz: number) => this.world.getBlock(bx, by, bz);
        const height = Math.ceil(MOB_SPECS[cmd.kind].height);
        const groundSpot = findSummonSpot(get, x, z, this.body.position.y, height, 4, MOB_SPECS[cmd.kind].width);
        const spot = groundSpot ?? {
          x,
          y: Math.max(this.world.generator.heightAt(Math.floor(x), Math.floor(z)) + 1, Math.floor(this.body.position.y)) + 0.5,
          z,
        };
        // Preserve the legacy fallback, but never allocate a new actor into the new fence geometry.
        if (!groundSpot && boxIntersectsFences(get, bodyBox({ ...spot, y: spot.y + .01 }, MOB_SPECS[cmd.kind].width, MOB_SPECS[cmd.kind].height))) {
          reply = "No safe space near the fence to summon that creature"; break;
        }
        // NPCs face the player.
        if (this.mobs.idsExhausted) { reply = "Creature IDs are exhausted; no creature was summoned"; break; }
        const mob = this.mobs.spawn(cmd.kind, { x: spot.x, y: spot.y + 0.01, z: spot.z }, { name: cmd.name, yaw: this.body.yaw + Math.PI });
        reply = `Summoned new ${mob.kind === "npc" ? (mob.name ?? "NPC") : MOB_SPECS[mob.kind].displayName}`;
        break;
      }
      case "gamerule":
        if (cmd.rule === "doMobSpawning") this.mobs.spawning = cmd.value;
        else if (cmd.rule === "doDaylightCycle") this.daylightCycle = cmd.value;
        else this.keepInventory = cmd.value;
        reply = `Game rule ${cmd.rule} is now set to: ${cmd.value}`;
        break;
      case "seed":
        reply = `Seed: [${this.world.seed}]`;
        break;
      case "agent":
        reply = this.teleportAgent() ? "Teleported the Agent to you" : "No open space nearby for the Agent";
        break;
      case "code": {
        const program = this.programs.find((p) => p.trigger.type === "chat" && p.trigger.command === cmd.command);
        if (program) {
          reply = this.runProgram(program) ? `Running "${program.name}"` : `Couldn't run "${program.name}"`;
        } else reply = `No Code Builder program runs on "${cmd.command}"`;
        break;
      }
      case "help":
        reply = COMMAND_HELP.join("  ·  ");
        break;
      case "error":
        reply = cmd.message;
        break;
    }
    this.hud.message(reply);
    return reply;
  }

  private findSpawn(): { x: number; y: number; z: number } {
    // Prefer dry land near the origin with open sky above (not under a tree).
    const gen = this.world.generator;
    const clear = (x: number, y0: number, y1: number, z: number) => {
      for (let y = y0; y < y1; y++) {
        const id = this.world.getBlock(x, y, z);
        if (id !== AIR && !blockById(id).replaceable) return false;
      }
      return true;
    };
    // Open sky above the spawn column and head-room around it, so the view is not blocked by trees.
    const open = (x: number, h: number, z: number) => {
      if (!clear(x, h + 1, WORLD_HEIGHT, z)) return false;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) if (!clear(x + dx, h + 1, h + 5, z + dz)) return false;
      }
      return true;
    };
    for (let r = 0; r < 96; r += 3) {
      for (let a = 0; a < 12; a++) {
        const x = Math.round(Math.cos((a / 12) * Math.PI * 2) * r);
        const z = Math.round(Math.sin((a / 12) * Math.PI * 2) * r);
        const h = gen.heightAt(x, z);
        if (h > SEA_LEVEL && open(x, h, z)) return { x: x + 0.5, y: h + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: gen.heightAt(0, 0) + 1, z: 0.5 };
  }

  private starterInventory(): Inventory {
    const inv = new Inventory();
    if (this.mode === "creative") {
      ["grass", "dirt", "stone", "cobblestone", "oak_planks", "oak_log", "glass", "bricks", "glowstone"].forEach((n, i) =>
        inv.setSlot(i, { id: blockId(n), count: 1 }),
      );
    }
    return inv;
  }

  private resize(): void {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  private debugText(): string {
    const p = this.body.position;
    const t = this.target;
    const biome = this.world.generator.biomeAt(Math.floor(p.x), Math.floor(p.z));
    return [
      `AgentFlow Craft  ${this.fps} fps`,
      `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Chunk: ${toChunkCoord(p.x)}, ${toChunkCoord(p.z)}  meshed ${this.renderer.meshedChunkCount()}`,
      `Facing: yaw ${((this.body.yaw * 180) / Math.PI).toFixed(0)}° pitch ${((this.body.pitch * 180) / Math.PI).toFixed(0)}°`,
      `Biome: ${biome}  Mode: ${this.mode}${this.body.flying ? " (flying)" : ""}`,
      `Time: ${Math.round(this.timeOfDay * 24000)}  Seed: ${this.world.seed}`,
      t ? `Looking at: ${blockById(t.id).displayName} (${t.x}, ${t.y}, ${t.z})` : "Looking at: -",
      `Blocks: ${creativeBlocks().length}`,
    ].join("\n");
  }
}
