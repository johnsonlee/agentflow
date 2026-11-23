import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CodeBuilderScreen, type CodeBuilderHost } from "../src/ui/codeBuilder";
import type { CodeProgram } from "@craft/engine";
let active: Cell | null = null, htmlWrites = 0;
class Cell extends EventTarget {
 tagName="";selected=false;
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
beforeEach(()=>{active=null;htmlWrites=0;vi.stubGlobal('document',{createElement:(tag:string)=>Object.assign(new Cell(),{tagName:tag.toUpperCase()})});vi.stubGlobal('Option',class extends Cell{constructor(text:string,value:string,_defaultSelected=false,selected=false){super();this.textContent=text;this.value=value;this.selected=selected;}});});
afterEach(()=>vi.unstubAllGlobals());

it('actual count controls stage exact own AST and editable then/else zones inertly',()=>{const {parent,host,ui}=fixture();click(all(parent).find(c=>c.dataset.palette==='if-item-count')!);for(const [aria,label]of[['Count slot','Slot'],['Equals count','Equals']]){const f=field(parent,aria);expect(f.parent!.tagName).toBe('LABEL');expect(f.parent!.children[0].textContent).toBe(label);expect(f.className).toContain('cb-count-number');}change(field(parent,'Count slot'),'27');change(field(parent,'Equals count'),'0');const prepared=ui.prepareProgramSnapshot();expect(prepared.ok).toBe(true);if(prepared.ok)expect(prepared.programs[0].blocks).toEqual([{type:'if-item-count',slot:26,equals:0,then:[],else:[]}]);expect(all(parent).some(c=>c.textContent==='then')).toBe(true);expect(all(parent).some(c=>c.textContent==='else')).toBe(true);expect(host.run).not.toHaveBeenCalled();});
for(const [label,value]of[['Count slot','0'],['Count slot','28'],['Equals count',''],['Equals count','-1'],['Equals count','1.5'],['Equals count','9007199254740992']])it(`actual invalid count edit ${label} ${value} retains last valid and refuses Run`,()=>{const{parent,ui,host}=fixture([oldProgram()]);click(all(parent).find(c=>c.dataset.palette==='if-item-count')!);change(field(parent,label),value);expect(ui.uncommittedProgramIssue()).toBeTruthy();const stage=ui.prepareProgramSnapshot();expect(stage.ok).toBe(true);if(stage.ok){expect(stage.warning).toBeTruthy();expect(stage.programs).toEqual([oldProgram()]);}click(button(parent,'▶ Run'));expect(host.run).not.toHaveBeenCalled();});
for(const lang of['javascript','python'])it(`actual ${lang} nested count conversion remains inert source workspace`,()=>{const{parent,host}=fixture([oldProgram()]);open(parent);change(field(parent,'Code language'),lang);input(field(parent,'Source code'),lang==='javascript'?'if (agent.getItemCount(5) === 5) { agent.transfer(5,5,1); }':'if agent.get_item_count(5) == 5:\n    agent.transfer(5,5,1)');input(field(parent,'New program name'),'Conditional cargo');click(button(parent,'Create block program'));expect(host.programs).toHaveLength(2);expect(host.programs[1].blocks[0]).toMatchObject({type:'if-item-count',slot:4,equals:5});expect(host.save).toHaveBeenCalledTimes(1);expect(host.run).not.toHaveBeenCalled();});
