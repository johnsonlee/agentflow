import {
  sanitizePlayerStatus, BREWING_PROFILE, type BrewingStand, type BrewingSlot, HOTBAR_SIZE, INVENTORY_SIZE, Inventory, ITEMS, MAX_PARTICLES, ARMOR_SLOTS, armorOf, armorPoints, durabilityOf, constructElement, craftOnce, createCompound, creativeBlocks, displayNameOf, elementByZ, elementParticlesOf, fuelSeconds,
  cloneStack, freshStack, inspectGlowState, isGlowStickId, inspectSparklerState, isSparklerId, stackLimit, stacksCompatible, isItem, itemById, labReaction, matchRecipe, maxStackOf, reduceMaterial, setFurnaceInput,
  type PlayerStatus, type ArmorSlot, type CraftingGrid, type FurnaceState, type GameMode, type ItemStack,
} from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";
import { blockIcon } from "./icons";
import { addToCursor, canReceiveStack, exchangeBagCursor, exchangeOneWithCell } from "./inventory-transfers";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export interface HudCallbacks {
  onSelectSlot(slot: number): void;
  onOpenInventory(): void;
  onPause(): void;
  onChat(): void;
  onCamera(): void;
  onPortfolio(): void;
  onCodeBuilder(): void;
  onShakeGlow(): void;
  onLightSparkler(offhand: boolean): void;
  onSwapOffhand(): void;
}

/** In-game overlay: crosshair, hotbar, hearts, item name, debug info and chat log. */
export class Hud {
  private disposed = false;
  private readonly messageTimers = new Set<ReturnType<typeof setTimeout>>();
  readonly root = el("div", "hud");
  private readonly hotbar = el("div", "hotbar");
  private readonly slots: HTMLElement[] = [];
  private readonly hearts = el("div", "hearts");
  private readonly hunger = el("div", "hunger");
  private readonly playerStatus = el("div", "player-status");
  private readonly armor = el("div", "armor-meter");
  private readonly itemName = el("div", "item-name");
  private readonly debug = el("pre", "debug");
  private readonly log = el("div", "chat-log");
  private readonly damage = el("div", "damage-flash");
  private readonly water = el("div", "underwater");
  private readonly cameraFlash = el("div", "camera-flash");
  private readonly nauseaCue = el("div", "nausea-vignette");
  private itemNameTimer = 0;
  private lastSignature = "";
  private selectedSignature = "";
  private readonly shakeGlow = el("button", "mc-button glow-shake-button", "Shake");

  private readonly lightSparkler = el("button", "mc-button sparkler-action", "Light");
  private readonly lightOffhand = el("button", "mc-button sparkler-action", "Light offhand");
  private readonly swapOffhand = el("button", "mc-button sparkler-action", "Swap offhand");
  private readonly offhandName = el("div", "offhand-name");

