import { expect, it } from "vitest";
import { compileAgentText, AGENT_TEXT_LIMITS, validateProgram, type AgentTextLanguage } from "../src";
const compiled = (text: string, lang: AgentTextLanguage = "javascript") => {
 const result = compileAgentText(text, lang, { name: "Finite route", trigger: { type: "chat", command: "build" } });
 if (!result.ok) throw Error(JSON.stringify(result.diagnostics)); expect(validateProgram(result.program)).toEqual([]); return result.program;
};
it("compiles equivalent literal JS and Python sequences into the same existing AST and controlled trigger", () => {
 const js = 'agent.setSlot(27);\nfor (let index = 0; index <= 3; index++) {\n agent.move(FORWARD, 2)\n if (agent.detect(AgentDetection.Block, UP)) { agent.turn(RIGHT_TURN); } else { agent.place(DOWN); }\n}';
 const py = 'agent.set_slot(27)\nfor index in range(4):\n    agent.move(FORWARD, 2)\n    if agent.detect(AgentDetection.BLOCK, UP):\n        agent.turn(TurnDirection.RIGHT)\n    else:\n        agent.place(DOWN)\n';
 const a=compiled(js),b=compiled(py,'python');expect(a).toEqual(b);expect(a.blocks[0]).toEqual({type:'command',cmd:{op:'select',slot:26}});expect(a.blocks[1]).toMatchObject({type:'repeat',times:4});expect(Object.keys(a).sort()).toEqual(['blocks','name','trigger']);
});
it.each(['javascript','python']as const)('accepts only exact application physical-state names through the clearly separate %s extension',lang=>{
 const text=lang==='javascript'?'if (agent.blockIs("hay_block_x", UP)) { agent.destroy(UP); }':'if agent.block_is("hay_block_x", UP):\n    agent.destroy(UP)';expect(compiled(text,lang).blocks[0]).toMatchObject({type:'if',condition:{type:'block-is',name:'hay_block_x'}});
 const bad=text.replace('hay_block_x','diamond');expect(compileAgentText(bad,lang).ok).toBe(false);
});
it("line comments, CRLF and quoted comment characters are scanned without running or silently dropping code",()=>{
 expect(compiled('// finite\r\nagent.move(FORWARD, 0); // nothing\r\nagent.turn(LEFT_TURN)\r\n').blocks).toEqual([{type:'command',cmd:{op:'turn',side:'left'}}]);
 expect(compiled('# finite\r\nagent.move(FORWARD, 0) # nothing\r\nagent.turn(TurnDirection.LEFT)\r\n','python').blocks).toEqual([{type:'command',cmd:{op:'turn',side:'left'}}]);
 expect(compileAgentText('if (agent.blockIs("stone//tail", UP)) {}','javascript').ok).toBe(false);
});
it.each([
 'agent.setItem(STONE, 64, 1);','agent.teleportToPlayer();','agent.setAssist(PLACE_ON_MOVE, true);','agent.inspect(AgentInspection.Block, UP);',
 'player.onChat("x", function () { agent.turn(LEFT_TURN); });','const x = 1;','agent.move(FORWARD, 1 + 2);','agent.move(FORWARD, Math.random());',
 'agent.move(FORWARD, -1);','agent.move(FORWARD, 1.5);','agent.move(FORWARD, 1e2);','agent.move(FORWARD, 01);','agent.move(FORWARD, 0x10);',
 'agent.move(FORWARD, 1) agent.turn(LEFT_TURN)','agent.move(FORWARD, 1); window.fetch("https://invalid");','agent.constructor("return 1")();',
 'if (true) { agent.place(UP); }','if (agent.detect(AgentDetection.Redstone, UP)) {}','while (true) {}','for (let i = 0; i < 0; i++) { agent.setItem(STONE, 64, 1); }',
 'for (let i = 1; i < 4; i++) {}','for (let i = 0; j < 4; i++) {}','for (let i = 0; i < 4; j++) {}','for (let i = 0; i < 4; i++) {agent.move(FORWARD, i);}',
 'for (let i = 0; i < 4; i++) { for (let i = 0; i < 4; i++) {} }','agent.setSlot(0);','agent.setSlot(28);','agent.move(FORWARD, 101);','agent.turn(TurnDirection.LEFT);',
 'agent.set_slot(1);','if (agent.blockIs("stone\\n", UP)) {}','/* block comments unsupported */ agent.move(FORWARD,1);'
])("atomically refuses unsupported JS, including otherwise valid prefixes: %s",text=>{const result=compileAgentText('agent.turn(LEFT_TURN);\n'+text,'javascript');expect(result.ok).toBe(false);expect(result).not.toHaveProperty('program');if(!result.ok){expect(result.diagnostics).toHaveLength(1);expect(result.diagnostics[0].line).toBeGreaterThanOrEqual(2);expect(result.diagnostics[0].column).toBeGreaterThanOrEqual(1);expect(result.diagnostics[0].endColumn).toBeGreaterThan(result.diagnostics[0].column);}});
it.each([
 'import os','from os import system','def on_chat():\n    agent.place(UP)','agent.set_item(STONE,64,1)','agent.teleport_to_player()',
 'agent.move(FORWARD, steps)','for i in range(1,4):\n    agent.place(UP)','for i in range(101):\n    agent.place(UP)',
 'for i in range(4):\n  agent.place(UP)','for i in range(4):\n\tagent.place(UP)','for i in range(4):\n        agent.place(UP)',
 'if agent.detect(AgentDetection.BLOCK, UP)\n    agent.place(UP)','if agent.detect(AgentDetection.Block, UP):\n    agent.place(UP)',
 'if agent.detect(AgentDetection.BLOCK, UP):\n    # no body','if agent.detect(AgentDetection.BLOCK, UP):\n    agent.place(UP)\n   agent.move(FORWARD,1)',
 'agent.place(UP); agent.destroy(UP)','agent.turn(LEFT_TURN)','agent.move(FORWARD, \\\n    1)','for i in range(2):\n    for i in range(2):\n        agent.place(UP)',
 'agent.move(FORWARD,1)\n__import__("os")'
])("refuses Python imports, expressions, indentation ambiguities and unsupported tails: %s",text=>{const r=compileAgentText(text,'python');expect(r.ok).toBe(false);expect(r).not.toHaveProperty('program');});
it("measures the actual UTF-8 byte bound, including comments, before tokenization",()=>{
 expect(compileAgentText('//'+'a'.repeat(AGENT_TEXT_LIMITS.sourceBytes-2),'javascript').ok).toBe(true);
 for(const source of['//'+'a'.repeat(AGENT_TEXT_LIMITS.sourceBytes-1),'//'+'€'.repeat(6000)]){const r=compileAgentText(source,'javascript');expect(r.ok).toBe(false);if(!r.ok)expect(r.diagnostics[0]).toMatchObject({kind:'limits',line:1,column:1,message:'Source exceeds 16384 UTF-8 bytes'});}
});
it("bounds tokens independently of zero-action AST and bounds expanded movement nodes independently of tokens",()=>{
 const token=compileAgentText('agent.move(FORWARD,0);\n'.repeat(600),'javascript'),nodes=compileAgentText('agent.move(FORWARD,100);\n'.repeat(21),'javascript');
 expect(token.ok).toBe(false);expect(nodes.ok).toBe(false);if(!token.ok)expect(token.diagnostics[0].message).toBe('Too many tokens');if(!nodes.ok)expect(nodes.diagnostics[0].message).toBe('Compiled program exceeds 2000 blocks');
 expect(compiled('agent.move(FORWARD,100);\n'.repeat(20)).blocks).toHaveLength(2000);
});
it("accepts four nesting levels and refuses the fifth without relying on runtime recursion",()=>{
 const js=(n:number)=>Array.from({length:n},(_,i)=>`for(let i${i}=0;i${i}<1;i${i}++){`).join('')+'agent.move(FORWARD,1);'+'}'.repeat(n);
 const py=(n:number)=>Array.from({length:n},(_,i)=>' '.repeat(i*4)+`for i${i} in range(1):`).join('\n')+'\n'+' '.repeat(n*4)+'agent.move(FORWARD,1)';
 for(const lang of['javascript','python']as const){expect(compileAgentText(lang==='javascript'?js(4):py(4),lang).ok).toBe(true);expect(compileAgentText(lang==='javascript'?js(5):py(5),lang).ok).toBe(false);}
});
it("returns source coordinates/ranges for an unsupported trailing statement, missing delimiter and unterminated string",()=>{
 const r=compileAgentText('// lead\nagent.place(UP);\nfetch("bad");','javascript');expect(r.ok).toBe(false);if(!r.ok)expect(r.diagnostics[0]).toMatchObject({line:3,column:1,endLine:3,endColumn:6});
 const missing=compileAgentText('if (agent.detect(AgentDetection.Block,UP)) {\nagent.place(UP);','javascript');expect(missing.ok).toBe(false);if(!missing.ok)expect(missing.diagnostics[0].line).toBe(2);
 const string=compileAgentText('if (agent.blockIs("stone, UP)) {}','javascript');expect(string.ok).toBe(false);if(!string.ok)expect(string.diagnostics[0]).toMatchObject({line:1,column:19,message:'Unterminated string'});
});
it("does not execute injection source or read accessor metadata, and never retains a source field",()=>{
 const host=globalThis as unknown as Record<string,unknown>;host.__agentTextProbe=0;
 const r=compileAgentText('agent.place(UP); globalThis.__agentTextProbe = 1;','javascript');expect(r.ok).toBe(false);expect(host.__agentTextProbe).toBe(0);delete host.__agentTextProbe;
 let reads=0;const meta=Object.defineProperty({trigger:{type:'run'}},'name',{get(){reads++;throw Error('getter');}});expect(compileAgentText('agent.place(UP);','javascript',meta as any).ok).toBe(false);expect(reads).toBe(0);
 expect(compileAgentText('agent.place(UP);','javascript',{name:'Invalid',trigger:{type:'chat',command:'bad space'}}).ok).toBe(false);
 expect(compileAgentText(null,'javascript').ok).toBe(false);expect(compileAgentText('','other' as AgentTextLanguage).ok).toBe(false);
 const p=compiled('agent.place(UP);');expect(p).not.toHaveProperty('source');expect(p).not.toHaveProperty('language');
});
it.each([
 ...['FORWARD','BACK','LEFT','RIGHT','UP','DOWN','LEFT_TURN','RIGHT_TURN','AgentDetection','TurnDirection','agent','return','true','null','class','await','yield','arguments','eval','implements','undefined'].map(name=>({lang:'javascript' as const,name})),
 ...['FORWARD','BACK','LEFT','RIGHT','UP','DOWN','LEFT_TURN','RIGHT_TURN','AgentDetection','TurnDirection','agent','range','True','False','None','class','return','yield','lambda','async','await','match','case','type','__debug__'].map(name=>({lang:'python' as const,name}))
])('counter names refuse keyword/API/constant shadowing $lang $name',({lang,name})=>{
 const text=lang==='javascript'?`for(let ${name}=0;${name}<2;${name}++){agent.move(FORWARD,1);}`:`for ${name} in range(2):\n    agent.move(FORWARD,1)`;
 const result=compileAgentText(text,lang);expect(result.ok).toBe(false);expect(result).not.toHaveProperty('program');
});

it.each(['javascript','python']as const)('refuses NUL source even inside an otherwise ignored %s comment',lang=>{const text=(lang==='javascript'?'//':'#')+' ignored\n'+(lang==='javascript'?'//':'#')+' bad\0tail';const r=compileAgentText(text,lang);expect(r.ok).toBe(false);if(!r.ok)expect(r.diagnostics[0]).toMatchObject({line:2,column:lang==='javascript'?7:6,message:'NUL is not supported in Agent text'});});
