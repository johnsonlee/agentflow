import { sanitizePhotos, BOOK_MAX_PAGES, BOOK_PAGE_CHARS, BOOK_TITLE_CHARS, CHALKBOARD_SIZES, canEditChalkboard, clampChalkText, isWritableBook, signBook, writeBook, type Chalkboard, type ItemStack } from "@craft/engine";
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

  /** Malformed stored entries dropped on load. */
  dropped = 0;

  constructor() {
    try {
      // Stored separately from the world save; every entry is checked strictly (sanitizePhotos).
      const result = sanitizePhotos(JSON.parse(localStorage.getItem(PORTFOLIO_KEY) ?? "[]"), MAX_PHOTOS);
      this.photos = result.photos;
      this.dropped = result.dropped;
    } catch {
      this.photos = [];
      this.dropped = 1;
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

/** Education Edition chalkboard editor: multi-line text, plus a lock for world builders (creative). */
export class ChalkboardDialog {
  readonly root = el("div", "screen chalkboard-screen");
  private readonly panel = el("div", "panel npc-panel");

  constructor(container: HTMLElement, private readonly onClose: () => void, private readonly onSave: (board: Chalkboard) => void) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(board: Chalkboard, mode: "creative" | "survival"): void {
    const names = { slate: "Slate", poster: "Poster", board: "Board" } as const;
    const parts: HTMLElement[] = [el("h2", "", names[board.size])];
    if (canEditChalkboard(board, mode)) {
      const text = el("textarea", "mc-input npc-edit chalk-edit");
      text.value = board.text;
      text.maxLength = CHALKBOARD_SIZES[board.size].maxChars;
      text.setAttribute("aria-label", "Chalkboard text");
      text.addEventListener("keydown", (e) => e.stopPropagation());
      parts.push(text);
      let lock: HTMLInputElement | null = null;
      if (mode === "creative") {
        lock = el("input");
        lock.type = "checkbox";
        lock.checked = board.locked;
        lock.setAttribute("aria-label", "Lock chalkboard");
        const row = el("label", "field checkbox");
        row.append(lock, el("span", "", "Locked (only world builders can edit)"));
        parts.push(row);
      }
      const save = el("button", "mc-button primary", "Save");
      save.addEventListener("click", () => {
        board.text = clampChalkText(board.size, text.value);
        if (lock) board.locked = lock.checked;
        this.onSave(board);
        this.onClose();
      });
      parts.push(save);
    } else {
      parts.push(el("p", "npc-text", board.text), el("p", "hint", "This chalkboard is locked."));
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

/** Book & Quill writing (pages, Sign) and Written Book reading (page turning). */
export class BookScreen {
  readonly root = el("div", "screen book-screen");
  private readonly panel = el("div", "panel book-panel");
  private stack: ItemStack | null = null;
  private pages: string[] = [""];
  private page = 0;
  private signing = false;

  constructor(container: HTMLElement, private readonly onClose: () => void) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(stack: ItemStack): void {
    this.stack = stack;
    this.pages = [...(stack.book?.pages ?? [""])];
    this.page = 0;
    this.signing = false;
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    // Unsigned books keep what was written.
    if (this.stack && isWritableBook(this.stack)) writeBook(this.stack, this.pages);
    this.stack = null;
    this.root.hidden = true;
  }

  private render(): void {
    const stack = this.stack!;
    const writable = isWritableBook(stack);
    const parts: HTMLElement[] = [];
    if (!writable) parts.push(el("h2", "book-title", stack.book?.title ?? "Book"), el("p", "book-author", `by ${stack.book?.author ?? "?"}`));
    else parts.push(el("h2", "", "Book and Quill"));
    if (writable && this.signing) {
      const title = el("input", "mc-input");
      title.maxLength = BOOK_TITLE_CHARS;
      title.setAttribute("aria-label", "Book title");
      title.addEventListener("keydown", (e) => e.stopPropagation());
      const sign = el("button", "mc-button primary", "Sign and Close");
      sign.addEventListener("click", () => {
        writeBook(stack, this.pages);
        if (signBook(stack, title.value, "Player")) this.onClose();
      });
      const cancel = el("button", "mc-button", "Cancel");
      cancel.addEventListener("click", () => {
        this.signing = false;
        this.render();
      });
      parts.push(el("p", "hint", "Signing makes the book read-only."), title, sign, cancel);
      this.panel.replaceChildren(...parts);
      return;
    }
    if (writable) {
      const text = el("textarea", "mc-input book-page");
      text.value = this.pages[this.page];
      text.maxLength = BOOK_PAGE_CHARS;
      text.setAttribute("aria-label", "Book page");
      text.addEventListener("keydown", (e) => e.stopPropagation());
      text.addEventListener("input", () => (this.pages[this.page] = text.value));
      parts.push(text);
    } else {
      parts.push(el("p", "book-text", this.pages[this.page]));
    }
    const nav = el("div", "book-nav");
    const prev = el("button", "mc-button", "◀");
    prev.setAttribute("aria-label", "Previous page");
    prev.disabled = this.page === 0;
    prev.addEventListener("click", () => {
      this.page--;
      this.render();
    });
    const label = el("span", "book-page-number", `Page ${this.page + 1} of ${this.pages.length}`);
    const next = el("button", "mc-button", "▶");
    next.setAttribute("aria-label", "Next page");
    // Writing: the next arrow on the last page adds a page (as in Minecraft).
    next.disabled = writable ? this.pages.length >= BOOK_MAX_PAGES && this.page === this.pages.length - 1 : this.page >= this.pages.length - 1;
    next.addEventListener("click", () => {
      if (this.page === this.pages.length - 1) this.pages.push("");
      this.page++;
      this.render();
    });
    nav.append(prev, label, next);
    parts.push(nav);
    if (writable) {
      const sign = el("button", "mc-button", "Sign");
      sign.addEventListener("click", () => {
        this.signing = true;
        this.render();
      });
      parts.push(sign);
    }
    const done = el("button", "mc-button primary", "Done");
    done.addEventListener("click", () => this.onClose());
    parts.push(done);
    this.panel.replaceChildren(...parts);
  }
}
