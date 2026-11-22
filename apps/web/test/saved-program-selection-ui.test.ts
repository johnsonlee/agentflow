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

import {ProgramRunner} from "@craft/engine";
it("actual select uses safe duplicate labels, commits older edits, preserves newer AST and never runs or stops",()=>{const old=oldProgram(),newer={...oldProgram(),name:old.name},originalNew=JSON.stringify(newer),{parent,host}=fixture([old,newer]);const picker=field(parent,"Saved program or draft");expect(picker.children.map(c=>c.textContent)).toEqual(["1. Old finite program (1 block)","2. Old finite program (1 block)"]);change(picker,"saved:0");change(field(parent,"Program name"),"<img src=x onerror=bad>");change(field(parent,"Turn side"),"right");change(field(parent,"Saved program or draft"),"saved:1");expect(host.programs[0].name).toBe("<img src=x onerror=bad>");expect(host.programs[0].blocks).toEqual([{type:"command",cmd:{op:"turn",side:"right"}}]);expect(JSON.stringify(newer)).toBe(originalNew);expect(field(parent,"Program name").value).toBe(newer.name);expect(host.run).not.toHaveBeenCalled();expect(host.stop).not.toHaveBeenCalled();expect(host.giveHeldToAgent).not.toHaveBeenCalled();expect(htmlWrites).toBe(0);expect(active).toBe(field(parent,"Saved program or draft"));});
it("actual edit and Save program leave already-active runner commands unchanged until explicit Run",()=>{const saved=oldProgram(),runner=new ProgramRunner(saved),bytes=JSON.stringify(saved),{parent,host}=fixture([saved]);change(field(parent,"Turn side"),"right");expect(JSON.stringify(saved)).toBe(bytes);click(button(parent,"Save program"));expect(host.programs[0]).not.toBe(saved);expect(runner.next()).toEqual({op:"turn",side:"left"});expect(host.run).not.toHaveBeenCalled();click(button(parent,"▶ Run"));expect(host.run).toHaveBeenCalledWith(host.programs[0]);expect(host.programs[0].blocks).toEqual([{type:"command",cmd:{op:"turn",side:"right"}}]);});
it("invalid selection keeps exact private edits through close/reopen and leaves authoritative objects untouched",()=>{const previous=oldProgram(),next={...oldProgram(),name:"Next"},{parent,host,ui}=fixture([previous,next]),bytes=JSON.stringify(host.programs);change(field(parent,"Chat command"),"$bad");change(field(parent,"Saved program or draft"),"saved:0");expect(field(parent,"Chat command").value).toBe("$bad");expect(JSON.stringify(host.programs)).toBe(bytes);expect(host.save).not.toHaveBeenCalled();expect(host.run).not.toHaveBeenCalled();expect(all(parent).some(c=>c.textContent.includes("invalid uncommitted edits"))).toBe(true);ui.hide();ui.show();expect(field(parent,"Chat command").value).toBe("$bad");change(field(parent,"Chat command"),"fixed");change(field(parent,"Saved program or draft"),"saved:0");expect(host.programs[1].trigger).toEqual({type:"chat",command:"fixed"});expect(field(parent,"Program name").value).toBe(previous.name);});
it("switch resets nested palette destination and drag selection; new blocks belong only to newly selected program",()=>{const previous=oldProgram(),next={...oldProgram(),name:"Next"},{parent,host}=fixture([previous,next]);click(all(parent).find(c=>c.dataset.palette==="repeat")!);change(field(parent,"Saved program or draft"),"saved:0");click(all(parent).find(c=>c.dataset.palette==="place")!);change(field(parent,"Saved program or draft"),"saved:1");expect(host.programs[0].blocks.map(b=>b.type)).toEqual(["command","command"]);expect(host.programs[1].blocks.map(b=>b.type)).toEqual(["command","repeat"]);});
