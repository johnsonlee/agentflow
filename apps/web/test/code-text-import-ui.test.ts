import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CodeBuilderScreen, type CodeBuilderHost } from "../src/ui/codeBuilder";
import type { CodeProgram } from "@craft/engine";
let active: Cell | null = null, htmlWrites = 0;
class Cell extends EventTarget {
 children: Cell[]=[]; parent:Cell|null=null; className="";textContent="";hidden=false;value="";placeholder="";id="";disabled=false;draggable=false;type="";min="";max="";
 scrolledIntoView=false;
 scrollIntoView(){this.scrolledIntoView=true;}
 dataset:Record<string,string>={};attributes:Record<string,string>={};selectionStart=0;selectionEnd=0;
 append(...cells:Cell[]){for(const c of cells){this.children.push(c);c.parent=this;}}
 appendChild(c:Cell){this.append(c);return c;}
 replaceChildren(...cells:Cell[]){for(const c of this.children)c.parent=null;this.children=[];this.append(...cells);}
 setAttribute(k:string,v:string){this.attributes[k]=v;}
 focus(){active=this;}
 setSelectionRange(start:number,end:number){this.selectionStart=start;this.selectionEnd=end;}
 set innerHTML(_value:string){htmlWrites++;throw Error('Source must never render as HTML');}
 override dispatchEvent(e:Event){let stopped=false;const stop=e.stopPropagation.bind(e);e.stopPropagation=()=>{stopped=true;stop();};let node:Cell|null=this;while(node){EventTarget.prototype.dispatchEvent.call(node,e);if(stopped||!e.bubbles)break;node=node.parent;}return !e.defaultPrevented;}
}
const all=(r:Cell):Cell[]=>[r,...r.children.flatMap(all)];
function fixture(programs:CodeProgram[]=[]){const parent=new Cell(),host:CodeBuilderHost={programs,run:vi.fn(),stop:vi.fn(),running:()=>false,giveHeldToAgent:vi.fn(()=>''),save:vi.fn()},closed=vi.fn(),ui=new CodeBuilderScreen(parent as unknown as HTMLElement,host,closed);ui.show();return{parent,host,closed,ui};}
const button=(r:Cell,text:string)=>all(r).find(c=>c.textContent===text)!;
const field=(r:Cell,label:string)=>all(r).find(c=>c.attributes['aria-label']===label)!;
const click=(c:Cell)=>c.dispatchEvent(new Event('click',{bubbles:true}));
const input=(c:Cell,value:string)=>{c.value=value;c.dispatchEvent(new Event('input',{bubbles:true}));};
const change=(c:Cell,value:string)=>{c.value=value;c.dispatchEvent(new Event('change',{bubbles:true}));};
const open=(r:Cell)=>click(button(r,'Create program from code'));
const oldProgram=():CodeProgram=>({name:'Old finite program',trigger:{type:'chat',command:'old'},blocks:[{type:'command',cmd:{op:'turn',side:'left'}}]});
beforeEach(()=>{active=null;htmlWrites=0;vi.stubGlobal('document',{createElement:()=>new Cell()});vi.stubGlobal('Option',class extends Cell{constructor(text:string,value:string){super();this.textContent=text;this.value=value;}});});
afterEach(()=>vi.unstubAllGlobals());
it('conversion creates and selects a new validated program, preserves old object/bytes, saves once and requires a separate Run',()=>{
 const previous=oldProgram(),bytes=JSON.stringify(previous),{parent,host,closed}=fixture([previous]);open(parent);input(field(parent,'Source code'),'agent.setSlot(1); agent.place(UP);');input(field(parent,'New program name'),'Finite conversion');click(button(parent,'Create block program'));
 expect(host.programs).toHaveLength(2);expect(host.programs[0]).toBe(previous);expect(JSON.stringify(previous)).toBe(bytes);expect(host.programs[1]).toEqual({name:'Finite conversion',trigger:{type:'run'},blocks:[{type:'command',cmd:{op:'select',slot:0}},{type:'command',cmd:{op:'place',dir:'up'}}]});expect(host.save).toHaveBeenCalledTimes(1);expect(host.run).not.toHaveBeenCalled();expect(host.stop).not.toHaveBeenCalled();expect(host.giveHeldToAgent).not.toHaveBeenCalled();expect(closed).not.toHaveBeenCalled();expect(active).toBe(field(parent,'Program name'));expect(field(parent,'Program name').value).toBe('Finite conversion');expect(host.programs[1]).not.toHaveProperty('source');expect(host.programs[1]).not.toHaveProperty('language');click(button(parent,'▶ Run'));expect(host.run).toHaveBeenCalledWith(host.programs[1]);expect(host.programs).toHaveLength(2);expect(closed).toHaveBeenCalledTimes(1);
});
it('a malformed tail keeps exact draft, selects its source range and leaves programs/owners/callbacks unchanged',()=>{
 const previous=oldProgram(),{parent,host}=fixture([previous]),bytes=JSON.stringify(host.programs);open(parent);const text='agent.place(UP);\nfetch("bad");';input(field(parent,'Source code'),text);click(button(parent,'Create block program'));const source=field(parent,'Source code');expect(source.value).toBe(text);expect(source.attributes['aria-invalid']).toBe('true');expect(source.selectionStart).toBe(text.indexOf('fetch'));expect(source.selectionEnd).toBe(text.indexOf('fetch')+5);expect(active).toBe(source);expect(all(parent).find(c=>c.attributes.role==='alert')!.textContent).toContain('Line 2, column 1');expect(all(parent).find(c=>c.attributes.role==='alert')!.scrolledIntoView).toBe(true);expect(JSON.stringify(host.programs)).toBe(bytes);expect(host.programs[0]).toBe(previous);expect(host.save).not.toHaveBeenCalled();expect(host.run).not.toHaveBeenCalled();expect(host.giveHeldToAgent).not.toHaveBeenCalled();
});
it.each(['','// no commands','agent.move(FORWARD,0);','for(let edge=0;edge<0;edge++){agent.place(UP);}','if(agent.detect(AgentDetection.Block,UP)){}'])('empty conversion does not save or create any program: %s',text=>{
 const{parent,host}=fixture();open(parent);input(field(parent,'Source code'),text);click(button(parent,'Create block program'));expect(host.programs).toEqual([]);expect(host.save).not.toHaveBeenCalled();expect(host.run).not.toHaveBeenCalled();expect(field(parent,'Source code').value).toBe(text);expect(all(parent).find(c=>c.attributes.role==='alert')!.textContent).toContain('at least one supported Agent command');
});
it('per-language invalid drafts/names/diagnostics survive switching, Back, and builder close/reopen without any save',()=>{
 const{parent,host,ui}=fixture([oldProgram()]);open(parent);const js='agent.move(FORWARD, steps);';input(field(parent,'Source code'),js);input(field(parent,'New program name'),'JS draft');click(button(parent,'Create block program'));change(field(parent,'Code language'),'python');input(field(parent,'Source code'),'agent.place(UP)\n# python draft');input(field(parent,'New program name'),'Python draft');click(button(parent,'Back to blocks'));expect(host.save).not.toHaveBeenCalled();open(parent);expect(field(parent,'Source code').value).toBe('agent.place(UP)\n# python draft');expect(field(parent,'New program name').value).toBe('Python draft');change(field(parent,'Code language'),'javascript');expect(field(parent,'Source code').value).toBe(js);expect(field(parent,'New program name').value).toBe('JS draft');expect(all(parent).find(c=>c.attributes.role==='alert')!.textContent).toContain('Line 1');ui.hide();ui.show();open(parent);expect(field(parent,'Source code').value).toBe(js);expect(host.programs).toHaveLength(1);expect(host.save).not.toHaveBeenCalled();expect(host.run).not.toHaveBeenCalled();
});
it('canceling valid text leaves an unsaved block draft intact; successful conversion then preserves both programs with one save',()=>{
 const{parent,host}=fixture();click(all(parent).find(c=>c.dataset.palette==='place')!);open(parent);input(field(parent,'Source code'),'agent.turn(LEFT_TURN);');click(button(parent,'Back to blocks'));expect(host.programs).toEqual([]);expect(host.save).not.toHaveBeenCalled();expect(all(parent).some(c=>c.dataset.type==='place')).toBe(true);open(parent);click(button(parent,'Create block program'));expect(host.programs).toHaveLength(2);expect(host.programs[0]).toMatchObject({name:'My program',blocks:[{type:'command',cmd:{op:'place'}}]});expect(host.programs[1].blocks).toEqual([{type:'command',cmd:{op:'turn',side:'left'}}]);expect(host.save).toHaveBeenCalledTimes(1);expect(host.run).not.toHaveBeenCalled();
});
it('compiles first and refuses valid conversion when current unsaved block metadata is invalid, preserving the repair path and text',()=>{
 const{parent,host}=fixture();click(all(parent).find(c=>c.dataset.palette==='place')!);change(field(parent,'Chat command'),'$bad');open(parent);input(field(parent,'Source code'),'agent.turn(LEFT_TURN);');click(button(parent,'Create block program'));expect(host.programs).toEqual([]);expect(host.save).not.toHaveBeenCalled();expect(host.run).not.toHaveBeenCalled();expect(active).toBe(button(parent,'Back to blocks'));expect(all(parent).find(c=>c.attributes.role==='alert')!.textContent).toContain('current block program needs repair');expect(field(parent,'Source code').value).toBe('agent.turn(LEFT_TURN);');click(button(parent,'Back to blocks'));expect(field(parent,'Chat command').value).toBe('$bad');expect(all(parent).some(c=>c.dataset.type==='place')).toBe(true);
});
it('source is plaintext, never HTML; oversized valid prefixes with unsupported tails remain intact and never convert',()=>{
 const{parent,host}=fixture([oldProgram()]);open(parent);const xss='<img src=x onerror="globalThis.compromised=1">';input(field(parent,'Source code'),xss);click(button(parent,'Create block program'));expect(field(parent,'Source code').value).toBe(xss);expect(htmlWrites).toBe(0);const long='agent.place(UP);\n//'+'a'.repeat(17000)+'\nfetch("unsupported tail");';input(field(parent,'Source code'),long);click(button(parent,'Create block program'));expect(field(parent,'Source code').value).toBe(long);expect(field(parent,'Source code').attributes).not.toHaveProperty('maxlength');expect(all(parent).find(c=>c.attributes.role==='alert')!.textContent).toContain('16384 UTF-8 bytes');expect(host.programs).toHaveLength(1);expect(host.save).not.toHaveBeenCalled();expect(host.run).not.toHaveBeenCalled();
});
it('all input keyboard phases stop at the import panel while text/newlines remain normal and legacy block mode is not globally shielded',()=>{
 const{parent}=fixture();const windowKey=vi.fn();parent.addEventListener('keydown',windowKey);parent.addEventListener('keyup',windowKey);parent.addEventListener('keypress',windowKey);open(parent);for(const type of['keydown','keyup','keypress'])for(const key of['w','a','s','d','k','e','/','Escape','Enter']){const event=Object.assign(new Event(type,{bubbles:true,cancelable:true}),{key});field(parent,'Source code').dispatchEvent(event);expect(event.defaultPrevented).toBe(false);}expect(windowKey).not.toHaveBeenCalled();click(button(parent,'Back to blocks'));field(parent,'Program name').dispatchEvent(new Event('keyup',{bubbles:true}));expect(windowKey).toHaveBeenCalledTimes(1);
});
it('invalid conversion metadata focuses the name field without mutating programs or dropping code',()=>{
 const{parent,host}=fixture([oldProgram()]);open(parent);input(field(parent,'Source code'),'agent.place(UP);');input(field(parent,'New program name'),'x'.repeat(81));click(button(parent,'Create block program'));expect(active).toBe(field(parent,'New program name'));expect(field(parent,'New program name').attributes['aria-invalid']).toBe('true');expect(field(parent,'Source code').value).toBe('agent.place(UP);');expect(host.programs).toHaveLength(1);expect(host.save).not.toHaveBeenCalled();
});
it('hidden import panel releases keyboard propagation so gameplay can reopen Code Builder without losing drafts',()=>{
 const{parent,ui}=fixture([oldProgram()]);open(parent);const source=field(parent,'Source code');input(source,'agent.move(FORWARD, steps);');const gameplayKey=vi.fn();parent.addEventListener('keydown',gameplayKey);ui.hide();source.dispatchEvent(Object.assign(new Event('keydown',{bubbles:true}),{code:'KeyK'}));expect(gameplayKey).toHaveBeenCalledTimes(1);ui.show();open(parent);expect(field(parent,'Source code').value).toBe('agent.move(FORWARD, steps);');
});
