import { HOTBAR_SIZE, INVENTORY_SIZE, blockById, creativeBlocks, type GameMode, type Inventory } from "@craft/engine";
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
}

/** In-game overlay: crosshair, hotbar, hearts, item name, debug info and chat log. */
export class Hud {
  readonly root = el("div", "hud");
  private readonly hotbar = el("div", "hotbar");
  private readonly slots: HTMLElement[] = [];
  private readonly hearts = el("div", "hearts");
  private readonly itemName = el("div", "item-name");
  private readonly debug = el("pre", "debug");
  private readonly log = el("div", "chat-log");
  private readonly damage = el("div", "damage-flash");
  private readonly water = el("div", "underwater");
  private itemNameTimer = 0;
  private lastSignature = "";

  constructor(
    container: HTMLElement,
    private readonly atlas: TextureAtlas,
    callbacks: HudCallbacks,
    touch: boolean,
  ) {
    this.root.append(this.water, this.damage, el("div", "crosshair"), this.log, this.debug);
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
    bottom.append(this.itemName, this.hearts, this.hotbar);
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
      top.append(chat, pause);
      this.root.appendChild(top);
    }
    this.root.appendChild(bottom);
    this.debug.hidden = true;
    container.appendChild(this.root);
  }

  update(inventory: Inventory, mode: GameMode, health: number, dt: number): void {
    const signature = JSON.stringify([inventory.slots.slice(0, HOTBAR_SIZE), inventory.selected, mode, health]);
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
          img.alt = blockById(stack.id).displayName;
          img.draggable = false;
          slot.appendChild(img);
          if (mode === "survival" && stack.count > 1) slot.appendChild(el("span", "count", String(stack.count)));
        }
      });
      this.hearts.hidden = mode !== "survival";
      this.hearts.replaceChildren(
        ...Array.from({ length: 10 }, (_, i) => {
          const hp = health - i * 2;
          return el("span", `heart ${hp >= 2 ? "full" : hp === 1 ? "half" : "empty"}`);
        }),
      );
      const stack = inventory.selectedStack();
      if (selectedChanged && stack) this.showItemName(blockById(stack.id).displayName);
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

/** Full-screen inventory: creative block palette or survival backpack, plus the hotbar. */
export class InventoryScreen {
  readonly root = el("div", "screen inventory-screen");
  private readonly panel = el("div", "panel inventory-panel");
  private held: number | null = null;

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

  show(inventory: Inventory, mode: GameMode): void {
    this.held = null;
    this.render(inventory, mode);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  private render(inventory: Inventory, mode: GameMode): void {
    const header = el("div", "panel-header");
    header.append(el("h2", "", mode === "creative" ? "Creative Inventory" : "Inventory"));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close inventory");
    close.addEventListener("click", () => this.onClose());
    header.append(close);

    const grid = el("div", "item-grid");
    if (mode === "creative") {
      for (const def of creativeBlocks()) {
        const cell = this.cell(def.id, 0, def.displayName);
        cell.dataset.block = def.name;
        cell.addEventListener("click", () => {
          inventory.pick(def.id);
          this.render(inventory, mode);
        });
        grid.appendChild(cell);
      }
    } else {
      for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) grid.appendChild(this.slotCell(inventory, mode, i));
    }

    const hotbar = el("div", "item-grid hotbar-grid");
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const cell = this.slotCell(inventory, mode, i);
      cell.classList.toggle("selected", i === inventory.selected);
      hotbar.appendChild(cell);
    }
    const hint = el(
      "p",
      "hint",
      mode === "creative"
        ? "Pick a block to put it in the selected hotbar slot. Tap a hotbar slot to select it."
        : "Tap two slots to swap them.",
    );
    this.panel.replaceChildren(header, grid, el("div", "divider"), hotbar, hint);
  }

  private slotCell(inventory: Inventory, mode: GameMode, index: number): HTMLElement {
    const stack = inventory.slots[index];
    const cell = this.cell(stack?.id ?? null, mode === "survival" ? (stack?.count ?? 0) : 0, stack ? blockById(stack.id).displayName : "Empty");
    cell.dataset.slot = String(index);
    if (this.held === index) cell.classList.add("held");
    cell.addEventListener("click", () => {
      if (mode === "creative" || this.held === null) {
        if (index < HOTBAR_SIZE && mode === "creative") inventory.select(index);
        else this.held = index;
      } else {
        inventory.swap(this.held, index);
        this.held = null;
      }
      if (index < HOTBAR_SIZE && mode === "survival" && this.held === null) inventory.select(index);
      this.render(inventory, mode);
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
