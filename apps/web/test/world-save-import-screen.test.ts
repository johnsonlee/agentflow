// Actual screen with a minimal DOM fixture: layout, native file selection and touch remain browser gates.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createWorldImportScreen } from "../src/ui/worldSaveImport";
import { WORLD_IMPORT_BACKUP_KEY } from "../src/persistence/worldSaveImport";
const raw = readFileSync(new URL("../../../packages/engine/test/fixtures/world-save-import-v1.json", import.meta.url), "utf8");
class Node extends EventTarget {
  tag: string; className = ""; textContent = ""; hidden = false; disabled = false; type = ""; accept = ""; value = ""; isConnected = true; files: unknown[] = []; children: Node[] = []; attributes = new Map<string, string>();
  constructor(tag: string) { super(); this.tag = tag; }
  append(...nodes: Node[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute(k: string, v: string) { this.attributes.set(k, v); }
  click() { this.dispatchEvent(new Event("click")); }
}
let values: Map<string, string>, writes: string[], current: boolean, dispose: () => void, root: Node, onBack: ReturnType<typeof vi.fn>, onImported: ReturnType<typeof vi.fn>, download: ReturnType<typeof vi.fn>, windowEvents: EventTarget;
let readFailure = false, writeFailure: string | null = null;
const all = (): Node[] => { const visit = (n: Node): Node[] => [n, ...n.children.flatMap(visit)]; return visit(root); };
const button = (label: string) => all().find(n => n.tag === "button" && n.textContent === label)!;
const input = () => all().find(n => n.tag === "input")!;
const status = () => all().find(n => n.attributes.get("aria-live") === "polite")!;
function mount() {
  const screen = createWorldImportScreen({ storage: { getItem(k) { if (readFailure) throw Error("read denied"); return values.get(k) ?? null; }, setItem(k, v) { writes.push(k); if (k === writeFailure) throw Error("quota"); values.set(k, v); } }, saveKey: "world", stillCurrent: () => current, onBack, onImported, download });
  root = screen.element as unknown as Node; dispose = screen.dispose;
}
function select(text = raw, name = "backup.json", promise?: Promise<ArrayBuffer>) {
  const data = new TextEncoder().encode(text); input().files = [{ name, size: data.byteLength, arrayBuffer: () => promise ?? Promise.resolve(data.buffer) }]; input().dispatchEvent(new Event("change"));
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  windowEvents = new EventTarget(); vi.stubGlobal("window", windowEvents); vi.stubGlobal("document", { createElement: (tag: string) => new Node(tag) });
  values = new Map([["world", "exact old damaged{\n"]]); writes = []; current = true; readFailure = false; writeFailure = null;
  onBack = vi.fn(); onImported = vi.fn(); download = vi.fn(); mount();
});
afterEach(() => { dispose(); vi.unstubAllGlobals(); });
it("selection creates an inert safe-text preview; only explicit replacement writes exact raw and returns to title", async () => {
  const selected = JSON.parse(raw); selected.name = "<img src=x onerror=alert(1)>"; const text = JSON.stringify(selected);
  select(text); await settle(); expect(writes).toEqual([]); expect(onImported).not.toHaveBeenCalled();
  expect(all().some(n => n.textContent === `Name: ${selected.name}`)).toBe(true); expect(all().filter(n => n.tag === "img")).toHaveLength(0);
  expect(button("Replace current world").hidden).toBe(false); button("Replace current world").click();
  expect(values.get("world")).toBe(text); expect(values.get(WORLD_IMPORT_BACKUP_KEY)).toBe("exact old damaged{\n"); expect(onImported).toHaveBeenCalledOnce();
});
it("downloads original raw only on explicit backup click, including damaged old bytes", () => {
  expect(download).not.toHaveBeenCalled(); button("Download original world backup").click(); expect(download).toHaveBeenCalledWith("exact old damaged{\n"); expect(writes).toEqual([]);
});
it.each(["bad.json", "native.mcworld"])("bad/foreign file %s never writes or exposes confirmation", async name => {
  select(name === "bad.json" ? "{" : raw, name); await settle(); expect(writes).toEqual([]); expect(button("Import world").hidden).toBe(true); expect(status().attributes.get("role")).toBe("alert");
});
it("file-read rejection preserves current world", async () => {
  select(raw, "backup.json", Promise.reject(Error("file unreadable"))); await settle(); expect(writes).toEqual([]); expect(values.get("world")).toBe("exact old damaged{\n"); expect(status().textContent).toContain("file unreadable");
});
it.each(["cancel", "game", "disconnected", "new-file"])("late file result cannot survive %s", async action => {
  let resolve!: (value: ArrayBuffer) => void; const delayed = new Promise<ArrayBuffer>(r => { resolve = r; }); select(raw, "first.json", delayed);
  if (action === "cancel") button("Cancel").click();
  if (action === "game") current = false;
  if (action === "disconnected") root.isConnected = false;
  if (action === "new-file") { select("{", "second.json"); await settle(); }
  resolve(new TextEncoder().encode(raw).buffer); await settle();
  expect(writes).toEqual([]); expect(button("Import world").hidden).toBe(true); expect(onImported).not.toHaveBeenCalled();
});
it("same-window current save change after preview refuses confirmation", async () => {
  select(); await settle(); values.set("world", "another world"); button("Replace current world").click(); expect(writes).toEqual([]); expect(values.get("world")).toBe("another world"); expect(status().textContent).toContain("changed");
});
it("cross-tab storage event invalidates preview and late reads", async () => {
  select(); await settle(); const event = new Event("storage"); Object.assign(event, { key: "world" }); windowEvents.dispatchEvent(event);
  expect(button("Replace current world").hidden).toBe(true); expect(writes).toEqual([]);
});
it.each(["world", WORLD_IMPORT_BACKUP_KEY])("quota on %s keeps active world exact", async key => {
  select(); await settle(); writeFailure = key; button("Replace current world").click(); expect(values.get("world")).toBe("exact old damaged{\n"); expect(onImported).not.toHaveBeenCalled(); expect(status().textContent).toContain("unchanged");
});
it("unreadable initial storage disables import without preventing cancellation", () => {
  dispose(); readFailure = true; mount(); expect(button("Choose world backup").disabled).toBe(true); button("Cancel").click(); expect(onBack).toHaveBeenCalledOnce(); expect(writes).toEqual([]);
});
it("native picker cancellation invalidates any previous chosen candidate", async () => {
  select(); await settle(); input().dispatchEvent(new Event("cancel")); expect(button("Replace current world").hidden).toBe(true); expect(writes).toEqual([]);
});
