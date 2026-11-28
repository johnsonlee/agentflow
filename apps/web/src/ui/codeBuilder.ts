import { emptyCodeWorkspace, hasCodeWorkspace, readCodeWorkspace, type CodeWorkspaceData } from "@craft/engine";
import {
  AGENT_DIRECTIONS, AGENT_SLOTS, CODE_BLOCK_CHOICES, MAX_NESTING, MAX_REPEAT, compileAgentText, validateProgram, type AgentTextLanguage, type TextDiagnostic, type AgentCommand, type AgentDirection, type CodeBlock, type CodeProgram,
} from "@craft/engine";
import { CodeProgramWorkspace, type ProgramSnapshot } from "./codeProgramWorkspace";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/** Palette entries: what each block creates. */
const PALETTE: Array<{ id: string; label: string; kind: "command" | "loop" | "logic"; make: () => CodeBlock }> = [
  { id:"teleport-to-player",label:"teleport to player",kind:"command",make:()=>({type:"command",cmd:{op:"teleport-to-player"}}) },
  { id: "move", label: "move", kind: "command", make: () => ({ type: "command", cmd: { op: "move", dir: "forward" } }) },
  { id: "turn", label: "turn", kind: "command", make: () => ({ type: "command", cmd: { op: "turn", side: "left" } }) },
  { id: "place", label: "place", kind: "command", make: () => ({ type: "command", cmd: { op: "place", dir: "forward" } }) },
  { id: "interact", label: "interact (wooden door)", kind: "command", make: () => ({ type: "command", cmd: { op: "interact", dir: "forward" } }) },
  { id: "till", label: "till soil", kind: "command", make: () => ({ type: "command", cmd: { op: "till", dir: "forward" } }) },
  { id: "destroy", label: "destroy", kind: "command", make: () => ({ type: "command", cmd: { op: "destroy", dir: "forward" } }) },
  { id: "attack", label: "attack", kind: "command", make: () => ({ type: "command", cmd: { op: "attack", dir: "forward" } }) },
  { id: "transfer", label: "transfer items", kind: "command", make: () => ({ type: "command", cmd: { op: "transfer", quantity: 5, sourceSlot: 4, destinationSlot: 0 } }) },
  { id: "select", label: "select slot", kind: "command", make: () => ({ type: "command", cmd: { op: "select", slot: 0 } }) },
  { id: "collect", label: "collect items", kind: "command", make: () => ({ type: "command", cmd: { op: "collect" } }) },
  { id: "drop-all", label: "drop all items", kind: "command", make: () => ({type:"command",cmd:{op:"drop-all",dir:"forward"}}) },
  { id: "drop", label: "drop slot", kind: "command", make: () => ({ type: "command", cmd: { op: "drop", slot: 0, dir: "forward" } }) },
  { id: "repeat", label: "repeat", kind: "loop", make: () => ({ type: "repeat", times: 4, body: [] }) },
  { id: "until", label: "repeat until detect", kind: "loop", make: () => ({ type: "until", dir: "forward", body: [] }) },
  { id: "if-item-count", label: "if Agent item count", kind: "logic", make: () => ({ type:"if-item-count",slot:4,equals:5,then:[],else:[] }) },
  { id: "if-item-space", label: "if Agent item space", kind: "logic", make: () => ({ type:"if-item-space",slot:4,equals:64,then:[],else:[] }) },
  { id: "if", label: "if detect", kind: "logic", make: () => ({ type: "if", dir: "forward", then: [], else: [] }) },
];

export interface CodeBuilderHost {
  codeWorkspace?: CodeWorkspaceData;
  programs: CodeProgram[];
  run(program: CodeProgram): void;
  stop(): void;
  running(): boolean;
  /** Hands the player's selected hotbar stack to the Agent; returns a status message. */
  giveHeldToAgent(): string;
  save(): boolean | void;
}

