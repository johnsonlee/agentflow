import {
  AGENT_DIRECTIONS, AGENT_SLOTS, MAX_NESTING, MAX_REPEAT, validateProgram, type AgentCommand, type AgentDirection, type CodeBlock, type CodeProgram,
} from "@craft/engine";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/** Palette entries: what each block creates. */
const PALETTE: Array<{ id: string; label: string; kind: "command" | "loop" | "logic"; make: () => CodeBlock }> = [
  { id: "move", label: "move", kind: "command", make: () => ({ type: "command", cmd: { op: "move", dir: "forward" } }) },
  { id: "turn", label: "turn", kind: "command", make: () => ({ type: "command", cmd: { op: "turn", side: "left" } }) },
  { id: "place", label: "place", kind: "command", make: () => ({ type: "command", cmd: { op: "place", dir: "forward" } }) },
  { id: "destroy", label: "destroy", kind: "command", make: () => ({ type: "command", cmd: { op: "destroy", dir: "forward" } }) },
  { id: "attack", label: "attack", kind: "command", make: () => ({ type: "command", cmd: { op: "attack", dir: "forward" } }) },
  { id: "select", label: "select slot", kind: "command", make: () => ({ type: "command", cmd: { op: "select", slot: 0 } }) },
  { id: "drop", label: "give me slot", kind: "command", make: () => ({ type: "command", cmd: { op: "drop", slot: 0 } }) },
  { id: "repeat", label: "repeat", kind: "loop", make: () => ({ type: "repeat", times: 4, body: [] }) },
  { id: "until", label: "repeat until detect", kind: "loop", make: () => ({ type: "until", dir: "forward", body: [] }) },
  { id: "if", label: "if detect", kind: "logic", make: () => ({ type: "if", dir: "forward", then: [], else: [] }) },
];

export interface CodeBuilderHost {
  programs: CodeProgram[];
  run(program: CodeProgram): void;
  stop(): void;
  running(): boolean;
  /** Hands the player's selected hotbar stack to the Agent; returns a status message. */
  giveHeldToAgent(): string;
  save(): void;
}

/**
 * Code Builder (block mode), in the spirit of Education Edition's MakeCode editor: a palette of
 * Agent blocks, loops and a detect conditional, assembled into a program. Desktop: drag blocks
 * from the palette (or within the program) onto a drop zone. Touch: tap a drop zone to select it,
 * tap palette blocks to add them there, and use the arrows / x on each block to reorder / delete.
 */
export class CodeBuilderScreen {
  readonly root = el("div", "screen code-screen");
  private readonly panel = el("div", "panel code-panel");
  private program: CodeProgram = { name: "My program", trigger: { type: "run" }, blocks: [] };
  /** The drop zone taps add to, and its nesting depth (the program itself is 0). */
  private target: CodeBlock[] = this.program.blocks;
  private targetDepth = 0;
  private dragging: { block: CodeBlock; from: CodeBlock[] | null } | null = null;
  private status = "";

