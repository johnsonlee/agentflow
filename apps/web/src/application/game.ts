import { BONE_MEAL_ITEM_ID, useOwnedBoneMeal, diagnoseRawBoneMealOwnership, type BoneMealOwnershipIssue } from "@craft/engine";
import { useOwnedLabProduct } from "@craft/engine";
import { CaneGrowthSystem, readCaneGrowthState } from "@craft/engine";
import { type CodeWorkspaceData } from "@craft/engine";
import {furnaceMutationBusy,reserveFurnaceContents} from "@craft/engine";
import {diagnoseRawRecyclingOwnership} from "@craft/engine";
import {CaneSupportSystem} from "@craft/engine";
import {diagnoseRawCaneOwnership,CURRENT_OVERWORLD_GENERATOR_VERSION,SingleChest,readChestOwners,type ChestOwnershipIssue} from '@craft/engine';
import {
  PlayerStatusOwner, hasPlayerStatus, applyTimedStatus, outgoingMeleeDamage, isDrinkablePotionId, MEDICINE_DRINK_SECONDS, finishMedicineDrink, finishOwnedMilkDrink,
  BrewingStand, readBrewingStandOwners, diagnoseRawBrewingItemOwnership, type BrewingOwnershipIssue,
  prepareOverworldRespawn as prepareRespawnWorld, replaceDimensionWorld, parseSave, PortalContact, preparePortalArrival, createPortalRouteSave, type PortalContactTicket, type DimensionWorldState, captureDimensionWorld, readBlazeOwners, type BlazeOwnershipIssue, readDimensionArchive, createDimensionGeneratedBlockProbe, type DimensionsData, type DimensionSaveIssue,
  tryUsePortalIgnition, isPortalActionBusy, tryUseFluidBucket, isFluidActionBusy, isFluidBlock, igniteFire, extinguishFire, cloneStack, freshStack, inspectGlowState, isGlowStickId, inspectSparklerState, isSparklerId, stackLimit, LeashStore, joinLeashRefundSink, type LeashContext, LEASH_PROFILE,
  BalloonStore, balloonColorOf, raycastBalloons, combineReleaseAttempts, type ReleaseAttempt,
  diagnoseRawWartSupport, diagnoseRawWartOwnership, SnowballProjectiles, tryThrowSnowball, bodyBox, boxIntersectsFences, type SnowballImpact, AIR, MAX_PLAYER_HEALTH, PlayerDeathTransfer, sanitizePlayerState, validatePlayerDeathOwnership, type PlayerDeathState, MobLootResolver, WorldDrops, type DropSink, type ItemStack, FarmingSystem, tillSoil, wheatAge, canBuildAt, skyDarken, ARMOR_SLOTS, applyArmorDamage, baseStackId, isItem, isKnownId, tryBlockById, COMMAND_HELP, MOB_SPECS, SEA_LEVEL, WORLD_HEIGHT, DAY_LENGTH, EYE_HEIGHT, Inventory, World, blockAtEyes, blockById, blockId, breakBlock, displayNameOf, toolOf,
  breakTime, canBreak, createPlayerBody, creativeBlocks, hayFallDamageMultiplierAt, lookDirection, parseCommand, placeBlock, raycast,
  sanitizeInventoryPending, serializeSave, skyAt, stepPlayer, toChunkCoord, type GameMode, type Mob, type PlayerBody, type RaycastHit, type SaveData,
  MILK_DRINK_SECONDS, isAdultCow, WATER_DRINK_SECONDS, EAT_SECONDS, EXHAUSTION, addExhaustion, canEat, createFurnace, createHunger, finishMeal, sanitizePlayerStatus, tickPlayerStatus, clearPlayerStatus, type PlayerStatus, furnaceContents, tickFurnace,
  tickHunger, knockbackFrom, mobAttack, findSummonSpot, canPlaceChalkboard, chalkboardCells, chalkboardKey, chalkboardSizeOf,
  facingTowards, findAgentPosition, Redstone, sanitizeScheduled, isWritableBook, isWrittenBook, stackId, type Chalkboard, ProgramRunner, createAgent, runAgentCommand,
  type AgentState, type CodeProgram, giveAgent, inspectLoadedAgentBlock, loadPrograms, startProgram, type AgentCommand,
  clampPosition, sanitizeMobState, sanitizeAgent, sanitizeChalkboards, sanitizeEdits, sanitizeFurnaces, sanitizeHunger, sanitizeNpcs, type FurnaceState, type HungerState,
} from "@craft/engine";
import { KeyboardMouseInput, TouchControls, mergeFrames } from "@craft/input";
import type { TextureAtlas } from "@craft/textures";
import { ChatInput, Hud, InventoryScreen, type ChemistryKind, type InventoryKind } from "../ui/hud";
import { MobManager, type MobDeathCause } from "../simulation/mobs";
import { findLoadedSquidSummonSpot } from "../simulation/squid-habitat";
import { BookScreen, ChalkboardDialog, NpcDialog, Portfolio, PortfolioScreen } from "../ui/screens";
import { ChalkboardViews } from "../ui/chalkboards";
import { AgentView } from "../rendering/agentView";
import { CodeBuilderScreen } from "../ui/codeBuilder";
import { WorldRenderer } from "../rendering/renderer";
import { WorldDropsView } from "../rendering/worldDropsView";
import { SnowballProjectilesView } from "../rendering/snowballProjectilesView";
import { LeashView } from "../rendering/leash-view";
import { BalloonView } from "../rendering/balloonView";
import { SparklerView } from "../rendering/sparkler-view";
import { GlowStickView } from "../rendering/glow-stick-view";

export const SAVE_KEY = "craft.save.v1";
const REACH = 5;
const MAX_HEALTH = MAX_PLAYER_HEALTH;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const CREATIVE_REPEAT = 0.25;
const CRAFTING_TABLE = blockId("crafting_table");
const FURNACE = blockId("furnace");
const BREWING_STAND = 201;
/** Chemistry station blocks and the screen each opens. */
const CHEMISTRY_STATIONS = new Map<number, ChemistryKind>(
  (["element_constructor", "compound_creator", "material_reducer", "lab_table"] as const).map((k) => [blockId(k), k]),
);

const GLASS_BOTTLE = stackId("glass_bottle");
const WATER_BOTTLE = stackId("water_bottle");
const EMPTY_BUCKET = stackId("bucket");
const MILK_BUCKET = stackId("milk_bucket");
const WATER_BUCKET = stackId("water_bucket");
const LAVA_BUCKET = stackId("lava_bucket");
const WATER = blockId("water");
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
  /** One private arrival World; valid only for a prepared session and never replayed. */
  preparedWorld?: World;
}

export interface GameEvents {
  onPause(): void;
  onDeath(): void;
  onPortalTravel?(source:Game,ticket:PortalContactTicket):void;
}

export interface PortalTravelHandle {readonly target:Game;prepareFrame(budgetMs?:number):boolean;commit(unchanged?:()=>boolean):boolean;cancel():void}

/** Owns the world simulation, player, input and HUD for one play session. */
export class Game {
  private static activeWriter: Game | null = null;
  private static handoffBusy = false;
  private static readonly attachedWorlds = new WeakSet<World>();
  private prepared = false;
  private portalTransfer=false;
  private readonly portalContact=new PortalContact();
  private frameRequest: number | null = null;
  private readonly cleanups: Array<{ name: string; dispose: () => void }> = [];
  private readonly cleanupErrors: string[] = [];
  get lifecycleCleanupErrors(): readonly string[] { return [...this.cleanupErrors]; }

  static prepare(container: HTMLElement, atlas: TextureAtlas, options: GameOptions, events: GameEvents): Game {
    return new Game(container, atlas, options, events, true);
  }
  readonly snowballProjectiles: SnowballProjectiles;
  private readonly snowballProjectilesView: SnowballProjectilesView;
  private snowballImpacts: SnowballImpact[] = [];
  /** Bounded actual simulation outcomes for read-only diagnostics; detached from store/view ownership. */
  get recentSnowballImpacts(): readonly SnowballImpact[] { return structuredClone(this.snowballImpacts); }
  readonly balloons: BalloonStore;
  private readonly balloonView: BalloonView;
  private readonly glowStickView: GlowStickView;
  private readonly sparklerView: SparklerView;
  private readonly balloonOriginalRaw: string | null;
  private balloonTarget: { key: number; distance: number } | null = null;
  get targetBalloon(): { key: number; distance: number } | null { return this.balloonTarget ? { ...this.balloonTarget } : null; }
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
  private wartIssues:Array<{path:string;reason:string}>=[];
  private caneIssues:Array<{path:string;reason:string}>=[];
  private boneMealIssues:BoneMealOwnershipIssue[]=[];
  private recyclingIssues:Array<{path:string;reason:string}>=[];
  private blazeIssues:BlazeOwnershipIssue[]=[];
  private brewingIssues:BrewingOwnershipIssue[]=[];
  private chestIssues:ChestOwnershipIssue[]=[];
  private openChest:string|null=null;
  readonly chests=new Map<string,SingleChest>();
  private get itemsNeedRecovery(): boolean { return this.recoverySections.includes("saved items"); }
  private get actionsNeedRecovery(): boolean { return this.itemsNeedRecovery || this.recoverySections.includes("code workspace") || this.recoverySections.includes("Cane growth") || this.recoverySections.includes("chest owners") || this.recoverySections.includes("brewing owners") || this.recoverySections.includes("Blaze owners") || this.recoverySections.includes("dimensions") || this.recoverySections.includes("player status") || this.recoverySections.includes("adult cows") || this.recoverySections.includes("gravel harvest decisions") || this.recoverySections.includes("fire") || this.recoverySections.includes("fluids") || this.recoverySections.includes("portals"); }
  private dimensionArchive: DimensionsData | undefined;
  private dimensionIssues: DimensionSaveIssue[] = [];
  private stopped = false;
  private readonly handleKey = (e: KeyboardEvent) => this.onKey(e);
  private readonly handleResize = () => { if (!this.stopped) this.resize(); };
  private readonly handlePageHide = () => { if (Game.activeWriter === this && !this.stopped) this.save(); };
  private readonly handlePointerLock = () => {
    if (this.keyboard.pointerLocked) this.hadPointerLock = true;
    else if (this.hadPointerLock && this.running && !this.screenOpen() && !this.dead) this.pause();
  };
  private readonly mobLoot = new MobLootResolver();
  private get transferBusy(): boolean { return this.statusOwner.busy || !!this.inventory?.busy || [...this.chests.values()].some(chest=>chest.busy) || [...this.brewingStands.values()].some(stand=>stand.busy) || this.leashes.busy || this.balloons.busy || !!this.mobs?.fireballBusy || !!this.world && (isFluidActionBusy(this.world) || isPortalActionBusy(this.world)); }
  private get ownershipBusy(): boolean { return this.prepared || this.portalTransfer || this.stopped || Game.handoffBusy || this.transferBusy || (!!this.furnaces && [...this.furnaces.values()].some(furnaceMutationBusy)); }
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
  /** Active simulation time only; Poison timings are an explicit application model. */
  private readonly statusOwner = new PlayerStatusOwner();
  get playerStatus(): PlayerStatus { return this.statusOwner.current; }
  set playerStatus(value: PlayerStatus) { if (this.statusOwner.busy) return; if (!this.statusOwner.replace(value)) this.markPlayerStatusRecovery(true); }
  private statusVisualSeconds = 0;
  private readonly motionPreference: MediaQueryList | null = null;
  /** Furnace contents by block position ("x,y,z"); they keep smelting while the world runs. */
  readonly furnaces = new Map<string, FurnaceState>();
  readonly brewingStands = new Map<string,BrewingStand>();
  private openBrewing:string|null=null;
  /** Loaded-area crop hydration and growth; its scheduler is persisted with the world. */
  readonly farming: FarmingSystem;
  readonly caneGrowth: CaneGrowthSystem;
  readonly caneSupport: CaneSupportSystem;
  private openFurnace: string | null = null;
  /** Seconds the use button has been held on food. */
  private eatTimer = 0;
  /** Ephemeral, exact-owner use progress; it is never part of the saved world. */
  private drinkOwner: { slot: number; source: ItemStack; id: number; count: number; mode: GameMode; elapsed: number } | null = null;
  private readonly handleDrinkMouseRelease = (e: MouseEvent) => { if (e.button === 2) this.cancelDrinking(); };
  private readonly handleDrinkPointerRelease = (e: PointerEvent) => this.endDrinkPointer(e);
  private readonly handleDrinkWheel = (e: WheelEvent) => { if (e.deltaY !== 0) this.cancelDrinking(); };
  private readonly handleDrinkBlur = () => this.cancelDrinking();
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
  private savedProgramReceipt: string | null = null;
  private savedSourceWorkspace?: CodeWorkspaceData;
  private hadPointerLock = false;
  private running = false;
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;