let importPanelId = 0;
interface CodeDraft { source: string; name: string; issue?: { message: string; focus: "source" | "name" | "back"; diagnostic?: TextDiagnostic } }

/**
 * Code Builder (block mode), in the spirit of Education Edition's MakeCode editor: a palette of
 * Agent blocks, loops and a detect conditional, assembled into a program. Desktop: drag blocks
 * from the palette (or within the program) onto a drop zone. Touch: tap a drop zone to select it,
 * tap palette blocks to add them there, and use the arrows / x on each block to reorder / delete.
 */
export class CodeBuilderScreen {
  readonly root = el("div", "screen code-screen");
  private readonly panel = el("div", "panel code-panel");
  private readonly workspace: CodeProgramWorkspace;
  private get program(): CodeProgram { return this.workspace.program; }
  /** The drop zone taps add to, and its nesting depth (the program itself is 0). */
  private target: CodeBlock[] = [];
  private targetDepth = 0;
  private dragging: { block: CodeBlock; from: CodeBlock[] | null } | null = null;
  private status = "";
  private importing = false;
  private importLanguage: AgentTextLanguage = "javascript";
  private readonly importId = `cb-import-${++importPanelId}`;
  // Text drafts are separate data; they never mutate CodeProgram or execute on load.
  private readonly codeDrafts: Record<AgentTextLanguage, CodeDraft> = { javascript: { source: "", name: "" }, python: { source: "", name: "" } };

  private savedSourceWorkspace?: CodeWorkspaceData;

