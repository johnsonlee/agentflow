/** Bounded application URL buttons; command/automatic/native permission semantics are unsupported. */
export interface NpcUrlButton { kind: "url"; label: string; url: string }
export interface NpcActions { version: 1; buttons: NpcUrlButton[] }
export const NPC_MAX_BUTTONS = 6;
export const NPC_BUTTON_LABEL_CHARS = 12;
export const NPC_URL_CHARS = 2048;
export type NpcActionRead = { kind: "absent" } | { kind: "valid"; data: NpcActions } | { kind: "invalid" };
const invalid = (): NpcActionRead => ({ kind: "invalid" });
function data(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(k => typeof k !== "string" || !keys.includes(k))) return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !("value" in d) || !d.enumerable) return null;
    out[key] = d.value;
  }
  return out;
}
/** Standalone web destinations only. These bounds are app policy, not native Education limits. */
export function validNpcUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.length || value.length > NPC_URL_CHARS || value.trim() !== value || value.includes("\\") || /[\p{Cc}\s]/u.test(value) || !/^https?:\/\//i.test(value)) return false;
  try { const url = new URL(value); return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
/** Reads without invoking record accessors; malformed present data is never repaired or truncated. */
export function readNpcActions(raw: unknown): NpcActionRead {
  try {
    const envelope = data(raw, ["version", "buttons"]);
    if (!envelope || envelope.version !== 1 || !Array.isArray(envelope.buttons)) return invalid();
    const buttons = envelope.buttons;
    if (buttons.length > NPC_MAX_BUTTONS || Reflect.ownKeys(buttons).length !== buttons.length + 1) return invalid();
    const out: NpcUrlButton[] = [];
    for (let i = 0; i < buttons.length; i++) {
      const d = Object.getOwnPropertyDescriptor(buttons, String(i));
      if (!d || !("value" in d) || !d.enumerable) return invalid();
      const b = data(d.value, ["kind", "label", "url"]);
      if (!b || b.kind !== "url" || typeof b.label !== "string" || !b.label.trim() || b.label.trim() !== b.label || Array.from(b.label).length > NPC_BUTTON_LABEL_CHARS || /\p{Cc}/u.test(b.label) || !validNpcUrl(b.url)) return invalid();
      out.push({ kind: "url", label: b.label, url: b.url });
    }
    return { kind: "valid", data: { version: 1, buttons: out } };
  } catch { return invalid(); }
}
/** A present undefined/getter field is invalid; only an actually absent field is legacy-empty. */
export function readNpcActionField(owner: object): NpcActionRead {
  try {
    const d = Object.getOwnPropertyDescriptor(owner, "npcActions");
    if (!d) return { kind: "absent" };
    return "value" in d && d.enumerable ? readNpcActions(d.value) : invalid();
  } catch { return invalid(); }
}
export function copyNpcActions(owner: object): NpcActions | undefined {
  const result = readNpcActionField(owner);
  if (result.kind === "invalid") throw new Error("Invalid NPC URL buttons");
  return result.kind === "valid" ? result.data : undefined;
}
/** Diagnose new action data before legacy sanitizers can discard it. Does not normalize old NPCs. */
export function diagnoseRawNpcActions(save: unknown): boolean {
  try {
    if (!save || typeof save !== "object") return false;
    const field = (o: object, k: PropertyKey): unknown => {
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (d && (!("value" in d) || !d.enumerable)) throw Error("Accessor in NPC source");
      return d?.value;
    };
    const legacy = field(save, "npcs"), mobs = field(save, "mobs");
    const hasActions = (candidate: unknown): candidate is object => !!candidate && typeof candidate === "object" && !!Object.getOwnPropertyDescriptor(candidate, "npcActions");
    const check = (candidate: unknown, modern: boolean): boolean => {
      if (!hasActions(candidate)) return false;
      if (Array.isArray(candidate) || ![Object.prototype, null].includes(Object.getPrototypeOf(candidate))) return true;
      const action = readNpcActionField(candidate);
      if (action.kind !== "valid") return true;
      if (modern) return field(candidate, "kind") !== "npc";
      if (mobs !== undefined) return false; // Present modern actors are authoritative, not this compatibility cache.
      // Legacy sanitizer must not drop a valid action because another NPC field is malformed.
      for (const k of ["x", "y", "z", "yaw"] as const) {
        const n = field(candidate, k);
        if (typeof n !== "number" || !Number.isFinite(n) || n < (k === "y" ? -100 : k === "yaw" ? -1e4 : -1e7) || n > (k === "y" ? 1000 : k === "yaw" ? 1e4 : 1e7)) return true;
      }
      return typeof field(candidate, "name") !== "string" || typeof field(candidate, "dialogue") !== "string";
    };
    if (hasActions(mobs)) return true; // The modern envelope is not an NPC record.
    const records = mobs && typeof mobs === "object" ? field(mobs, "records") : undefined;
    for (const [container, modern] of [[legacy, false], [records, true]] as const) {
      if (hasActions(container)) return true; // Action data belongs to a record, not its container.
      if (Array.isArray(container)) {
        for (const key of Reflect.ownKeys(container)) {
          if (key === "length") continue;
          const entry = field(container, key);
          if (hasActions(entry) && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= container.length)) return true;
          if (check(entry, modern)) return true;
        }
      } else if (container && typeof container === "object") {
        // One direct record level identifies stranded new data in array-like objects.
        // Do not recursively search arbitrary unrelated legacy payloads.
        for (const key of Reflect.ownKeys(container)) if (hasActions(field(container, key))) return true;
      }
    }
    return false;
  } catch { return true; }
}
