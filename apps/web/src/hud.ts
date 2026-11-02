import {
  HOTBAR_SIZE, INVENTORY_SIZE, ITEMS, craftOnce, creativeBlocks, displayNameOf, fuelSeconds, matchRecipe, maxStackOf, toolOf,
  type CraftingGrid, type FurnaceState, type GameMode, type Inventory, type ItemStack,
} from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";
import { blockIcon } from "./icons";

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
}

/** In-game overlay: crosshair, hotbar, hearts, item name, debug info and chat log. */
export class Hud {
  readonly root = el("div", "hud");
  private readonly hotbar = el("div", "hotbar");
  private readonly slots: HTMLElement[] = [];
  private readonly hearts = el("div", "hearts");
  private readonly hunger = el("div", "hunger");
  private readonly itemName = el("div", "item-name");
  private readonly debug = el("pre", "debug");
  private readonly log = el("div", "chat-log");
  private readonly damage = el("div", "damage-flash");
  private readonly water = el("div", "underwater");
  private readonly cameraFlash = el("div", "camera-flash");
  private itemNameTimer = 0;
  private lastSignature = "";

  constructor(
    container: HTMLElement,
    private readonly atlas: TextureAtlas,
    callbacks: HudCallbacks,
    touch: boolean,
  ) {
    this.root.append(this.water, this.damage, this.cameraFlash, el("div", "crosshair"), this.log, this.debug);
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
    bottom.append(this.itemName, stats, this.hotbar);
    if (touch) {
      const more = el("button", "slot slot-more", "•••");
      more.setAttribute("aria-label", "Open inventory");
      more.addEventListener("pointerdown", (e) => {
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
      top.append(camera, portfolio, chat, pause);
      this.root.appendChild(top);
    }
    this.root.appendChild(bottom);
    this.debug.hidden = true;
    container.appendChild(this.root);
  }

  update(inventory: Inventory, mode: GameMode, health: number, food: number, dt: number): void {
    const signature = JSON.stringify([inventory.slots.slice(0, HOTBAR_SIZE), inventory.selected, mode, health, food]);
    if (signature !== this.lastSignature) {
      const selectedChanged = this.lastSignature === "" || JSON.parse(this.lastSignature)[1] !== inventory.selected;
      this.lastSignature = signature;
      this.slots.forEach((slot, i) => {
        const stack = inventory.slots[i];
        slot.classList.toggle("selected", i === inventory.selected);
        slot.replaceChildren();
        if (stack) {
          const img = el("img");
          img.src = blockIcon(this.atlas, stack.id);
          img.alt = displayNameOf(stack.id);
          img.draggable = false;
          slot.appendChild(img);
          if (mode === "survival" && stack.count > 1) slot.appendChild(el("span", "count", String(stack.count)));
          const bar = durabilityBar(stack);
          if (bar) slot.appendChild(bar);
        }
      });
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
          const hp = health - i * 2;
          return el("span", `heart ${hp >= 2 ? "full" : hp === 1 ? "half" : "empty"}`);
        }),
      );
      const stack = inventory.selectedStack();
      if (selectedChanged && stack) this.showItemName(displayNameOf(stack.id));
    }
    if (this.itemNameTimer > 0) {
      this.itemNameTimer -= dt;
      this.itemName.style.opacity = String(Math.min(1, this.itemNameTimer));
    }
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

  message(text: string): void {
    const line = el("div", "chat-line", text);
    this.log.appendChild(line);
    setTimeout(() => line.classList.add("fade"), 6000);
    setTimeout(() => line.remove(), 7000);
    while (this.log.children.length > 8) this.log.firstChild?.remove();
  }
}

export type InventoryKind = "inventory" | "crafting_table" | "furnace";

/**
 * Full-screen inventory. Survival shows the backpack with a 2x2 crafting grid; creative shows the
 * block palette; the crafting table shows a 3x3 grid in both modes. Items move through a cursor
 * stack: tap a slot to pick it up, tap another slot to drop it (one item into a crafting cell).
 */