  constructor(container: HTMLElement, private readonly host: CodeBuilderHost, private readonly onClose: () => void) {
    this.workspace = new CodeProgramWorkspace(this.host.programs);
    const restored = readCodeWorkspace(host.codeWorkspace);
    if (restored.kind === "valid") {
      this.savedSourceWorkspace = restored.data;
      this.importLanguage = restored.data.language;
      this.codeDrafts.javascript = { ...restored.data.drafts.javascript };
      this.codeDrafts.python = { ...restored.data.drafts.python };
    }
    this.root.hidden = true;
    this.root.appendChild(this.panel);
    for (const type of ["keydown", "keyup", "keypress"]) this.panel.addEventListener(type, e => { if (this.importing && !this.root.hidden) e.stopPropagation(); });
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.workspace.open();
    this.resetTarget();
    this.status = "";
    this.importing = false;
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Pure world-checkpoint stage. Invalid UI work leaves last valid owned programs intact. */
  prepareProgramSnapshot(): ProgramSnapshot {
    const blocks = this.workspace.prepareSnapshot();
    if (!blocks.ok) return blocks;
    const text = this.sourceSnapshot();
    return { ...blocks, codeWorkspace: text.workspace, warning: [blocks.warning, text.issue].filter(Boolean).join(" "), accept: () => {
      // Called after a successful world write. Keep newer RAM text.
      this.savedSourceWorkspace = text.workspace && structuredClone(text.workspace);
      return blocks.accept();
    } };
  }
  private sourceSnapshot(): { workspace?: CodeWorkspaceData; issue: string | null } {
    const data = emptyCodeWorkspace(); data.language = this.importLanguage;
    for (const language of ["javascript", "python"] as const) data.drafts[language] = { source: this.codeDrafts[language].source, name: this.codeDrafts[language].name };
    const checked = readCodeWorkspace(data);
    if (checked.kind !== "valid") return { workspace: this.savedSourceWorkspace && structuredClone(this.savedSourceWorkspace), issue: "Source drafts exceed storage limits (64 KiB UTF-8 per source, 4 KiB per name). The last saved drafts are kept in world checkpoints; current text remains in this game. Shorten or copy the text before quitting or changing worlds." };
    return { workspace: hasCodeWorkspace(checked.data) ? checked.data : undefined, issue: null };
  }
  uncommittedProgramIssue(): string | null { return this.workspace.unsavedIssue() ?? this.sourceSnapshot().issue; }
  private sourcePersistenceNote(): string {
    return this.sourceSnapshot().issue ?? "Text drafts and the selected language save with this world, including syntax errors. Loading text never runs it. Storage: 64 KiB UTF-8 per source and 4 KiB per name; conversion remains limited to 16 KiB. This is application-owned draft storage, not a native MakeCode project. The Agent uses only the items it already carries.";
  }
  private resetTarget(): void { this.target = this.program.blocks; this.targetDepth = 0; this.dragging = null; }
  private commit(): boolean {
    const committed = this.workspace.commitCurrent();
    if (!committed.ok) { this.status = committed.error ?? "Program could not be committed."; return false; }
    if (this.host.save() === false) this.status = "Program changes are kept in this game. The world could not be saved; keep it open and retry.";
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

  private render(focus?: "name" | "import" | "picker"): void {
    const before = this.program; this.workspace.open(); if (before !== this.program) this.resetTarget();
    this.panel.className = `panel code-panel${this.importing ? " cb-import-mode" : ""}`;
    if (this.importing) { this.renderImport(); return; }
    const header = el("div", "panel-header");
    header.append(el("h2", "", "Code Builder"));
    const close = el("button", "close-button", "✕");
    close.setAttribute("aria-label", "Close Code Builder");
    close.addEventListener("click", () => this.onClose());
    header.append(close);

    const pickerField = el("label", "cb-program-picker-field", "Saved program or draft");
    const picker = el("select", "cb-select cb-program-picker"); picker.setAttribute("aria-label", "Saved program or draft");
    const optionNodes: HTMLOptionElement[] = [];
    const refreshChoices = () => {
      const choices = this.workspace.choices();
      choices.forEach((choice, i) => { if (optionNodes[i]) optionNodes[i].textContent = choice.label; });
    };
    for (const choice of this.workspace.choices()) { const option = new Option(choice.label, choice.value, false, choice.selected); optionNodes.push(option); picker.append(option); }
    picker.addEventListener("keydown", e => e.stopPropagation()); picker.addEventListener("keyup", e => e.stopPropagation());
    picker.addEventListener("change", () => {
      const selected = this.workspace.select(picker.value);
      if (!selected.ok) this.status = selected.error ?? "Program selection was refused.";
      else { this.resetTarget(); this.status = "Program selected. The Agent was not run or stopped."; this.host.save(); }
      this.render("picker");
    });
    pickerField.append(picker);
    const workingStatus = el("p", "cb-working-status", this.workspace.status()); workingStatus.setAttribute("role", "status");
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
    const updateName = () => { this.program.name = name.value.trim() || "My program"; refreshChoices(); workingStatus.textContent = this.workspace.status(); };
    name.addEventListener("input", updateName); name.addEventListener("change", updateName);
    const chat = el("input", "mc-input");
    chat.placeholder = "chat command (optional)";
    chat.value = this.program.trigger.type === "chat" ? this.program.trigger.command : "";
    chat.setAttribute("aria-label", "Chat command");
    chat.addEventListener("keydown", (e) => e.stopPropagation());
    const updateChat = () => {
      const word = chat.value.trim().toLowerCase().split(/\s+/)[0] ?? "";
      this.program.trigger = word ? { type: "chat", command: word } : { type: "run" };
      workingStatus.textContent = this.workspace.status();
    };
    chat.addEventListener("input", updateChat); chat.addEventListener("change", updateChat);
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
      const owned = this.workspace.ownedProgram;
      if (!owned) { this.status = "The program list changed. Select a program and try again."; this.render(); return; }
      this.host.run(owned);
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
      const created = this.workspace.newProgram();
      if (!created.ok) { this.status = created.error ?? "Your working draft needs repair."; this.render(); return; }
      this.resetTarget(); this.host.save(); this.render("name");
    });
    const fromCode = el("button", "mc-button cb-import-open", "Create program from code");
    fromCode.addEventListener("click", () => { this.importing = true; this.render(); });
    const saveProgram = el("button", "mc-button", "Save program");
    saveProgram.addEventListener("click", () => { this.status = ""; if (this.commit()) this.status ||= "Program changes saved. Already-running code is unchanged."; this.render("name"); });
    actions.append(run, stop, saveProgram, give, newProgram, fromCode);
    const status = el("p", "cb-status", this.status);
    status.setAttribute("role", "status");
    this.panel.replaceChildren(header, pickerField, workingStatus, meta, palette, workspace, actions, status);
    if (focus === "name") name.focus();
    if (focus === "import") fromCode.focus();
    if (focus === "picker") picker.focus();
  }

