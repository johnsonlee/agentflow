import { validateProgram, type CodeProgram, type CodeWorkspaceData } from "@craft/engine";
interface Entry { id: number; source: CodeProgram | null; index: number; working: CodeProgram; baseline: string; initial: string }
interface Plan { entry: Entry; entrySource: CodeProgram | null; source: CodeProgram | null; index: number; sourceJSON: string; workingJSON: string; staged: CodeProgram }
export type ProgramSnapshot = { ok: false; error: string } | { ok: true; programs: CodeProgram[]; codeWorkspace?: CodeWorkspaceData; warning: string; accept(): boolean };
export interface ProgramChoice { value: string; label: string; selected: boolean }
const copy = (p: CodeProgram): CodeProgram => structuredClone(p);
const json = (p: CodeProgram): string => JSON.stringify(p);
const blank = (name: string): CodeProgram => ({ name, trigger: { type: "run" }, blocks: [] });
/** UI-only working ownership. Owned ASTs are replaced, never edited: a running interpreter may
 * still hold their block arrays. Snapshot preparation is pure; acceptance never rewrites newer work. */
export class CodeProgramWorkspace {
  private nextId = 1;
  private opened = false;
  private readonly drafts = new Set<Entry>();
  private current: Entry;
  constructor(private readonly programs: CodeProgram[]) { this.current = this.draft(blank("My program")); }
  private draft(program: CodeProgram): Entry {
    const value = copy(program), initial = json(value), entry = { id: this.nextId++, source: null, index: -1, working: value, baseline: initial, initial };
    this.drafts.add(entry); return entry;
  }
  private owned(program: CodeProgram, index: number): Entry {
    const value = copy(program), baseline = json(value); return { id: this.nextId++, source: program, index, working: value, baseline, initial: baseline };
  }
  private indexOf(entry: Entry): number {
    if (!entry.source) return -1;
    return this.programs[entry.index] === entry.source ? entry.index : this.programs.indexOf(entry.source);
  }
  private meaningful(entry: Entry): boolean { return entry.source !== null || entry.working.blocks.length > 0 || json(entry.working) !== entry.initial; }
  get program(): CodeProgram { return this.current.working; }
  get ownedProgram(): CodeProgram | null { const index = this.indexOf(this.current); return index < 0 ? null : this.programs[index]; }
  open(): void {
    if (!this.opened) {
      this.opened = true;
      if (this.programs.length) { this.drafts.delete(this.current); this.current = this.owned(this.programs[this.programs.length - 1], this.programs.length - 1); }
      return;
    }
    const entry = this.current, index = this.indexOf(entry);
    if (entry.source && index < 0) {
      if (json(entry.working) !== entry.baseline) { entry.source = null; entry.index = -1; this.drafts.add(entry); }
      else if (this.programs.length) this.current = this.owned(this.programs[this.programs.length - 1], this.programs.length - 1);
      else this.current = this.draft(blank("My program"));
    } else if (index >= 0) {
      entry.index = index;
      if (json(entry.working) === entry.baseline && json(this.programs[index]) !== entry.baseline) {
        entry.working = copy(this.programs[index]); entry.baseline = json(entry.working);
      }
    }
  }
  choices(): ProgramChoice[] {
    const index = this.indexOf(this.current), count = (p: CodeProgram) => `${p.blocks.length} block${p.blocks.length === 1 ? "" : "s"}`;
    const saved = this.programs.map((p, i) => {
      const view = i === index ? this.current.working : p;
      return { value: `saved:${i}`, label: `${i + 1}. ${view.name} (${count(view)})`, selected: i === index };
    });
    const drafts = [...this.drafts].filter(e => !e.source).map(e => ({ value: `draft:${e.id}`, label: `Unsaved draft ${e.id}: ${e.working.name} (${count(e.working)})`, selected: e === this.current }));
    return [...saved, ...drafts];
  }
  currentIssue(): string | null { const errors = validateProgram(this.current.working); return errors.length ? `Program has invalid uncommitted edits: ${errors[0]}` : null; }
  unsavedIssue(): string | null {
    for (const e of new Set([this.current, ...this.drafts])) if (this.meaningful(e)) { const errors = validateProgram(e.working); if (errors.length) return `Code Builder has invalid uncommitted edits in "${e.working.name}": ${errors[0]}. Reopen Code Builder to repair them before quitting or changing worlds.`; }
    return null;
  }
  status(): string {
    const issue = this.currentIssue(); if (issue) return `${issue}. World checkpoints keep the last valid program; these edits remain in this session.`;
    const e = this.current, index = this.indexOf(e);
    return index < 0 ? "Unsaved draft. Valid edits save with your world; selecting another program also preserves your work." : json(e.working) !== e.baseline ? "Edited working copy. Valid edits save with your world; running code is unchanged until you choose Run." : "Saved program. Editing this working copy does not change code that is already running.";
  }
  prepareSnapshot(): ProgramSnapshot {
    try {
      for (const p of this.programs) { const errors = validateProgram(p); if (errors.length) return { ok: false, error: `Saved program is invalid: ${errors[0]}` }; }
      const programs = this.programs.map(copy), plans: Plan[] = [], warnings: string[] = [];
      for (const entry of new Set([this.current, ...this.drafts])) {
        if (!this.meaningful(entry)) continue;
        const errors = validateProgram(entry.working);
        if (errors.length) { warnings.push(`Uncommitted edits in "${entry.working.name}" are invalid and were not saved.`); continue; }
        const workingJSON = json(entry.working), index = this.indexOf(entry), source = index < 0 ? null : this.programs[index];
        if ((source || entry.source) && workingJSON === entry.baseline) continue;
        // External edits to the same saved object are kept too: save this working copy as a new program.
        const replace = source && json(source) === entry.baseline ? index : -1;
        const staged = copy(entry.working), target = replace < 0 ? programs.length : replace;
        if (replace < 0) programs.push(staged); else programs[replace] = staged;
        plans.push({ entry, entrySource: entry.source, source: replace < 0 ? null : source, index: target, sourceJSON: replace < 0 ? "" : json(source!), workingJSON, staged });
      }
      const pinned = JSON.stringify(programs); let used = false;
      return { ok: true, programs, warning: warnings.join(" "), accept: () => {
        if (used || JSON.stringify(programs) !== pinned) return false; used = true; let complete = true;
        for (const plan of plans) {
          const { entry } = plan;
          let index: number;
          if (plan.source) {
            index = this.programs[plan.index] === plan.source ? plan.index : this.programs.indexOf(plan.source);
            if (index < 0 || json(this.programs[index]) !== plan.sourceJSON) { complete = false; continue; }
            this.programs[index] = plan.staged;
          } else {
            // A UI callback may have committed this draft while storage was writing. Do not append twice.
            if (entry.source !== plan.entrySource) { complete = false; continue; }
            index = this.programs.length; this.programs.push(plan.staged);
          }
          entry.source = plan.staged; entry.index = index; entry.baseline = plan.workingJSON;
          // Keep entry.working, including any newer edits made after the snapshot was prepared.
          this.drafts.delete(entry);
        }
        return complete;
      } };
    } catch { return { ok: false, error: "Program edits could not be prepared. Keep this game open and repair the draft." }; }
  }
  commitCurrent(): { ok: boolean; error?: string } {
    const issue = this.currentIssue(); if (issue) return { ok: false, error: issue };
    const stage = this.prepareSnapshot(); if (!stage.ok) return { ok: false, error: stage.error };
    return stage.accept() ? { ok: true } : { ok: false, error: "The program list changed. Your working copy is preserved; try again." };
  }
  select(value: string): { ok: boolean; error?: string } {
    const saved = /^saved:(0|[1-9][0-9]*)$/.exec(value), draft = /^draft:(0|[1-9][0-9]*)$/.exec(value);
    const index = saved ? Number(saved[1]) : -1, source = index >= 0 ? this.programs[index] : null;
    const entry = draft ? [...this.drafts].find(e => e.id === Number(draft[1]) && !e.source) : undefined;
    if ((!source || !Number.isSafeInteger(index)) && !entry) return { ok: false, error: "That program is no longer available. Your working copy is preserved." };
    if ((source && this.indexOf(this.current) === index) || entry === this.current) return { ok: true };
    const committed = this.commitCurrent(); if (!committed.ok) return committed;
    if (entry) this.current = entry;
    else {
      const actual = this.programs[index] === source ? index : this.programs.indexOf(source!);
      if (actual < 0) return { ok: false, error: "The program list changed. Select a program again." };
      this.current = this.owned(this.programs[actual], actual);
    }
    return { ok: true };
  }
  newProgram(): { ok: boolean; error?: string } {
    const committed = this.commitCurrent(); if (!committed.ok) return committed;
    const existing = [...this.drafts].find(e => !e.source && !this.meaningful(e));
    this.current = existing ?? this.draft(blank(`Program ${this.programs.length + 1}`));
    return { ok: true };
  }
  addImported(program: CodeProgram): { ok: boolean; error?: string } {
    const committed = this.commitCurrent(); if (!committed.ok) return committed;
    const owned = copy(program); this.programs.push(owned); this.current = this.owned(owned, this.programs.length - 1); return { ok: true };
  }
}