  constructor(container: HTMLElement, private readonly host: CodeBuilderHost, private readonly onClose: () => void) {
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    // Edit the most recent program (or a new one).
    const last = this.host.programs[this.host.programs.length - 1];
    if (last) this.program = last;
    this.target = this.program.blocks;
    this.targetDepth = 0;
    this.status = "";
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Saves the program into the world, unless it's invalid (then shows why and returns false). */
  private commit(): boolean {
    const problems = validateProgram(this.program);
    if (problems.length > 0) {
      this.status = problems.join("; ");
      return false;
    }
    if (!this.host.programs.includes(this.program)) this.host.programs.push(this.program);
    this.host.save();
    return true;
  }

  /**
   * Whether `block` may go into a zone at `depth`: loops and ifs may nest at most MAX_NESTING deep
   * (the same rule validation applies). Shows why when it can't.
   */
  private fits(block: CodeBlock, depth: number): boolean {
    if (depth + height(block) <= MAX_NESTING) return true;
    this.status = `Loops and ifs can be nested at most ${MAX_NESTING} deep`;
    return false;
  }

  private render(): void {
    const header = el("div", "panel-header");
    header.append(el("h2", "", "Code Builder"));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close Code Builder");
    close.addEventListener("click", () => this.onClose());
    header.append(close);

    const palette = el("div", "cb-palette");
    palette.setAttribute("aria-label", "Blocks");
    for (const entry of PALETTE) {
      const b = el("button", `cb-palette-block cb-${entry.kind}`, entry.label);
      b.dataset.palette = entry.id;
      b.draggable = true;
      b.addEventListener("dragstart", (e) => {
        this.dragging = { block: entry.make(), from: null };
        e.dataTransfer?.setData("text/plain", entry.id);
      });
      b.addEventListener("click", () => {
        const block = entry.make();
        if (this.fits(block, this.targetDepth)) this.target.push(block);
        this.render();
      });
      palette.appendChild(b);
    }

    const meta = el("div", "cb-meta");
    const name = el("input", "mc-input");
    name.value = this.program.name;
    name.setAttribute("aria-label", "Program name");
    name.addEventListener("keydown", (e) => e.stopPropagation());
    name.addEventListener("change", () => (this.program.name = name.value.trim() || "My program"));
    const chat = el("input", "mc-input");
    chat.placeholder = "chat command (optional)";
    chat.value = this.program.trigger.type === "chat" ? this.program.trigger.command : "";
    chat.setAttribute("aria-label", "Chat command");
    chat.addEventListener("keydown", (e) => e.stopPropagation());
    chat.addEventListener("change", () => {
      const word = chat.value.trim().toLowerCase().split(/\s+/)[0] ?? "";
      this.program.trigger = word ? { type: "chat", command: word } : { type: "run" };
    });
    meta.append(name, chat);

    const workspace = el("div", "cb-workspace");
    workspace.append(this.zone(this.program.blocks, "on run / chat", 0));

    const actions = el("div", "cb-actions");
    const run = el("button", "mc-button primary", "▶ Run");
    run.addEventListener("click", () => {
      const problems = validateProgram(this.program);
      if (this.program.blocks.length === 0) problems.push("Add some blocks first");
      if (problems.length > 0) {
        this.status = problems.join("; ");
        this.render();
        return;
      }
      if (!this.commit()) {
        this.render();
        return;
      }
      this.host.run(this.program);
      this.onClose();
    });
    const stop = el("button", "mc-button", "■ Stop");
    stop.disabled = !this.host.running();
    stop.addEventListener("click", () => {
      this.host.stop();
      this.render();
    });
    const give = el("button", "mc-button", "Give held stack to Agent");
    give.addEventListener("click", () => {
      this.status = this.host.giveHeldToAgent();
      this.render();
    });
    const newProgram = el("button", "mc-button", "New");
    newProgram.addEventListener("click", () => {
      if (this.program.blocks.length > 0 && !this.commit()) {
        this.render();
        return;
      }
      this.program = { name: `Program ${this.host.programs.length + 1}`, trigger: { type: "run" }, blocks: [] };
      this.target = this.program.blocks;
      this.targetDepth = 0;
      this.render();
    });
    actions.append(run, stop, give, newProgram);
    const status = el("p", "cb-status", this.status);
    status.setAttribute("role", "status");
    this.panel.replaceChildren(header, meta, palette, workspace, actions, status);
  }

  /** A drop zone listing `blocks` at nesting `depth`; tapping it makes it the tap target. */
  private zone(blocks: CodeBlock[], label: string, depth: number): HTMLElement {
    const zone = el("div", `cb-zone${blocks === this.target ? " cb-target" : ""}`);
    zone.dataset.drop = label;
    zone.addEventListener("click", (e) => {
      if (e.target !== zone && !(e.target as HTMLElement).classList.contains("cb-empty")) return;
      // Don't let an outer zone take the selection back.
      e.stopPropagation();
      this.target = blocks;
      this.targetDepth = depth;
      this.render();
    });
    zone.addEventListener("dragover", (e) => e.preventDefault());
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const d = this.dragging;
      this.dragging = null;
      if (!d || contains(d.block, blocks)) return;
      if (!this.fits(d.block, depth)) {
        this.render();
        return;
      }
      if (d.from) d.from.splice(d.from.indexOf(d.block), 1);
      blocks.push(d.block);
      this.render();
    });
    if (blocks.length === 0) zone.append(el("span", "cb-empty", label));
    blocks.forEach((b, i) => zone.append(this.blockView(b, blocks, i, depth)));
    return zone;
  }

  private blockView(block: CodeBlock, list: CodeBlock[], index: number, depth: number): HTMLElement {
    const view = el("div", `cb-block cb-${block.type === "command" ? "command" : block.type === "if" ? "logic" : "loop"}`);
    view.dataset.type = block.type === "command" ? block.cmd.op : block.type;
    view.draggable = true;
    view.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      this.dragging = { block, from: list };
      e.dataTransfer?.setData("text/plain", view.dataset.type!);
    });
    const row = el("div", "cb-row");
    if (block.type === "command") row.append(...this.commandFields(block.cmd));
    else if (block.type === "repeat") {
      const times = el("input", "cb-number");
      times.type = "number";
      times.min = "0";
      times.max = String(MAX_REPEAT);
      times.value = String(block.times);
      times.setAttribute("aria-label", "Repeat times");
      times.addEventListener("keydown", (e) => e.stopPropagation());
      times.addEventListener("change", () => (block.times = Math.max(0, Math.min(MAX_REPEAT, Number(times.value) || 0))));
      row.append(el("span", "", "repeat"), times, el("span", "", "times"));
    } else {
      row.append(el("span", "", block.type === "if" ? "if Agent detects block" : "repeat until Agent detects block"), this.dirSelect(block.dir, (d) => (block.dir = d)));
    }
    row.append(...this.moveButtons(list, index));
    view.append(row);
    if (block.type === "repeat" || block.type === "until") view.append(this.zone(block.body, "do", depth + 1));
    if (block.type === "if") view.append(this.zone(block.then, "then", depth + 1), el("span", "cb-label", "else"), this.zone(block.else, "else", depth + 1));
    return view;
  }

  private commandFields(cmd: AgentCommand): HTMLElement[] {
    const names: Record<AgentCommand["op"], string> = {
      move: "Agent move", turn: "Agent turn", place: "Agent place", destroy: "Agent destroy", attack: "Agent attack", select: "Agent select slot",
      drop: "Agent give me slot", detect: "Agent detect", inspect: "Agent inspect", collect: "Agent collect",
    };
    const out: HTMLElement[] = [el("span", "", names[cmd.op])];
    if ("dir" in cmd) out.push(this.dirSelect(cmd.dir, (d) => (cmd.dir = d)));
    if (cmd.op === "turn") {
      const side = el("select", "cb-select");
      for (const s of ["left", "right"]) side.append(new Option(s, s, false, cmd.side === s));
      side.setAttribute("aria-label", "Turn side");
      side.addEventListener("change", () => (cmd.side = side.value as "left" | "right"));
      out.push(side);
    }
    if (cmd.op === "select" || cmd.op === "drop") {
      const slot = el("input", "cb-number");
      slot.type = "number";
      slot.min = "1";
      slot.max = String(AGENT_SLOTS);
      slot.value = String(cmd.slot + 1);
      slot.setAttribute("aria-label", "Slot");
      slot.addEventListener("keydown", (e) => e.stopPropagation());
      slot.addEventListener("change", () => (cmd.slot = Math.max(1, Math.min(AGENT_SLOTS, Number(slot.value) || 1)) - 1));
      out.push(slot);
    }
    return out;
  }

  private dirSelect(value: AgentDirection, set: (d: AgentDirection) => void): HTMLSelectElement {
    const select = el("select", "cb-select");
    for (const d of AGENT_DIRECTIONS) select.append(new Option(d, d, false, d === value));
    select.setAttribute("aria-label", "Direction");
    select.addEventListener("change", () => set(select.value as AgentDirection));
    return select;
  }

  private moveButtons(list: CodeBlock[], index: number): HTMLElement[] {
    const button = (label: string, aria: string, action: () => void, disabled = false) => {
      const b = el("button", "cb-mini", label);
      b.setAttribute("aria-label", aria);
      b.disabled = disabled;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        action();
        this.render();
      });
      return b;
    };
    const swap = (a: number, b: number) => ([list[a], list[b]] = [list[b], list[a]]);
    return [
      button("▲", "Move block up", () => swap(index, index - 1), index === 0),
      button("▼", "Move block down", () => swap(index, index + 1), index === list.length - 1),
      button("✕", "Delete block", () => list.splice(index, 1)),
    ];
  }
}

/** Nesting a block adds: 0 for commands, 1 + the deepest child for loops and ifs. */
function height(block: CodeBlock): number {
  const children = block.type === "repeat" || block.type === "until" ? [block.body] : block.type === "if" ? [block.then, block.else] : [];
  if (children.length === 0) return 0;
  return 1 + Math.max(0, ...children.flat().map(height));
}

/** True if `list` is `block`'s own body (or nested inside it): dropping there would lose the block. */
function contains(block: CodeBlock, list: CodeBlock[]): boolean {
  const children = block.type === "repeat" || block.type === "until" ? [block.body] : block.type === "if" ? [block.then, block.else] : [];
  return children.some((c) => c === list || c.some((b) => contains(b, list)));
}