  private defaultImportName(): string {
    const stage = this.workspace.prepareSnapshot();
    return `Converted program ${(stage.ok ? stage.programs.length : this.host.programs.length) + 1}`;
  }

  /** Compile first, then validate pending block work, before changing any program owner. */
  private convertDraft(): void {
    const draft = this.codeDrafts[this.importLanguage];
    const result = compileAgentText(draft.source, this.importLanguage, { name: draft.name.trim() || this.defaultImportName(), trigger: { type: "run" } });
    if (!result.ok) {
      const diagnostic = result.diagnostics[0];
      draft.issue = { message: diagnostic.kind === "metadata" ? "Use a program name of 80 characters or fewer." : `Line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}`, focus: diagnostic.kind === "metadata" ? "name" : "source", diagnostic };
      this.render(); return;
    }
    if (!hasImportedCommand(result.program.blocks)) {
      draft.issue = { message: "Enter at least one supported Agent command that can run.", focus: "source" };
      this.render(); return;
    }
    const imported = this.workspace.addImported(result.program);
    if (!imported.ok) {
      draft.issue = { message: `Your current block program needs repair: ${imported.error}. Return to blocks before creating another program.`, focus: "back" };
      this.render(); return;
    }
    this.resetTarget();
    this.importing = false; draft.issue = undefined;
    this.status = "Program created as blocks. Review it, then choose Run when ready.";
    this.host.save();
    this.render("name");
  }