  constructor(
    private readonly container: HTMLElement,
    atlas: TextureAtlas,
    options: GameOptions,
    private readonly events: GameEvents,
    prepareOnly = false,
  ) {
    if (Game.handoffBusy) throw new Error("A Game handoff is in progress");
    this.prepared = prepareOnly;
    this.registerCleanup("animation frame", () => { if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest); });
    this.registerCleanup("program", () => this.runner?.stop());
    try {
    this.root = document.createElement("div");
    this.registerCleanup("root", () => this.root.remove());
    this.root.className = "game";
    this.root.hidden = this.prepared;
    if (!this.prepared) container.appendChild(this.root);
    this.motionPreference = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const canvas = this.canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    this.root.appendChild(canvas);

    const save = options.save;
    this.restoreDimensions(save);
    this.restoreBrewingOwners(save);this.restoreChestOwners(save);
    this.markBlazeRecovery(save); this.markWartRecovery(save); this.markCaneRecovery(save); this.markBoneMealRecovery(save); this.markRecyclingRecovery(save); this.markPortalRecovery(save); this.markIgnitionRecovery(save); this.markGlowRecovery(save); this.markSparklerRecovery(save); this.markBottleRecovery(save); this.markBucketRecovery(save); this.markCowRecovery(save); this.restorePlayerStatus(save);
    this.name = save?.name ?? options.name;
    if(options.preparedWorld){
      if(!prepareOnly||!save||this.recoverySections.length||!this.acceptPreparedWorld(options.preparedWorld,save))throw new Error("Invalid or already attached prepared arrival World");
      this.world=options.preparedWorld;
    }else{
      this.world = new World(save?.seed ?? options.seed, save ? save.generatorVersion ?? 1 : CURRENT_OVERWORLD_GENERATOR_VERSION, this.dimensionArchive?.active ?? "overworld");
      if (save) this.world.importEdits(sanitizeEdits(save.edits));
      this.restoreGravelHarvests(save); this.restoreFire(save); this.restoreFluids(save); this.restorePortals(save);
    }
    Game.attachedWorlds.add(this.world);
    this.registerCleanup("Chest owners",this.world.onBlockChanged((x,y,z,id)=>this.chestBlockChanged(x,y,z,id)));
    this.registerCleanup("brewing owners",this.world.onBlockChanged((x,y,z,id)=>this.brewingBlockChanged(x,y,z,id)));
    this.farming = new FarmingSystem(this.world, save?.farming);
    this.registerCleanup("farming", () => this.farming.dispose());
    this.caneSupport = new CaneSupportSystem(this.world, this.dropSink);
    this.registerCleanup("cane-support", () => this.caneSupport.dispose());
    const restoredCaneGrowth = readCaneGrowthState(save?.caneGrowth);
    this.caneGrowth = new CaneGrowthSystem(this.world, restoredCaneGrowth.kind === "valid" ? restoredCaneGrowth.data : undefined);
    this.registerCleanup("Cane growth", () => this.caneGrowth.dispose());
    this.snowballProjectiles = new SnowballProjectiles(this.world, save?.snowballProjectiles);
    this.registerCleanup("snowball simulation", () => this.snowballProjectiles.dispose());
    if (this.snowballProjectiles.loadIssues) { this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("snowball projectiles"); }
    this.worldDrops = new WorldDrops(this.world, save?.worldDrops);
    this.registerCleanup("drop simulation", () => this.worldDrops.dispose());
    this.leashes = new LeashStore(save?.leashes);
    this.registerCleanup("leash store", () => this.leashes.dispose());
    this.balloons = new BalloonStore(save?.balloons);
    this.registerCleanup("balloon store", () => this.balloons.dispose());
    this.balloonOriginalRaw = save?.balloons === undefined ? null : localStorage.getItem(SAVE_KEY);
    this.leashOriginalRaw = save?.leashes === undefined ? null : localStorage.getItem(SAVE_KEY);
    if (this.worldDrops.loadIssues) { this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("world drops"); }
    // Redstone: component states are blocks (in the edits); pending ticks are saved separately.
    this.redstone = new Redstone(this.world);
    if (save) this.redstone.restore(sanitizeScheduled(save.redstone), this.world.exportEdits());
    this.mode = save?.mode ?? options.mode;
    this.timeOfDay = save?.timeOfDay ?? 0.05;
    this.renderer = new WorldRenderer(canvas, this.world, atlas);
    this.registerCleanup("renderer", () => this.renderer.dispose());
    this.worldDropsView = new WorldDropsView(this.renderer.scene, atlas, this.worldDrops);
    this.registerCleanup("drop view", () => this.worldDropsView.dispose());
    this.snowballProjectilesView = new SnowballProjectilesView(this.renderer.scene, atlas, this.snowballProjectiles);
    this.registerCleanup("snowball view", () => this.snowballProjectilesView.dispose());
    this.mobs = new MobManager(this.world, this.renderer.scene, (mob, cause) => this.transferMobDeath(mob, cause),
      (mob) => this.mobLoot.exportPending(mob) !== undefined,
      (mob) => this.leashes.protectsMob(mob.id) || this.balloons.protectsMob(mob.id), () => this.ownershipBusy,
      (mob) => this.leashes.movementBias(mob, this.leashContext()),
      (mob) => this.balloons.externalAcceleration(mob, this.leashContext()),
      (mob) => this.balloons.protectsMob(mob.id));
    this.registerCleanup("mobs", () => this.mobs.dispose());
    this.leashView = new LeashView(this.renderer.scene);
    this.registerCleanup("leash view", () => this.leashView.dispose());
    this.balloonView = new BalloonView(this.renderer.scene);
    this.registerCleanup("balloon view", () => this.balloonView.dispose());
    this.glowStickView = new GlowStickView(this.root, atlas);
    this.registerCleanup("glow view", () => this.glowStickView.dispose());
    this.sparklerView = new SparklerView(this.root, atlas);
    this.registerCleanup("sparkler view", () => this.sparklerView.dispose());
    const creatures = sanitizeMobState(save?.mobs);
    if (creatures.present) this.mobs.restore(creatures.data, this.mobLoot);
    else for (const npc of sanitizeNpcs(save?.npcs)) this.mobs.spawn("npc", npc, npc);
    if (creatures.invalid) {
      this.recoveryOriginal = localStorage.getItem(SAVE_KEY);
      this.recoverySections.push("creatures");
    }
    if(save?.blazeFireballs!==undefined&&!this.mobs.restoreFireballs(save.blazeFireballs)){this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);if(!this.recoverySections.includes("Blaze owners"))this.recoverySections.push("Blaze owners");}
    this.hunger = sanitizeHunger(save?.hunger) ?? createHunger();
    const furnaces = sanitizeFurnaces(save?.furnaces);
    for (const f of furnaces.furnaces) this.furnaces.set(furnaceKey(f.x, f.y, f.z), f.state);
    this.mobs.spawning = save?.gamerules?.doMobSpawning ?? options.spawnAnimals ?? true;
    this.daylightCycle = save?.gamerules?.doDaylightCycle ?? true;
    this.keepInventory = save?.gamerules?.keepInventory ?? false;
    const playerState = sanitizePlayerState(save?.playerState);
    this.health = playerState.data.health; this.deathState = playerState.data.death; this.dead = this.health === 0;
    if (this.dead) clearPlayerStatus(this.playerStatus);
    if (playerState.invalid) {
      this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("player state");
    }

    // A saved Nether pose is already the world-local location owner. Avoid the
    // Overworld open-sky scan in a roofed realm. The pending dimension controller
    // must supply cross-realm respawn; this shortcut does not implement it.
    this.spawn = this.world.dimension === "nether" && save?.player.position ? { ...save.player.position } : this.findSpawn();
    this.body = createPlayerBody(save?.player.position ?? this.spawn);
    this.lastPos = { x: this.body.position.x, z: this.body.position.z };
    this.body.yaw = save?.player.yaw ?? 0;
    this.body.pitch = save?.player.pitch ?? 0;
    this.body.flying = save?.player.flying ?? false;
    this.inventory = save ? Inventory.fromJSON(save.inventory) : this.starterInventory();
    this.leashes.validateCrossReferences(this.leashContext());
    this.balloons.validateCrossReferences(this.leashContext());
    this.markLeashRecovery(); this.markBalloonRecovery();
    if (this.dead && (save?.playerStateOwnershipInvalid || !validatePlayerDeathOwnership(save?.inventory, save?.inventoryPending))) {
      this.recoveryOriginal = localStorage.getItem(SAVE_KEY); this.recoverySections.push("player state");
    }

    this.keyboard = new KeyboardMouseInput(canvas, { mouseButtons: !options.touch });
    this.registerCleanup("keyboard", () => this.keyboard.dispose());
    this.keyboard.enabled = !this.prepared;
    this.touch = options.touch ? new TouchControls(canvas, this.root) : null;
    if (this.touch) this.registerCleanup("touch", () => this.touch!.dispose());
    this.hud = new Hud(this.root, atlas, {
      onSelectSlot: (slot) => this.selectHudHotbar(slot),
      onOpenInventory: () => this.toggleInventory(),
      onPause: () => this.pause(),
      onChat: () => this.openChat(),
      onCamera: () => this.takePhoto(),
      onPortfolio: () => this.togglePortfolio(),
      onCodeBuilder: () => this.openCodeBuilder(),
      onShakeGlow: () => { this.tryShakeSelectedGlow(); },
      onLightSparkler: offhand => { this.tryLightSparkler(offhand); },
      onSwapOffhand: () => { this.trySwapOffhand(); },
    }, options.touch);
    this.registerCleanup("hud", () => this.hud.dispose());
    this.inventoryScreen = new InventoryScreen(this.root, atlas, () => this.toggleInventory(), (stack) => this.dropStack(stack), () => !this.ownershipBusy && !this.actionsNeedRecovery, () => this.ownershipBusy ? "Items are being transferred. Try again afterward." : this.recoverySections.includes("Cane growth") ? "Damaged Cane growth state. Export a backup before continuing." : this.recoverySections.includes("code workspace") ? "Damaged source workspace. Export a backup before continuing." : this.recoverySections.includes("chest owners") ? "Damaged Chest storage. Export a backup before continuing." : this.recoverySections.includes("brewing owners") ? "Damaged brewing stations. Export a backup before continuing." : this.recoverySections.includes("Blaze owners") ? "Damaged Blaze owners. Export a backup before continuing." : this.recoverySections.includes("dimensions") ? "Damaged dimensions. Export a backup before continuing." : this.recoverySections.includes("portals") ? "Damaged portals. Export a backup before continuing." : this.recoverySections.includes("fluids") && !this.itemsNeedRecovery ? "Damaged liquids or terrain version. Export a backup before moving items." : this.recoverySections.includes("fire") && !this.itemsNeedRecovery ? "Damaged fire. Export a backup before moving items." : this.recoverySections.includes("gravel harvest decisions") && !this.itemsNeedRecovery
      ? "Damaged gravel harvest decisions. Export a backup before moving items." : this.recoverySections.includes("adult cows") && !this.itemsNeedRecovery && !this.recoverySections.includes("player status")
      ? "Damaged adult cows. Export a backup before moving items." : "Saved items need repair. Export a backup before moving items.");
    this.chat = new ChatInput(this.root, (text) => this.runChat(text), () => this.resumeInput());
    this.portfolioScreen = new PortfolioScreen(this.root, this.portfolio, () => this.togglePortfolio());
    this.npcDialog = new NpcDialog(this.root, () => this.closeNpcDialog(), (mob) => this.mobs.refresh(mob));
    this.chalkDialog = new ChalkboardDialog(this.root, () => this.closeDialog(this.chalkDialog), (board) => this.chalkViews.update(board));
    this.bookScreen = new BookScreen(this.root, () => this.closeDialog(this.bookScreen));
    this.chalkViews = new ChalkboardViews(this.renderer.scene);
    this.registerCleanup("chalk views", () => this.chalkViews.dispose());
    const boards = sanitizeChalkboards(save?.chalkboards);
    for (const b of boards.boards) this.addChalkboard(b);
    this.agent = sanitizeAgent(save?.agent) ?? this.agentNearPlayer() ?? this.agentNearPlayer(this.spawn)
      ?? createAgent(this.spawn.x, this.spawn.y, this.spawn.z, facingTowards(this.body.yaw + Math.PI));
    // Saved programs are validated (a total function): invalid ones are dropped and reported.
    const loaded = loadPrograms(save?.programs);
    this.programs = loaded.programs;
    this.loadErrors = loaded.errors;
    this.savedSourceWorkspace = save?.codeWorkspace && structuredClone(save.codeWorkspace);
    if (save?.caneGrowthInvalid || restoredCaneGrowth.kind === "invalid") {
      this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
      this.recoverySections.push("Cane growth");
      this.loadErrors.push("Damaged Cane growth state (original save preserved)");
    }
    if (save?.codeWorkspaceInvalid) {
      this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
      this.recoverySections.push("code workspace");
      this.loadErrors.push("Damaged source workspace (original save preserved)");
    }
    if (loaded.errors.length) {
      this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
      this.recoverySections.push("programs");
    }
    for (const issue of this.dimensionIssues) this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for (const issue of save?.ignitionOwnershipIssues ?? []) this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for(const issue of this.chestIssues)this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for(const issue of this.brewingIssues)this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for(const issue of this.blazeIssues)this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for(const issue of this.recyclingIssues)this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for(const issue of this.caneIssues)this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for(const issue of this.boneMealIssues)this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for(const issue of this.wartIssues)this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for (const issue of save?.portalOwnershipIssues ?? []) this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    if (this.recoverySections.includes("portals")) this.loadErrors.push("Damaged portals (original save preserved)");
    if (this.recoverySections.includes("fluids")) this.loadErrors.push("Damaged liquids or terrain version (original save preserved)");
    if (this.recoverySections.includes("fire")) this.loadErrors.push("Damaged fire (original save preserved)");
    for (const issue of save?.glowOwnershipIssues ?? []) this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for (const issue of save?.sparklerOwnershipIssues ?? []) this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for (const issue of save?.bottleOwnershipIssues ?? []) this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    for (const issue of save?.bucketOwnershipIssues ?? []) this.loadErrors.push(`${issue.path}: ${issue.reason} (original save preserved)`);
    if (save?.cowStateInvalid) this.loadErrors.push("Damaged adult cows (original save preserved)");
    if (this.recoverySections.includes("gravel harvest decisions")) this.loadErrors.push("Damaged gravel harvest decisions (original save preserved)");
    if (this.leashes.loadIssues) this.loadErrors.push("Damaged leashes (original save preserved)");
    if (this.balloons.loadIssues) this.loadErrors.push("Damaged balloons (original save preserved)");
    if (playerState.invalid) this.loadErrors.push("Damaged player state (original save preserved)");
    if (this.recoverySections.includes("player status")) this.loadErrors.push("Damaged player status (original save preserved)");
    if (creatures.invalid) this.loadErrors.push(`${creatures.invalid} damaged creature entries (original save preserved)`);
    if (this.snowballProjectiles.loadIssues) this.loadErrors.push(`${this.snowballProjectiles.loadIssues} damaged snowball-projectile entries (original save preserved)`);
    if (this.worldDrops.loadIssues) this.loadErrors.push(`${this.worldDrops.loadIssues} damaged world-drop entries`);
    if (boards.dropped + furnaces.dropped > 0) this.loadErrors.push(`${boards.dropped + furnaces.dropped} damaged chalkboard/furnace entries`);
    this.agentView = new AgentView(this.renderer.scene, this.agent);
    this.registerCleanup("agent view", () => this.agentView.dispose());
    this.codeBuilder = new CodeBuilderScreen(
      this.root,
      {
        programs: this.programs,
        codeWorkspace: this.savedSourceWorkspace,
        run: (p) => this.runProgram(p),
        stop: () => this.stopProgram(),
        running: () => this.programRunning,
        giveHeldToAgent: () => this.giveHeldToAgent(),
        save: () => this.save(),
      },
      () => this.closeDialog(this.codeBuilder),
    );

    this.listen(canvas, "click", () => {
      if (!this.touch && !this.paused && !this.dead) this.keyboard.requestPointerLock();
    });
    this.listen(canvas, "pointerup", this.handleDrinkPointerRelease);
    this.listen(canvas, "pointercancel", this.handleDrinkPointerRelease);
    this.listen(canvas, "wheel", this.handleDrinkWheel, { passive: true });
    this.listen(window, "mouseup", this.handleDrinkMouseRelease);
    this.listen(window, "blur", this.handleDrinkBlur);
    this.listen(document, "pointerlockchange", this.handlePointerLock);
    this.listen(window, "keydown", this.handleKey);
    this.listen(window, "resize", this.handleResize);
    this.listen(window, "pagehide", this.handlePageHide);
    this.resize();
    if (this.inventoryScreen.restorePending(this.inventory, this.mode, sanitizeInventoryPending(save?.inventoryPending))) this.suspendInput();
    if (this.dead) {
      this.inventoryScreen.freezeForDeath(); this.suspendInput();
      if (this.deathState?.phase === "complete" && !this.deathState.keepInventory &&
          (this.inventory.slots.some(Boolean) || this.inventory.offhand !== null || ARMOR_SLOTS.some(slot => this.inventory.equipment[slot]) || this.inventoryScreen.pendingItems().length > 0)) {
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
    // Publish save authority only after construction succeeds. A failed
    // destination must not revoke the still-live previous world's writer.
    if (this.prepared) {
      this.paused = true; this.keyboard.enabled = false;
      if (this.touch) { this.touch.enabled = false; this.touch.setVisible(false); }
    } else Game.activeWriter = this;
    } catch (error) { this.retireWithoutSave(); throw error; }
  }