  constructor(
    container: HTMLElement,
    private readonly atlas: TextureAtlas,
    callbacks: HudCallbacks,
    touch: boolean,
  ) {
    this.nauseaCue.hidden = true;
    this.nauseaCue.setAttribute("aria-hidden", "true");
    this.root.append(this.water, this.nauseaCue, this.damage, this.cameraFlash, el("div", "crosshair"), this.log, this.debug);
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = el("button", "slot");
      slot.dataset.slot = String(i);
      slot.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        callbacks.onSelectSlot(i);
      });
      this.slots.push(slot);
      this.hotbar.appendChild(slot);
    }
    const bottom = el("div", "hud-bottom");
    const stats = el("div", "stats");
    this.hunger.setAttribute("aria-label", "Hunger");
    stats.append(this.hearts, this.hunger);
    this.armor.setAttribute("role", "meter");
    this.armor.setAttribute("aria-label", "Armor protection");
    this.armor.setAttribute("aria-valuemin", "0");
    this.armor.setAttribute("aria-valuemax", "20");
    this.playerStatus.setAttribute("role", "status");
    this.playerStatus.setAttribute("aria-label", "Active effects");
    this.playerStatus.hidden = true;
    bottom.append(this.itemName, this.playerStatus, this.armor, stats, this.hotbar);
    if (touch) {
      const more = el("button", "slot slot-more", "•••");
      more.setAttribute("aria-label", "Open inventory");
      more.addEventListener("pointerdown", (e) => e.stopPropagation());
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.onOpenInventory();
      });
      this.hotbar.appendChild(more);
      const top = el("div", "touch-top");
      const pause = el("button", "touch-top-button", "❚❚");
      pause.setAttribute("aria-label", "Pause");
      pause.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        callbacks.onPause();
      });
      const chat = el("button", "touch-top-button", "💬");
      chat.setAttribute("aria-label", "Chat and commands");
      chat.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        callbacks.onChat();
      });
      const camera = el("button", "touch-top-button", "📷");
      camera.setAttribute("aria-label", "Take photo");
      camera.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        callbacks.onCamera();
      });
      const portfolio = el("button", "touch-top-button", "🖼");
      portfolio.setAttribute("aria-label", "Portfolio");
      portfolio.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        callbacks.onPortfolio();
      });
      const code = el("button", "touch-top-button", "</>");
      code.setAttribute("aria-label", "Code Builder");
      code.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        callbacks.onCodeBuilder();
      });
      top.append(code, camera, portfolio, chat, pause);
      this.root.appendChild(top);
    }
    this.shakeGlow.hidden = true; this.shakeGlow.setAttribute("aria-label", "Shake selected glow stick");
    this.shakeGlow.addEventListener("pointerdown", e => e.stopPropagation());
    this.shakeGlow.addEventListener("keydown", e => {
      // Keep native button activation local; gameplay shortcuts must reach the window input.
      if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") e.stopPropagation();
    });
    this.shakeGlow.addEventListener("click", e => { e.stopPropagation(); callbacks.onShakeGlow(); });
    const sparklerActions = el("div", "sparkler-actions");
    for (const [button, name, action] of [
      [this.lightSparkler, "Light selected sparkler", () => callbacks.onLightSparkler(false)],
      [this.lightOffhand, "Light offhand sparkler", () => callbacks.onLightSparkler(true)],
      [this.swapOffhand, "Swap selected item with offhand", () => callbacks.onSwapOffhand()],
    ] as const) {
      button.setAttribute("aria-label", name); button.hidden = true;
      button.addEventListener("pointerdown", e => e.stopPropagation());
      button.addEventListener("keydown", e => { if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") e.stopPropagation(); });
      button.addEventListener("click", e => { e.stopPropagation(); action(); });
      sparklerActions.appendChild(button);
    }
    sparklerActions.appendChild(this.offhandName);
    bottom.prepend(this.shakeGlow, sparklerActions);
    this.root.appendChild(bottom);
    this.debug.hidden = true;
    container.appendChild(this.root);
  }

  update(inventory: Inventory, mode: GameMode, health: number, food: number, dt: number, glowEnabled = true): void {
    const held = inventory.selectedStack(), glow = held && isGlowStickId(held.id) ? inspectGlowState(held) : null;
    this.shakeGlow.hidden = glow === null;
    this.shakeGlow.disabled = !glowEnabled || glow?.kind === "active" || glow?.kind === "invalid";
    this.shakeGlow.textContent = glow?.kind === "active" ? "Glowing" : "Shake";
    const mainSparkler = held && isSparklerId(held.id) ? inspectSparklerState(held) : null;
    const offhand = inventory.offhand, offSparkler = offhand ? inspectSparklerState(offhand) : null;
    this.lightSparkler.hidden = mainSparkler === null;
    this.lightSparkler.disabled = !glowEnabled || mainSparkler?.kind === "active" || mainSparkler?.kind === "invalid";
    this.lightSparkler.textContent = mainSparkler?.kind === "active" ? "Lit" : "Light";
    this.lightOffhand.hidden = !offhand;
    this.lightOffhand.disabled = !glowEnabled || offSparkler?.kind === "active" || offSparkler?.kind === "invalid";
    this.lightOffhand.textContent = offSparkler?.kind === "active" ? "Offhand lit" : "Light offhand";
    this.swapOffhand.hidden = !offhand && mainSparkler === null;
    this.swapOffhand.disabled = !glowEnabled || !!held && !isSparklerId(held.id);
    this.offhandName.textContent = offhand ? `Offhand: ${stackLabel(offhand)}` : "";
    const signature = JSON.stringify([inventory.offhand, inventory.slots.slice(0, HOTBAR_SIZE), inventory.selected, mode, health, food, inventory.equipment]);
    if (signature !== this.lastSignature) {
      const selected = JSON.stringify([inventory.selected, inventory.selectedStack()]);
      const selectedChanged = selected !== this.selectedSignature; this.selectedSignature = selected;
      this.lastSignature = signature;
      this.slots.forEach((slot, i) => {
        const stack = inventory.slots[i];
        slot.classList.toggle("selected", i === inventory.selected);
        slot.replaceChildren(); slot.title = "Empty"; slot.setAttribute("aria-label", "Empty");
        if (stack) {
          const img = el("img");
          img.src = blockIcon(this.atlas, stack.id, 64, stack);
          img.alt = stackLabel(stack);
          slot.title = stackTooltip(stack);
          slot.setAttribute("aria-label", stackLabel(stack));
          img.draggable = false;
          slot.appendChild(img);
          if (mode === "survival" && stack.count > 1) slot.appendChild(el("span", "count", String(stack.count)));
          const bar = durabilityBar(stack);
          if (bar) slot.appendChild(bar);
        }
      });
      const protection = armorPoints(inventory);
      this.armor.hidden = mode !== "survival" || protection === 0;
      this.armor.dataset.armorPoints = String(protection);
      this.armor.setAttribute("aria-valuenow", String(protection));
      this.armor.setAttribute("aria-valuetext", `${protection} of 20 armor points`);
      this.armor.replaceChildren(...Array.from({ length: 10 }, (_, i) => {
        const points = protection - i * 2;
        const icon = el("span", `armor-point ${points >= 2 ? "full" : points === 1 ? "half" : "empty"}`, "◆");
        icon.setAttribute("aria-hidden", "true");
        return icon;
      }));
      this.hearts.hidden = mode !== "survival";
      // Minecraft's hunger bar: 10 drumsticks, right-aligned, emptying from the left.
      this.hunger.hidden = mode !== "survival";
      this.hunger.dataset.food = String(food);
      this.hunger.replaceChildren(
        ...Array.from({ length: 10 }, (_, i) => {
          const f = food - (9 - i) * 2;
          return el("span", `food ${f >= 2 ? "full" : f === 1 ? "half" : "empty"}`);
        }),
      );
      this.hearts.replaceChildren(
        ...Array.from({ length: 10 }, (_, i) => {
          const hp = Math.ceil(health) - i * 2;
          return el("span", `heart ${hp >= 2 ? "full" : hp === 1 ? "half" : "empty"}`);
        }),
      );
      const stack = inventory.selectedStack();
      if (selectedChanged && stack) this.showItemName(stackLabel(stack));
    }
    if (this.itemNameTimer > 0) {
      this.itemNameTimer -= dt;
      this.itemName.style.opacity = String(Math.min(1, this.itemNameTimer));
    }
  }

  setPlayerStatus(status: PlayerStatus): void {
    // Frozen recovery UI must not evaluate malformed owner accessors.
    status = sanitizePlayerStatus(status).data;
    const labels: string[] = [], effects: string[] = [];
    if (status.poison) { labels.push(`Poison · ${Math.ceil(status.poison.remaining)}s`); effects.push("poison"); }
    for (const [key, label] of [["weakness", "Weakness"], ["blindness", "Blindness"], ["nausea", "Nausea"]] as const) {
      const effect = status[key];
      if (effect) { labels.push(`${label} ${effect.amplifier + 1} · ${Math.ceil(effect.remaining)}s`); effects.push(key); }
    }
    this.playerStatus.hidden = labels.length === 0;
    this.playerStatus.textContent = labels.join(" | ");
    this.playerStatus.dataset.effect = effects.join(" ");
    this.nauseaCue.hidden = status.nausea === undefined;
  }

  showItemName(name: string): void {
    this.itemName.textContent = name;
    this.itemNameTimer = 2;
  }

  flashDamage(): void {
    this.damage.classList.remove("on");
    void this.damage.offsetWidth;
    this.damage.classList.add("on");
  }

  flashCamera(): void {
    this.cameraFlash.classList.remove("on");
    void this.cameraFlash.offsetWidth;
    this.cameraFlash.classList.add("on");
  }

  setUnderwater(on: boolean): void {
    this.water.classList.toggle("on", on);
  }

  toggleDebug(): void {
    this.debug.hidden = !this.debug.hidden;
  }

  setDebug(text: string): void {
    if (!this.debug.hidden) this.debug.textContent = text;
  }

  /** Cancels only HUD-owned message work; unrelated download URL cleanup stays alive. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    let failure: unknown;
    for (const timer of this.messageTimers) {
      try { clearTimeout(timer); } catch (error) { failure ??= error; }
    }
    this.messageTimers.clear();
    try { this.root.remove(); } catch (error) { failure ??= error; }
    if (failure !== undefined) throw failure;
  }

  private messageLater(action: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.messageTimers.delete(timer);
      if (!this.disposed) action();
    }, delay);
    this.messageTimers.add(timer);
  }

  message(text: string): void {
    if (this.disposed) return;
    const line = el("div", "chat-line", text);
    this.log.appendChild(line);
    this.messageLater(() => line.classList.add("fade"), 6000);
    this.messageLater(() => line.remove(), 7000);
    while (this.log.children.length > 8) this.log.firstChild?.remove();
  }
}

export type ChemistryKind = "element_constructor" | "compound_creator" | "material_reducer" | "lab_table";
export type InventoryKind = "inventory" | "crafting_table" | "furnace" | "brewing_stand" | ChemistryKind;

const CHEMISTRY_TITLES = new Map<InventoryKind, string>([
  ["element_constructor", "Element Constructor"],
  ["compound_creator", "Compound Creator"],
  ["material_reducer", "Material Reducer"],
  ["lab_table", "Lab Table"],
]);
const isChemistry = (kind: InventoryKind): kind is ChemistryKind => CHEMISTRY_TITLES.has(kind);

/** Hover/long-press tooltip: the name, plus symbol, atomic number and mass or formula for chemistry items. */
export function tooltipOf(id: number): string {
  const name = displayNameOf(id);
  const chem = isItem(id) ? itemById(id).chem : undefined;
  if (!chem) return name;
  if (chem.kind === "element") return `${name} (${chem.symbol}): atomic number ${chem.z}, mass ${chem.mass}`;
  if (chem.kind === "isotope") return `${name} (${chem.symbol}-${chem.mass}): atomic number ${chem.z}, ${chem.mass! - chem.z!} neutrons`;
  if (chem.kind === "compound") return `${name} (${chem.formula})`;
  return `${name} (lab product)`;
}


/** State follows the owned stack through every inventory view. */
export function stackLabel(stack: ItemStack): string {
  if (isSparklerId(stack.id)) {
    const state = inspectSparklerState(stack);
    return `${displayNameOf(stack.id)} — ${state.kind === "active" ? "Lit" : state.kind === "invalid" ? "Unavailable" : "Ready to light"}`;
  }
  if (!isGlowStickId(stack.id)) return displayNameOf(stack.id);
  const state = inspectGlowState(stack);
  return `${displayNameOf(stack.id)} — ${state.kind === "active" ? "Glowing" : state.kind === "invalid" ? "Unavailable" : "Ready to shake"}`;
}
export function stackTooltip(stack: ItemStack): string {
  return isGlowStickId(stack.id) || isSparklerId(stack.id) ? stackLabel(stack) : tooltipOf(stack.id);
}

type PaletteTab = "blocks" | "elements" | "compounds";
const PALETTE_TABS: readonly (readonly [PaletteTab, string])[] = [["blocks", "Blocks & Items"], ["elements", "Elements"], ["compounds", "Compounds"]];

/** Which creative-palette tab an id belongs to. */
function paletteTab(id: number): PaletteTab {
  const kind = isItem(id) ? itemById(id).chem?.kind : undefined;
  return kind === "element" || kind === "isotope" ? "elements" : kind === "compound" || kind === "product" ? "compounds" : "blocks";
}

/**
 * Full-screen inventory. Survival shows the backpack with a 2x2 crafting grid; creative shows the
 * block palette; the crafting table shows a 3x3 grid in both modes. Items move through a cursor
 * stack: tap a slot to pick it up, tap another slot to drop it (one item into a crafting cell).
 */
export class InventoryScreen {
  readonly root = el("div", "screen inventory-screen");
  private readonly panel = el("div", "panel inventory-panel");
  private cursor: ItemStack | null = null;
  private lookup: ItemStack | null = null;
  private lookupError = "";
  private grid: CraftingGrid = [];
  private width = 0;
  private kind: InventoryKind = "inventory";
  private inventory: Inventory | null = null;
  private mode: GameMode = "creative";
  private furnace: FurnaceState | null = null;
  private furnaceSignature = "";
  private brewing:BrewingStand|null=null;
  private brewingSignature="";
  private progressFill: HTMLElement | null = null;
  private flameFill: HTMLElement | null = null;
  private chem: ChemistryKind | null = null;
  private tab: PaletteTab = "blocks";
  private closeHint = "";
  private recovery: ItemStack[] = [];
  private recovering = false;
  /** Element Constructor settings (kept between openings, like Education Edition's sliders). */
  private readonly particles = { protons: 1, neutrons: 0, electrons: 1 };

  constructor(
    container: HTMLElement,
    private readonly atlas: TextureAtlas,
    private readonly onClose: () => void,
    private readonly onDropHeld?: (stack: ItemStack) => boolean,
    private readonly canMoveItems: () => boolean = () => true,
    private readonly recoveryNotice: () => string = () => "Saved items need repair. Export a backup before moving items.",
  ) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    this.root.addEventListener("pointerdown", (e) => {
      if (e.target === this.root) this.onClose();
    });
    this.root.addEventListener("click", e => {
      if (!this.canMoveItems() && !(e.target as Element).closest(".close-button")) {
        e.preventDefault(); e.stopImmediatePropagation();
        this.closeHint = this.recoveryNotice(); this.render();
      }
    }, true);
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(inventory: Inventory, mode: GameMode, kind: InventoryKind = "inventory", furnace: FurnaceState | null = null, brewing:BrewingStand|null=null): void {
    // A station switch must return every owned pending item before replacing its screen state.
    if (this.open && !this.hide()) return;
    this.inventory = inventory;
    this.mode = mode;
    this.kind = kind;
    this.furnace = kind === "furnace" ? furnace : null;
    this.brewing = kind === "brewing_stand" ? brewing : null;
    // The furnace screen has no crafting grid (as in Minecraft).
    this.chem = isChemistry(kind) ? kind : null;
    this.width =
      kind === "crafting_table" || kind === "compound_creator" || kind === "lab_table" ? 3
        : kind === "material_reducer" ? 1
          : kind === "furnace" || kind === "brewing_stand" || kind === "element_constructor" ? 0
            : mode === "survival" ? 2 : 0;
    this.grid = new Array(this.width * this.width).fill(null);
    this.cursor = null;
    this.lookup = null;
    this.lookupError = "";
    this.closeHint = "";
    this.recovery = [];
    this.recovering = false;
    this.render();
    this.root.hidden = false;
    this.panel.scrollTop = 0;
  }

  /** Saved grid/cursor contents are recovered without recreating a potentially missing station. */
  restorePending(inventory: Inventory, mode: GameMode, stacks: ItemStack[]): boolean {
    if (stacks.length === 0 || this.open) return false;
    this.show(inventory, mode);
    this.recovery = structuredClone(stacks);
    this.recovering = true;
    this.render();
    return true;
  }

  /** A detached save snapshot; saving never moves items out of the live screen. */
  pendingItems(): ItemStack[] {
    return structuredClone([...this.recovery, ...this.grid, this.cursor, this.lookup].filter((stack): stack is ItemStack => stack !== null));
  }

  /** Freeze modal interaction without moving any owned grid/cursor/recovery items. */
  freezeForDeath(): void { this.root.hidden = true; }

  /** Nonthrowing ownership finalization after the entire death batch has committed. */
  clearTransferredPending(): void {
    this.grid = []; this.cursor = null; this.lookup = null; this.recovery = [];
    this.furnace = null; this.brewing=null; this.chem = null; this.recovering = false;
  }

  /** Kept items stay in their original screen owner, including when a full bag cannot accept them. */
  resumePending(): boolean {
    if (this.pendingItems().length === 0) return false;
    const pending = this.pendingItems(), inventory = this.inventory!, mode = this.mode;
    this.clearTransferredPending();
    return this.restorePending(inventory, mode, pending);
  }

  /** True when the screen has a work area (crafting grid or chemistry station): the palette fills the cursor. */
  private get working(): boolean {
    return this.width > 0 || this.chem !== null;
  }

  /** Closes the screen, returning crafting-grid and cursor items to the inventory. */
  hide(): boolean {
    if (!this.canMoveItems()) { this.root.hidden = true; return true; }
    if (this.inventory) {
      const returning = this.pendingItems();
      // Check the entire return first: a full bag must not delete held armor or crafting ingredients.
      const trial = Inventory.fromJSON(this.inventory.toJSON());
      if (returning.some((stack) => trial.addStack(stack) > 0)) {
        this.closeHint = "Inventory full. Make room for held and crafting items before closing.";
        this.render();
        return false;
      }
      for (const stack of returning) this.inventory.addStack(stack);
    }
    this.grid = [];
    this.cursor = null;
    this.lookup = null;
    this.lookupError = "";
    this.furnace = null; this.brewing=null;
    this.recovery = [];
    this.recovering = false;
    this.root.hidden = true;
    return true;
  }

  /** Called every frame while open: a furnace keeps smelting, so redraw its slots and gauges. */
  refresh(): void {
    if(this.root.hidden)return;
    if(this.brewing?.removed){this.brewing=null;this.kind="inventory";this.width=this.mode==="survival"?2:0;this.grid=new Array(this.width*this.width).fill(null);this.render();return;}
    if(this.brewing){
      const state=this.brewing.snapshot(),signature=JSON.stringify([state.bottles,state.ingredient,state.fuel,state.fuelUses]);
      if(signature!==this.brewingSignature)this.render();
      else{const progress=this.panel.querySelector<HTMLProgressElement>("[data-brewing-progress]");if(progress){progress.value=state.progressSeconds;progress.dataset.brewingProgress=String(state.progressSeconds);}}
      return;
    }
    if(!this.furnace)return;
    const f = this.furnace;
    const signature = JSON.stringify([f.input, f.fuel, f.output]);
    if (signature !== this.furnaceSignature) this.render();
    else this.updateGauges();
  }

  private render(): void {
    const inventory = this.inventory!;
    const mode = this.mode;
    const header = el("div", "panel-header");
    const title =
      CHEMISTRY_TITLES.get(this.kind) ??
      (this.kind === "crafting_table" ? "Crafting Table" : this.kind === "furnace" ? "Furnace" : this.kind==="brewing_stand" ? "Brewing Stand" : mode === "creative" ? "Creative Inventory" : "Inventory");
    header.append(el("h2", "", title));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close inventory");
    close.addEventListener("click", () => this.onClose());
    if (this.onDropHeld) {
      const drop = el("button", "mc-button", "Drop held item");
      drop.dataset.dropHeld = ""; drop.disabled = this.cursor === null;
      drop.addEventListener("click", () => {
        if (this.cursor && this.onDropHeld!(structuredClone(this.cursor))) { this.cursor = null; this.render(); }
      });
      header.append(drop);
    }
    header.append(close);
    const parts: HTMLElement[] = [header];

    if (this.recovering) parts.push(this.recoverySection());
    else if (this.chem) parts.push(this.chemistrySection());
    else if (this.width > 0) parts.push(this.craftingSection());
    if (this.furnace) parts.push(this.furnaceSection());
    if (this.brewing) parts.push(this.brewingSection());
    if (this.kind === "inventory") parts.push(this.equipmentSection(), this.offhandSection());

    if (mode === "creative" && !this.furnace && !this.brewing && !this.recovering) {
      const tabs = el("div", "palette-tabs");
      for (const [tab, label] of PALETTE_TABS) {
        const b = el("button", `mc-button small palette-tab${tab === this.tab ? " active" : ""}`, label);
        b.dataset.tab = tab;
        b.addEventListener("click", () => {
          this.tab = tab;
          this.render();
        });
        tabs.appendChild(b);
      }
      parts.push(tabs);
      const grid = el("div", "item-grid palette-grid");
      for (const def of [...creativeBlocks(), ...ITEMS]) {
        if (paletteTab(def.id) !== this.tab) continue;
        const cell = this.cell(def.id, 0, def.displayName);
        cell.dataset.block = def.name;
        cell.addEventListener("click", () => {
          if (this.working) {
            if (this.cursor) {
              // Palette selection must not overwrite a withdrawn owned stack.
              const trial = Inventory.fromJSON(inventory.toJSON());
              if (trial.addStack(this.cursor) > 0) {
                this.closeHint = "Make room for the held item before choosing another item.";
                this.render();
                return;
              }
              inventory.addStack(this.cursor);
            }
            this.cursor = freshStack(def.id, maxStackOf(def.id));
          } else inventory.pick(def.id);
          this.render();
        });
        grid.appendChild(cell);
      }
      parts.push(grid);
    }
    if (mode === "survival" || this.working || this.furnace || this.brewing || this.recovering) {
      const backpack = el("div", "item-grid");
      for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) backpack.appendChild(this.slotCell(i));
      parts.push(backpack);
    }

    const hotbar = el("div", "item-grid hotbar-grid");
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const cell = this.slotCell(i);
      cell.classList.toggle("selected", i === inventory.selected);
      hotbar.appendChild(cell);
    }
    parts.push(el("div", "divider"), hotbar);

    const cursor = el("div", "cursor-stack");
    cursor.dataset.testid = "cursor";
    if (this.cursor) {
      const img = el("img");
      img.src = blockIcon(this.atlas, this.cursor.id, 64, this.cursor);
      img.alt = "";
      cursor.append(el("span", "", "Holding:"), img, el("span", "", `${stackLabel(this.cursor)} ×${this.cursor.count}`));
    }
    parts.push(cursor);
    const hint = this.recovering
      ? "Recover saved held items into the bag or equip matching armor. Make room before closing; crafting and new item pickup resume afterward."
      : this.chem
      ? CHEMISTRY_HINTS.get(this.chem)!
      : this.brewing
      ? "Place water or awkward potions in the bottle slots, add an ingredient and Blaze Powder. Tap a finished bottle to collect it."
      : this.furnace
      ? "Tap a slot to pick items up, then tap the furnace's top slot (to smelt) or bottom slot (fuel). Tap the result to collect it."
      : mode === "creative" && !this.working
        ? "Pick an item for the hotbar. To wear armor, select it, then tap its matching empty armor slot. Tap worn armor to remove it."
        : "Tap a slot to pick items up, tap another slot to put them down. Crafting cells take one item per tap.";
    parts.push(el("p", "hint", hint));
    if (this.closeHint) {
      const status = el("p", "hint inventory-status", this.closeHint);
      status.setAttribute("role", "status");
      parts.push(status);
    }
    this.panel.replaceChildren(...parts);
  }

  private recoverySection(): HTMLElement {
    const section = el("section", "recovery-section");
    section.setAttribute("aria-label", "Saved held items");
    section.appendChild(el("h3", "", "Saved held items"));
    const slots = el("div", "item-grid");
    this.recovery.forEach((stack, index) => {
      const cell = this.cell(stack.id, stack.count, displayNameOf(stack.id), stack);
      cell.dataset.recovery = String(index);
      const bar = durabilityBar(stack);
      if (bar) cell.appendChild(bar);
      cell.addEventListener("click", () => {
        if (this.cursor) return;
        this.cursor = this.recovery.splice(index, 1)[0];
        this.render();
      });
      slots.appendChild(cell);
    });
    section.appendChild(slots);
    return section;
  }

  /** Offhand is a real owner; refuse incompatible cursor items before any debit. */
  private offhandSection(): HTMLElement {
    const inventory = this.inventory!, section = el("section", "offhand-section");
    section.setAttribute("aria-label", "Sparkler offhand");
    const current = inventory.offhand;
    const cell = this.cell(current?.id ?? null, current?.count ?? 0, "Empty offhand", current);
    cell.dataset.offhand = ""; cell.setAttribute("aria-label", current ? `Offhand: ${stackLabel(current)}` : "Empty offhand — sparklers only");
    cell.addEventListener("click", () => {
      const previous = inventory.offhand ? cloneStack(inventory.offhand) : null;
      if (inventory.setOffhand(this.cursor)) this.cursor = previous;
      else this.closeHint = "Only sparklers can be held in the offhand. Move other items into the bag.";
      this.render();
    });
    const swap = el("button", "mc-button", "Swap selected item with offhand"); swap.dataset.swapOffhand = "";
    swap.addEventListener("click", () => {
      if (!inventory.swapSelectedOffhand()) this.closeHint = "Select a sparkler or an empty hotbar slot before swapping the offhand.";
      this.render();
    });
    section.append(el("p", "hint", "Offhand · sparklers only"), cell, swap);
    return section;
  }

  /** Equipment exchanges use the same cursor as the backpack, keeping occupied-slot swaps atomic. */
  private equipmentSection(): HTMLElement {
    const section = el("section", "equipment-section");
    section.setAttribute("aria-label", "Armor equipment");
    const labels: Record<ArmorSlot, string> = { head: "Head", chest: "Chest", legs: "Legs", feet: "Feet" };
    const heading = el("div", "equipment-heading", `Armor · ${armorPoints(this.inventory!)} / 20`);
    const slots = el("div", "equipment-slots");
    for (const slot of ARMOR_SLOTS) {
      const worn = this.inventory!.equipment[slot];
      const label = labels[slot];
      const column = el("div", "equipment-column");
      const cell = this.cell(worn?.id ?? null, 0, worn ? displayNameOf(worn.id) : `${label} armor`);
      cell.dataset.equipment = slot;
      cell.setAttribute("aria-label", `${label} armor${worn ? `: ${displayNameOf(worn.id)}` : ": empty"}`);
      if (worn) {
        const bar = durabilityBar(worn);
        if (bar) cell.appendChild(bar);
      } else cell.appendChild(el("span", "equipment-empty", label));
      cell.addEventListener("click", () => {
        let incoming = this.cursor;
        if (this.recovering && !incoming) return;
        // Creative palette picks remain hotbar picks. An empty equipment slot can copy selected armor.
        if (!incoming && !worn && this.mode === "creative") {
          const selected = this.inventory!.selectedStack();
          if (selected && armorOf(selected.id)?.slot === slot) incoming = cloneStack(selected, 1);
        }
        const result = this.inventory!.swapEquipment(slot, incoming);
        if (result.ok) this.cursor = result.stack;
        this.render();
      });
      column.append(cell, el("span", "equipment-label", label));
      slots.appendChild(column);
    }
    section.append(heading, slots);
    return section;
  }

  private craftingSection(): HTMLElement {
    const section = el("div", "crafting");
    const grid = el("div", `item-grid craft-grid craft-${this.width}`);
    this.grid.forEach((stack, i) => {
      const cell = this.cell(stack?.id ?? null, stack?.count ?? 0, stack ? displayNameOf(stack.id) : "Empty", stack);
      cell.dataset.craft = String(i);
      cell.addEventListener("click", () => {
        const current = this.grid[i];
        const transfer = exchangeOneWithCell(this.cursor, current);
        if (transfer.ok) { this.cursor = transfer.cursor; this.grid[i] = transfer.cell; }
        this.render();
      });
      grid.appendChild(cell);
    });
    const match = matchRecipe(this.grid, this.width);
    const result = this.cell(match?.result.id ?? null, match?.result.count ?? 0, match ? displayNameOf(match.result.id) : "No recipe", match?.result);
    result.classList.add("craft-result");
    result.dataset.craftResult = "";
    result.addEventListener("click", () => {
      const preview = matchRecipe(this.grid, this.width);
      if (!preview) return;
      if (!canReceiveStack(this.cursor, preview.result)) return;
      const crafted = craftOnce(this.grid, this.width)!;
      this.cursor = addToCursor(this.cursor, crafted);
      this.render();
    });
    section.append(grid, el("span", "craft-arrow", "➜"), result);
    return section;
  }

  /** One item per tap into a station input cell (or pick the cell up), like a crafting cell. */
  private inputCell(i: number, empty: string): HTMLElement {
    const stack = this.grid[i];
    const cell = this.cell(stack?.id ?? null, stack?.count ?? 0, stack ? displayNameOf(stack.id) : empty, stack);
    cell.dataset.chemInput = String(i);
    cell.addEventListener("click", () => {
      const current = this.grid[i];
      const transfer = exchangeOneWithCell(this.cursor, current);
      if (transfer.ok) { this.cursor = transfer.cursor; this.grid[i] = transfer.cell; }
      this.render();
    });
    return cell;
  }

  /** A result cell: tap to take one product onto the cursor (stacking with the same item). */
  private resultCell(result: { id: number } | { error: string }, onTake: () => void): HTMLElement[] {
    const id = "id" in result ? result.id : null;
    const cell = this.cell(id, 0, id !== null ? displayNameOf(id) : "No result", id !== null ? freshStack(id) : null);
    cell.classList.add("craft-result");
    cell.dataset.chemResult = "";
    cell.addEventListener("click", () => {
      if (id === null) return;
      const product = freshStack(id);
      if (!canReceiveStack(this.cursor, product)) return;
      onTake();
      this.cursor = addToCursor(this.cursor, product);
      this.render();
    });
    const status = el("p", "chem-status", "id" in result ? tooltipOf(result.id) : result.error);
    status.dataset.chemStatus = "id" in result ? "ok" : "error";
    return [cell, status];
  }

  /** Transfers an actual owned stack; particle inspection never creates or converts it. */
  private elementLookupSection(): HTMLElement {
    const section = el("section", "element-lookup");
    section.setAttribute("aria-label", "Inspect owned element");
    const stack = this.lookup;
    const cell = this.cell(stack?.id ?? null, stack?.count ?? 0, stack ? displayNameOf(stack.id) : "Inspect element", stack);
    cell.dataset.elementLookup = "";
    cell.setAttribute("aria-label", `Inspect owned element: ${stack ? displayNameOf(stack.id) : "empty"}`);
    if (!stack) cell.appendChild(el("span", "equipment-empty", "Inspect"));
    cell.addEventListener("click", () => {
      if (this.cursor) {
        const particles = elementParticlesOf(this.cursor.id);
        if (!particles) {
          this.lookupError = "Only an element or isotope can be inspected here.";
          this.render();
          return;
        }
        const previous = this.lookup;
        this.lookup = this.cursor;
        this.cursor = previous;
        this.particles.protons = particles.protons;
        this.particles.neutrons = particles.neutrons;
        this.particles.electrons = particles.electrons;
      } else if (this.lookup) {
        this.cursor = this.lookup;
        this.lookup = null;
      }
      this.lookupError = "";
      this.render();
    });
    const inspected = elementParticlesOf(stack?.id);
    const note = el("p", "hint", inspected
      ? `${inspected.protons} protons, ${inspected.neutrons} neutrons, ${inspected.electrons} electrons. Take back the owned stack to edit these counts.`
      : "Place an owned element or isotope here to read its particle counts.");
    note.dataset.elementLookupReadout = "";
    if (inspected) {
      cell.dataset.protons = String(inspected.protons);
      cell.dataset.neutrons = String(inspected.neutrons);
      cell.dataset.electrons = String(inspected.electrons);
    }
    section.append(cell, note);
    if (this.lookupError) {
      const status = el("p", "chem-status", this.lookupError);
      status.dataset.elementLookupStatus = "error";
      status.setAttribute("role", "status");
      section.appendChild(status);
    }
    return section;
  }

  /** The four Education Edition chemistry stations. */
  private chemistrySection(): HTMLElement {
    const section = el("div", "chemistry");
    section.dataset.station = this.chem!;
    const row = el("div", "crafting");
    if (this.chem === "element_constructor") {
      const p = this.particles;
      const steppers = el("div", "particle-steppers");
      for (const key of ["protons", "neutrons", "electrons"] as const) {
        const line = el("div", "particle-row");
        line.dataset.particle = key;
        const value = el("input", "particle-value");
        value.type = "number";
        value.min = "0";
        value.max = String(MAX_PARTICLES);
        value.value = String(p[key]);
        value.disabled = this.lookup !== null;
        value.setAttribute("aria-label", key);
        value.addEventListener("keydown", (e) => e.stopPropagation());
        value.addEventListener("change", () => {
          if (this.lookup) return;
          const n = Math.round(Number(value.value));
          p[key] = Number.isFinite(n) ? Math.max(0, Math.min(MAX_PARTICLES, n)) : 0;
          this.render();
        });
        const step = (d: number) => {
          const b = el("button", "mc-button small stepper", d < 0 ? "−" : "+");
          b.dataset.step = String(d);
          b.disabled = this.lookup !== null;
          b.setAttribute("aria-label", `${d < 0 ? "Fewer" : "More"} ${key}`);
          b.addEventListener("click", () => {
            if (this.lookup) return;
            p[key] = Math.max(0, Math.min(MAX_PARTICLES, p[key] + d));
            this.render();
          });
          return b;
        };
        line.append(el("span", "particle-label", key[0].toUpperCase() + key.slice(1)), step(-1), value, step(1));
        steppers.appendChild(line);
      }
      const e = elementByZ(p.protons);
      const card = el("div", "element-preview", e ? `${e.symbol}` : "?");
      card.title = e ? e.name : "No element";
      const result = this.lookup
        ? { error: "Take back the inspected item before constructing another element." }
        : constructElement(p.protons, p.neutrons, p.electrons);
      const output = this.resultCell(result, () => undefined);
      (output[0] as HTMLButtonElement).disabled = this.lookup !== null;
      output[0].dataset.elementCreationEnabled = String(this.lookup === null);
      row.append(steppers, el("span", "craft-arrow", "➜"), ...output);
      section.append(card, row, this.elementLookupSection());
      return section;
    }
    if (this.chem === "material_reducer") {
      const input = this.grid[0];
      const parts = input ? reduceMaterial(input.id) : null;
      const out = el("div", "item-grid reducer-output");
      for (const s of parts ?? []) out.appendChild(this.cell(s.id, s.count, displayNameOf(s.id)));
      const status = el("p", "chem-status", input ? (parts ? `${displayNameOf(input.id)} reduces to:` : `${displayNameOf(input.id)} can't be reduced`) : "Put a block or item in");
      status.dataset.chemStatus = parts ? "ok" : "error";
      status.setAttribute("role", "status");
      const button = el("button", "mc-button small chem-action", "Reduce");
      button.dataset.chemAction = "reduce";
      button.disabled = !parts;
      button.addEventListener("click", () => {
        const stack = this.grid[0];
        const result = stack ? reduceMaterial(stack.id) : null;
        if (!stack || !result || !this.inventory) return;
        // Reserve the whole batch on an exact deep copy; loading/sanitizing could create false space.
        const snapshot = structuredClone(this.inventory.toJSON());
        const trial = new Inventory();
        trial.slots.splice(0, trial.slots.length, ...snapshot.slots);
        trial.selected = snapshot.selected;
        Object.assign(trial.equipment, snapshot.equipment);
        if (result.some((s) => trial.addStack(s) > 0)) {
          status.textContent = "Make room for all reduced elements.";
          status.dataset.chemStatus = "error";
          return;
        }
        // One synchronous commit preserves the live slot array and cannot partially add outputs.
        this.inventory.slots.splice(0, this.inventory.slots.length, ...trial.slots);
        stack.count--;
        if (stack.count <= 0) this.grid[0] = null;
        this.render();
      });
      row.append(this.inputCell(0, "Input"), el("span", "craft-arrow", "➜"), out);
      section.append(row, status, button);
      return section;
    }
    const grid = el("div", "item-grid craft-grid craft-3");
    for (let i = 0; i < 9; i++) grid.appendChild(this.inputCell(i, this.chem === "lab_table" ? "Ingredient" : "Element"));
    const result = this.chem === "lab_table" ? labReaction(this.grid) : createCompound(this.grid);
    row.append(grid, el("span", "craft-arrow", "➜"), ...this.resultCell(result, () => this.grid.fill(null)));
    section.append(row);
    return section;
  }

  private brewingSection():HTMLElement {
    const stand=this.brewing!,state=stand.snapshot();this.brewingSignature=JSON.stringify([state.bottles,state.ingredient,state.fuel,state.fuelUses]);
    const section=el("div","brewing-station"),inputs=el("div","brewing-inputs"),bottles=el("div","brewing-bottles");
    const slot=(key:BrewingSlot,label:string)=>{
      const stack=typeof key==="number"?state.bottles[key]:state[key];
      const cell=this.cell(stack?.id??null,stack?.count??0,stack?displayNameOf(stack.id):label,stack);cell.dataset.brewing=String(key);cell.setAttribute("aria-label",label+(stack?`: ${displayNameOf(stack.id)} ×${stack.count}`:""));
      cell.addEventListener("click",()=>{
        if(!this.canMoveItems())return;
        const current=stand.snapshot(),owned=typeof key==="number"?current.bottles[key]:current[key],cursor=this.cursor;
        if(cursor&&owned&&typeof key!=="number"&&stacksCompatible(cursor,owned)){
          const moved=Math.min(stackLimit(owned)-owned.count,cursor.count);if(moved<=0)return;
          const result=stand.replace(key,{...owned,count:owned.count+moved});if(!result.ok)return;
          cursor.count-=moved;if(cursor.count===0)this.cursor=null;
        }else{const result=stand.replace(key,cursor);if(!result.ok)return;this.cursor=result.returned;}
        this.render();
      });return cell;
    };
    inputs.append(slot("ingredient","Brewing ingredient"),slot("fuel","Blaze Powder fuel"));
    for(const i of [0,1,2] as const)bottles.append(slot(i,`Bottle ${i+1}`));
    const progress=el("progress");progress.max=BREWING_PROFILE.seconds;progress.value=state.progressSeconds;progress.dataset.brewingProgress=String(state.progressSeconds);progress.setAttribute("aria-label","Brewing progress");
    const fuel=el("p","",`Fuel uses remaining: ${state.fuelUses}`);fuel.dataset.brewingFuel=String(state.fuelUses);
    section.append(inputs,progress,bottles,fuel);return section;
  }

  /** Minecraft furnace layout: input over a flame gauge over fuel, an arrow, then the result. */
  private furnaceSection(): HTMLElement {
    const f = this.furnace!;
    this.furnaceSignature = JSON.stringify([f.input, f.fuel, f.output]);
    const slot = (key: "input" | "fuel" | "output", empty: string) => {
      const stack = f[key];
      const cell = this.cell(stack?.id ?? null, stack?.count ?? 0, stack ? displayNameOf(stack.id) : empty, stack);
      cell.dataset.furnace = key;
      cell.addEventListener("click", () => {
        const current = f[key];
        const cursor = this.cursor;
        if (key === "output") {
          if (current && !cursor) {
            this.cursor = current;
            f.output = null;
          } else if (current && cursor && canReceiveStack(cursor, current)) {
            cursor.count += current.count;
            f.output = null;
          }
        } else if (cursor) {
          // Only fuels go in the fuel slot.
          if (key === "fuel" && fuelSeconds(cursor.id) === 0) return;
          if (current && stacksCompatible(current, cursor) && stackLimit(current) > 1) {
            const n = Math.min(stackLimit(current) - current.count, cursor.count);
            current.count += n;
            cursor.count -= n;
            if (cursor.count <= 0) this.cursor = null;
          } else if (key === "input") {
            this.cursor = setFurnaceInput(f, cursor);
          } else {
            f.fuel = cursor;
            this.cursor = current;
          }
        } else if (current) {
          if (key === "input") this.cursor = setFurnaceInput(f, null);
          else { this.cursor = current; f.fuel = null; }
        }
        this.render();
      });
      return cell;
    };
    const flame = el("div", "furnace-flame");
    this.flameFill = el("div", "furnace-flame-fill");
    flame.appendChild(this.flameFill);
    const arrow = el("div", "furnace-progress");
    this.progressFill = el("div", "furnace-progress-fill");
    arrow.appendChild(this.progressFill);
    const column = el("div", "furnace-column");
    column.append(slot("input", "Smelt"), flame, slot("fuel", "Fuel"));
    const section = el("div", "furnace");
    section.append(column, arrow, slot("output", "Result"));
    this.updateGauges();
    return section;
  }

  private updateGauges(): void {
    const f = this.furnace;
    if (!f || !this.progressFill || !this.flameFill) return;
    this.progressFill.style.width = `${Math.round(f.progress * 100)}%`;
    this.progressFill.parentElement!.dataset.progress = f.progress.toFixed(2);
    const flame = f.burnTotal > 0 ? f.burnLeft / f.burnTotal : 0;
    this.flameFill.style.height = `${Math.round(flame * 100)}%`;
    this.flameFill.parentElement!.dataset.burning = String(f.burnLeft > 0);
  }

  private slotCell(index: number): HTMLElement {
    const inventory = this.inventory!;
    const stack = inventory.slots[index];
    const showCount = this.mode === "survival" || this.working;
    const cell = this.cell(stack?.id ?? null, showCount ? (stack?.count ?? 0) : 0, stack ? displayNameOf(stack.id) : "Empty", stack);
    cell.dataset.slot = String(index);
    const bar = stack ? durabilityBar(stack) : null;
    if (bar) cell.appendChild(bar);
    cell.addEventListener("click", () => {
      if (this.recovering && !this.cursor) {
        return;
      } else if (this.mode === "creative" && !this.working && !this.furnace && !this.cursor) {
        if (index < HOTBAR_SIZE) inventory.select(index);
      } else if (this.cursor || stack) {
        const transfer = exchangeBagCursor(inventory, index, this.cursor);
        if (transfer.ok) this.cursor = transfer.cursor;
        else this.closeHint = "Those items cannot be moved together.";
      } else if (index < HOTBAR_SIZE) {
        inventory.select(index);
      }
      this.render();
    });
    return cell;
  }

  private cell(id: number | null, count: number, title: string, stack?: ItemStack | null): HTMLElement {
    const cell = el("button", "item-cell");
    cell.title = stack ? stackTooltip(stack) : id !== null ? tooltipOf(id) : title;
    if (stack && isSparklerId(stack.id)) {
      cell.dataset.sparklerState = inspectSparklerState(stack).kind === "active" ? "active" : "ready";
      cell.setAttribute("aria-label", stackLabel(stack));
    }
    if (stack && isGlowStickId(stack.id)) {
      const state = inspectGlowState(stack); cell.dataset.glowState = state.kind === "active" ? "active" : "ready";
      cell.setAttribute("aria-label", stackLabel(stack));
    }
    if (id !== null) {
      const img = el("img");
      img.src = blockIcon(this.atlas, id, 64, stack ?? undefined);
      img.alt = title;
      img.draggable = false;
      cell.appendChild(img);
      if (count > 1) cell.appendChild(el("span", "count", String(count)));
    }
    return cell;
  }
}