  private renderImport(): void {
    const draft = this.codeDrafts[this.importLanguage];
    const view = el("div", "cb-import");
    const header = el("div", "panel-header cb-import-header");
    header.append(el("h2", "", "Create program from code"));
    const close = el("button", "close-button", "✕"); close.setAttribute("aria-label", "Close Code Builder");
    close.addEventListener("click", () => this.onClose()); header.append(close);
    const note = el("p", "cb-import-note", "Convert a supported snippet into a new block program. Conversion does not run the Agent or replace your saved programs.");
    const fields = el("div", "cb-import-fields");
    const languageLabel = el("label", "cb-import-field", "Code language");
    const language = el("select", "cb-select"); language.setAttribute("aria-label", "Code language");
    language.append(new Option("JavaScript subset (body only)", "javascript", false, this.importLanguage === "javascript"), new Option("Python subset (4 spaces)", "python", false, this.importLanguage === "python"));
    language.addEventListener("change", () => { if (language.value === "javascript" || language.value === "python") { this.importLanguage = language.value; this.render(); } }); languageLabel.append(language);
    const nameLabel = el("label", "cb-import-field", "New program name");
    const name = el("input", "mc-input"); name.setAttribute("aria-label", "New program name"); name.value = draft.name; name.placeholder = this.defaultImportName(); nameLabel.append(name); fields.append(languageLabel, nameLabel);
    const issue = el("p", "cb-import-status", draft.issue?.message ?? ""); issue.id = `${this.importId}-issue`; issue.setAttribute("role", "alert");
    const sourceLabel = el("label", "cb-import-field", "Source code");
    const source = el("textarea", "mc-input cb-import-source"); source.setAttribute("aria-label", "Source code"); source.setAttribute("spellcheck", "false"); source.setAttribute("autocapitalize", "off"); source.setAttribute("autocomplete", "off"); source.setAttribute("autocorrect", "off"); source.value = draft.source;
    source.placeholder = this.importLanguage === "javascript" ? "agent.move(FORWARD, 1);" : "agent.move(FORWARD, 1)";
    sourceLabel.append(source);
    const policy = el("p", "cb-import-note", this.importLanguage === "javascript" ? "Body-only JavaScript: native onChat callbacks and function wrappers are unsupported." : "Python subset: use exactly four spaces per indentation level. Functions and imports are unsupported.");
    policy.id = `${this.importId}-policy`;
    const persistence = el("p", "cb-import-note", this.sourcePersistenceNote());
    const details = el("details", "cb-import-help"); details.append(el("summary", "", "Supported subset and limits"));
    details.append(el("p", "", "Commands: teleport to player (agent.teleportToPlayer() in JavaScript or agent.teleport_to_player() in Python), move, turn, place, till, destroy, slot selection, and agent.interact(direction) in either language. Interact toggles only a loaded matching wooden-door pair without consuming cargo, using this app’s survival Allow/Deny policy. Iron doors, other components and unavailable pairs refuse unchanged. Native return/error/use coverage is uncalibrated. Other commands include agent.transfer(quantity, sourceSlot, destinationSlot) using slots 1–27. Transfer requires the exact owned quantity and compatible capacity; refusal changes nothing. Drop all items uses agent.dropAll(direction) in JavaScript or the app Python alias agent.drop_all(direction). It moves the whole owned cargo into physical world drops in one batch; empty inventory is a validated no-op. Target offset, empty/error behavior and physics are app policy, not native calibration. Finite for loops and if/else are supported, including item-count equality: agent.getItemCount(slot) === count (JavaScript) or agent.get_item_count(slot) == count (Python). Item-space equality is also supported: agent.getItemSpace(slot) (JavaScript) or agent.get_item_space(slot) (app Python alias). App policy: empty slots have 64 space, occupied slots use their metadata-aware stack limit minus count; native edge behavior is uncalibrated. Empty slots count as 0 under app policy; unavailable inventory stops the program. No variables, general expressions, inventory grants, coordinate teleport, assist, or native project import."));
    const example = this.importLanguage === "javascript" ? 'agent.setSlot(1);\nfor (let step = 0; step < 2; step++) {\n    agent.move(FORWARD, 1);\n}\nif (agent.blockIs("stone", UP)) {\n    agent.turn(RIGHT_TURN);\n}' : 'agent.set_slot(1)\nfor step in range(2):\n    agent.move(FORWARD, 1)\nif agent.block_is("stone", UP):\n    agent.turn(TurnDirection.RIGHT)';
    details.append(el("pre", "", example), el("p", "", "Exact block names are an application extension. detect uses this game's any-solid-block rule, which differs from native MakeCode. Limits: 16 KiB of UTF-8 source, 4,096 tokens, 2,000 blocks, four nesting levels and 100 repeats. Oversized text is rejected in full, never cut off. Strings have no escapes; loop counters cannot shadow constants or keywords."));
    source.setAttribute("aria-describedby", `${policy.id} ${issue.id}`); source.setAttribute("aria-invalid", draft.issue?.focus === "source" ? "true" : "false");
    name.setAttribute("aria-invalid", draft.issue?.focus === "name" ? "true" : "false"); name.setAttribute("aria-describedby", issue.id);
    const clearIssue = () => { draft.issue = undefined; issue.textContent = ""; source.setAttribute("aria-invalid", "false"); name.setAttribute("aria-invalid", "false"); };
    source.addEventListener("input", () => { draft.source = source.value; clearIssue(); persistence.textContent = this.sourcePersistenceNote(); });
    name.addEventListener("input", () => { draft.name = name.value; clearIssue(); persistence.textContent = this.sourcePersistenceNote(); });
    const actions = el("div", "cb-import-actions");
    const back = el("button", "mc-button", "Back to blocks"); back.addEventListener("click", () => { this.importing = false; this.render("import"); });
    const convert = el("button", "mc-button primary", "Create block program"); convert.addEventListener("click", () => this.convertDraft());
    actions.append(back, convert); view.append(header, note, fields, issue, sourceLabel, policy, persistence, details, actions); this.panel.replaceChildren(view);
    if (draft.issue?.focus === "back") back.focus();
    else if (draft.issue?.focus === "name") name.focus();
    else {
      source.focus();
      const diagnostic = draft.issue?.diagnostic;
      if (diagnostic) { const range = diagnosticSelection(draft.source, diagnostic); source.setSelectionRange(range.start, range.end); }
    }
    // Leave room around the alert: nearest-edge scrolling can clip a fractional pixel.
    if (draft.issue) issue.scrollIntoView({ block: "center", inline: "nearest" });
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
    const view = el("div", `cb-block cb-${block.type === "command" ? "command" : (block.type === "if" || block.type === "if-item-count" || block.type === "if-item-space") ? "logic" : "loop"}`);
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
    } else if(block.type==="if-item-count"||block.type==="if-item-space"){
      const space=block.type==="if-item-space";
      row.append(el("span","",space?"if Agent item space":"if Agent item count"));
      for(const [key,label,min,max,offset]of [["slot",space?"Space slot":"Count slot",1,AGENT_SLOTS,1],["equals",space?"Equals space":"Equals count",0,Number.MAX_SAFE_INTEGER,0]] as const){
        const field=el("label","cb-count-field"),input=el("input","cb-number cb-count-number");
        input.type="number";input.min=String(min);input.max=String(max);input.step="1";input.value=String(block[key]+offset);input.setAttribute("aria-label",label);
        input.addEventListener("keydown",e=>e.stopPropagation());input.addEventListener("change",()=>{block[key]=input.value.trim()===""?NaN:Number(input.value)-offset;});
        field.append(el("span","",key==="slot"?"Slot":"Equals"),input);row.append(field);
      }
    } else {
      row.append(el("span", "", block.type === "if" ? "if Agent detects block" : "repeat until Agent detects block"), this.dirSelect(block.dir, (d) => (block.dir = d)));
      const kind = el("select", "cb-select");
      kind.setAttribute("aria-label", "Block condition");
      kind.append(new Option("any solid block", "solid", false, !block.condition), new Option("specific block", "specific", false, !!block.condition));
      kind.addEventListener("change", () => {
        if (kind.value === "solid") delete block.condition;
        else block.condition = { type: "block-is", name: "stone" };
        this.render();
      });
      row.append(kind);
      if (block.condition) {
        const identity = el("select", "cb-select");
        identity.setAttribute("aria-label", "Specific block");
        for (const choice of CODE_BLOCK_CHOICES) identity.append(new Option(`${choice.displayName} (${choice.name})`, choice.name, false, choice.name === block.condition.name));
        identity.addEventListener("change", () => { block.condition = { type: "block-is", name: identity.value }; });
        row.append(identity, el("span", "cb-label", "Exact block state"));
      }
    }
    row.append(...this.moveButtons(list, index));
    view.append(row);
    if (block.type === "repeat" || block.type === "until") view.append(this.zone(block.body, "do", depth + 1));
    if (block.type === "if" || block.type === "if-item-count" || block.type === "if-item-space") view.append(this.zone(block.then, "then", depth + 1), el("span", "cb-label", "else"), this.zone(block.else, "else", depth + 1));
    return view;
  }

  private commandFields(cmd: AgentCommand): HTMLElement[] {
    const names: Record<AgentCommand["op"], string> = {
      move: "Agent move", turn: "Agent turn", place: "Agent place", till: "Agent till", interact: "Agent interact (wooden door)", destroy: "Agent destroy", attack: "Agent attack", select: "Agent select slot",
      "teleport-to-player":"Agent teleport to player", transfer: "Agent transfer items", "drop-all":"Agent drop all items", drop: "Agent drop slot", detect: "Agent detect", inspect: "Agent inspect", collect: "Agent collect",
    };
    const out: HTMLElement[] = [el("span", "", names[cmd.op])];
    if ("dir" in cmd && cmd.dir !== undefined) out.push(this.dirSelect(cmd.dir, (d) => (cmd.dir = d)));
    else if (cmd.op === "drop") out.push(this.dirSelect("forward", (d) => (cmd.dir = d)));
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
    if(cmd.op==="transfer"){
      for(const [key,label,visible,min,max,offset]of [["quantity","Quantity","Quantity",1,Number.MAX_SAFE_INTEGER,0],["sourceSlot","Source slot","From slot",1,AGENT_SLOTS,1],["destinationSlot","Destination slot","To slot",1,AGENT_SLOTS,1]] as const){
        const field=el("label",`cb-transfer-field${key==="quantity"?" cb-transfer-quantity":""}`);
        const input=el("input","cb-number cb-transfer-number");input.type="number";input.min=String(min);input.max=String(max);input.step="1";input.value=String(cmd[key]+offset);input.setAttribute("aria-label",label);
        input.addEventListener("keydown",e=>e.stopPropagation());
        // Keep invalid edits diagnosable; validation refuses Run/commit; checkpoints retain last valid programs.
        input.addEventListener("change",()=>{cmd[key]=input.value.trim()===""?NaN:Number(input.value)-offset;});field.append(el("span","cb-transfer-label",visible),input);out.push(field);
      }
    }
    if (cmd.op === "drop") {
      const quantity = el("input", "cb-number"); quantity.type = "number"; quantity.min = "1"; quantity.max = "64";
      quantity.value = cmd.quantity === undefined ? "" : String(cmd.quantity); quantity.placeholder = "all";
      quantity.setAttribute("aria-label", "Drop quantity (empty means whole stack)");
      quantity.addEventListener("keydown", (e) => e.stopPropagation());
      quantity.addEventListener("change", () => { cmd.quantity = quantity.value === "" ? undefined : Math.max(1, Math.min(64, Math.floor(Number(quantity.value) || 1))); });
      out.push(quantity);
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
  const children = block.type === "repeat" || block.type === "until" ? [block.body] : (block.type === "if" || block.type === "if-item-count" || block.type === "if-item-space") ? [block.then, block.else] : [];
  if (children.length === 0) return 0;
  return 1 + Math.max(0, ...children.flat().map(height));
}

/** True if `list` is `block`'s own body (or nested inside it): dropping there would lose the block. */
function contains(block: CodeBlock, list: CodeBlock[]): boolean {
  const children = block.type === "repeat" || block.type === "until" ? [block.body] : (block.type === "if" || block.type === "if-item-count" || block.type === "if-item-space") ? [block.then, block.else] : [];
  return children.some((c) => c === list || c.some((b) => contains(b, list)));
}

/** Empty text, zero moves and zero-repeat-only snippets do not create empty programs. */
function hasImportedCommand(blocks: readonly CodeBlock[]): boolean {
  return blocks.some(block => block.type === "command" || (block.type === "repeat" ? block.times > 0 && hasImportedCommand(block.body) : (block.type === "if" || block.type === "if-item-count" || block.type === "if-item-space") ? hasImportedCommand(block.then) || hasImportedCommand(block.else) : hasImportedCommand(block.body)));
}
function diagnosticSelection(source: string, diagnostic: TextDiagnostic): { start: number; end: number } {
  let offset = 0;
  for (let line = 1; line < diagnostic.line && offset < source.length; line++) {
    while (offset < source.length && source[offset] !== "\r" && source[offset] !== "\n") offset++;
    if (source[offset] === "\r" && source[offset + 1] === "\n") offset += 2;
    else if (offset < source.length) offset++;
  }
  const start = Math.min(source.length, offset + Math.max(0, diagnostic.column - 1));
  const end = Math.min(source.length, start + Math.max(0, diagnostic.endColumn - diagnostic.column));
  return { start, end };
}