export class InventoryScreen {
  readonly root = el("div", "screen inventory-screen");
  private readonly panel = el("div", "panel inventory-panel");
  private cursor: ItemStack | null = null;
  private grid: CraftingGrid = [];
  private width = 0;
  private kind: InventoryKind = "inventory";
  private inventory: Inventory | null = null;
  private mode: GameMode = "creative";
  private furnace: FurnaceState | null = null;
  private furnaceSignature = "";
  private progressFill: HTMLElement | null = null;
  private flameFill: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    private readonly atlas: TextureAtlas,
    private readonly onClose: () => void,
  ) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    this.root.addEventListener("pointerdown", (e) => {
      if (e.target === this.root) this.onClose();
    });
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(inventory: Inventory, mode: GameMode, kind: InventoryKind = "inventory", furnace: FurnaceState | null = null): void {
    this.inventory = inventory;
    this.mode = mode;
    this.kind = kind;
    this.furnace = kind === "furnace" ? furnace : null;
    // The furnace screen has no crafting grid (as in Minecraft).
    this.width = kind === "crafting_table" ? 3 : kind === "furnace" ? 0 : mode === "survival" ? 2 : 0;
    this.grid = new Array(this.width * this.width).fill(null);
    this.cursor = null;
    this.render();
    this.root.hidden = false;
  }

  /** Closes the screen, returning crafting-grid and cursor items to the inventory. */
  hide(): void {
    if (this.inventory) {
      for (const stack of [...this.grid, this.cursor]) if (stack) this.inventory.addStack(stack);
    }
    this.grid = [];
    this.cursor = null;
    this.furnace = null;
    this.root.hidden = true;
  }

  /** Called every frame while open: a furnace keeps smelting, so redraw its slots and gauges. */
  refresh(): void {
    if (this.root.hidden || !this.furnace) return;
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
      this.kind === "crafting_table" ? "Crafting Table" : this.kind === "furnace" ? "Furnace" : mode === "creative" ? "Creative Inventory" : "Inventory";
    header.append(el("h2", "", title));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close inventory");
    close.addEventListener("click", () => this.onClose());
    header.append(close);
    const parts: HTMLElement[] = [header];

    if (this.width > 0) parts.push(this.craftingSection());
    if (this.furnace) parts.push(this.furnaceSection());

    if (mode === "creative" && !this.furnace) {
      const grid = el("div", "item-grid");
      for (const def of [...creativeBlocks(), ...ITEMS]) {
        const cell = this.cell(def.id, 0, def.displayName);
        cell.dataset.block = def.name;
        cell.addEventListener("click", () => {
          if (this.width > 0) this.cursor = { id: def.id, count: maxStackOf(def.id) };
          else inventory.pick(def.id);
          this.render();
        });
        grid.appendChild(cell);
      }
      parts.push(grid);
    }
    if (mode === "survival" || this.width > 0 || this.furnace) {
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
      img.src = blockIcon(this.atlas, this.cursor.id);
      img.alt = "";
      cursor.append(el("span", "", "Holding:"), img, el("span", "", `${displayNameOf(this.cursor.id)} ×${this.cursor.count}`));
    }
    parts.push(cursor);
    const hint = this.furnace
      ? "Tap a slot to pick items up, then tap the furnace's top slot (to smelt) or bottom slot (fuel). Tap the result to collect it."
      : mode === "creative" && this.width === 0
        ? "Pick a block to put it in the selected hotbar slot. Tap a hotbar slot to select it."
        : "Tap a slot to pick items up, tap another slot to put them down. Crafting cells take one item per tap.";
    parts.push(el("p", "hint", hint));
    this.panel.replaceChildren(...parts);
  }

  private craftingSection(): HTMLElement {
    const section = el("div", "crafting");
    const grid = el("div", `item-grid craft-grid craft-${this.width}`);
    this.grid.forEach((stack, i) => {
      const cell = this.cell(stack?.id ?? null, stack?.count ?? 0, stack ? displayNameOf(stack.id) : "Empty");
      cell.dataset.craft = String(i);
      cell.addEventListener("click", () => {
        const current = this.grid[i];
        if (this.cursor && (!current || current.id === this.cursor.id) && (current?.count ?? 0) < maxStackOf(this.cursor.id)) {
          this.grid[i] = { ...this.cursor, count: (current?.count ?? 0) + 1 };
          this.cursor.count--;
          if (this.cursor.count <= 0) this.cursor = null;
        } else if (!this.cursor && current) {
          this.cursor = current;
          this.grid[i] = null;
        }
        this.render();
      });
      grid.appendChild(cell);
    });
    const match = matchRecipe(this.grid, this.width);
    const result = this.cell(match?.result.id ?? null, match?.result.count ?? 0, match ? displayNameOf(match.result.id) : "No recipe");
    result.classList.add("craft-result");
    result.dataset.craftResult = "";
    result.addEventListener("click", () => {
      const preview = matchRecipe(this.grid, this.width);
      if (!preview) return;
      if (this.cursor && (this.cursor.id !== preview.result.id || this.cursor.count + preview.result.count > maxStackOf(preview.result.id))) return;
      const crafted = craftOnce(this.grid, this.width)!;
      this.cursor = this.cursor ? { id: crafted.id, count: this.cursor.count + crafted.count } : crafted;
      this.render();
    });
    section.append(grid, el("span", "craft-arrow", "➜"), result);
    return section;
  }

  /** Minecraft furnace layout: input over a flame gauge over fuel, an arrow, then the result. */
  private furnaceSection(): HTMLElement {
    const f = this.furnace!;
    this.furnaceSignature = JSON.stringify([f.input, f.fuel, f.output]);
    const slot = (key: "input" | "fuel" | "output", empty: string) => {
      const stack = f[key];
      const cell = this.cell(stack?.id ?? null, stack?.count ?? 0, stack ? displayNameOf(stack.id) : empty);
      cell.dataset.furnace = key;
      cell.addEventListener("click", () => {
        const current = f[key];
        const cursor = this.cursor;
        if (key === "output") {
          if (current && !cursor) {
            this.cursor = current;
            f.output = null;
          } else if (current && cursor && cursor.id === current.id && cursor.count + current.count <= maxStackOf(current.id)) {
            cursor.count += current.count;
            f.output = null;
          }
        } else if (cursor) {
          // Only fuels go in the fuel slot.
          if (key === "fuel" && fuelSeconds(cursor.id) === 0) return;
          if (current && current.id === cursor.id && maxStackOf(current.id) > 1) {
            const n = Math.min(maxStackOf(current.id) - current.count, cursor.count);
            current.count += n;
            cursor.count -= n;
            if (cursor.count <= 0) this.cursor = null;
          } else {
            f[key] = cursor;
            this.cursor = current;
          }
        } else if (current) {
          this.cursor = current;
          f[key] = null;
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
    const showCount = this.mode === "survival" || this.width > 0;
    const cell = this.cell(stack?.id ?? null, showCount ? (stack?.count ?? 0) : 0, stack ? displayNameOf(stack.id) : "Empty");
    cell.dataset.slot = String(index);
    const bar = stack ? durabilityBar(stack) : null;
    if (bar) cell.appendChild(bar);
    cell.addEventListener("click", () => {
      if (this.mode === "creative" && this.width === 0 && !this.furnace) {
        if (index < HOTBAR_SIZE) inventory.select(index);
      } else if (this.cursor) {
        const current = inventory.slots[index];
        if (current && current.id === this.cursor.id && maxStackOf(current.id) > 1) {
          const n = Math.min(maxStackOf(current.id) - current.count, this.cursor.count);
          current.count += n;
          this.cursor.count -= n;
          if (this.cursor.count <= 0) this.cursor = null;
        } else {
          inventory.setSlot(index, this.cursor);
          this.cursor = current ? { ...current } : null;
        }
      } else if (stack) {
        this.cursor = { ...stack };
        inventory.setSlot(index, null);
      } else if (index < HOTBAR_SIZE) {
        inventory.select(index);
      }
      this.render();
    });
    return cell;
  }

  private cell(id: number | null, count: number, title: string): HTMLElement {
    const cell = el("button", "item-cell");
    cell.title = title;
    if (id !== null) {
      const img = el("img");
      img.src = blockIcon(this.atlas, id);
      img.alt = title;
      img.draggable = false;
      cell.appendChild(img);
      if (count > 1) cell.appendChild(el("span", "count", String(count)));
    }
    return cell;
  }
}

/** Minecraft-style wear bar under a damaged tool's icon (none for new tools and non-tools). */
function durabilityBar(stack: ItemStack): HTMLElement | null {
  const tool = toolOf(stack.id);
  if (!tool || !stack.damage) return null;
  const left = 1 - stack.damage / tool.durability;
  const bar = el("span", "durability");
  const fill = el("span", "durability-fill");
  fill.style.width = `${Math.round(left * 100)}%`;
  fill.style.background = `hsl(${Math.round(left * 120)}, 90%, 45%)`;
  bar.appendChild(fill);
  bar.dataset.durability = String(tool.durability - stack.damage);
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
