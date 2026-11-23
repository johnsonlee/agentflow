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
it('actual Transfer block exposes distinct quantity/source/destination handlers and stages inert AST',()=>{const old=oldProgram(),bytes=JSON.stringify(old),{parent,host,ui}=fixture([old]);click(all(parent).find(c=>c.dataset.palette==='transfer')!);expect(field(parent,'Quantity').value).toBe('5');expect(field(parent,'Source slot').value).toBe('5');expect(field(parent,'Destination slot').value).toBe('1');for(const[aria,visible]of[['Quantity','Quantity'],['Source slot','From slot'],['Destination slot','To slot']]){const control=field(parent,aria);expect(control.parent!.tagName).toBe('LABEL');expect(control.parent!.className).toContain('cb-transfer-field');expect(control.parent!.children[0].textContent).toBe(visible);expect(control.className).toContain('cb-transfer-number');expect(all(parent).filter(c=>c.attributes['aria-label']===aria)).toHaveLength(1);}change(field(parent,'Quantity'),'3');change(field(parent,'Source slot'),'27');change(field(parent,'Destination slot'),'2');const stage=ui.prepareProgramSnapshot();expect(stage.ok).toBe(true);if(stage.ok)expect(stage.programs[0].blocks.at(-1)).toEqual({type:'command',cmd:{op:'transfer',quantity:3,sourceSlot:26,destinationSlot:1}});expect(JSON.stringify(old)).toBe(bytes);expect(host.run).not.toHaveBeenCalled();expect(host.save).not.toHaveBeenCalled();});
for(const value of['','0','1.5','9007199254740992'])it(`actual invalid transfer Quantity${value} remains diagnosable and snapshot refuses`,()=>{const{parent,ui,host}=fixture([oldProgram()]);click(all(parent).find(c=>c.dataset.palette==='transfer')!);change(field(parent,'Quantity'),value);const stage=ui.prepareProgramSnapshot();expect(stage.ok).toBe(true);if(stage.ok){expect(stage.warning).toBeTruthy();expect(stage.programs).toEqual([oldProgram()]);}expect(ui.uncommittedProgramIssue()).toBeTruthy();click(button(parent,'▶ Run'));expect(host.run).not.toHaveBeenCalled();expect(host.save).not.toHaveBeenCalled();});
for(const lang of['javascript','python'])it(`actual ${lang} transfer conversion stages new program withoutautorun`,()=>{const{parent,host}=fixture([oldProgram()]);open(parent);change(field(parent,'Code language'),lang);input(field(parent,'Source code'),lang==='javascript'?'agent.transfer(5,5,1);':'agent.transfer(5,5,1)');input(field(parent,'New program name'),'Transfer owned cargo');click(button(parent,'Create block program'));expect(host.programs).toHaveLength(2);expect(host.programs[1].blocks).toEqual([{type:'command',cmd:{op:'transfer',quantity:5,sourceSlot:4,destinationSlot:0}}]);expect(host.save).toHaveBeenCalledTimes(1);expect(host.run).not.toHaveBeenCalled();});
