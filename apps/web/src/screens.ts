import type { Mob } from "@craft/engine";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export const PORTFOLIO_KEY = "craft.portfolio.v1";
const MAX_PHOTOS = 24;

export interface Photo {
  id: string;
  dataUrl: string;
  caption: string;
  takenAt: string;
}

/** Education Edition Camera & Portfolio: photos of the world with captions, kept in localStorage. */
export class Portfolio {
  photos: Photo[] = [];

  constructor() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) ?? "[]") as Photo[];
      if (Array.isArray(parsed)) this.photos = parsed;
    } catch {
      this.photos = [];
    }
  }

  add(dataUrl: string): Photo {
    const photo = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dataUrl, caption: "", takenAt: new Date().toISOString() };
    this.photos.unshift(photo);
    this.photos = this.photos.slice(0, MAX_PHOTOS);
    this.persist();
    return photo;
  }

  remove(id: string): void {
    this.photos = this.photos.filter((p) => p.id !== id);
    this.persist();
  }

  setCaption(id: string, caption: string): void {
    const p = this.photos.find((x) => x.id === id);
    if (p) p.caption = caption;
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(this.photos));
    } catch {
      // Storage full: drop the oldest photo and retry once.
      this.photos.pop();
      try {
        localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(this.photos));
      } catch {
        /* give up silently; photos stay in memory */
      }
    }
  }
}

export class PortfolioScreen {
  readonly root = el("div", "screen portfolio-screen");
  private readonly panel = el("div", "panel portfolio-panel");

  constructor(container: HTMLElement, private readonly portfolio: Portfolio, private readonly onClose: () => void) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const header = el("div", "panel-header");
    header.append(el("h2", "", `Portfolio (${this.portfolio.photos.length})`));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close portfolio");
    close.addEventListener("click", () => this.onClose());
    header.append(close);
    const grid = el("div", "photo-grid");
    if (this.portfolio.photos.length === 0) grid.append(el("p", "hint", "No photos yet. Press C (or 📷) to take one."));
    for (const photo of this.portfolio.photos) {
      const card = el("figure", "photo-card");
      const img = el("img");
      img.src = photo.dataUrl;
      img.alt = photo.caption || "World photo";
      const caption = el("input", "mc-input photo-caption");
      caption.value = photo.caption;
      caption.placeholder = "Add a caption…";
      caption.setAttribute("aria-label", "Photo caption");
      caption.addEventListener("keydown", (e) => e.stopPropagation());
      caption.addEventListener("change", () => this.portfolio.setCaption(photo.id, caption.value));
      const actions = el("div", "photo-actions");
      const download = el("a", "mc-button small", "Save");
      download.href = photo.dataUrl;
      download.download = `photo-${photo.id}.jpg`;
      const del = el("button", "mc-button small", "Delete");
      del.addEventListener("click", () => {
        this.portfolio.remove(photo.id);
        this.render();
      });
      actions.append(download, del);
      card.append(img, caption, actions);
      grid.appendChild(card);
    }
    this.panel.replaceChildren(header, grid);
  }
}

/** Education Edition NPC dialogue: players read it; creative (world builder) players can edit it. */
export class NpcDialog {
  readonly root = el("div", "screen npc-screen");
  private readonly panel = el("div", "panel npc-panel");

  constructor(container: HTMLElement, private readonly onClose: () => void, private readonly onRename: (mob: Mob) => void) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(mob: Mob, editable: boolean): void {
    const title = el("h2", "", mob.name ?? "NPC");
    const text = el("p", "npc-text", mob.dialogue ?? "");
    const parts: HTMLElement[] = [title, text];
    if (editable) {
      const name = el("input", "mc-input");
      name.value = mob.name ?? "";
      name.setAttribute("aria-label", "NPC name");
      const dialogue = el("textarea", "mc-input npc-edit");
      dialogue.value = mob.dialogue ?? "";
      dialogue.setAttribute("aria-label", "NPC dialogue");
      for (const input of [name, dialogue]) input.addEventListener("keydown", (e) => e.stopPropagation());
      const save = el("button", "mc-button primary", "Save");
      save.addEventListener("click", () => {
        mob.name = name.value.trim() || "NPC";
        mob.dialogue = dialogue.value;
        this.onRename(mob);
        this.onClose();
      });
      const label = (t: string, input: HTMLElement) => {
        const l = el("label", "field");
        l.append(el("span", "", t), input);
        return l;
      };
      parts.push(label("Name", name), label("Dialogue", dialogue), save);
    }
    const close = el("button", "mc-button", "Close");
    close.addEventListener("click", () => this.onClose());
    parts.push(close);
    this.panel.replaceChildren(...parts);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