const CHEMISTRY_HINTS = new Map<ChemistryKind, string>([
  ["element_constructor", "Set protons, neutrons and electrons with − and +, then tap the result to take the element or isotope."],
  ["compound_creator", "Put elements in (one per tap; e.g. 2 hydrogen and 1 oxygen), then tap the result to take the compound."],
  ["material_reducer", "Put a block or item in the input slot, then tap Reduce: its elements go to your inventory."],
  ["lab_table", "Put ingredients in (one per tap), then tap the result to take the product."],
]);

/** Wear bar shared by damaged tools and armor (none for undamaged or non-durable items). */
function durabilityBar(stack: ItemStack): HTMLElement | null {
  const durability = durabilityOf(stack.id);
  if (durability === null || !stack.damage) return null;
  const left = 1 - stack.damage / durability;
  const bar = el("span", "durability");
  const fill = el("span", "durability-fill");
  fill.style.width = `${Math.round(left * 100)}%`;
  fill.style.background = `hsl(${Math.round(left * 120)}, 90%, 45%)`;
  bar.appendChild(fill);
  bar.dataset.durability = String(durability - stack.damage);
  return bar;
}

/** Chat / command input line. */
export class ChatInput {
  readonly root = el("form", "chat-input");
  readonly input = el("input");

  constructor(container: HTMLElement, onSubmit: (text: string) => void, private readonly onClose: () => void) {
    this.input.type = "text";
    this.input.placeholder = "Type a command, e.g. /time set night";
    this.input.autocomplete = "off";
    this.input.setAttribute("aria-label", "Chat");
    this.root.appendChild(this.input);
    this.root.hidden = true;
    this.root.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      this.hide();
      if (text) onSubmit(text);
    });
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.hide();
    });
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(prefix = ""): void {
    this.root.hidden = false;
    this.input.value = prefix;
    this.input.focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.input.blur();
    this.onClose();
  }
}