  private registerCleanup(name: string, dispose: () => void): void { this.cleanups.push({ name, dispose }); }

  private listen<E extends Event>(target: EventTarget, type: string, listener: (event: E) => void, options?: AddEventListenerOptions): void {
    const fn = listener as EventListener;
    target.addEventListener(type, fn, options);
    this.registerCleanup(`listener ${type}`, () => target.removeEventListener(type, fn, options));
  }

  private retireWithoutSave(): void {
    this.cancelDrinking();
    this.running = false; this.stopped = true;
    if (Game.activeWriter === this) Game.activeWriter = null;
    if (this.keyboard) this.keyboard.enabled = false;
    if (this.touch) this.touch.enabled = false;
    for (const entry of this.cleanups.splice(0).reverse()) {
      try { entry.dispose(); } catch (error) { this.cleanupErrors.push(`${entry.name}: ${String(error)}`); }
    }
  }

  /** Meshing/rendering only: no simulation, active input, animation loop or save. */
  /** Stage one live trip without granting the destination save authority. */
  preparePortalTravel(ticket:PortalContactTicket,atlas:TextureAtlas):PortalTravelHandle|null {
    if(this.ownershipBusy||this.paused||this.dead||this.recoverySections.length||this.screenOpen()||Game.activeWriter!==this||!ticket.unchanged())return null;
    const programIssue = this.pendingProgramIssue();
    if (programIssue) { this.hud.message(programIssue); return null; }
    const box=bodyBox(this.body.position),frame=ticket.frame;
    if(!this.world.portals.captureOwner(frame)||box.maxX<=frame.x||box.minX>=frame.x+(frame.axis==="x"?frame.width:1)||box.maxY<=frame.y||box.minY>=frame.y+frame.height||box.maxZ<=frame.z||box.minZ>=frame.z+(frame.axis==="z"?frame.width:1))return null;
    let target:Game|null=null,done=false;
    const previousPaused=this.paused;
    const resume=()=>{this.portalTransfer=false;if(Game.activeWriter===this&&!this.stopped){this.paused=previousPaused;this.keyboard.reset();}};
    try{
      const sourceVersion=this.world.blockMutationVersion,original=this.savePayload(),source=parseSave(original),sourceDimension=this.world.dimension,targetDimension=sourceDimension==="overworld"?"nether":"overworld";
      this.portalTransfer=true;this.paused=true;this.cancelDrinking();this.keyboard.reset();
      const sourceUnchanged=()=>!done&&!this.stopped&&!this.dead&&Game.activeWriter===this&&this.portalTransfer&&this.world.blockMutationVersion===sourceVersion&&ticket.unchanged()&&this.savePayload(false,true)===original;
      if(!sourceUnchanged())throw Error("Portal source changed");
      const scale=sourceDimension==="overworld"?1/8:8;
      const point={x:this.body.position.x*scale,y:this.body.position.y,z:this.body.position.z*scale};
      const old=source.dimensions?.inactive[targetDimension];
      const state:DimensionWorldState=old??{seed:source.seed,generatorVersion:targetDimension==="nether"?1:2,player:{...source.player,position:{...point},flying:false},edits:[]};
      const same=(p:typeof ticket.frame,q:typeof ticket.frame)=>p.axis===q.axis&&p.x===q.x&&p.y===q.y&&p.z===q.z&&p.width===q.width&&p.height===q.height;
      const link=source.dimensions?.links.find(l=>[l.from,l.to].some(e=>e.dimension===sourceDimension&&same(e.portal,ticket.frame)));
      const linked=link&&(link.from.dimension===targetDimension?link.from.portal:link.to.portal);
      const reserved=source.dimensions?.links.flatMap(l=>[l.from,l.to]).filter(e=>e.dimension===targetDimension&&(!linked||!same(e.portal,linked))).map(e=>e.portal)??[];
      const arrival=preparePortalArrival(state,targetDimension,point,linked,reserved,this.mode);
      if(!arrival||!sourceUnchanged())throw Error("No safe portal arrival");
      const route=createPortalRouteSave(source,sourceDimension,ticket.frame,arrival.state,arrival.frame,arrival.position,arrival.agentPosition);
      if(!route)throw Error("Portal route refused");
      target=Game.prepare(this.container,atlas,{name:this.name,seed:route.seed,mode:this.mode,touch:!!this.touch,save:route,preparedWorld:arrival.world},this.events);
      const staged=target,initialTarget=JSON.parse(staged.savePayload(false,true)) as SaveData;
      const preparedUnchanged=this.preparedOwnerGuard(initialTarget,targetDimension);
      const cancel=()=>{if(done)return;done=true;staged.discardPrepared();resume();};
      return Object.freeze({target:staged,prepareFrame:(budgetMs=8)=>{if(!sourceUnchanged()||!arrival.unchanged()){cancel();throw Error("Portal preparation cancelled");}return staged.prepareFrame(budgetMs);},commit:(external=()=>true)=>{
        if(!sourceUnchanged()||!arrival.unchanged()||!external()){cancel();return false;}
        // Rendering can load cold fluid neighbors. Capture the actual prepared owner again.
        const current=JSON.parse(staged.savePayload(false,true)) as SaveData;
        if(!preparedUnchanged(current)){cancel();return false;}
        const targetVersion=staged.world.blockMutationVersion;
        // Keep the validated archive's sparse owner shape. Canonical empty defaults added
        // by Game construction were pinned above and have not advanced during preparation.
        const targetState:DimensionWorldState={...arrival.state,edits:current.edits,...(current.portals?{portals:current.portals}:{})};
        const finalRoute=createPortalRouteSave(source,sourceDimension,ticket.frame,targetState,arrival.frame,arrival.position,arrival.agentPosition);
        if(!finalRoute){cancel();return false;}
        staged.dimensionArchive=finalRoute.dimensions;
        const targetSnapshot=staged.savePayload(false,true);
        const unchanged=()=>external()&&sourceUnchanged()&&arrival.unchanged()&&staged.world.blockMutationVersion===targetVersion&&staged.recoverySections.length===0&&staged.savePayload(false,true)===targetSnapshot;
        if(!staged.commitPrepared(this,unchanged)){cancel();return false;}
        done=true;this.portalTransfer=false;return true;
      },cancel});
    }catch{target?.discardPrepared();resume();return null;}
  }

  /** Complete the death receipt in its own realm before preparing a new living context. */
  prepareOverworldRespawn(atlas:TextureAtlas):PortalTravelHandle|null {
    if(this.recoverySections.length){this.deathError="Saved data needs repair. Export a backup before respawning.";return null;}
    if(this.world.dimension!=="nether"||this.ownershipBusy||!this.dead||!this.deathState||this.recoverySections.length||Game.activeWriter!==this)return null;
    if(!this.tryDeathTransfer()||this.deathState.phase!=="complete")return null;
    let target:Game|null=null,done=false;
    const previousPaused=this.paused;
    const resume=()=>{this.portalTransfer=false;if(Game.activeWriter===this&&!this.stopped){this.paused=previousPaused;this.keyboard.reset();}};
    try {
      const sourceVersion=this.world.blockMutationVersion,original=this.savePayload(),source=JSON.parse(original) as SaveData;
      this.portalTransfer=true;this.paused=true;this.cancelDrinking();this.keyboard.reset();
      const sourceUnchanged=()=>!done&&!this.stopped&&this.dead&&this.health===0&&this.deathState?.phase==="complete"&&Game.activeWriter===this&&this.portalTransfer&&this.world.blockMutationVersion===sourceVersion&&this.savePayload(false,true)===original;
      if(!sourceUnchanged())throw Error("Death source changed");
      const state:DimensionWorldState=source.dimensions?.inactive.overworld??{seed:source.seed,generatorVersion:2,player:{...source.player,flying:false},edits:[]};
      const arrival=prepareRespawnWorld(state);
      if(!arrival||!sourceUnchanged())throw Error("No safe Overworld respawn");
      const route=(world:DimensionWorldState):SaveData=>{
        const next=replaceDimensionWorld(source,world);
        next.player={...source.player,position:{...arrival.position},flying:false};
        next.playerState={health:MAX_HEALTH};next.hunger=createHunger();delete next.playerStatus;
        if(next.agent)next.agent={...next.agent,...arrival.agentPosition,slots:next.agent.slots};
        next.dimensions={version:1,active:"overworld",inactive:{nether:captureDimensionWorld(source)},links:source.dimensions?.links??[]};
        serializeSave(next,createDimensionGeneratedBlockProbe());return next;
      };
      const initialRoute=route(arrival.state);
      target=Game.prepare(this.container,atlas,{name:this.name,seed:initialRoute.seed,mode:this.mode,touch:!!this.touch,save:initialRoute,preparedWorld:arrival.world},this.events);
      const staged=target,initialTarget=JSON.parse(staged.savePayload(false,true)) as SaveData,preparedUnchanged=this.preparedOwnerGuard(initialTarget,"overworld");
      const cancel=()=>{if(done)return;done=true;staged.discardPrepared();resume();};
      return Object.freeze({target:staged,prepareFrame:(budgetMs=8)=>{if(!sourceUnchanged()||!arrival.unchanged()){cancel();throw Error("Respawn preparation cancelled");}return staged.prepareFrame(budgetMs);},commit:(external=()=>true)=>{
        try {
          if(!sourceUnchanged()||!arrival.unchanged()||!external()){cancel();return false;}
          const current=JSON.parse(staged.savePayload(false,true)) as SaveData;
          if(!preparedUnchanged(current)){cancel();return false;}
          const targetVersion=staged.world.blockMutationVersion;
          const finalRoute=route({...arrival.state,edits:current.edits,...(current.portals?{portals:current.portals}:{})});
          staged.dimensionArchive=finalRoute.dimensions;
          const targetSnapshot=staged.savePayload(false,true);
          const unchanged=()=>external()&&sourceUnchanged()&&arrival.unchanged()&&staged.world.blockMutationVersion===targetVersion&&staged.recoverySections.length===0&&staged.savePayload(false,true)===targetSnapshot;
          if(!staged.commitPreparedTransfer(this,unchanged,true)){cancel();return false;}
          done=true;this.portalTransfer=false;return true;
        }catch{cancel();return false;}
      },cancel});
    }catch{target?.discardPrepared();resume();this.deathError="Overworld respawn could not be prepared. Your world and items remain preserved. Retry or export a backup.";return null;}
  }

