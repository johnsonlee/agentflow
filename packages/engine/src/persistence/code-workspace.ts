/** Application-owned text drafts, not native MakeCode project files or executable code. */
export type CodeSourceLanguage = "javascript" | "python";
export interface CodeTextDraft { source: string; name: string }
export interface CodeWorkspaceData {
  version: 1;
  language: CodeSourceLanguage;
  drafts: Record<CodeSourceLanguage, CodeTextDraft>;
}
export const CODE_SOURCE_STORAGE_BYTES = 64 * 1024;
export const CODE_DRAFT_NAME_BYTES = 4 * 1024;
export const CODE_WORKSPACE_STORAGE_BYTES = 1024 * 1024;
export type CodeWorkspaceRead = { kind: "absent" } | { kind: "invalid"; reason: string } | { kind: "valid"; data: CodeWorkspaceData };
const bytes = (s: string) => new TextEncoder().encode(s).length;
/** Own data fields only: never invoke a caller's getters or copy unknown properties. */
function fields(value: unknown, keys: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors);
  if (names.length !== keys.length || names.some(k => typeof k !== "string" || !keys.includes(k))) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}
export function emptyCodeWorkspace(): CodeWorkspaceData {
  return { version: 1, language: "javascript", drafts: { javascript: { source: "", name: "" }, python: { source: "", name: "" } } };
}
export function hasCodeWorkspace(data: CodeWorkspaceData): boolean {
  return data.language !== "javascript" || Object.values(data.drafts).some(d => d.source !== "" || d.name !== "");
}
/** Syntax and compiler/name validity are deliberately not checked: invalid code is editable data. */
export function readCodeWorkspace(value: unknown): CodeWorkspaceRead {
  if (value === undefined) return { kind: "absent" };
  const invalid = (): CodeWorkspaceRead => ({ kind: "invalid", reason: "Invalid source workspace shape, version, language or storage bounds" });
  try {
    const root = fields(value, ["version", "language", "drafts"]);
    if (!root || root.version !== 1 || (root.language !== "javascript" && root.language !== "python")) return invalid();
    const drafts = fields(root.drafts, ["javascript", "python"]);
    if (!drafts) return invalid();
    const data = emptyCodeWorkspace(); data.language = root.language;
    for (const language of ["javascript", "python"] as const) {
      const draft = fields(drafts[language], ["source", "name"]);
      if (!draft || typeof draft.source !== "string" || typeof draft.name !== "string" || bytes(draft.source) > CODE_SOURCE_STORAGE_BYTES || bytes(draft.name) > CODE_DRAFT_NAME_BYTES) return invalid();
      data.drafts[language] = { source: draft.source, name: draft.name };
    }
    if (bytes(JSON.stringify(data)) > CODE_WORKSPACE_STORAGE_BYTES) return invalid();
    return { kind: "valid", data };
  } catch { return invalid(); }
}
