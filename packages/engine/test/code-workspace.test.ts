import { expect, it } from "vitest";
import { emptyCodeWorkspace, readCodeWorkspace, hasCodeWorkspace, CODE_SOURCE_STORAGE_BYTES, CODE_DRAFT_NAME_BYTES } from "../src/persistence/code-workspace";
import { parseSave, serializeSave, type SaveData } from "../src/persistence/save";
import { Inventory } from "../src/ownership/inventory";

function world(): SaveData {
  return { version: 1, name: "Text drafts", seed: 7, generatorVersion: 3, mode: "survival", timeOfDay: .25,
    player: { position: { x: .5, y: 80, z: .5 }, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [], programs: [] };
}
it("legacy saves have no invented workspace or trusted derived flag", () => {
  expect(readCodeWorkspace(undefined)).toEqual({ kind: "absent" });
  const raw = JSON.stringify({ ...world(), codeWorkspaceInvalid: true });
  expect(parseSave(raw).codeWorkspaceInvalid).toBeUndefined();
  expect(parseSave(raw).codeWorkspace).toBeUndefined();
  expect(hasCodeWorkspace(emptyCodeWorkspace())).toBe(false);
});
it("invalid syntax, unsupported APIs, literal HTML, Unicode and NUL are inert exact draft data", () => {
  const data = emptyCodeWorkspace(); data.language = "python";
  data.drafts.javascript = { source: '<script>bad()</script>\r\nagent.unsupported(\u0000); 日本語', name: "x".repeat(81) };
  data.drafts.python = { source: "import unsupported\n\tif broken:\n", name: "<img onerror=bad>" };
  const before = world(), bag = JSON.stringify(before.inventory), programs = JSON.stringify(before.programs);
  const restored = parseSave(serializeSave({ ...before, codeWorkspace: data }));
  expect(restored.codeWorkspace).toEqual(data);
  expect(JSON.stringify(restored.inventory)).toBe(bag);
  expect(JSON.stringify(restored.programs)).toBe(programs);
  expect(restored.codeWorkspaceInvalid).toBeUndefined();
  const checked = readCodeWorkspace(data); expect(checked.kind).toBe("valid");
  if (checked.kind === "valid") { checked.data.drafts.python.source = "changed"; expect(data.drafts.python.source).toContain("unsupported"); }
});
it("storage bounds count UTF-8 and allow exact limits without truncating compiler-invalid source", () => {
  const data = emptyCodeWorkspace(); data.drafts.javascript.source = "\u0000".repeat(CODE_SOURCE_STORAGE_BYTES);
  data.drafts.python.source = "x".repeat(CODE_SOURCE_STORAGE_BYTES); data.drafts.python.name = "n".repeat(CODE_DRAFT_NAME_BYTES);
  expect(readCodeWorkspace(data).kind).toBe("valid");
  expect(parseSave(serializeSave({ ...world(), codeWorkspace: data })).codeWorkspace).toEqual(data);
  data.drafts.python.source += "x"; expect(readCodeWorkspace(data).kind).toBe("invalid");
  data.drafts.python.source = "😀".repeat(CODE_SOURCE_STORAGE_BYTES / 4); expect(readCodeWorkspace(data).kind).toBe("valid");
  data.drafts.python.source += "😀"; expect(readCodeWorkspace(data).kind).toBe("invalid");
  data.drafts.python.source = ""; data.drafts.python.name += "n"; expect(readCodeWorkspace(data).kind).toBe("invalid");
});
it.each([null, [], {}, { ...emptyCodeWorkspace(), version: 2 }, { ...emptyCodeWorkspace(), language: "ruby" }, { ...emptyCodeWorkspace(), extra: 1 }, { ...emptyCodeWorkspace(), drafts: { javascript: { source: "", name: "" } } }])("present malformed data is diagnosed before any save overwrite: %j", value => {
  const raw = "  " + JSON.stringify({ ...world(), codeWorkspace: value, codeWorkspaceInvalid: false }) + "\n";
  const parsed = parseSave(raw);
  expect(parsed.codeWorkspaceInvalid).toBe(true); expect(parsed.codeWorkspace).toBeUndefined();
  expect(() => serializeSave(parsed)).toThrow("source workspace");
});
it("untrusted accessors are refused without execution and unknown draft fields are refused", () => {
  let reads = 0; const data = emptyCodeWorkspace();
  Object.defineProperty(data.drafts.python, "source", { enumerable: true, get() { reads++; throw Error("do not execute"); } });
  expect(readCodeWorkspace(data).kind).toBe("invalid"); expect(reads).toBe(0);
  expect(readCodeWorkspace({ ...emptyCodeWorkspace(), drafts: { javascript: { source: "", name: "", compiled: [] }, python: { source: "", name: "" } } }).kind).toBe("invalid");
});

import { captureDimensionWorld, replaceDimensionWorld } from "../src/persistence/dimension-world";
it("unresolved source workspace diagnostics refuse both public world partition operations", () => {
  const bad = parseSave(JSON.stringify({ ...world(), codeWorkspace: { version: 9 }, codeWorkspaceInvalid: false }));
  const target = captureDimensionWorld(world());
  expect(() => captureDimensionWorld(bad)).toThrow("codeWorkspaceInvalid");
  expect(() => replaceDimensionWorld(bad, target)).toThrow("codeWorkspaceInvalid");
});
