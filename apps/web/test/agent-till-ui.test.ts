import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CodeBuilderScreen, type CodeBuilderHost } from "../src/ui/codeBuilder";
import type { CodeProgram } from "@craft/engine";
let active: Cell | null = null, htmlWrites = 0;
class Cell extends EventTarget {
 selected=false;
 children: Cell[]=[]; parent:Cell|null=null; className="";textContent="";hidden=false;value="";placeholder="";id="";disabled=false;draggable=false;type="";min="";max="";
 scrolledIntoView=false;
 scrollIntoView(){this.scrolledIntoView=true;}
 dataset:Record<string,string>={};attributes:Record<string,string>={};selectionStart=0;selectionEnd=0;
 append(...cells:Cell[]){for(const c of cells){this.children.push(c);c.parent=this;if(c.selected)this.value=c.value;}}
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
beforeEach(()=>{active=null;htmlWrites=0;vi.stubGlobal('document',{createElement:()=>new Cell()});vi.stubGlobal('Option',class extends Cell{constructor(text:string,value:string,_defaultSelected=false,selected=false){super();this.textContent=text;this.value=value;this.selected=selected;}});});
afterEach(()=>vi.unstubAllGlobals());
it('actual till palette/direction handlers stage genuine till without Run, checkpoint/cold retains old program',()=>{const old=oldProgram(),bytes=JSON.stringify(old),{parent,host,ui}=fixture([old]);const palette=all(parent).find(c=>c.dataset.palette==='till')!;expect(palette.textContent).toBe('till soil');click(palette);change(field(parent,'Direction'),'down');expect(host.run).not.toHaveBeenCalled();expect(host.save).not.toHaveBeenCalled();expect(JSON.stringify(old)).toBe(bytes);const stage=ui.prepareProgramSnapshot();expect(stage.ok).toBe(true);if(!stage.ok)return;expect(stage.programs[0].blocks).toEqual([{type:'command',cmd:{op:'turn',side:'left'}},{type:'command',cmd:{op:'till',dir:'down'}}]);expect(stage.programs[0]).not.toBe(old);const cold=JSON.parse(JSON.stringify(stage.programs))as CodeProgram[],next=fixture(cold);expect(all(next.parent).some(c=>c.textContent==='Agent till')).toBe(true);expect(field(next.parent,'Direction').value).toBe('down');expect(host.run).not.toHaveBeenCalled();});
for(const lang of['javascript','python'])it(`actual ${lang} till conversion creates separate validated AST without Run`,()=>{const old=oldProgram(),bytes=JSON.stringify(old),{parent,host}=fixture([old]);open(parent);change(field(parent,'Code language'),lang);input(field(parent,'Source code'),lang==='javascript'?'agent.till(DOWN);':'agent.till(DOWN)');input(field(parent,'New program name'),'Till crop soil');click(button(parent,'Create block program'));expect(host.programs).toHaveLength(2);expect(host.programs[1].blocks).toEqual([{type:'command',cmd:{op:'till',dir:'down'}}]);expect(host.programs[0]).toBe(old);expect(JSON.stringify(old)).toBe(bytes);expect(host.save).toHaveBeenCalledTimes(1);expect(host.run).not.toHaveBeenCalled();});
