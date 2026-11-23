import { inspectWorldSaveImport, MAX_WORLD_SAVE_BYTES, type WorldSaveImport } from "@craft/engine";
import { commitWorldSaveImport, type WorldImportStorage } from "../persistence/worldSaveImport";

export interface WorldImportScreenOptions {
  storage: WorldImportStorage;
  saveKey: string;
  stillCurrent: () => boolean;
  onBack: () => void;
  onImported: () => void;
  download?: (raw: string) => void;
}
export function downloadWorldBackup(raw: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "agentflow-world-backup.json";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** File reads and preview stay inert until an explicit confirmation. No Game is constructed. */
export function createWorldImportScreen(options: WorldImportScreenOptions): { element: HTMLElement; dispose: () => void } {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
  };
  const element = make("div", "", "screen world-import-screen"), panel = make("div", "", "panel menu-panel"); element.append(panel);
  const title = make("h2", "Import world / backup");
  const hint = make("p", "Choose a complete JSON world backup exported by this app (up to 8 MiB). Minecraft .mcworld, ZIP and NBT files are not supported.", "hint");
  const file = make("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true; file.setAttribute("aria-label", "World backup file");
  const choose = make("button", "Choose world backup", "mc-button"), backup = make("button", "Download original world backup", "mc-button");
  const backupHint = make("p", "The original backup contains the world saved when this screen opened.", "hint");
  const preview = make("section", "", "world-import-preview"); preview.setAttribute("aria-label", "Selected world backup"); preview.hidden = true;
  const confirm = make("button", "Import world", "mc-button primary"); confirm.hidden = true;
  const cancel = make("button", "Cancel", "mc-button");
  const status = make("p", "", "save-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  panel.append(title, hint, choose, file, backup, backupHint, preview, confirm, cancel, status);
  let active = true, attempt = 0, candidate: WorldSaveImport | null = null, current: string | null = null, readable = true;
  try { current = options.storage.getItem(options.saveKey); } catch { readable = false; }
  backup.hidden = backupHint.hidden = current === null; choose.disabled = !readable;
  if (!readable) { status.textContent = "Your current world could not be read. Import is unavailable; no world has been changed."; status.setAttribute("role", "alert"); }
  const visible = () => active && element.isConnected && options.stillCurrent();
  const feedback = (message: string, error = false) => { status.textContent = message; status.setAttribute("role", error ? "alert" : "status"); status.scrollIntoView?.({ block: "nearest" }); };
  const invalidate = () => { candidate = null; confirm.hidden = true; preview.hidden = true; attempt++; };
  const stale = () => {
    invalidate(); choose.disabled = true;
    feedback("Your current world changed. Return to the title and open Import again.", true);
  };
  const onStorage = (event: StorageEvent) => { if (visible() && (event.key === options.saveKey || event.key === null)) stale(); };
  window.addEventListener("storage", onStorage);
  const dispose = () => { active = false; invalidate(); window.removeEventListener("storage", onStorage); };
  choose.addEventListener("click", () => { if (visible()) { invalidate(); file.click(); } });
  file.addEventListener("cancel", () => { if (visible()) { invalidate(); feedback("No file selected. Your current world is unchanged."); } });
  backup.addEventListener("click", () => {
    if (!visible() || current === null) return;
    try { (options.download ?? downloadWorldBackup)(current); feedback("Original backup download requested. It contains the saved world from when this screen opened."); }
    catch { feedback("The backup download could not start. Your current world is unchanged.", true); }
  });
  cancel.addEventListener("click", () => { if (!visible()) return; dispose(); options.onBack(); });
  file.addEventListener("change", () => {
    if (!visible() || !readable) return;
    const selected = file.files?.[0]; file.value = ""; invalidate();
    if (!selected) { feedback("No file selected. Your current world is unchanged."); return; }
    const token = attempt;
    feedback("Reading world backup…");
    void (async () => {
      try {
        if (!/\.json$/i.test(selected.name)) throw new Error("Choose this app’s .json backup. Minecraft .mcworld, ZIP and NBT files are not supported.");
        if (!selected.size || selected.size > MAX_WORLD_SAVE_BYTES) throw new Error("Choose an application world backup of 8 MiB or smaller.");
        const bytes = new Uint8Array(await selected.arrayBuffer());
        if (!visible() || token !== attempt) return;
        const parsed = inspectWorldSaveImport(bytes);
        if (!visible() || token !== attempt) return;
        if (options.storage.getItem(options.saveKey) !== current) { stale(); return; }
        candidate = parsed; preview.replaceChildren(make("h3", "Selected world"), make("p", `Name: ${parsed.name}`), make("p", `Mode: ${parsed.mode === "survival" ? "Survival" : "Creative"}`), make("p", `Seed: ${parsed.seed}`)); preview.hidden = false;
        confirm.textContent = current === null ? "Import world" : "Replace current world"; confirm.hidden = false;
        feedback(current === null ? "Ready to import. The world opens only when you choose Continue afterward." : "This replaces the current world. Download its backup first if you want to keep a separate copy. Only one previous-world backup is kept on this device; importing replaces that backup.");
      } catch (error) {
        if (!visible() || token !== attempt) return;
        invalidate(); feedback(error instanceof Error ? error.message : "This backup could not be read. Your current world is unchanged.", true);
      }
    })();
  });
  confirm.addEventListener("click", () => {
    if (!visible() || !candidate || !readable) return;
    try {
      commitWorldSaveImport(options.storage, options.saveKey, current, candidate, visible);
    } catch (error) {
      invalidate(); feedback(error instanceof Error && error.message.includes("world changed") ? error.message : "The import could not be saved. Your current world is unchanged. Download its backup and try again.", true); return;
    }
    dispose(); options.onImported();
  });
  return { element, dispose };
}
