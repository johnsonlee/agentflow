import{portfolioExportSnapshot,buildPortfolioZip,ExportCancelled,type ExportPhoto}from'../assessment/portfolio-export';
import{downloadBlob}from'../platform/download';
import { readNpcActionField, readNpcActions, NPC_MAX_BUTTONS, type NpcActions } from "@craft/engine";
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

  constructor(private readonly canWrite:()=>boolean=()=>true) {
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
    if(!this.canWrite())throw Error("Portfolio is awaiting Camera recovery");
    const photo = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dataUrl, caption: "", takenAt: new Date().toISOString() };
    this.photos.unshift(photo);
    this.photos = this.photos.slice(0, MAX_PHOTOS);
    this.persist();
    return photo;
  }

  exportSnapshot(current:()=>boolean,drafts?:ReadonlyMap<string,string>):readonly ExportPhoto[]{return portfolioExportSnapshot(this.photos,()=>this.canWrite()&&current(),drafts);}

  prepareCaptured(dataUrl:string){
    if(!dataUrl.startsWith("data:image/jpeg;base64,"))throw Error("Invalid Camera photo");
    const photo={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,dataUrl,caption:"",takenAt:new Date().toISOString()};
    const photos=[photo,...this.photos].slice(0,MAX_PHOTOS);return{photo,photos,raw:JSON.stringify(photos)};
  }
  adoptCaptured(photos:Photo[]):void{this.photos=photos;}
  remove(id: string): void {
    if(!this.canWrite())return;
    this.photos = this.photos.filter((p) => p.id !== id);
    this.persist();
  }

  setCaption(id: string, caption: string): void {
    if(!this.canWrite())return;
    const p = this.photos.find((x) => x.id === id);
    if (p) p.caption = caption;
    this.persist();
  }

  private persist(): void {
    if(!this.canWrite())return;
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

export interface PortfolioExportServices{build:typeof buildPortfolioZip;download:typeof downloadBlob}
const portfolioExportServices:PortfolioExportServices={build:buildPortfolioZip,download:downloadBlob};
export class PortfolioScreen {
  readonly root = el("div", "screen portfolio-screen");
  private readonly panel = el("div", "panel portfolio-panel");

  private generation=0;
  private exportOperation:symbol|null=null;
  private readonly downloadCleanups=new Set<()=>void>();
  private disposeDownloads():void{for(const cleanup of this.downloadCleanups)cleanup();this.downloadCleanups.clear();}
  constructor(container: HTMLElement, private readonly portfolio: Portfolio, private readonly onClose: () => void,private readonly canMutate:()=>boolean=()=>true,private readonly exportServices:PortfolioExportServices=portfolioExportServices,private readonly canExport:()=>boolean=canMutate) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    if(!this.canMutate())return;
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.generation++;this.exportOperation=null;this.disposeDownloads();
    this.root.hidden = true;
  }

  private render(): void {
    this.exportOperation=null;this.disposeDownloads();
    const generation=++this.generation,current=()=>this.open&&generation===this.generation&&this.canMutate();
    const header = el("div", "panel-header");
    header.append(el("h2", "", `Portfolio (${this.portfolio.photos.length})`));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close portfolio");
    close.addEventListener("click", () => {if(this.open&&generation===this.generation)this.onClose();});
    header.append(close);
    const controls=el("div","portfolio-export-controls"),exportButton=el("button","mc-button primary","Export Portfolio"),status=el("p","hint portfolio-export-status"),drafts=new Map<string,HTMLInputElement>();
    exportButton.disabled=this.portfolio.photos.length===0;status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const exportAll=async()=>{
      if(!current()||!this.canExport()||this.exportOperation!==null||exportButton.disabled)return;
      const token=Symbol('portfolio-export');this.exportOperation=token;exportButton.disabled=true;status.textContent="Preparing ZIP…";
      const alive=()=>this.exportOperation===token&&current()&&this.canExport();
      try{
        const snapshot=this.portfolio.exportSnapshot(alive,new Map([...drafts].map(([id,input])=>[id,input.value])));
        const result=await this.exportServices.build(snapshot,alive);if(!alive())return;
        let cleanup:(()=>void)|undefined;cleanup=this.exportServices.download(result.blob,"portfolio.zip",alive,()=>{if(cleanup)this.downloadCleanups.delete(cleanup);});
        if(!alive()){cleanup();return;}this.downloadCleanups.add(cleanup);status.textContent=`Exported ${result.photos} photo${result.photos===1?'':'s'}. ZIP includes JPGs and app-specific captions.json.`;
      }catch(error){if(alive())status.textContent=error instanceof ExportCancelled?error.message:"Could not export all photos. "+(error instanceof Error?error.message:"Please try again.");}
      finally{if(this.exportOperation===token){this.exportOperation=null;if(current())exportButton.disabled=this.portfolio.photos.length===0;}}
    };
    exportButton.addEventListener("click",()=>{void exportAll();});
    controls.append(exportButton,status);
    const grid = el("div", "photo-grid");
    if (this.portfolio.photos.length === 0) grid.append(el("p", "hint", "No photos yet. Press C (or 📷) to take one."));
    for (const photo of this.portfolio.photos) {
      const card = el("figure", "photo-card");
      const img = el("img");
      img.src = photo.dataUrl;
      img.alt = photo.caption || "World photo";
      const caption = el("input", "mc-input photo-caption");
      caption.value = photo.caption;drafts.set(photo.id,caption);
      caption.placeholder = "Add a caption…";
      caption.setAttribute("aria-label", "Photo caption");
      caption.addEventListener("keydown", (e) => e.stopPropagation());
      caption.addEventListener("change", () => {if(current())this.portfolio.setCaption(photo.id, caption.value);});
      const actions = el("div", "photo-actions");
      const download = el("a", "mc-button small", "Save");
      download.href = photo.dataUrl;
      download.download = `photo-${photo.id}.jpg`;
      const del = el("button", "mc-button small", "Delete");
      del.addEventListener("click", () => {
        if(!current())return;
        this.portfolio.remove(photo.id);
        this.render();
      });
      actions.append(download, del);
      card.append(img, caption, actions);
      grid.appendChild(card);
    }
    this.panel.replaceChildren(header, controls, grid);
  }
}

