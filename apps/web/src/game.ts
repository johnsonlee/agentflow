import {
  AIR, BLOCKS, COMMAND_HELP, SEA_LEVEL, WORLD_HEIGHT, DAY_LENGTH, EYE_HEIGHT, Inventory, World, blockAtEyes, blockById, blockId, breakBlock,
  breakTime, canBreak, createPlayerBody, creativeBlocks, lookDirection, parseCommand, placeBlock, raycast,
  serializeSave, skyAt, stepPlayer, toChunkCoord, type GameMode, type PlayerBody, type RaycastHit, type SaveData,
} from "@craft/engine";
import { KeyboardMouseInput, TouchControls, mergeFrames } from "@craft/input";
import type { TextureAtlas } from "@craft/textures";
import { ChatInput, Hud, InventoryScreen } from "./hud";
import { WorldRenderer } from "./renderer";

export const SAVE_KEY = "craft.save.v1";
const REACH = 5;
const MAX_HEALTH = 20;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const CREATIVE_REPEAT = 0.25;

export interface GameOptions {
  name: string;
  seed: number;
  mode: GameMode;
  touch: boolean;
  save?: SaveData;
}

export interface GameEvents {
  onPause(): void;
  onDeath(): void;
}

/** Owns the world simulation, player, input and HUD for one play session. */
export class Game {
  readonly world: World;
  readonly body: PlayerBody;
  readonly renderer: WorldRenderer;
  readonly hud: Hud;
  inventory: Inventory;
  mode: GameMode;
  timeOfDay: number;
  health = MAX_HEALTH;
  paused = false;
  dead = false;
  fps = 0;

  private readonly name: string;
  private readonly keyboard: KeyboardMouseInput;
  private readonly touch: TouchControls | null;
  private readonly inventoryScreen: InventoryScreen;
  private readonly chat: ChatInput;
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
    this.root = document.createElement("div");
    this.root.className = "game";
    container.appendChild(this.root);
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    this.root.appendChild(canvas);

    const save = options.save;
    this.name = save?.name ?? options.name;
    this.world = new World(save?.seed ?? options.seed);
    if (save) this.world.importEdits(save.edits);
    this.mode = save?.mode ?? options.mode;
    this.timeOfDay = save?.timeOfDay ?? 0.05;
    this.renderer = new WorldRenderer(canvas, this.world, atlas);

    this.spawn = this.findSpawn();
    this.body = createPlayerBody(save?.player.position ?? this.spawn);
    this.body.yaw = save?.player.yaw ?? 0;
    this.body.pitch = save?.player.pitch ?? 0;
    this.body.flying = save?.player.flying ?? false;
    this.inventory = save ? Inventory.fromJSON(save.inventory) : this.starterInventory();

    this.keyboard = new KeyboardMouseInput(canvas);
    this.touch = options.touch ? new TouchControls(canvas, this.root) : null;
    this.hud = new Hud(this.root, atlas, {
      onSelectSlot: (slot) => this.inventory.select(slot),
      onOpenInventory: () => this.toggleInventory(),
      onPause: () => this.pause(),
      onChat: () => this.openChat(),
    }, options.touch);
    this.inventoryScreen = new InventoryScreen(this.root, atlas, () => this.toggleInventory());
    this.chat = new ChatInput(this.root, (text) => this.runChat(text), () => this.resumeInput());

    canvas.addEventListener("click", () => {
      if (!this.touch && !this.paused && !this.dead) this.keyboard.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      if (this.keyboard.pointerLocked) this.hadPointerLock = true;
      else if (this.hadPointerLock && this.running && !this.inventoryScreen.open && !this.chat.open && !this.dead) this.pause();
    });
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pagehide", () => this.save());
    this.resize();

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

  stop(): void {
    this.running = false;
    this.save();
    this.keyboard.dispose();
    this.root.remove();
    this.renderer.renderer.dispose();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.keyboard.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.save();
    this.events.onPause();
  }

  resume(): void {
    this.paused = false;
    this.lastTime = performance.now();
    if (!this.touch) this.keyboard.requestPointerLock();
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    if (mode === "survival") this.body.flying = false;
    this.health = MAX_HEALTH;
    this.hud.message(`Game mode set to ${mode === "creative" ? "Creative" : "Survival"}`);
  }

