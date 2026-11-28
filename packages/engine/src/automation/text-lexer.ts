/** Bounded, linear scanner for the documented Agent text subset, never a language runtime. */
export interface TextLocation { line: number; column: number }
export interface TextDiagnostic extends TextLocation { endLine: number; endColumn: number; message: string; kind: "source" | "syntax" | "limits" | "metadata" }
export interface TextToken extends TextLocation { kind: "id" | "number" | "string" | "punct" | "newline" | "indent" | "dedent" | "eof"; value: string }
export type AgentTextLanguage = "javascript" | "python";
export const AGENT_TEXT_LIMITS = Object.freeze({ sourceBytes: 16384, tokens: 4096, nesting: 4, nodes: 2000, repeat: 100 });
export class AgentTextError extends Error {
  constructor(readonly diagnostic: TextDiagnostic) { super(diagnostic.message); }
}
export function textFail(at: TextLocation, message: string, kind: TextDiagnostic["kind"] = "syntax"): never {
  const width = "value" in at && typeof at.value === "string" ? Math.max(1, at.value.length) : 1;
  throw new AgentTextError({ line: at.line, column: at.column, endLine: at.line, endColumn: at.column + width, message, kind });
}
export function lexAgentText(source: string, language: AgentTextLanguage): TextToken[] {
  const tokens: TextToken[] = [], indents = [0], lines = source.split(/\r\n|\n|\r/);
  const emit = (kind: TextToken["kind"], value: string, line: number, column: number) => {
    if (tokens.length >= AGENT_TEXT_LIMITS.tokens) textFail({ line, column }, "Too many tokens", "limits");
    tokens.push({ kind, value, line, column });
  };
  for (let n = 0; n < lines.length; n++) {
    const s = lines[n], line = n + 1; let i = 0;
    while (s[i] === " ") i++;
    if (language === "python") {
      if (s[i] === "\t") textFail({ line, column: i + 1 }, "Python indentation must use spaces, not tabs");
      if (i === s.length || s[i] === "#") continue;
      if (i % 4 !== 0) textFail({ line, column: 1 }, "Python indentation must use four-space levels");
      const current = indents[indents.length - 1];
      if (i > current) {
        if (i !== current + 4) textFail({ line, column: 1 }, "An indented body adds exactly four spaces");
        if (indents.length > AGENT_TEXT_LIMITS.nesting) textFail({ line, column: 1 }, "Text nesting exceeds four levels", "limits");
        indents.push(i); emit("indent", "", line, 1);
      } else {
        while (i < indents[indents.length - 1]) { indents.pop(); emit("dedent", "", line, 1); }
        if (i !== indents[indents.length - 1]) textFail({ line, column: 1 }, "Inconsistent Python indentation");
      }
    }
    let content = false;
    while (i < s.length) {
      const c = s[i], column = i + 1;
      if (c === " " || (c === "\t" && language === "javascript")) { i++; continue; }
      if ((language === "python" && c === "#") || (language === "javascript" && c === "/" && s[i + 1] === "/")) break;
      if (c === "\t") textFail({ line, column }, "Tabs are not supported in Python code");
      content = true;
      if (/[A-Za-z_]/.test(c)) {
        const start = i++; while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) i++;
        emit("id", s.slice(start, i), line, column); continue;
      }
      if (/[0-9]/.test(c)) {
        const start = i++; while (i < s.length && /[0-9]/.test(s[i])) i++;
        emit("number", s.slice(start, i), line, column); continue;
      }
      if (c === '"' || c === "'") {
        const quote = c, start = ++i;
        while (i < s.length && s[i] !== quote) {
          if (s[i] === "\\" || s.charCodeAt(i) < 32 || s.charCodeAt(i) > 126) textFail({ line, column: i + 1 }, "Block-name strings do not support escapes or control/non-ASCII characters");
          i++;
        }
        if (i === s.length) textFail({ line, column }, "Unterminated string");
        emit("string", s.slice(start, i), line, column); i++; continue;
      }
      if ("().,;:{}=<+".includes(c)) {
        const pair = s.slice(i, i + 2);
        if(s.slice(i,i+3)==="==="){emit("punct","===",line,column);i+=3;continue;}
        if(pair==="=="){emit("punct",pair,line,column);i+=2;continue;}
        if (pair === "<=" || pair === "++") { emit("punct", pair, line, column); i += 2; }
        else { emit("punct", c, line, column); i++; }
        continue;
      }
      textFail({ line, column }, "Unsupported character in Agent text");
    }
    if (content) emit("newline", "", line, s.length + 1);
  }
  const end = { line: lines.length, column: lines[lines.length - 1].length + 1 };
  if (language === "python") while (indents.length > 1) { indents.pop(); emit("dedent", "", end.line, end.column); }
  emit("eof", "", end.line, end.column); return tokens;
}