/** Local Creative editing is an app policy, not native World Builder authorization. */
export interface NpcEdit { name: string; dialogue: string; npcActions?: NpcActions }
export class NpcDialog {
  readonly root = el("div", "screen npc-screen");
  private readonly panel = el("div", "panel npc-panel");
  private generation = 0;
  private listeners: Array<() => void> = [];
  private listen(target: HTMLElement, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.listeners.push(() => target.removeEventListener(type, listener));
  }
  constructor(container: HTMLElement, private readonly onClose: () => void, private readonly onSave: (mob: Mob, draft: NpcEdit) => boolean) {
    this.root.hidden = true; this.root.appendChild(this.panel); container.appendChild(this.root);
  }
  get open(): boolean { return !this.root.hidden; }
  show(mob: Mob, editable: boolean, current: () => boolean = () => false): void {
    this.hide();
    const generation = this.generation;
    const active = () => generation === this.generation && this.open && current();
    const title = el("h2", "", mob.name ?? "NPC");
    const text = el("p", "npc-text", mob.dialogue ?? "");
    const parts: HTMLElement[] = [title, text];
    const actions = readNpcActionField(mob);
    const message = el("p", "npc-error"); message.setAttribute("role", "status");
    if (actions.kind === "invalid") {
      parts.push(el("p", "npc-error", "NPC links need repair. Export the original world backup."));
    } else {
      if (actions.kind === "valid" && actions.data.buttons.length) {
        const links = el("div", "npc-links");
        for (const button of actions.data.buttons) {
          const link = el("a", "npc-url", button.label);
          link.href = button.url; link.target = "_blank"; link.rel = "noopener noreferrer";
          link.title = `${button.url} (opens in a new tab)`;
          let pointerOwner: { id: number; type: string } | null = null;
          const guard = (event: Event) => {
            try {
              if (active()) {
                const now = readNpcActionField(mob);
                if (active() && now.kind === "valid" && JSON.stringify(now.data) === JSON.stringify(actions.data)) {
                  const pointer = event as PointerEvent;
                  if (event.type === "pointerdown") {
                    pointerOwner = typeof pointer.pointerId === "number" && pointer.pointerId >= 0 && !!pointer.pointerType
                      ? { id: pointer.pointerId, type: pointer.pointerType } : null;
                    return;
                  }
                  if (event.type === "pointercancel") { pointerOwner = null; return; }
                  if (event.type === "click" || event.type === "auxclick") {
                    const pointing = typeof pointer.pointerType === "string" ? pointer.pointerType !== "" : (pointer.detail ?? 0) > 0;
                    if (pointing && (!pointerOwner || typeof pointer.pointerId === "number" && pointer.pointerId !== pointerOwner.id || typeof pointer.pointerType === "string" && pointer.pointerType !== pointerOwner.type)) {
                      // The opening canvas gesture may be retargeted after this overlay appears.
                      // Cancel that activation, keeping the native link ready for a NEW gesture.
                      event.preventDefault(); return;
                    }
                    pointerOwner = null;
                  }
                  // Keyboard/AT semantic activation stays native; compatibility mousedown never arms.
                  return;
                }
              }
            } catch { /* Validation/lifecycle exceptions never allow default navigation. */ }
            pointerOwner = null;
            event.preventDefault(); link.removeAttribute("href");
            message.textContent = "This NPC interaction is no longer active. Close and talk again.";
          };
          for (const name of ["click", "auxclick", "pointerdown", "pointercancel", "mousedown", "keydown", "contextmenu"]) this.listen(link, name, guard);
          links.append(link);
        }
        parts.push(links, el("p", "hint", "Links open in a new tab. The world stays here."));
      }
      if (editable) {
        const name = el("input", "mc-input"); name.value = mob.name ?? ""; name.setAttribute("aria-label", "NPC name");
        const dialogue = el("textarea", "mc-input npc-edit"); dialogue.value = mob.dialogue ?? ""; dialogue.setAttribute("aria-label", "NPC dialogue");
        const label = (text: string, input: HTMLElement) => { const field = el("label", "field"); field.append(el("span", "", text), input); return field; };
        let rows = (actions.kind === "valid" ? actions.data.buttons : []).map(b => ({ label: b.label, url: b.url }));
        const editor = el("div", "npc-action-editor"), add = el("button", "mc-button", "Add URL");
        const render = () => {
          editor.replaceChildren();
          rows.forEach((row, index) => {
            const group = el("fieldset", "npc-action-row"); group.append(el("legend", "", `URL button ${index + 1}`));
            const caption = el("input", "mc-input"); caption.value = row.label; caption.setAttribute("aria-label", `URL button ${index + 1} label`);
            const url = el("input", "mc-input"); url.type = "url"; url.value = row.url; url.placeholder = "https://…"; url.setAttribute("aria-label", `URL button ${index + 1} address`);
            this.listen(caption, "input", () => { row.label = caption.value; }); this.listen(url, "input", () => { row.url = url.value; });
            const controls = el("div", "npc-action-controls");
            for (const [text, offset] of [["Move up", -1], ["Move down", 1]] as const) {
              const move = el("button", "mc-button", text); move.setAttribute("aria-label", `${text} URL button ${index + 1}`); move.disabled = index + offset < 0 || index + offset >= rows.length;
              this.listen(move, "click", () => { if (!active()) return; [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]]; render(); }); controls.append(move);
            }
            const remove = el("button", "mc-button", "Remove"); remove.setAttribute("aria-label", `Remove URL button ${index + 1}`);
            this.listen(remove, "click", () => { if (!active()) return; rows.splice(index, 1); render(); }); controls.append(remove);
            group.append(label("Button label (1–12 characters)", caption), label("Web address", url), controls); editor.append(group);
          });
          add.disabled = rows.length >= NPC_MAX_BUTTONS;
        };
        this.listen(add, "click", () => { if (!active() || rows.length >= NPC_MAX_BUTTONS) return; rows.push({ label: "", url: "" }); render(); }); render();
        const save = el("button", "mc-button primary", "Save");
        this.listen(save, "click", () => {
          if (!active()) { message.textContent = "This NPC interaction is no longer active. Close and talk again."; return; }
          const result = readNpcActions({ version: 1, buttons: rows.map(row => ({ kind: "url", label: row.label.trim(), url: row.url.trim() })) });
          if (result.kind !== "valid" || name.value.trim().length > 64 || dialogue.value.length > 2000) {
            message.textContent = "Use labels of 1–12 characters and absolute http:// or https:// addresses without spaces or sign-in credentials (up to 2,048 characters). Name: up to 64; dialogue: up to 2,000."; return;
          }
          const draft: NpcEdit = { name: name.value.trim() || "NPC", dialogue: dialogue.value, ...(result.data.buttons.length ? { npcActions: result.data } : {}) };
          if (this.onSave(mob, draft)) this.onClose();
          else message.textContent = "The NPC could not be updated. Close and talk again.";
        });
        const saveRow = el("div", "npc-save"); saveRow.append(save);
        parts.push(label("Name", name), label("Dialogue", dialogue), el("h3", "", "URL buttons"), editor, add, el("p", "hint", "Local Creative editing. Up to six links; commands and automatic actions are not supported."), saveRow);
      }
    }
    const close = el("button", "mc-button", "Close"); this.listen(close, "click", () => { if (generation === this.generation && this.open) this.onClose(); });
    parts.push(message, close);
    this.panel.replaceChildren(...parts);
    this.root.hidden = false;
    this.panel.scrollTop = 0;
    this.panel.onkeydown = e => { e.stopPropagation(); if (e.code === "Escape" && generation === this.generation && this.open) { e.preventDefault(); this.onClose(); } };
  }
  hide(): void {
    this.generation++; this.root.hidden = true;
    for (const remove of this.listeners.splice(0)) remove();
    for (const link of this.panel.querySelectorAll("a")) link.removeAttribute("href");
    this.panel.replaceChildren(); this.panel.onkeydown = null;
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
