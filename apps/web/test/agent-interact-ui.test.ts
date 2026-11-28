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
it('actual interact palette and direction edit checkpoint/cold do not Run or mutate old program',()=>{const old=oldProgram(),before=JSON.stringify(old),{parent,host,ui}=fixture([old]);const palette=all(parent).find(c=>c.dataset.palette==='interact')!;expect(palette.textContent).toBe('interact (wooden door)');click(palette);change(field(parent,'Direction'),'up');expect(host.run).not.toHaveBeenCalled();expect(host.save).not.toHaveBeenCalled();expect(JSON.stringify(old)).toBe(before);const checkpoint=ui.prepareProgramSnapshot();expect(checkpoint.ok).toBe(true);if(!checkpoint.ok)return;expect(checkpoint.programs[0].blocks).toEqual([...old.blocks,{type:'command',cmd:{op:'interact',dir:'up'}}]);const next=fixture(JSON.parse(JSON.stringify(checkpoint.programs)));expect(all(next.parent).some(c=>c.textContent==='Agent interact (wooden door)')).toBe(true);expect(field(next.parent,'Direction').value).toBe('up');expect(next.host.run).not.toHaveBeenCalled();});
for(const language of ['javascript','python'])it(`actual${language} conversion is inert; only explicit Run dispatches new door program`,()=>{const old=oldProgram(),{parent,host}=fixture([old]);open(parent);change(field(parent,'Code language'),language);input(field(parent,'Source code'),language==='javascript'?'agent.interact(FORWARD);':'agent.interact(FORWARD)');input(field(parent,'New program name'),'Open door');click(button(parent,'Create block program'));expect(host.programs).toHaveLength(2);expect(host.programs[1].blocks).toEqual([{type:'command',cmd:{op:'interact',dir:'forward'}}]);expect(host.programs[0]).toBe(old);expect(host.run).not.toHaveBeenCalled();expect(host.save).toHaveBeenCalledTimes(1);click(button(parent,'▶ Run'));expect(host.run).toHaveBeenCalledTimes(1);expect(host.run).toHaveBeenCalledWith(host.programs[1]);});
