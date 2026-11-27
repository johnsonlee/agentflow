import{portfolioExportSnapshot,buildPortfolioZip,ExportCancelled,type ExportPhoto}from'../assessment/portfolio-export';
import{downloadBlob}from'../platform/download';
import { sanitizePhotos, CHALKBOARD_SIZES, canEditChalkboard, clampChalkText, type Chalkboard, type ItemStack } from "@craft/engine";
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

export {NpcDialog,type NpcEdit} from "./npcDialog";

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

export { BookScreen } from "./bookScreen";
