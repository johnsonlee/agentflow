import { BLOCKS } from "../catalog/blocks";

/** Exact application block identities, including physical state names. These are not native IDs. */
export const CODE_BLOCK_CHOICES = Object.freeze(BLOCKS.map(({ name, displayName }) => Object.freeze({ name, displayName })));
const names = new Set(CODE_BLOCK_CHOICES.map(({ name }) => name));
export interface BlockCondition { type: "block-is"; name: string }
export type ProgramCondition = { kind: "legacy" } | { kind: "named"; name: string } | { kind: "invalid" };

/** Absence preserves the original any-solid predicate; a malformed present field never falls back. */
export function readProgramCondition(block: object): ProgramCondition {
  const descriptor = Object.getOwnPropertyDescriptor(block, "condition");
  if (!descriptor) return "condition" in block ? { kind: "invalid" } : { kind: "legacy" };
  if (!("value" in descriptor)) return { kind: "invalid" };
  const value: unknown = descriptor.value;
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return { kind: "invalid" };
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== 2 || !fields.type || !fields.name ||
      !("value" in fields.type) || !("value" in fields.name) || fields.type.value !== "block-is" ||
      typeof fields.name.value !== "string" || !names.has(fields.name.value)) return { kind: "invalid" };
  return { kind: "named", name: fields.name.value };
}
