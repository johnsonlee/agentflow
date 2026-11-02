import {
  HOTBAR_SIZE, INVENTORY_SIZE, ITEMS, constructElement, craftOnce, createCompound, creativeBlocks, displayNameOf, elementByZ, fuelSeconds,
  isItem, itemById, labReaction, matchRecipe, maxStackOf, reduceMaterial, toolOf,
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
  onCodeBuilder(): void;
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
      const code = el("button", "touch-top-button", "</>");
      code.setAttribute("aria-label", "Code Builder");
      code.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        callbacks.onCodeBuilder();
      });
      top.append(code, camera, portfolio, chat, pause);
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

export type ChemistryKind = "element_constructor" | "compound_creator" | "material_reducer" | "lab_table";
export type InventoryKind = "inventory" | "crafting_table" | "furnace" | ChemistryKind;

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
  private grid: CraftingGrid = [];
  private width = 0;
  private kind: InventoryKind = "inventory";
  private inventory: Inventory | null = null;
  private mode: GameMode = "creative";
  private furnace: FurnaceState | null = null;
  private furnaceSignature = "";
  private progressFill: HTMLElement | null = null;
  private flameFill: HTMLElement | null = null;
  private chem: ChemistryKind | null = null;
  private tab: PaletteTab = "blocks";
  /** Element Constructor settings (kept between openings, like Education Edition's sliders). */
  private readonly particles = { protons: 1, neutrons: 0, electrons: 1 };

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
    this.chem = isChemistry(kind) ? kind : null;
    this.width =
      kind === "crafting_table" || kind === "compound_creator" || kind === "lab_table" ? 3
        : kind === "material_reducer" ? 1
          : kind === "furnace" || kind === "element_constructor" ? 0
            : mode === "survival" ? 2 : 0;
    this.grid = new Array(this.width * this.width).fill(null);
    this.cursor = null;
    this.render();
    this.root.hidden = false;
  }

  /** True when the screen has a work area (crafting grid or chemistry station): the palette fills the cursor. */
  private get working(): boolean {
    return this.width > 0 || this.chem !== null;
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
      CHEMISTRY_TITLES.get(this.kind) ??
      (this.kind === "crafting_table" ? "Crafting Table" : this.kind === "furnace" ? "Furnace" : mode === "creative" ? "Creative Inventory" : "Inventory");
    header.append(el("h2", "", title));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close inventory");
    close.addEventListener("click", () => this.onClose());
    header.append(close);
    const parts: HTMLElement[] = [header];

    if (this.chem) parts.push(this.chemistrySection());
    else if (this.width > 0) parts.push(this.craftingSection());
    if (this.furnace) parts.push(this.furnaceSection());

    if (mode === "creative" && !this.furnace) {
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
          if (this.working) this.cursor = { id: def.id, count: maxStackOf(def.id) };
          else inventory.pick(def.id);
          this.render();
        });
        grid.appendChild(cell);
      }
      parts.push(grid);
    }
    if (mode === "survival" || this.working || this.furnace) {
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
    const hint = this.chem
      ? CHEMISTRY_HINTS.get(this.chem)!
      : this.furnace
      ? "Tap a slot to pick items up, then tap the furnace's top slot (to smelt) or bottom slot (fuel). Tap the result to collect it."
      : mode === "creative" && !this.working
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

  /** One item per tap into a station input cell (or pick the cell up), like a crafting cell. */
  private inputCell(i: number, empty: string): HTMLElement {
    const stack = this.grid[i];
    const cell = this.cell(stack?.id ?? null, stack?.count ?? 0, stack ? displayNameOf(stack.id) : empty);
    cell.dataset.chemInput = String(i);
    cell.addEventListener("click", () => {
      const current = this.grid[i];
      if (this.cursor && (!current || current.id === this.cursor.id) && (current?.count ?? 0) < maxStackOf(this.cursor.id)) {
        this.grid[i] = { id: this.cursor.id, count: (current?.count ?? 0) + 1 };
        this.cursor.count--;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (!this.cursor && current) {
        this.cursor = current;
        this.grid[i] = null;
      }
      this.render();
    });
    return cell;
  }

  /** A result cell: tap to take one product onto the cursor (stacking with the same item). */
  private resultCell(result: { id: number } | { error: string }, onTake: () => void): HTMLElement[] {
    const id = "id" in result ? result.id : null;
    const cell = this.cell(id, 0, id !== null ? displayNameOf(id) : "No result");
    cell.classList.add("craft-result");
    cell.dataset.chemResult = "";
    cell.addEventListener("click", () => {
      if (id === null) return;
      if (this.cursor && (this.cursor.id !== id || this.cursor.count >= maxStackOf(id))) return;
      onTake();
      this.cursor = this.cursor ? { id, count: this.cursor.count + 1 } : { id, count: 1 };
      this.render();
    });
    const status = el("p", "chem-status", "id" in result ? tooltipOf(result.id) : result.error);
    status.dataset.chemStatus = "id" in result ? "ok" : "error";
    return [cell, status];
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
        value.max = "140";
        value.value = String(p[key]);
        value.setAttribute("aria-label", key);
        value.addEventListener("keydown", (e) => e.stopPropagation());
        value.addEventListener("change", () => {
          const n = Math.round(Number(value.value));
          p[key] = Number.isFinite(n) ? Math.max(0, Math.min(140, n)) : 0;
          this.render();
        });
        const step = (d: number) => {
          const b = el("button", "mc-button small stepper", d < 0 ? "−" : "+");
          b.dataset.step = String(d);
          b.setAttribute("aria-label", `${d < 0 ? "Fewer" : "More"} ${key}`);
          b.addEventListener("click", () => {
            p[key] = Math.max(0, Math.min(140, p[key] + d));
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
      row.append(steppers, el("span", "craft-arrow", "➜"), ...this.resultCell(constructElement(p.protons, p.neutrons, p.electrons), () => undefined));
      section.append(card, row);
      return section;
    }
    if (this.chem === "material_reducer") {
      const input = this.grid[0];
      const parts = input ? reduceMaterial(input.id) : null;
      const out = el("div", "item-grid reducer-output");
      for (const s of parts ?? []) out.appendChild(this.cell(s.id, s.count, displayNameOf(s.id)));
      const button = el("button", "mc-button small chem-action", "Reduce");
      button.dataset.chemAction = "reduce";
      button.disabled = !parts;
      button.addEventListener("click", () => {
        const stack = this.grid[0];
        const result = stack ? reduceMaterial(stack.id) : null;
        if (!stack || !result || !this.inventory) return;
        // Only reduce if every element fits.
        if (result.some((s) => this.inventory!.spaceFor(s.id) < s.count)) return;
        for (const s of result) this.inventory.addStack(s);
        stack.count--;
        if (stack.count <= 0) this.grid[0] = null;
        this.render();
      });
      const status = el("p", "chem-status", input ? (parts ? `${displayNameOf(input.id)} reduces to:` : `${displayNameOf(input.id)} can't be reduced`) : "Put a block or item in");
      status.dataset.chemStatus = parts ? "ok" : "error";
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
    const showCount = this.mode === "survival" || this.working;
    const cell = this.cell(stack?.id ?? null, showCount ? (stack?.count ?? 0) : 0, stack ? displayNameOf(stack.id) : "Empty");
    cell.dataset.slot = String(index);
    const bar = stack ? durabilityBar(stack) : null;
    if (bar) cell.appendChild(bar);
    cell.addEventListener("click", () => {
      if (this.mode === "creative" && !this.working && !this.furnace) {
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
    cell.title = id !== null ? tooltipOf(id) : title;
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

const CHEMISTRY_HINTS = new Map<ChemistryKind, string>([
  ["element_constructor", "Set protons, neutrons and electrons with − and +, then tap the result to take the element or isotope."],
  ["compound_creator", "Put elements in (one per tap; e.g. 2 hydrogen and 1 oxygen), then tap the result to take the compound."],
  ["material_reducer", "Put a block or item in the input slot, then tap Reduce: its elements go to your inventory."],
  ["lab_table", "Put ingredients in (one per tap), then tap the result to take the product."],
]);

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
