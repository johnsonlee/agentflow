import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CodeBuilderScreen, type CodeBuilderHost } from "../src/ui/codeBuilder";
import type { CodeProgram } from "@craft/engine";
class Cell extends EventTarget {
  children: Cell[] = []; className = ""; textContent = ""; hidden = false; value = "";
  dataset: Record<string, string> = {}; attributes: Record<string, string> = {};
  append(...cells: Cell[]) { this.children.push(...cells); }
  appendChild(c: Cell) { this.children.push(c); return c; }
  replaceChildren(...cells: Cell[]) { this.children = cells; }
  setAttribute(k: string, v: string) { this.attributes[k] = v; }
}
const all = (root: Cell): Cell[] => [root, ...root.children.flatMap(all)];
beforeEach(() => {
  vi.stubGlobal("document", { createElement: () => new Cell() });
  vi.stubGlobal("Option", class extends Cell { constructor(text: string, value: string) { super(); this.textContent = text; this.value = value; } });
});
afterEach(() => vi.unstubAllGlobals());
it.each(["if", "until"])("real %s editor handlers expose labeled identity selection and retain it when saving/running", kind => {
  const parent = new Cell(), host: CodeBuilderHost = { programs: [], run: vi.fn(), stop: vi.fn(), running: () => false, giveHeldToAgent: () => "", save: vi.fn() };
  const ui = new CodeBuilderScreen(parent as unknown as HTMLElement, host, vi.fn()); ui.show();
  const palette = all(parent).find(e => e.dataset.palette === kind)!; palette.dispatchEvent(new Event("click"));
  const mode = all(parent).find(e => e.attributes["aria-label"] === "Block condition")!;
  mode.value = "specific"; mode.dispatchEvent(new Event("change"));
  const identity = all(parent).find(e => e.attributes["aria-label"] === "Specific block")!;
  expect(identity.children.some(e => e.value === "diamond_ore")).toBe(true);
  expect(identity.children.some(e => e.value === "diamond")).toBe(false); // An item is not a physical block.
  identity.value = "diamond_ore"; identity.dispatchEvent(new Event("change"));
  const run = all(parent).find(e => e.textContent === "▶ Run")!; run.dispatchEvent(new Event("click"));
  expect(host.run).toHaveBeenCalledTimes(1); expect(host.save).toHaveBeenCalledTimes(1);
  const saved = (host.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as CodeProgram;
  expect(saved.blocks[0]).toMatchObject({ type: kind, dir: "forward", condition: { type: "block-is", name: "diamond_ore" } });
  expect(all(parent).some(e => e.textContent === "Exact application block state")).toBe(true);
});
it("switching back to any solid removes the optional field so legacy JSON shape is retained", () => {
  const parent = new Cell(), program: CodeProgram = { name: "Old", trigger: { type: "run" }, blocks: [{ type: "if", dir: "forward", then: [], else: [] }] };
  const old = JSON.stringify(program), host: CodeBuilderHost = { programs: [program], run: vi.fn(), stop: vi.fn(), running: () => false, giveHeldToAgent: () => "", save: vi.fn() };
  const ui = new CodeBuilderScreen(parent as unknown as HTMLElement, host, vi.fn()); ui.show();
  let mode = all(parent).find(e => e.attributes["aria-label"] === "Block condition")!; mode.value = "specific"; mode.dispatchEvent(new Event("change"));
  mode = all(parent).find(e => e.attributes["aria-label"] === "Block condition")!; mode.value = "solid"; mode.dispatchEvent(new Event("change"));
  expect(JSON.stringify(program)).toBe(old); expect(all(parent).some(e => e.attributes["aria-label"] === "Specific block")).toBe(false);
});