  private preparedOwnerGuard(initialTarget:SaveData,targetDimension:"overworld"|"nether"):(current:SaveData)=>boolean {
      const targetOwners=(value:SaveData)=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key])=>key!=="edits")));
      const initialOwners=targetOwners(initialTarget),probe=createDimensionGeneratedBlockProbe();
      const initialEdits=new Map(initialTarget.edits.map(e=>[`${e[0]},${e[1]},${e[2]}`,e[3]]));
      return (current:SaveData)=>{
        if(targetOwners(current)!==initialOwners)return false;
        const edits=new Map(current.edits.map(e=>[`${e[0]},${e[1]},${e[2]}`,e[3]]));
        if([...initialEdits.keys()].some(key=>!edits.has(key)))return false;
        const cell=(map:Map<string,number>,x:number,y:number,z:number)=>map.get(`${x},${y},${z}`)??probe(targetDimension,initialTarget.seed,initialTarget.generatorVersion??1,x,y,z);
        return current.edits.every(([x,y,z,id])=>{
          const key=`${x},${y},${z}`;if(initialEdits.has(key)&&initialEdits.get(key)===id)return true;
          return id===blockId("obsidian")&&cell(initialEdits,x,y,z)===blockId("lava")&&[[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([dx,dy,dz])=>cell(initialEdits,x+dx,y+dy,z+dz)===blockId("water")&&cell(edits,x+dx,y+dy,z+dz)===blockId("water"));
        });
      };
  }

  /** Compare against a detached reconstruction; never restore into the guarded arrival owner. */
  private acceptPreparedWorld(world:World,save:SaveData):boolean {
    captureDimensionWorld(save); // Refuse parser diagnostics before considering normalized owners.
    if(!(world instanceof World)||Game.attachedWorlds.has(world)||world.blockSourceLeaseBusy||world.seed!==save.seed||world.generatorVersion!==(save.generatorVersion??1)||world.dimension!==(this.dimensionArchive?.active??"overworld"))return false;
    const reference=new World(save.seed,save.generatorVersion??1,world.dimension);
    reference.importEdits(sanitizeEdits(save.edits));
    if(reference.gravelHarvests.restore(save.gravelHarvests).invalid||reference.fires.restore(save.fire,reference.exportEdits()).invalid||reference.fluids.restore(save.fluids).invalid||reference.portals.restore(save.portals,reference.exportEdits()).invalid)return false;
    const stable=(value:unknown):string=>{
      const ordered=(v:unknown):unknown=>Array.isArray(v)?v.map(ordered):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,ordered(x)])):v;
      return JSON.stringify(ordered(value));
    };
    const state=(w:World)=>({edits:w.exportEdits().sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]),gravel:w.gravelHarvests.exportState(),fire:w.fires.exportState(),fluids:w.fluids.exportState(),portals:w.portals.exportState()});
    return stable(state(world))===stable(state(reference));
  }

  prepareFrame(budgetMs = 8): boolean {
    if (!this.prepared || this.stopped || Game.handoffBusy || !Number.isFinite(budgetMs) || budgetMs < 0) return false;
    this.positionCamera();
    this.renderer.updateChunks(budgetMs);
    this.renderer.render(skyAt(this.timeOfDay,this.world.dimension), false, 0);
    return this.renderer.isAreaReady(2);
  }

  private positionCamera(): void {
    const camera = this.renderer.camera;
    camera.position.set(this.body.position.x, this.body.position.y + EYE_HEIGHT, this.body.position.z);
    camera.rotation.set(this.body.pitch, this.body.yaw, 0);
  }

  discardPrepared(): boolean {
    if (!this.prepared || Game.handoffBusy) return false;
    this.retireWithoutSave(); return true;
  }

  /** Publishes one ready target, then retires the expected paused source without saving it. */
  commitPrepared(source: Game, unchanged:()=>boolean=()=>true): boolean {
    return this.commitPreparedTransfer(source,unchanged,false);
  }

  private commitPreparedTransfer(source:Game,unchanged:()=>boolean,completedDeath:boolean):boolean {
    const pose = { ...this.body.position, yaw: this.body.yaw, pitch: this.body.pitch };
    const samePose = () => this.body.position.x === pose.x && this.body.position.y === pose.y && this.body.position.z === pose.z && this.body.yaw === pose.yaw && this.body.pitch === pose.pitch;
    const samePrograms = () => {
      if (!completedDeath && source.pendingProgramIssue()) return false;
      const from = source.programSnapshot(), to = this.programSnapshot();
      return from.ok && to.ok && this.codeReceipt(from) === this.codeReceipt(to);
    };
    const valid = () => unchanged() && samePrograms() && samePose() && this.prepared && !this.stopped && !this.dead && !this.actionsNeedRecovery && !this.transferBusy &&
      source !== this && Game.activeWriter === source && source.paused && !source.stopped && (completedDeath?source.dead&&source.health===0&&source.deathState?.phase==="complete"&&source.recoverySections.length===0:!source.dead) && !source.actionsNeedRecovery && !source.transferBusy;
    if (Game.handoffBusy || !valid()) return false;
    Game.handoffBusy = true;
    try {
      this.positionCamera();
      if (!this.renderer.isAreaReady(2) || !valid()) return false;
      // DOM/input/frame setup may throw or invoke a host callback. Do it before
      // moving writer authority and recheck both endpoints afterwards.
      this.container.appendChild(this.root);
      this.resize(); this.positionCamera(); this.renderer.render(skyAt(this.timeOfDay,this.world.dimension), false, 0); this.keyboard.reset();
      if (this.touch) this.touch.setVisible(true);
      this.root.hidden = false;
      const time = performance.now(); this.frameRequest = this.requestFrame();
      this.positionCamera();
      if (!valid() || !this.renderer.isAreaReady(2) || !valid()) { this.retireWithoutSave(); return false; }
      this.prepared = false; this.paused = false; this.lastTime = time;
      this.keyboard.enabled = !completedDeath||!this.screenOpen(); if (this.touch) this.touch.enabled = !completedDeath||!this.screenOpen();
      this.running = true; Game.activeWriter = this;
      source.retireWithoutSave();
      return true;
    } catch (error) {
      this.cleanupErrors.push(`handoff: ${String(error)}`); this.retireWithoutSave(); return false;
    } finally { Game.handoffBusy = false; }
  }

  private requestFrame(): number {
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now; this.tick(dt);
      if (this.running) this.frameRequest = requestAnimationFrame(frame);
    };
    return requestAnimationFrame(frame);
  }

  start(): void {
    if (this.prepared || this.stopped || this.running || Game.handoffBusy) return;
    this.lastTime = performance.now(); this.frameRequest = this.requestFrame(); this.running = true;
  }

  stop(): boolean {
    this.cancelDrinking();
    if (this.stopped) return true;
    if (this.prepared || Game.handoffBusy) return false;
    const issue = !this.dead && this.pendingProgramIssue();
    if (issue) { this.saveError = issue; this.hud.message(issue); return false; }
    if (!this.save()) return false;
    if (!this.dead) {
      const current = this.programSnapshot();
      if (this.pendingProgramIssue() || !current.ok || this.codeReceipt(current) !== this.savedProgramReceipt) {
        this.saveError = "World saved, but program edits changed while saving. Keep this game open and retry Save & Quit.";
        this.hud.message(this.saveError); return false;
      }
    }
    this.retireWithoutSave(); return true;
  }

  /** Requests a complete-world backup; requesting a download never bypasses failed browser storage. */
  exportSaveBackup(): void {
    if (this.ownershipBusy) { this.hud.message("Items are being transferred. Retry the backup afterward."); return; }
    this.cancelDrinking();
    this.paused = true; this.keyboard.reset();
    this.markPlayerStatusRecovery();
    this.leashes.reconcileLoadedReferences(this.leashContext()); this.markLeashRecovery();
    this.balloons.reconcileLoadedReferences(this.leashContext()); this.markBalloonRecovery();
    let backup:string;
    try {
      const payload=this.savePayload(true);
      backup=this.recoveryOriginal===null?payload:JSON.stringify({...JSON.parse(payload),recoveryOriginalSave:this.recoveryOriginal});
    } catch(error) {
      // A damaged physical owner may make even a detached normalized snapshot invalid.
      // Preserve the exact input in an explicit evidence envelope instead of repairing it.
      if(this.recoveryOriginal===null&&!this.recoverySections.includes("brewing owners")&&!this.recoverySections.includes("chest owners"))throw error;
      backup=JSON.stringify({recoveryBackupFormat:(this.recoverySections.includes("brewing owners")||this.recoverySections.includes("chest owners"))?"original-and-live-v1":"original-only-v1",recoveryOriginalSave:this.recoveryOriginal,...((this.recoverySections.includes("brewing owners")||this.recoverySections.includes("chest owners"))?{recoveryLiveSave:this.captureSaveData(true)}:{}),reason:error instanceof Error?error.message:"Normalized recovery snapshot unavailable"});
      this.hud.message((this.recoverySections.includes("brewing owners")||this.recoverySections.includes("chest owners"))?"Original and live world owners exported for repair; a normalized backup could not be created.":"Original save exported for repair; a normalized world backup could not be created.");
    }
    const url = URL.createObjectURL(new Blob([backup], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${this.name.replace(/[^a-z0-9_-]/gi, "_") || "world"}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  pause(): void {
    this.cancelDrinking();
    if (this.ownershipBusy) return;
    if (this.paused || this.dead) return;
    this.paused = true;
    this.keyboard.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.save();
    this.events.onPause();
  }

  resume(): void {
    this.cancelDrinking();
    if (this.dead || this.ownershipBusy) return;
    this.paused = false;
    this.lastTime = performance.now();
    if (!this.touch) this.keyboard.requestPointerLock();
  }

  setMode(mode: GameMode): void {
    if (this.dead || this.ownershipBusy || this.actionsNeedRecovery) return;
    this.cancelDrinking();
    this.mode = mode;
    if (mode === "survival") this.body.flying = false;
    this.health = MAX_HEALTH;
    this.hud.message(`Game mode set to ${mode === "creative" ? "Creative" : "Survival"}`);
  }

  /** A failed item transfer keeps the same death overlay and all original owners. */
  respawn(): boolean {
    if(this.world?.dimension==="nether"){this.deathError="Prepare a safe Overworld respawn before continuing.";return false;}
    this.cancelDrinking();
    if (this.ownershipBusy || this.actionsNeedRecovery || !this.dead || !this.deathState || !this.tryDeathTransfer()) return false;
    this.dead = false; this.paused = false; this.deathState = undefined; this.deathError = "";
    this.health = MAX_HEALTH; this.hunger = createHunger(); clearPlayerStatus(this.playerStatus);
    this.body.position = { ...this.spawn }; this.body.velocity = { x: 0, y: 0, z: 0 };
    this.fallStart = null; this.lastPos = { x: this.spawn.x, z: this.spawn.z }; this.lastTime = performance.now();
    if (this.inventoryScreen.resumePending()) this.suspendInput(); else this.resumeInput();
    return true;
  }

  private tryDeathTransfer(): boolean {
    if (this.ownershipBusy || !this.deathState) return false;
    if (this.actionsNeedRecovery) { this.deathError = this.itemsNeedRecovery ? "Saved items need repair. Export a backup before respawning." : this.recoverySections.includes("Cane growth") ? "Damaged Cane growth state. Export a backup before continuing." : this.recoverySections.includes("code workspace") ? "Damaged source workspace. Export a backup before continuing." : this.recoverySections.includes("chest owners") ? "Damaged Chest storage. Export a backup before continuing." : this.recoverySections.includes("brewing owners") ? "Damaged brewing stations. Export a backup before continuing." : this.recoverySections.includes("Blaze owners") ? "Damaged Blaze owners. Export a backup before continuing." : this.recoverySections.includes("dimensions") ? "Damaged dimensions. Export a backup before continuing." : this.recoverySections.includes("portals") ? "Damaged portals. Export a backup before continuing." : this.recoverySections.includes("fluids") ? "Damaged liquids or terrain version. Export a backup before continuing." : this.recoverySections.includes("fire") ? "Damaged fire. Export a backup and repair the saved data before respawning." : this.recoverySections.includes("gravel harvest decisions") ? "Damaged gravel harvest decisions. Export a backup and repair the saved data before respawning." : this.recoverySections.includes("adult cows") && !this.recoverySections.includes("player status") ? "Damaged adult cows. Export a backup and repair the saved data before respawning." : "Damaged player status. Export a backup and repair the saved data before respawning."; return false; }
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

  private markBalloonRecovery(): void {
    if (!this.balloons.loadIssues || this.recoverySections.includes("balloons")) return;
    this.recoveryOriginal ??= this.balloonOriginalRaw ?? localStorage.getItem(SAVE_KEY);
    this.recoverySections.push("balloons");
    this.loadErrors?.push("Damaged balloons (original save preserved)");
  }

  private fenceBalloonKeys(x: number, y: number, z: number): number[] {
    return this.balloons.records.filter(r => r.phase === "active" && r.target.kind === "fence" &&
      r.target.x === x && r.target.y === y && r.target.z === z).map(r => r.key);
  }

  private restoreChestOwners(save:SaveData|undefined):void {
    if(!save)return;const probe=createDimensionGeneratedBlockProbe(),dimension=this.dimensionArchive?.active??"overworld";
    const read=readChestOwners(save,(x,y,z)=>probe(dimension,save.seed,save.generatorVersion??1,x,y,z));
    this.chestIssues=[...(save.chestOwnershipIssues??[]),...read.issues];if(this.chestIssues.length){this.freezeChestOwnership("Damaged saved Chest owners");return;}
    for(const row of read.stations)this.chests.set(furnaceKey(row.x,row.y,row.z),new SingleChest(row.state));
  }
  private freezeChestOwnership(reason:string):void {
    this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);if(!this.recoverySections.includes("chest owners")){this.recoverySections.push("chest owners");this.chestIssues.push({path:"chests",reason});this.loadErrors?.push(`${reason} (original and live owners preserved)`);}this.cancelDrinking();
  }
  private chestBlockChanged(x:number,y:number,z:number,id:number):void {
    const key=furnaceKey(x,y,z),chest=this.chests.get(key);
    if(id===203){if(!chest&&!this.actionsNeedRecovery)this.chests.set(key,new SingleChest());return;}if(!chest)return;
    if(chest.contents().length){this.freezeChestOwnership("Chest removed outside its ownership transfer");return;}
    const lease=chest.reserveContents();if(!lease){this.freezeChestOwnership("Chest changed during ownership transfer");return;}if(lease.retire())this.chests.delete(key);else lease.cancel();
  }
  private reconcileChestOwners():void {for(const[key,chest]of this.chests){const[x,y,z]=key.split(",").map(Number),id=this.world.getLoadedBlock(x,y,z);if(id!==undefined&&id!==203)this.chestBlockChanged(x,y,z,id);}}

  private restoreBrewingOwners(save:SaveData|undefined):void {
    if(!save)return;
    const probe=createDimensionGeneratedBlockProbe(),dimension=this.dimensionArchive?.active??"overworld";
    const read=readBrewingStandOwners(save,(x,y,z)=>probe(dimension,save.seed,save.generatorVersion??1,x,y,z));
    this.brewingIssues=[...(save.brewingOwnershipIssues??[]),...read.issues,...diagnoseRawBrewingItemOwnership(save)];
    if(this.brewingIssues.length){this.freezeBrewingOwnership("Damaged saved brewing owners");return;}
    for(const row of read.stations)this.brewingStands.set(furnaceKey(row.x,row.y,row.z),new BrewingStand(row.state));
  }

  private freezeBrewingOwnership(reason:string):void {
    this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);
    if(!this.recoverySections.includes("brewing owners")){
      this.recoverySections.push("brewing owners");
      this.brewingIssues.push({path:"brewingStands",reason});
      this.loadErrors?.push(`${reason} (original and live owners preserved)`);
    }
    this.cancelDrinking();
  }

  private brewingBlockChanged(x:number,y:number,z:number,id:number):void {
    const key=furnaceKey(x,y,z),stand=this.brewingStands.get(key);
    if(id===BREWING_STAND){if(!stand&&!this.actionsNeedRecovery)this.brewingStands.set(key,new BrewingStand());return;}
    if(!stand)return;
    if(stand.contents().length){this.freezeBrewingOwnership("Brewing stand removed outside its ownership transfer");return;}
    const lease=stand.reserveContents();if(!lease){this.freezeBrewingOwnership("Brewing station changed during ownership transfer");return;}
    if(lease.retire())this.brewingStands.delete(key);else lease.cancel();
  }

  private reconcileBrewingOwners():void {
    for(const [key,stand]of this.brewingStands){const [x,y,z]=key.split(",").map(Number),id=this.world.getLoadedBlock(x,y,z);if(id!==undefined&&id!==BREWING_STAND)this.brewingBlockChanged(x,y,z,id);if(stand.loadIssues)this.freezeBrewingOwnership("Damaged live brewing owner");}
  }

  private updateBrewingStations(dt:number):void {
    if(this.paused||this.stopped||this.ownershipBusy||this.actionsNeedRecovery)return;
    this.reconcileChestOwners();this.reconcileBrewingOwners();if(this.actionsNeedRecovery)return;
    for(const [key,stand]of this.brewingStands){const [x,y,z]=key.split(",").map(Number);if(this.world.getLoadedBlock(x,y,z)===BREWING_STAND)stand.update(dt);}
  }

  private beginBlockRelease(x:number,y:number,z:number):ReleaseAttempt {
    return combineReleaseAttempts([()=>this.beginFenceRelease(x,y,z),()=>{
      if(this.world.getLoadedBlock(x,y,z)!==203)return{kind:"none"};const key=furnaceKey(x,y,z),chest=this.chests.get(key);if(!chest)return{kind:"refused",reason:"Chest ownership is unavailable"};const lease=chest.reserveContents();if(!lease)return{kind:"refused",reason:"Chest contents are busy"};
      return{kind:"ready",lease:{refundStacks:[],valid:()=>this.chests.get(key)===chest&&this.world.getLoadedBlock(x,y,z)===203&&lease.valid(),consumeAfterReceiverCommit:()=>{if(lease.retire())this.chests.delete(key);},cancel:()=>lease.cancel()}};
    },()=>{
      const key=furnaceKey(x,y,z),stand=this.brewingStands.get(key);
      if(this.world.getLoadedBlock(x,y,z)!==BREWING_STAND)return{kind:"none"};
      if(!stand)return{kind:"refused",reason:"Brewing stand ownership is unavailable"};
      const lease=stand.reserveContents();if(!lease)return{kind:"refused",reason:"Brewing contents are busy"};
      return{kind:"ready",lease:{refundStacks:[],valid:()=>this.brewingStands.get(key)===stand&&this.world.getLoadedBlock(x,y,z)===BREWING_STAND&&lease.valid(),consumeAfterReceiverCommit:()=>{if(lease.retire())this.brewingStands.delete(key);},cancel:()=>lease.cancel()}};
    },()=>{
      if(this.world.getLoadedBlock(x,y,z)!==FURNACE)return{kind:"none"};
      const key=furnaceKey(x,y,z),furnace=this.furnaces.get(key);if(!furnace)return{kind:"none"};
      const lease=reserveFurnaceContents(furnace);if(!lease)return{kind:"refused",reason:"Furnace contents are busy or invalid"};
      return{kind:"ready",lease:{refundStacks:[],valid:()=>this.furnaces.get(key)===furnace&&this.world.getLoadedBlock(x,y,z)===FURNACE&&lease.valid(),consumeAfterReceiverCommit:()=>{if(lease.retire())this.furnaces.delete(key);},cancel:()=>lease.cancel()}};
    }]);
  }

  private beginFenceRelease(x: number, y: number, z: number): ReleaseAttempt {
    const context = this.leashContext();
    return combineReleaseAttempts([
      () => this.leashes.beginRelease(this.fenceLeashKeys(x, y, z), context, true),
      () => this.balloons.beginRelease(this.fenceBalloonKeys(x, y, z), context, true),
    ]);
  }

  private releaseBalloon(key: number): boolean {
    const record = this.balloons.records.find(r => r.key === key);
    if (!record) return false;
    const attempt = this.balloons.beginRelease([key], this.leashContext());
    if (attempt.kind !== "ready") return false;
    try {
      const batch = joinLeashRefundSink(attempt.lease, this.dropSink)([], { ...record.position });
      return Boolean(batch && batch.commit());
    } catch { return false; }
    finally { attempt.lease.cancel(); }
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

  private transferMobDeath(mob: Mob, cause: MobDeathCause = "suffocation"): boolean {
    const context = this.leashContext();
    const attempt = combineReleaseAttempts([
      () => this.leashes.beginRelease(this.leashes.records.filter(r => r.targetMobId === mob.id).map(r => r.key), context, true),
      () => this.balloons.beginRelease(this.balloons.records.filter(r => r.target.kind === "mob" && r.target.mobId === mob.id).map(r => r.key), context, true),
    ]);
    if (attempt.kind === "refused") return false;
    const lease = attempt.kind === "ready" ? attempt.lease : null;
    const health = mob.health, at = { ...mob.position, y: mob.position.y + .3 };
    try {
      const sink = lease ? joinLeashRefundSink(lease, this.dropSink, () => this.mobs.mobs.includes(mob) && mob.health === health) : this.dropSink;
      const ok = this.mobLoot.tryDrop(mob, sink, at, cause === "player" || cause === "agent" ? cause : "environment");
      if (!ok) this.hud?.message("Could not preserve mob drops and attached items; the mob remains");
      return ok;
    } catch { return false; }
    finally { lease?.cancel(); }
  }

  private savePayload(recoveryBackup = false, internalSnapshot=false, programOverride?: CodeProgram[], textOverride?: { workspace?: CodeWorkspaceData }): string {
    return serializeSave(this.captureSaveData(recoveryBackup,internalSnapshot,programOverride,textOverride));
  }

  private programSnapshot() {
    const stage = this.codeBuilder?.prepareProgramSnapshot?.() ?? { ok: true as const, programs: this.programs ?? [], warning: "", accept: () => true };
    if (!stage.ok) return stage;
    return { ...stage, codeWorkspace: Object.hasOwn(stage, "codeWorkspace") ? stage.codeWorkspace : this.savedSourceWorkspace };
  }
  private codeReceipt(stage: { programs: CodeProgram[]; codeWorkspace?: CodeWorkspaceData }): string {
    return JSON.stringify({ programs: stage.programs, codeWorkspace: stage.codeWorkspace });
  }

  private pendingProgramIssue(): string | null { return this.codeBuilder?.uncommittedProgramIssue?.() ?? null; }

  private captureSaveData(recoveryBackup = false, internalSnapshot=false, programOverride?: CodeProgram[], textOverride?: { workspace?: CodeWorkspaceData }): SaveData {
    if (this.ownershipBusy && !(internalSnapshot&&!this.stopped&&!this.transferBusy)) throw new Error("An ownership transfer is in progress");
    const stage = programOverride ? null : this.programSnapshot();
    if (stage && !stage.ok) throw new Error(stage.error);
    const checkpointPrograms = programOverride ?? (stage && stage.ok ? stage.programs : this.programs);
    const textStage = textOverride ?? { workspace: stage && stage.ok ? stage.codeWorkspace : this.savedSourceWorkspace };
    const checkpointWorkspace = recoveryBackup && this.recoverySections.includes("code workspace") ? undefined : textStage.workspace;
    const gravelHarvests = this.world.gravelHarvests.exportState();
    const fire = this.world.fires.exportState();
    const fluids = this.world.fluids.exportState();
    const portals = this.world.portals.exportState();
    const dimensions = recoveryBackup && this.recoverySections.includes("dimensions") ? undefined : this.dimensionArchive && structuredClone(this.dimensionArchive);
    if (dimensions) {
      // A legitimate live collapse removes only link metadata. Raw dangling
      // links are instead refused by restoreDimensions before normalization.
      const portalKey = (p: typeof portals.records[number]) => `${p.axis}:${p.x},${p.y},${p.z}:${p.width},${p.height}`;
      const live = new Set(portals.records.map(portalKey));
      dimensions.links = dimensions.links.filter(link => [link.from,link.to].every(e => e.dimension !== dimensions.active || live.has(portalKey(e.portal))));
    }
    const portalBackup = recoveryBackup && this.recoverySections.includes("portals");
    const blazeFireballs=this.mobs.exportFireballs();
    return {
        version:1,
        name: this.name,
        seed: this.world.seed,
        ...(dimensions ? { dimensions } : {}),
        generatorVersion: this.world.generatorVersion,
        ...(!(recoveryBackup && this.recoverySections.includes("fluids")) ? { fluids } : {}),
        mode: this.mode,
        timeOfDay: this.timeOfDay,
        player: { position: { ...this.body.position }, yaw: this.body.yaw, pitch: this.body.pitch, flying: this.body.flying },
        inventory: this.inventory.toJSON(),
        inventoryPending: this.inventoryScreen.pendingItems(),
        playerState: { health: this.health, ...(this.deathState ? { death: this.deathState } : {}) },
        snowballProjectiles: this.snowballProjectiles.toJSON(),
        ...(!(recoveryBackup&&this.recoverySections.includes("Blaze owners"))&&(blazeFireballs.nextKey>1||blazeFireballs.records.length)?{blazeFireballs}:{}),
        worldDrops: this.worldDrops.toJSON(),
        ...(recoveryBackup && this.leashes.loadIssues ? {} : { leashes: this.leashes.toJSON() }),
        ...(recoveryBackup && this.balloons.loadIssues ? {} : { balloons: this.balloons.toJSON() }),
        edits: portalBackup ? this.world.exportEdits().filter(edit => edit[3] !== 192 && edit[3] !== 193) : this.world.exportEdits(),
        ...(portals.records.length && !portalBackup ? { portals } : {}),
        ...(fire.records.length && !(recoveryBackup && this.recoverySections.includes("fire")) ? { fire } : {}),
        ...(gravelHarvests.records.length && !(recoveryBackup && this.recoverySections.includes("gravel harvest decisions")) ? { gravelHarvests } : {}),
        mobs: this.mobs.exportState(this.mobLoot),
        npcs: this.mobs.exportNpcs(),
        hunger: { ...this.hunger },
        ...(hasPlayerStatus(this.playerStatus) && !(recoveryBackup && this.recoverySections.includes("player status")) ? { playerStatus: structuredClone(this.playerStatus) } : {}),
        chalkboards: [...this.chalkboards.values()].map((b) => ({ ...b })),
        agent: { ...this.agent, slots: this.agent.slots.map((s) => (s ? { ...s } : null)) },
        programs: checkpointPrograms,
        ...(checkpointWorkspace ? { codeWorkspace: checkpointWorkspace } : {}),
        chests:[...this.chests].map(([key,chest])=>{const [x,y,z]=key.split(",").map(Number);return{x,y,z,state:chest.snapshot()};}),
        brewingStands:[...this.brewingStands].map(([key,stand])=>{const [x,y,z]=key.split(",").map(Number);return{x,y,z,state:stand.snapshot()};}),
        furnaces: [...this.furnaces].map(([key, state]) => {
          const [x, y, z] = key.split(",").map(Number);
          return { x, y, z, state };
        }),
        gamerules: { doMobSpawning: this.mobs.spawning, doDaylightCycle: this.daylightCycle, keepInventory: this.keepInventory },
        redstone: this.redstone.exportScheduled(),
        farming: this.farming.toJSON(),
        ...(!(recoveryBackup && this.recoverySections.includes("Cane growth")) ? { caneGrowth: this.caneGrowth.toJSON() } : {}),
      };
  }

  save(): boolean {
    if (this.stopped || Game.activeWriter !== this) return false;
    if (this.ownershipBusy) { this.saveError = "Items are being transferred. Retry saving afterward."; return false; }
    this.markPlayerStatusRecovery();
    this.reconcileChestOwners();this.reconcileBrewingOwners();
    this.leashes.reconcileLoadedReferences(this.leashContext());
    this.leashes.validateCrossReferences(this.leashContext()); this.markLeashRecovery();
    this.balloons.reconcileLoadedReferences(this.leashContext());
    this.balloons.validateCrossReferences(this.leashContext()); this.markBalloonRecovery();
    if (this.recoverySections.length > 0) {
      this.saveError = `Damaged ${[...new Set(this.recoverySections)].join(" and ")}. Original save preserved. Export a backup; repair the saved data before saving or quitting.`;
      this.hud.message(this.saveError); return false;
    }
    try {
      const stage = this.programSnapshot();
      if (!stage.ok) { this.saveError = stage.error; this.hud.message(this.saveError); return false; }
      const receipt = this.codeReceipt(stage);
      const workspaceReceipt = stage.codeWorkspace && structuredClone(stage.codeWorkspace);
      const payload = this.savePayload(false, false, stage.programs, { workspace: stage.codeWorkspace });
      localStorage.setItem(SAVE_KEY, payload);
      this.savedProgramReceipt = receipt;
      this.savedSourceWorkspace = workspaceReceipt;
      // Disk now owns a complete checkpoint. A stale editor acknowledgement must not
      // turn this successful item/death receipt into a reported failed world write.
      try { stage.accept(); } catch { /* Keep newer session work; do not roll back disk. */ }
      this.saveError = "";
      if (stage.warning) { try { this.hud.message(stage.warning); } catch { /* Disk checkpoint already committed. */ } }
      return true;
    } catch {
      this.saveError = "World could not be saved. Keep this game open, retry, or export a backup before leaving.";
      this.hud.message(this.saveError); return false;
    }
  }

  private dropStack(stack: ItemStack): boolean {
    if (this.ownershipBusy || this.actionsNeedRecovery) return false;
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
    if (this.ownershipBusy) { this.cancelDrinking(); return; }
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    this.clock += dt;
    this.markPlayerStatusRecovery();
    const active = !this.paused && !this.dead && !this.screenOpen() && !this.actionsNeedRecovery;
    const frames = [this.keyboard.poll()];
    if (this.touch) frames.push(this.touch.poll());
    const input = mergeFrames(frames);

    if (active) {
      this.body.yaw += input.lookYaw;
      this.body.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.body.pitch + input.lookPitch));
      if (input.hotbarSlot !== null) this.selectHotbar(input.hotbarSlot);
      if (input.hotbarScroll !== 0) { this.cancelDrinking(); this.inventory.scroll(input.hotbarScroll); }
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
      if (!this.dead) this.updatePlayerStatus(dt);
      if (!this.dead) this.updateFire(dt);
      if (!this.dead) this.updateFluids(dt);
      if (!this.dead && this.body.position.y < -20) this.hurt(MAX_HEALTH, "void");
      if (!this.dead && this.daylightCycle) this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
      const light = skyAt(this.timeOfDay,this.world.dimension).light;
      // Hostile mobs ignore creative players (as in Minecraft).
      const target = this.mode === "survival" ? this.body.position : null;
      if (!this.dead) {
        this.leashes.update(dt, this.leashContext(), this.dropSink); this.markLeashRecovery();
        this.balloons.update(dt, this.leashContext(), this.dropSink); this.markBalloonRecovery();
      }
      if (!this.dead) this.mobs.update(dt, this.body.position, light, this.clock, target, (light - 0.2) / 0.8);
      if(!this.dead)this.updateBlazeProjectiles(dt);
      if (!this.dead && target) this.takeMobHits(dt, (light - 0.2) / 0.8);
      if (!this.dead) this.interact(input.breaking, input.place, input.using, input.pick, dt);
      if (!this.dead) this.updateSnowballs(dt);
    } else {
      this.target = null;
      this.mobTarget = null;
      this.balloonTarget = null;
      this.breakProgress = 0;
      this.eatTimer = 0;
      this.cancelDrinking();
    }
    this.lastPos = { x: this.body.position.x, z: this.body.position.z };
    if (!this.paused && !this.actionsNeedRecovery) {
      this.worldDrops.update(dt);
      if (!this.dead && !this.screenOpen()) this.worldDrops.tryPickup(this.body.position, (stack) => this.inventory.addStack(stack));
      this.stepAgent(dt);
    }
    this.agentView.update(dt, AGENT_STEP_SECONDS, this.clock);
    // Furnaces keep smelting while the world runs, even with their screen closed.
    if (!this.paused && !this.actionsNeedRecovery) {
      // Pressure plates under the player and mobs, then redstone ticks (10 per second).
      const feet = (p: { x: number; y: number; z: number }) => `${Math.floor(p.x)},${Math.floor(p.y + 0.05)},${Math.floor(p.z)}`;
      this.redstone.updatePlates(new Set([feet(this.body.position), ...this.mobs.mobs.map((m) => feet(m.position))]));
      this.redstone.update(dt);
      this.farming.update(dt, 15 - skyDarken(skyAt(this.timeOfDay,this.world.dimension).light));
      this.caneSupport.update(dt);
      this.caneGrowth.update(dt);
      for (const f of this.furnaces.values()) tickFurnace(f, dt);
      this.reconcileChestOwners();this.updateBrewingStations(dt);
      this.inventoryScreen.refresh();
    }

    const cam = this.renderer.camera;
    cam.position.set(this.body.position.x, this.body.position.y + EYE_HEIGHT, this.body.position.z);
    cam.rotation.set(this.body.pitch, this.body.yaw, 0);
    this.renderer.updateChunks(this.renderer.isAreaReady(1) ? 6 : 30);
    this.worldDropsView.update(this.clock, cam.position, this.renderer.renderDistance * 16);
    this.leashView.update(this.leashes.records, this.mobs.mobs, this.body.position);
    this.balloonView.update(this.balloons.records);
    this.snowballProjectilesView.update(active && !this.dead && !this.screenOpen() ? dt : 0, cam, this.renderer.renderDistance * 16);

    const underwater = blockAtEyes((x, y, z) => this.world.getBlock(x, y, z), this.body) === "water";
    this.hud.setUnderwater(underwater);
    this.hud.setPlayerStatus(this.playerStatus);
    this.hud.update(this.inventory, this.mode, this.health, this.hunger.food, dt, active && !this.ownershipBusy);
    this.glowStickView.update(this.inventory.selectedStack(), !this.paused && !this.dead && !this.screenOpen());
    this.sparklerView.update(this.inventory.selectedStack(), this.inventory.offhand, !this.paused && !this.dead && !this.screenOpen() && !this.actionsNeedRecovery);
    this.renderer.setSelection(this.target, this.breakProgress);
    // A held glow stick lights the area around the player (Education Edition).
    this.heldLight = this.inventory.selectedStack()?.id === GLOW_STICK ? HELD_GLOW_LIGHT : 0;
    this.renderer.setHeldLight(this.heldLight, cam.position);
    const visualStatus = sanitizePlayerStatus(this.playerStatus);
    this.renderer.render(skyAt(this.timeOfDay,this.world.dimension), underwater, dt, {
      blindness: !visualStatus.invalid && !!visualStatus.data.blindness,
      nauseaRoll: !visualStatus.invalid && visualStatus.data.nausea && !this.motionPreference?.matches ? Math.sin(this.statusVisualSeconds * 2) * .015 : 0,
    });
    this.hud.setDebug(this.debugText());

    this.autosaveTimer += dt;
    if (this.autosaveTimer > 30) {
      this.autosaveTimer = 0;
      this.save();
    }
    const portal=this.portalContact.update(this.world,this.body.position,dt,active&&!this.dead&&!this.screenOpen()&&!this.actionsNeedRecovery);
    if(portal)this.events.onPortalTravel?.(this,portal);
  }

  private interact(breaking: boolean, place: boolean, using: boolean, pick: boolean, dt: number): void {
    if (this.ownershipBusy || this.actionsNeedRecovery || this.dead || this.paused || this.stopped || this.screenOpen()) { this.cancelDrinking(); return; }
    if (!using) this.cancelDrinking();
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

    const balloonHit = raycastBalloons(eye, dir, this.balloons.records, REACH);
    this.balloonTarget = balloonHit && (!this.target || balloonHit.distance < this.target.distance) &&
      (!mobHit || balloonHit.distance < mobHit.distance) ? balloonHit : null;
    const held = this.inventory.selectedStack();
    const stationTarget = this.target !== null && (this.target.id === CRAFTING_TABLE || this.target.id === FURNACE || this.target.id === BREWING_STAND || CHEMISTRY_STATIONS.has(this.target.id) || chalkboardSizeOf(this.target.id) !== null);
    const drinking = using && (held?.id === WATER_BOTTLE || held?.id === MILK_BUCKET || isDrinkablePotionId(held?.id)) && !this.mobTarget && !this.balloonTarget && !stationTarget;
    if (!drinking) this.cancelDrinking();
    if (place && this.placeCooldown === 0 && held?.id === GLASS_BOTTLE) {
      // Normal outline/break targeting keeps ignoring liquids. This separate physical ray uses
      // the same five-block reach and fence geometry; nearer actors win ties and occlude filling.
      const water = raycast((x, y, z) => this.world.getBlock(x, y, z), eye, dir, REACH, id => id !== AIR);
      const actorDistance = Math.min(mobHit?.distance ?? Infinity, balloonHit?.distance ?? Infinity);
      if (water?.id === WATER && water.distance + 1e-9 < actorDistance) {
        const result = this.inventory.fillSelectedBottle();
        this.placeCooldown = .25; this.breakProgress = 0; this.eatTimer = 0;
        if (result.ok) this.hud.message("Filled a Water Bottle");
        else if (result.reason === "no-room") this.hud.message("Make room for a Water Bottle before filling one.");
        else this.hud.message("These bottles need attention before they can be filled.");
        // World water is deliberately non-consuming in this bounded application model.
        return;
      }
    }
    if (place && this.placeCooldown === 0 && held?.id === EMPTY_BUCKET) {
      const source = raycast((x, y, z) => this.world.getBlock(x, y, z), eye, dir, REACH, id => id !== AIR);
      const actorDistance = Math.min(mobHit?.distance ?? Infinity, balloonHit?.distance ?? Infinity);
      if (source && isFluidBlock(source.id) && source.distance + 1e-9 < actorDistance) {
        const result = tryUseFluidBucket(this.world, this.inventory, this.mode, source);
        if (result.ok) this.placeCooldown = .25;
        this.breakProgress = 0; this.eatTimer = 0;
        this.hud.message(result.ok ? `Collected ${result.fluid}.` : result.reason === "no-room" ? "Make room for a full Bucket before collecting liquid." : "Cannot collect this liquid here.");
        return;
      }
    }
    if (this.balloonTarget) {
      this.target = null; this.mobTarget = null; this.breakProgress = 0;
      const key = this.balloonTarget.key;
      if (breaking && this.attackCooldown === 0) {
        this.attackCooldown = .4;
        const ok = this.balloons.pop(key, this.leashContext());
        this.hud.message(ok ? "Balloon popped" : "Could not pop the balloon here");
      } else if (place && this.placeCooldown === 0 && !this.inventory.selectedStack()) {
        this.placeCooldown = .25;
        this.hud.message(this.releaseBalloon(key) ? "Balloon released as a dropped item" : "Could not release the balloon; it remains attached");
      }
      return;
    }

    // Eating: hold use (right button, or a touch hold) with food in hand. Using a crafting table,
    // furnace or NPC still takes precedence over eating.
    // Using a chalkboard opens its editor; using a book opens it for writing or reading.
    if (place && this.placeCooldown === 0 && this.target && !this.mobTarget && chalkboardSizeOf(this.target.id)) {
      const board = this.chalkboardAt(this.target.x, this.target.y, this.target.z);
      if (board) {
        this.suspendInput();
        this.chalkDialog.show(board, this.mode);
        return;
      }
    }
    if (place && held && (isWritableBook(held) || isWrittenBook(held)) && !(this.target && (this.target.id === CRAFTING_TABLE || this.target.id === FURNACE || this.target.id === BREWING_STAND))) {
      this.suspendInput();
      this.bookScreen.show(held);
      return;
    }
    if (drinking) {
      this.breakProgress = 0; this.eatTimer = 0;
      this.drinkSelectedContainer(dt);
      return;
    }
    const usesBlock = this.target !== null && !this.mobTarget && (this.target.id === CRAFTING_TABLE || this.target.id === FURNACE || this.target.id === BREWING_STAND);
    const usesNpc = this.mobTarget?.kind === "npc";
    if (using && !(place && (usesBlock || usesNpc)) && this.mode === "survival" && canEat(this.hunger, held?.id)) {
      this.eatTimer += dt;
      this.breakProgress = 0;
      if (this.eatTimer >= EAT_SECONDS) {
        finishMeal(this.inventory, this.hunger, this.playerStatus);
        this.eatTimer = 0;
      }
      return;
    }
    this.eatTimer = 0;
    if (place && this.placeCooldown === 0 && held?.id === EMPTY_BUCKET && this.mobTarget?.kind === "cow") {
      const cow = this.mobTarget;
      const validCow = isAdultCow(cow) && Number.isSafeInteger(cow.id) && cow.id > 0 && Number.isFinite(cow.health) && cow.health > 0 && cow.health <= MOB_SPECS.cow.maxHealth && [cow.position.x, cow.position.y, cow.position.z].every(Number.isFinite) &&
        this.mobs.mobs.includes(cow) && this.mobs.mobs.filter(m => m.id === cow.id).length === 1 && mobHit?.mob === cow && Number.isFinite(mobHit.distance) && mobHit.distance >= 0 && mobHit.distance <= REACH;
      this.placeCooldown = .25; this.breakProgress = 0; this.eatTimer = 0;
      if (!validCow) this.hud.message("Only a healthy adult cow can be milked.");
      else if (this.mobLoot.exportPending(cow) !== undefined) this.hud.message("This cow's drops need attention before it can be milked.");
      else {
        const result = this.inventory.fillSelectedMilkBucket();
        this.hud.message(result.ok ? "Milked the adult cow." : result.reason === "no-room" ? "Make room for a Milk Bucket before milking." : "These buckets need attention before they can be filled.");
      }
      // This bounded model does not consume, injure or exhaust the adult cow.
      return;
    }
    // A non-NPC actor does not consume the use edge: snowballs can be aimed at supported mobs.
    if (place && held?.id === SNOWBALL && this.placeCooldown === 0 && this.mobTarget && this.mobTarget.kind !== "npc") {
      this.throwSnowball(); return;
    }
    if (place && this.placeCooldown === 0 && this.mobTarget && this.mobTarget.kind !== "npc" && held && balloonColorOf(held.id)) {
      const ok = this.balloons.attachFromInventory(this.inventory, this.mode, { kind: "mob", mobId: this.mobTarget.id }, this.leashContext());
      this.placeCooldown = .25;
      this.hud.message(ok ? "Balloon attached" : "Cannot attach another balloon to that creature here");
      return;
    }
    if (place && this.placeCooldown === 0 && this.mobTarget && this.mobTarget.kind !== "npc" && (held?.id === LEAD || !held && (!this.inventory.offhand || this.leashes.records.some(record => record.targetMobId === this.mobTarget!.id)))) {
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
    if (place && held && isGlowStickId(held.id) && this.placeCooldown === 0 && this.mobTarget && this.mobTarget.kind !== "npc") {
      this.tryShakeSelectedGlow(); return;
    }
    if (place && this.placeCooldown === 0 && this.mobTarget?.kind !== "npc" && this.mobTarget &&
        (held && isSparklerId(held.id) || !held && this.inventory.offhand)) {
      this.tryLightSparkler(!held); return;
    }
    if (this.mobTarget) {
      this.target = null;
      this.breakProgress = 0;
      const mob = this.mobTarget;
      if (breaking && this.attackCooldown === 0) {
        this.attackCooldown = 0.4;
        // Held tools hit harder (swords most); the bare-hand damage keeps the game's balance.
        const tool = toolOf(this.inventory.selectedStack()?.id);
        const damage = outgoingMeleeDamage(this.playerStatus, tool?.attack ?? (this.mode === "creative" ? 4 : 2));
        // A zero-strength swing keeps its cooldown/wear policy but does not publish a hit.
        const killed = damage > 0 ? this.mobs.attack(mob, damage, this.body.yaw) : false;
        if (this.mode === "survival") addExhaustion(this.hunger, EXHAUSTION.attack);
        // Minecraft: a hit wears a sword by one use and other tools by two.
        if (tool && this.mode === "survival") this.wearTool(tool.kind === "sword" ? 1 : 2);
        if (killed) this.hud.message(`${MOB_SPECS[mob.kind].displayName} was defeated`);
      }
      if (place && mob.kind === "npc") this.openNpcDialog(mob);
      return;
    }
    const t = this.target;
    if (breaking && t?.id === blockId("fire")) {
      if (canBreak(this.world, this.mode, t.x, t.y, t.z)) {
        const removed = extinguishFire(this.world, t.x, t.y, t.z);
        if (removed) this.hud.message("Fire extinguished");
      }
      this.breakProgress = 0; this.breakKey = ""; return;
    }
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
    if(place&&t&&this.placeCooldown===0&&t.id===203){const key=furnaceKey(t.x,t.y,t.z);if(!this.chests.has(key)){this.freezeChestOwnership("Physical Chest lacks an owner");return;}this.openChest=key;this.openInventory("chest");return;}
    if(place&&t&&this.placeCooldown===0&&t.id===BREWING_STAND){
      const key=furnaceKey(t.x,t.y,t.z);
      if(!this.brewingStands.has(key)){this.freezeBrewingOwnership("Physical brewing stand lacks an owner");return;}
      this.openBrewing=key;this.openInventory("brewing_stand");return;
    }
    if (place && t && this.placeCooldown === 0 && t.id === FURNACE) {
      const key = furnaceKey(t.x, t.y, t.z);
      if (!this.furnaces.has(key)) this.furnaces.set(key, createFurnace());
      this.openFurnace = key;
      this.openInventory("furnace");
      return;
    }

    // Stations and NPCs above retain priority. Only the main hand can ignite a supported top face.
    if (place && this.placeCooldown === 0 && (held?.id === WATER_BUCKET || held?.id === LAVA_BUCKET)) {
      // Inclusive ray prevents pouring through a nearer liquid to an outlined solid behind it.
      const hit = raycast((x, y, z) => this.world.getBlock(x, y, z), eye, dir, REACH, id => id !== AIR);
      const result = hit && !isFluidBlock(hit.id) ? tryUseFluidBucket(this.world, this.inventory, this.mode, hit) : null;
      if (result?.ok) this.placeCooldown = .25;
      this.breakProgress = 0; this.eatTimer = 0;
      this.hud.message(result?.ok ? `Placed ${result.fluid}.` : "Aim at a solid face with clear air beside it to pour the Bucket.");
      return;
    }

    if (place && this.placeCooldown === 0 && held?.id === stackId("flint_and_steel")) {
      const portal = t ? tryUsePortalIgnition(this.world, this.inventory, this.mode, t) : { ok: false, reason: "not-frame" } as const;
      const ok = portal.ok || portal.reason === "not-frame" && t !== null && igniteFire(this.world, this.inventory, this.mode, t);
      this.placeCooldown = .25; this.breakProgress = 0;
      if (portal.ok) this.hud.message(this.inventory.selectedStack() ? "Portal lit" : "Portal lit; Flint and Steel broke");
      else if (portal.reason !== "not-frame") this.hud.message(portal.reason === "unloaded" ? "Load the complete portal area before lighting it." : portal.reason === "source-changed" ? "The portal changed. Try lighting it again." : "Could not light the portal here.");
      else this.hud.message(ok ? (this.inventory.selectedStack() ? "Fire lit" : "Fire lit; Flint and Steel broke") : "Aim at the top of a supported solid block with clear air above");
      return;
    }

    // Ordinary use shakes a colored/stateful stick. Old green block placement stays available.
    if (place && held && isGlowStickId(held.id) && this.placeCooldown === 0 &&
        (!t || held.id !== GLOW_STICK || Object.prototype.hasOwnProperty.call(held, "glow"))) {
      this.tryShakeSelectedGlow(); return;
    }

    // Interactive blocks above keep priority; otherwise a snowball also throws into empty sky.
    if (place && held?.id === SNOWBALL && this.placeCooldown === 0) { this.throwSnowball(); return; }

    if (place && this.placeCooldown === 0 && held && balloonColorOf(held.id)) {
      const ok = t?.id === OAK_FENCE && this.balloons.attachFromInventory(this.inventory, this.mode,
        { kind: "fence", x: t.x, y: t.y, z: t.z }, this.leashContext());
      this.placeCooldown = .25;
      this.hud.message(ok ? "Balloon tied to fence" : "Aim at a pig, sheep, chicken, adult cow or oak fence to attach a balloon");
      return;
    }

    // Held blocks still place normally; only a Lead or an empty hand selects the fence tether action.
    if (place && t?.id === OAK_FENCE && this.placeCooldown === 0 && (held?.id === LEAD || !held &&
        (!this.inventory.offhand || this.leashes.records.some(record => record.phase === "active" && record.anchor.kind === "player") || this.fenceLeashKeys(t.x, t.y, t.z).length > 0))) {
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

    if (place && this.placeCooldown === 0 && (held && isSparklerId(held.id) || !held && this.inventory.offhand)) {
      this.tryLightSparkler(!held); return;
    }

    // Hoe use precedes generic placement; authorization and successful-use wear are engine-owned.
    if (place && t && this.placeCooldown === 0 && tool?.kind === "hoe") {
      if (tillSoil(this.world, this.inventory, this.mode, t)) this.placeCooldown = 0.25;
      return;
    }

    // Bone Meal is a distinct finite ingredient; its loaded Cane effect owns the debit.
    if (place && t && this.placeCooldown === 0 && held?.id === BONE_MEAL_ITEM_ID) {
      const boneWorld = this.world, boneMode = this.mode;
      const changed = useOwnedBoneMeal(boneWorld, this.inventory, boneMode, t, () =>
        this.world === boneWorld && this.mode === boneMode && !this.dead && !this.stopped && !this.paused &&
        !this.actionsNeedRecovery && !this.screenOpen());
      this.placeCooldown = 0.25;
      if (changed <= 0) this.hud.message("Bone Meal has nothing to grow here");
      return;
    }

    // Lab Table products with a use effect: the ice bomb freezes water, super fertilizer grows plants.
    if (place && t && this.placeCooldown === 0 && held) {
      if (held.id === SUPER_FERTILIZER && wheatAge(t.id) !== null && !canBuildAt(this.world, this.mode, t.x, t.y, t.z)) {
        this.placeCooldown = 0.25;
        this.hud.message("Building is not allowed here");
        return;
      }
      const labWorld = this.world, labMode = this.mode;
      const changed = useOwnedLabProduct(labWorld, this.inventory, labMode, t, undefined, () =>
        this.world === labWorld && this.mode === labMode && !this.dead && !this.stopped && !this.paused &&
        !this.actionsNeedRecovery && !this.screenOpen());
      if (changed >= 0) {
        this.placeCooldown = 0.25;
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
      if (placeBlock(this.world, this.inventory, this.mode, px, py, pz, this.body.position, look, t.normal)) this.placeCooldown = 0.15;
    }

    if (pick && t && this.mode === "creative") {
      // Hidden world states (including element cubes) pick their established inventory identity.
      const canonical = baseStackId(t.id);
      if (isKnownId(canonical) && (isItem(canonical) || tryBlockById(canonical)?.creative)) this.inventory.pick(canonical, t.id === blockId("placed_glow_stick"));
    }
  }

  private cancelDrinking(): void { this.drinkOwner = null; }

  private endDrinkPointer(e: Pick<PointerEvent, "type" | "pointerType">): void {
    if (e.type === "pointercancel" || e.pointerType !== "mouse") this.cancelDrinking();
  }

  private selectHudHotbar(slot: number): void {
    // Saved-item recovery keeps HUD selection available for inspecting disabled actions.
    // This changes only the live selected index; all ownership/write guards stay in force.
    if (this.ownershipBusy || this.dead || this.recoverySections.includes("dimensions") || this.recoverySections.includes("player status") || this.recoverySections.includes("adult cows") || this.recoverySections.includes("gravel harvest decisions") || this.recoverySections.includes("fire") || this.recoverySections.includes("fluids") || this.recoverySections.includes("portals")) return;
    this.selectHotbar(slot);
  }

  private selectHotbar(slot: number): void {
    this.cancelDrinking();
    this.inventory.select(slot);
  }

  /** Held duration and finite-container behavior are application choices, not native calibration. */
  private drinkSelectedContainer(dt: number): void {
    const slot = this.inventory.selected, source = this.inventory.selectedStack();
    if (!Number.isFinite(dt) || dt <= 0 || !source || source.id !== WATER_BOTTLE && source.id !== MILK_BUCKET && !isDrinkablePotionId(source.id)) { this.cancelDrinking(); return; }
    const milk = source.id === MILK_BUCKET, potion = isDrinkablePotionId(source.id), label = displayNameOf(source.id);
    if (!this.drinkOwner || this.drinkOwner.slot !== slot || this.drinkOwner.source !== source || this.drinkOwner.id !== source.id || this.drinkOwner.count !== source.count || this.drinkOwner.mode !== this.mode) {
      this.drinkOwner = { slot, source, id: source.id, count: source.count, mode: this.mode, elapsed: 0 };
      this.hud.message(potion ? `Keep holding to use ${label}.` : milk ? "Keep holding to drink milk." : "Keep holding to drink water.");
    }
    this.drinkOwner.elapsed += dt;
    if (this.drinkOwner.elapsed + 1e-10 < (potion ? MEDICINE_DRINK_SECONDS : milk ? MILK_DRINK_SECONDS : WATER_DRINK_SECONDS)) return;
    const ok = potion ? finishMedicineDrink(this.inventory, this.statusOwner) : milk ? finishOwnedMilkDrink(this.inventory, this.statusOwner) : this.inventory.drinkSelectedWaterBottle().ok;
    this.cancelDrinking();
    this.hud.message(potion ? ok ? `Used ${label}; the Glass Bottle is empty.` : "This potion needs attention before it can be used." : milk ? ok ? "Drank milk; active effects cleared and the Bucket is empty." : "This milk needs attention before it can be used." : ok ? "Drank water; the Glass Bottle is empty." : "This bottle needs attention before it can be used.");
  }

  /** Diagnose the raw section before sanitation can erase malformed timed state. */
  private restorePlayerStatus(save: SaveData | undefined): void {
    const status = sanitizePlayerStatus(save?.playerStatus);
    this.playerStatus = status.data;
    if (status.invalid || save?.playerStatusInvalid) this.markPlayerStatusRecovery(true);
  }

  private markPlayerStatusRecovery(invalid = false): void {
    if (!invalid && !sanitizePlayerStatus(this.playerStatus).invalid) return;
    this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.recoverySections.includes("player status")) this.recoverySections.push("player status");
  }

  /** Poison bypasses armor wear and melee invulnerability; these are application choices. */
  private updatePlayerStatus(dt: number): void {
    this.markPlayerStatusRecovery();
    if (this.dead || this.paused || this.screenOpen() || this.actionsNeedRecovery) return;
    if (Number.isFinite(dt) && dt > 0) this.statusVisualSeconds = hasPlayerStatus(this.playerStatus) ? this.statusVisualSeconds + dt : 0;
    const change = tickPlayerStatus(this.playerStatus, dt, this.health, this.mode === "survival");
    if (change < 0) {
      this.health = Math.max(1, this.health + change);
      this.hud.flashDamage();
    }
  }

  /** Retain the exact stored envelope before any item loader can repair it. */
  private restoreDimensions(save: SaveData | undefined): void {
    const result = readDimensionArchive(save?.dimensions, save, createDimensionGeneratedBlockProbe());
    if (save?.dimensionsInvalid || save?.dimensionOwnershipIssues?.length || result.kind === "invalid") {
      this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
      if (!this.recoverySections.includes("dimensions")) this.recoverySections.push("dimensions");
      const issues = result.kind === "invalid" ? result.issues : save?.dimensionOwnershipIssues ?? [];
      this.dimensionIssues = issues.map(issue=>({...issue}));
      return;
    }
    if (result.kind === "valid") this.dimensionArchive = result.data;
  }

  /** Retain the exact stored envelope before any item loader can repair it. */
  private markGlowRecovery(save: Pick<SaveData, "glowOwnershipIssues"> | undefined): void {
    if (!save?.glowOwnershipIssues?.length) return;
    this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.itemsNeedRecovery) this.recoverySections.push("saved items");
  }

  /** Restore coordinate decisions only after edits establish the actual source blocks. */
  private markBlazeRecovery(save:SaveData|undefined):void {
    this.blazeIssues=[...(save?.blazeOwnershipIssues??[]),...readBlazeOwners(save).issues].filter((issue,index,all)=>all.findIndex(other=>other.path===issue.path&&other.reason===issue.reason)===index);
    if(!this.blazeIssues.length)return;
    this.cancelDrinking();this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);
    if(!this.recoverySections.includes("Blaze owners"))this.recoverySections.push("Blaze owners");
  }

  private updateSnowballs(dt:number):void {
    if(this.dead||this.paused||this.stopped||this.screenOpen()||this.ownershipBusy||this.actionsNeedRecovery)return;
    const impacts=this.snowballProjectiles.update(dt,this.mobs.mobs.filter(m=>m.health>0).map(m=>({id:m.id,box:bodyBox(m.position,MOB_SPECS[m.kind].width,MOB_SPECS[m.kind].height)})));
    // The consumed projectile owns one impact; ordinary mobs retain their existing no-damage policy.
    for(const impact of impacts)if(impact.kind==="mob"){
      const mob=this.mobs.mobs.find(m=>m.id===impact.mobId&&m.health>0);
      if(mob?.kind==="blaze")this.mobs.attack(mob,3,this.body.yaw,"player");
    }
    if(impacts.length){this.snowballImpacts=[...this.snowballImpacts,...impacts].slice(-16);this.snowballProjectilesView.impact(impacts);}
  }

  private updateBlazeProjectiles(dt:number):void {
    if(this.dead||this.paused||this.stopped||this.screenOpen()||this.ownershipBusy||this.actionsNeedRecovery)return;
    try { this.mobs.updateFireballs(dt,this.mode==="survival"?bodyBox(this.body.position):null); }
    finally {
      // Render cleanup can throw after simulation commits. Settle every consumed receipt first.
      const impacts=this.mobs.drainFireballImpacts();
      for(const impact of impacts)if(!this.dead&&impact.kind==="player"&&this.mode==="survival")this.hurt(impact.damage,"blaze");
    }
  }

  private markRecyclingRecovery(save:SaveData|undefined):void {
    this.recyclingIssues=[...(save?.recyclingOwnershipIssues??[]),...diagnoseRawRecyclingOwnership(save)].filter((issue,index,all)=>all.findIndex(other=>other.path===issue.path&&other.reason===issue.reason)===index);
    if(!this.recyclingIssues.length)return;
    this.cancelDrinking();this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);
    if(!this.itemsNeedRecovery)this.recoverySections.push("saved items");
  }

  private markBoneMealRecovery(save:SaveData|undefined):void {
    this.boneMealIssues=[...(save?.boneMealOwnershipIssues??[]),...diagnoseRawBoneMealOwnership(save)].filter((issue,index,all)=>all.findIndex(other=>other.path===issue.path&&other.reason===issue.reason)===index);
    if(!this.boneMealIssues.length)return;
    this.cancelDrinking();this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);
    if(!this.itemsNeedRecovery)this.recoverySections.push("saved items");
  }

  private markCaneRecovery(save:SaveData|undefined):void {
    this.caneIssues=[...(save?.caneOwnershipIssues??[]),...diagnoseRawCaneOwnership(save)].filter((issue,index,all)=>all.findIndex(other=>other.path===issue.path&&other.reason===issue.reason)===index);
    if(!this.caneIssues.length)return;
    this.cancelDrinking();this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);
    if(!this.itemsNeedRecovery)this.recoverySections.push("saved items");
  }

  private markWartRecovery(save:SaveData|undefined):void {
    this.wartIssues=[...(save?.wartOwnershipIssues??[]),...diagnoseRawWartOwnership(save),...diagnoseRawWartSupport(save,save?.dimensions?.active??"overworld",createDimensionGeneratedBlockProbe())].filter((issue,index,all)=>all.findIndex(other=>other.path===issue.path&&other.reason===issue.reason)===index);
    if(!this.wartIssues.length)return;
    this.cancelDrinking();this.recoveryOriginal??=localStorage.getItem(SAVE_KEY);
    if(!this.itemsNeedRecovery)this.recoverySections.push("saved items");
  }

  private markPortalRecovery(save: Pick<SaveData, "portalOwnershipIssues"> | undefined): void {
    if (!save?.portalOwnershipIssues?.length) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.itemsNeedRecovery) this.recoverySections.push("saved items");
  }

  private restorePortals(save: Pick<SaveData, "portals" | "portalsInvalid"> | undefined): void {
    const restored = this.world.portals.restore(save?.portals, this.world.exportEdits());
    if (!save?.portalsInvalid && !restored.invalid) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.recoverySections.includes("portals")) this.recoverySections.push("portals");
  }

  private restoreFluids(save: Pick<SaveData, "fluids" | "fluidsInvalid" | "generatorVersionInvalid"> | undefined): void {
    const restored = this.world.fluids.restore(save?.fluids);
    if (!save?.fluidsInvalid && !save?.generatorVersionInvalid && !restored.invalid) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.recoverySections.includes("fluids")) this.recoverySections.push("fluids");
  }

  private updateFluids(dt: number): void {
    if (this.dead || this.paused || this.stopped || this.screenOpen() || this.ownershipBusy || this.actionsNeedRecovery) return;
    const damage = this.world.fluids.update(dt, this.mode === "survival" ? bodyBox(this.body.position) : null);
    if (damage > 0 && this.mode === "survival") this.hurt(damage, "lava");
  }

  private restoreFire(save: Pick<SaveData, "fire" | "fireInvalid"> | undefined): void {
    const restored = this.world.fires.restore(save?.fire, this.world.exportEdits());
    if (!save?.fireInvalid && !restored.invalid) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.recoverySections.includes("fire")) this.recoverySections.push("fire");
  }

  private markIgnitionRecovery(save: Pick<SaveData, "ignitionOwnershipIssues"> | undefined): void {
    if (!save?.ignitionOwnershipIssues?.length) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.itemsNeedRecovery) this.recoverySections.push("saved items");
  }

  /** Bounded contact hazard: no lingering burn, mob damage or spread is implied. */
  private updateFire(dt: number): void {
    if (this.dead || this.paused || this.stopped || this.screenOpen() || this.ownershipBusy || this.actionsNeedRecovery) return;
    const damage = this.world.fires.update(dt, this.mode === "survival" ? bodyBox(this.body.position) : null);
    if (damage > 0 && this.mode === "survival") this.hurt(damage, "fire");
  }

  private restoreGravelHarvests(save: Pick<SaveData, "gravelHarvests" | "gravelHarvestInvalid"> | undefined): void {
    const restored = this.world.gravelHarvests.restore(save?.gravelHarvests);
    if (!save?.gravelHarvestInvalid && !restored.invalid) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.recoverySections.includes("gravel harvest decisions")) this.recoverySections.push("gravel harvest decisions");
  }

  private markCowRecovery(save: Pick<SaveData, "cowStateInvalid"> | undefined): void {
    if (!save?.cowStateInvalid) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.recoverySections.includes("adult cows")) this.recoverySections.push("adult cows");
  }

  private markBucketRecovery(save: Pick<SaveData, "bucketOwnershipIssues"> | undefined): void {
    if (!save?.bucketOwnershipIssues?.length) return;
    this.cancelDrinking(); this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.itemsNeedRecovery) this.recoverySections.push("saved items");
  }

  /** Preserve malformed whole-container owners before general inventory repair. */
  private markBottleRecovery(save: Pick<SaveData, "bottleOwnershipIssues"> | undefined): void {
    if (!save?.bottleOwnershipIssues?.length) return;
    this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.itemsNeedRecovery) this.recoverySections.push("saved items");
  }

  /** Diagnose raw sparkler/offhand ownership before any item loader can repair it. */
  private markSparklerRecovery(save: Pick<SaveData, "sparklerOwnershipIssues"> | undefined): void {
    if (!save?.sparklerOwnershipIssues?.length) return;
    this.recoveryOriginal ??= localStorage.getItem(SAVE_KEY);
    if (!this.itemsNeedRecovery) this.recoverySections.push("saved items");
  }

  trySwapOffhand(): boolean {
    if (this.dead || this.paused || this.screenOpen() || this.ownershipBusy || this.actionsNeedRecovery || this.stopped) return false;
    if (!this.inventory.swapSelectedOffhand()) { this.hud.message("Select a sparkler or an empty hotbar slot before swapping the offhand."); return false; }
    return true;
  }

  /** One explicit hand is activated; the other owner is never implicitly changed. */
  tryLightSparkler(offhand = false): boolean {
    if (this.dead || this.paused || this.screenOpen() || this.ownershipBusy || this.actionsNeedRecovery || this.stopped) return false;
    const result = offhand ? this.inventory.activateOffhandSparkler() : this.inventory.activateSelectedSparkler();
    if (!result.ok) {
      if (result.reason !== "not-sparkler") this.hud.message(result.reason === "needs-room"
        ? "Make room in the bag for the remaining sparklers before lighting one."
        : result.reason === "already-active" ? "This sparkler is already lit." : "These items need attention before they can be used.");
      return false;
    }
    this.placeCooldown = .25; this.breakProgress = 0; this.breakKey = "";
    this.sparklerView.update(this.inventory.selectedStack(), this.inventory.offhand, true);
    this.hud.message(offhand ? "Offhand sparkler lit" : "Sparkler lit"); return true;
  }

  /** A single input edge commits one complete per-unit activation before its visual response. */
  tryShakeSelectedGlow(): boolean {
    if (this.dead || this.paused || this.screenOpen() || this.ownershipBusy || this.actionsNeedRecovery || this.stopped) return false;
    const result = this.inventory.activateSelectedGlow();
    if (!result.ok) {
      if (result.reason !== "not-glow") this.hud.message(result.reason === "needs-room"
        ? "Make room for the remaining glow sticks before shaking one."
        : result.reason === "already-active" ? "This glow stick is already glowing." : "These items need attention before they can be used.");
      return false;
    }
    this.placeCooldown = .25; this.breakProgress = 0; this.breakKey = "";
    this.glowStickView.update(this.inventory.selectedStack(), true); this.glowStickView.shake();
    this.hud.message("Glow stick shaken");
    return true;
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
    if (this.ownershipBusy || this.actionsNeedRecovery) return false;
    const next = this.agentNearPlayer();
    if (!next) return false;
    Object.assign(this.agent, { x: next.x, y: next.y, z: next.z, facing: next.facing });
    this.agentView.snap(this.agent);
    return true;
  }

  openCodeBuilder(): void {
    if (this.dead || this.ownershipBusy) return;
    if (this.screenOpen()) return;
    this.suspendInput();
    this.codeBuilder.show();
  }

  /** Moves the selected hotbar stack into the Agent's inventory (creative: a copy). */
  giveHeldToAgent(): string {
    if (this.actionsNeedRecovery) return this.itemsNeedRecovery ? "Saved items need repair. Export a backup before moving items" : this.recoverySections.includes("Cane growth") ? "Damaged Cane growth state. Export a backup before continuing." : this.recoverySections.includes("code workspace") ? "Damaged source workspace. Export a backup before continuing." : this.recoverySections.includes("chest owners") ? "Damaged Chest storage. Export a backup before continuing." : this.recoverySections.includes("brewing owners") ? "Damaged brewing stations. Export a backup before continuing." : this.recoverySections.includes("Blaze owners") ? "Damaged Blaze owners. Export a backup before continuing." : this.recoverySections.includes("portals") ? "Damaged portals. Export a backup before continuing." : this.recoverySections.includes("fluids") ? "Damaged liquids or terrain version. Export a backup before continuing." : this.recoverySections.includes("fire") ? "Damaged fire. Export a backup before moving items": this.recoverySections.includes("gravel harvest decisions") ? "Damaged gravel harvest decisions. Export a backup before moving items" : this.recoverySections.includes("adult cows") && !this.recoverySections.includes("player status") ? "Damaged adult cows. Export a backup before moving items" : "Damaged player status. Export a backup before moving items";
    if (this.ownershipBusy) return "Items are being transferred. Retry giving them afterward";
    if (this.dead) return "Respawn before giving items to the Agent";
    const held = this.inventory.selectedStack();
    if (!held) return "Select a stack in your hotbar first";
    // Creative has unlimited blocks: give a full stack without taking any.
    const count = this.mode === "creative" ? stackLimit(held) : held.count;
    if (count < 1 || inspectGlowState(held).kind === "invalid" || inspectSparklerState(held).kind === "invalid") return "These items need attention before they can be moved";
    const left = giveAgent(this.agent, cloneStack(held, count));
    const given = count - left;
    if (this.mode === "survival") {
      held.count = left;
      if (left === 0) this.inventory.slots[this.inventory.selected] = null;
    }
    return `Gave the Agent ${given} ${displayNameOf(held.id)}`;
  }

  /** Starts a Code Builder program (stopping any running one). Invalid programs are refused with a message. */
  runProgram(program: CodeProgram): boolean {
    if (this.recoverySections.includes("programs")) { this.hud.message("Damaged saved programs. Export a backup before running code."); return false; }
    if (this.dead || this.ownershipBusy || this.actionsNeedRecovery) return false;
    this.runner?.stop();
    this.runner = null;
    const started = startProgram(program, undefined, (dir) => runAgentCommand(this.world, this.agent, { op: "detect", dir }).value === true,
      (dir) => inspectLoadedAgentBlock(this.world, this.agent, dir));
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
    if (!runner || this.ownershipBusy || this.actionsNeedRecovery) return;
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
      beginDestroyOwnership: (x, y, z) => this.beginBlockRelease(x, y, z),
      collect: (agent, filterId) => this.worldDrops.tryPickup({ x: agent.x + .5, y: agent.y, z: agent.z + .5 }, (stack) => giveAgent(agent, stack), filterId),
      destroyContents: (x, y, z) => {
        const key=furnaceKey(x,y,z),stand=this.brewingStands.get(key),chest=this.chests.get(key);
        if(chest)return chest.contents();
        if(stand)return stand.contents();
        const furnace = this.furnaces.get(key); return furnace ? furnaceContents(furnace) : [];
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
    if (this.ownershipBusy || this.actionsNeedRecovery) return;
    const chest=t.id===203?this.chests.get(furnaceKey(t.x,t.y,t.z)):undefined;
    const stand=t.id===BREWING_STAND?this.brewingStands.get(furnaceKey(t.x,t.y,t.z)):undefined;
    const furnace = t.id === FURNACE ? this.furnaces.get(furnaceKey(t.x, t.y, t.z)) : undefined;
    const contents = chest?chest.contents():stand?stand.contents():furnace ? furnaceContents(furnace) : [];
    // Breaking any cell of a chalkboard removes the whole board (one item drops, from the broken cell).
    const board = chalkboardSizeOf(t.id) ? this.chalkboardAt(t.x, t.y, t.z) : null;
    const release = this.beginBlockRelease(t.x, t.y, t.z);
    if (release.kind === "refused") { this.hud.message("Attached items could not be released; the block remains"); return; }
    const lease = release.kind === "ready" ? release.lease : null;
    const sourceContents = JSON.stringify(contents);
    const sourceValid = () => this.world.getBlock(t.x, t.y, t.z) === t.id &&
      JSON.stringify(t.id===203 ? this.chests.get(furnaceKey(t.x,t.y,t.z))?.contents() ?? [] : t.id===BREWING_STAND ? this.brewingStands.get(furnaceKey(t.x,t.y,t.z))?.contents() ?? [] : t.id === FURNACE ? furnaceContents(this.furnaces.get(furnaceKey(t.x, t.y, t.z)) ?? createFurnace()) : []) === sourceContents;
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
      // Passive aquatic actors cannot attack; avoid a generating light query for them.
      if (mob.kind === "squid") continue;
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
      if (damage > 0) this.hurt(damage * hayFallDamageMultiplierAt((x, y, z) => this.world.getBlock(x, y, z), this.body.position), "fall");
    }
  }

  private hurt(amount: number, kind: "melee" | "fall" | "starvation" | "void" | "fire" | "lava" | "blaze" = "melee"): void {
    if (this.ownershipBusy || this.dead || !Number.isFinite(amount) || amount <= 0 || (this.mode === "creative" && kind !== "void")) return;
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
      clearPlayerStatus(this.playerStatus);
      this.deathState = { phase: "pending", position: { ...this.body.position }, keepInventory: this.keepInventory };
      // Flush the editor while its book still belongs to the player, then freeze every modal.
      this.bookScreen.hide(); this.inventoryScreen.freezeForDeath();
      this.npcDialog.hide(); this.chalkDialog.hide(); this.portfolioScreen.hide(); this.codeBuilder.hide();
      this.chat.hide(); this.suspendInput();
      this.breakProgress = 0; this.eatTimer = 0; this.target = null; this.mobTarget = null; this.balloonTarget = null;
      this.tryDeathTransfer();
      this.events.onDeath();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.prepared || Game.handoffBusy || !this.running || this.dead || this.chat.open) return;
    if (/^Digit[1-9]$/.test(e.code)) this.cancelDrinking();
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
    if (this.dead || this.ownershipBusy) return;
    if (this.inventoryScreen.open) {
      if (this.inventoryScreen.hide()) this.resumeInput();
    } else {
      this.openInventory("inventory");
    }
  }

  private openInventory(kind: InventoryKind): void {
    if (this.dead || this.ownershipBusy) return;
    this.suspendInput();
    const furnace = kind === "furnace" && this.openFurnace ? (this.furnaces.get(this.openFurnace) ?? null) : null;
    if (this.actionsNeedRecovery && this.inventoryScreen.resumePending()) return;
    const brewing=kind==="brewing_stand"&&this.openBrewing?this.brewingStands.get(this.openBrewing)??null:null;
    if(kind==="brewing_stand"&&!brewing)return;
    const chest=kind==="chest"&&this.openChest?this.chests.get(this.openChest)??null:null;if(kind==="chest"&&!chest)return;
    this.inventoryScreen.show(this.inventory, this.mode, kind, furnace,brewing,chest);
  }

  private suspendInput(): void {
    this.cancelDrinking();
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
    if (this.dead || this.ownershipBusy) return;
    const r = this.renderer;
    r.render(skyAt(this.timeOfDay,this.world.dimension), false, 0);
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
    this.cancelDrinking();
    this.keyboard.reset();
    this.keyboard.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.chat.show(prefix);
  }

  private resumeInput(): void {
    if (this.prepared || this.stopped || Game.handoffBusy) return;
    this.cancelDrinking();
    if (this.dead) return;
    this.keyboard.enabled = true;
    this.lastTime = performance.now();
    if (!this.touch && !this.paused) this.keyboard.requestPointerLock();
  }

  /** Executes a chat line; returns the feedback shown to the player. */
  runChat(text: string): string {
    if (this.prepared || this.stopped || Game.handoffBusy) return "World is not active.";
    if (this.actionsNeedRecovery && text.startsWith("/")) {
      const reply = this.itemsNeedRecovery ? "Saved items need repair. Export a backup before using commands" : this.recoverySections.includes("Cane growth") ? "Damaged Cane growth state. Export a backup before continuing." : this.recoverySections.includes("code workspace") ? "Damaged source workspace. Export a backup before continuing." : this.recoverySections.includes("chest owners") ? "Damaged Chest storage. Export a backup before continuing." : this.recoverySections.includes("brewing owners") ? "Damaged brewing stations. Export a backup before continuing." : this.recoverySections.includes("Blaze owners") ? "Damaged Blaze owners. Export a backup before continuing." : this.recoverySections.includes("dimensions") ? "Damaged dimensions. Export a backup before continuing." : this.recoverySections.includes("portals") ? "Damaged portals. Export a backup before continuing." : this.recoverySections.includes("fluids") ? "Damaged liquids or terrain version. Export a backup before continuing." : this.recoverySections.includes("fire") ? "Damaged fire. Export a backup before using commands": this.recoverySections.includes("gravel harvest decisions") ? "Damaged gravel harvest decisions. Export a backup before using commands" : this.recoverySections.includes("adult cows") && !this.recoverySections.includes("player status") ? "Damaged adult cows. Export a backup before using commands" : "Damaged player status. Export a backup before using commands";
      this.hud.message(reply);
      return reply;
    }
    if (this.dead) return "Respawn before using commands";
    if (this.ownershipBusy) return "Items are being transferred. Retry the command afterward";
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
      case "effect": {
        this.cancelDrinking();
        this.markPlayerStatusRecovery();
        if (this.actionsNeedRecovery) { reply = "Damaged player status. Export a backup before continuing."; break; }
        if (cmd.action === "clear") {
          const next = sanitizePlayerStatus(this.playerStatus).data;
          clearPlayerStatus(next, cmd.effect);
          reply = this.statusOwner.replace(next) ? "Cleared status effects." : "Status effects are being transferred. Try again afterward.";
        } else {
          const ok = applyTimedStatus(this.playerStatus, cmd.effect, cmd.seconds, cmd.amplifier);
          reply = ok ? `Applied ${cmd.effect} for ${cmd.seconds}s.` : "This effect cannot be applied to the current player status.";
        }
        break;
      }
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
        if (cmd.kind === "squid") {
          // Command policy: prefer nearby loaded water, then a supported dry pose. A dry
          // summon proves neither aquatic habitat nor natural spawning; never generate terrain.
          const spot = findLoadedSquidSummonSpot(this.world, { x, y: this.body.position.y, z });
          if (!spot) { reply = "No safe loaded water or dry space nearby to summon a Squid"; break; }
          if (this.mobs.idsExhausted) { reply = "Creature IDs are exhausted; no creature was summoned"; break; }
          this.mobs.spawn("squid", spot, { yaw: this.body.yaw + Math.PI });
          reply = "Summoned new Squid";
          break;
        }
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
      ["grass", "dirt", "stone", "cobblestone", "oak_planks", "oak_log", "glass", "bricks", "glowstone"].forEach((n, i) => {
        if (!inv.setSlot(i, freshStack(blockId(n)))) throw new Error("Starter inventory could not be created");
      });
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