  respawn(): void {
    this.dead = false;
    this.health = MAX_HEALTH;
    this.body.position = { ...this.spawn };
    this.body.velocity = { x: 0, y: 0, z: 0 };
    this.fallStart = null;
    this.lastTime = performance.now();
    if (!this.touch) this.keyboard.requestPointerLock();
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, serializeSave({
        name: this.name,
        seed: this.world.seed,
        mode: this.mode,
        timeOfDay: this.timeOfDay,
        player: { position: { ...this.body.position }, yaw: this.body.yaw, pitch: this.body.pitch, flying: this.body.flying },
        inventory: this.inventory.toJSON(),
        edits: this.world.exportEdits(),
      }));
    } catch {
      // Storage may be full or disabled (private mode); the game keeps running.
    }
  }

  /** The block currently under the crosshair. */
  get targetBlock(): RaycastHit | null {
    return this.target;
  }

  private tick(dt: number): void {
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    const active = !this.paused && !this.dead && !this.inventoryScreen.open && !this.chat.open;
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
      if (this.body.position.y < -20) this.hurt(MAX_HEALTH);
      this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
      this.interact(input.breaking, input.place, input.pick, dt);
    } else {
      this.target = null;
      this.breakProgress = 0;
    }

    const cam = this.renderer.camera;
    cam.position.set(this.body.position.x, this.body.position.y + EYE_HEIGHT, this.body.position.z);
    cam.rotation.set(this.body.pitch, this.body.yaw, 0);
    this.renderer.updateChunks(this.renderer.isAreaReady(1) ? 6 : 30);

    const underwater = blockAtEyes((x, y, z) => this.world.getBlock(x, y, z), this.body) === "water";
    this.hud.setUnderwater(underwater);
    this.hud.update(this.inventory, this.mode, this.health, dt);
    this.renderer.setSelection(this.target, this.breakProgress);
    this.renderer.render(skyAt(this.timeOfDay), underwater, dt);
    this.hud.setDebug(this.debugText());

    this.autosaveTimer += dt;
    if (this.autosaveTimer > 30) {
      this.autosaveTimer = 0;
      this.save();
    }
  }

  private interact(breaking: boolean, place: boolean, pick: boolean, dt: number): void {
    const eye = { x: this.body.position.x, y: this.body.position.y + EYE_HEIGHT, z: this.body.position.z };
    const dir = lookDirection(this.body.yaw, this.body.pitch);
    const targetable = (id: number) => id !== AIR && BLOCKS[id].shape !== "liquid";
    this.target = raycast((x, y, z) => this.world.getBlock(x, y, z), eye, dir, REACH, targetable);
    this.creativeCooldown = Math.max(0, this.creativeCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    const t = this.target;

    if (breaking && t && canBreak(this.world, this.mode, t.x, t.y, t.z)) {
      const key = `${t.x},${t.y},${t.z}`;
      if (key !== this.breakKey) {
        this.breakKey = key;
        this.breakProgress = 0;
      }
      const needed = breakTime(this.mode, t.id);
      if (needed === 0) {
        if (this.creativeCooldown === 0) {
          breakBlock(this.world, this.inventory, this.mode, t.x, t.y, t.z);
          this.creativeCooldown = CREATIVE_REPEAT;
        }
        this.breakProgress = 0;
      } else {
        this.breakProgress += dt / needed;
        if (this.breakProgress >= 1) {
          breakBlock(this.world, this.inventory, this.mode, t.x, t.y, t.z);
          this.breakProgress = 0;
          this.breakKey = "";
        }
      }
    } else {
      this.breakProgress = 0;
      this.breakKey = "";
      if (!breaking) this.creativeCooldown = 0;
    }

    if (place && t && this.placeCooldown === 0) {
      // Plants and other replaceable blocks are replaced in place; otherwise place against the hit face.
      const replace = BLOCKS[t.id].needsSupport === true;
      const px = replace ? t.x : t.x + t.normal.x;
      const py = replace ? t.y : t.y + t.normal.y;
      const pz = replace ? t.z : t.z + t.normal.z;
      if (placeBlock(this.world, this.inventory, this.mode, px, py, pz, this.body.position)) this.placeCooldown = 0.15;
    }

    if (pick && t && this.mode === "creative" && blockById(t.id).creative) this.inventory.pick(t.id);
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
      if (damage > 0) this.hurt(damage);
    }
  }

  private hurt(amount: number): void {
    if (this.mode === "creative" && this.body.position.y > -20) return;
    this.health = Math.max(0, this.health - amount);
    this.hud.flashDamage();
    if (this.health === 0 || this.body.position.y < -20) {
      this.dead = true;
      this.health = 0;
      this.keyboard.reset();
      if (document.pointerLockElement) document.exitPointerLock();
      this.events.onDeath();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.running || this.chat.open) return;
    if (e.code === "KeyE" && !this.paused && !this.dead) this.toggleInventory();
    else if (e.code === "Escape" && this.inventoryScreen.open) this.toggleInventory();
    else if (e.code === "Escape" && !this.paused && !this.dead && !this.keyboard.pointerLocked) this.pause();
    else if ((e.code === "Slash" || e.code === "KeyT") && !this.paused && !this.dead && !this.inventoryScreen.open) {
      e.preventDefault();
      this.openChat(e.code === "Slash" ? "/" : "");
    } else if (e.code === "F3") {
      e.preventDefault();
      this.hud.toggleDebug();
    }
  }

  private toggleInventory(): void {
    if (this.inventoryScreen.open) {
      this.inventoryScreen.hide();
      this.resumeInput();
    } else {
      this.keyboard.reset();
      this.keyboard.enabled = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.inventoryScreen.show(this.inventory, this.mode);
    }
  }

  private openChat(prefix = ""): void {
    this.keyboard.reset();
    this.keyboard.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.chat.show(prefix);
  }

  private resumeInput(): void {
    this.keyboard.enabled = true;
    this.lastTime = performance.now();
    if (!this.touch && !this.paused) this.keyboard.requestPointerLock();
  }

  /** Executes a chat line; returns the feedback shown to the player. */
  runChat(text: string): string {
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
        this.body.position = {
          x: cmd.relative[0] ? p.x + cmd.x : cmd.x,
          y: cmd.relative[1] ? p.y + cmd.y : cmd.y,
          z: cmd.relative[2] ? p.z + cmd.z : cmd.z,
        };
        this.body.velocity = { x: 0, y: 0, z: 0 };
        const q = this.body.position;
        reply = `Teleported to ${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${q.z.toFixed(1)}`;
        break;
      }
      case "give": {
        const left = this.inventory.add(cmd.id, cmd.count);
        reply = `Gave ${cmd.count - left} [${blockById(cmd.id).displayName}]`;
        break;
      }
      case "seed":
        reply = `Seed: [${this.world.seed}]`;
        break;
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
        if (id !== AIR && !BLOCKS[id].needsSupport) return false;
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
