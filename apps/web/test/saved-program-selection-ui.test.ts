import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CodeBuilderScreen, type CodeBuilderHost } from "../src/ui/codeBuilder";
import { type CodeWorkspaceData, type CodeProgram } from "@craft/engine";
let active: Cell | null = null, htmlWrites = 0;
class Cell extends EventTarget {
 children: Cell[]=[]; parent:Cell|null=null; className="";textContent="";hidden=false;value="";placeholder="";id="";disabled=false;draggable=false;type="";min="";max="";
 scrolledIntoView=false; selected=false;
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
function fixture(programs:CodeProgram[]=[],codeWorkspace?:CodeWorkspaceData){const parent=new Cell(),host:CodeBuilderHost={programs,codeWorkspace,run:vi.fn(),stop:vi.fn(),running:()=>false,giveHeldToAgent:vi.fn(()=>''),save:vi.fn()},closed=vi.fn(),ui=new CodeBuilderScreen(parent as unknown as HTMLElement,host,closed);ui.show();return{parent,host,closed,ui};}
const button=(r:Cell,text:string)=>all(r).find(c=>c.textContent===text)!;
const field=(r:Cell,label:string)=>all(r).find(c=>c.attributes['aria-label']===label)!;
const click=(c:Cell)=>c.dispatchEvent(new Event('click',{bubbles:true}));
const input=(c:Cell,value:string)=>{c.value=value;c.dispatchEvent(new Event('input',{bubbles:true}));};
const change=(c:Cell,value:string)=>{c.value=value;c.dispatchEvent(new Event('change',{bubbles:true}));};
const open=(r:Cell)=>click(button(r,'Create program from code'));
const oldProgram=():CodeProgram=>({name:'Old finite program',trigger:{type:'chat',command:'old'},blocks:[{type:'command',cmd:{op:'turn',side:'left'}}]});
beforeEach(()=>{active=null;htmlWrites=0;vi.stubGlobal('document',{createElement:()=>new Cell()});vi.stubGlobal('Option',class extends Cell{constructor(text:string,value:string,_defaultSelected=false,selected=false){super();this.textContent=text;this.value=value;this.selected=selected;}});});
afterEach(()=>vi.unstubAllGlobals());

import {ProgramRunner} from "@craft/engine";
it("actual select uses safe duplicate labels, commits older edits, preserves newer AST and never runs or stops",()=>{const old=oldProgram(),newer={...oldProgram(),name:old.name},originalNew=JSON.stringify(newer),{parent,host}=fixture([old,newer]);const picker=field(parent,"Saved program or draft");expect(picker.children.map(c=>c.textContent)).toEqual(["1. Old finite program (1 block)","2. Old finite program (1 block)"]);change(picker,"saved:0");change(field(parent,"Program name"),"<img src=x onerror=bad>");change(field(parent,"Turn side"),"right");change(field(parent,"Saved program or draft"),"saved:1");expect(host.programs[0].name).toBe("<img src=x onerror=bad>");expect(host.programs[0].blocks).toEqual([{type:"command",cmd:{op:"turn",side:"right"}}]);expect(JSON.stringify(newer)).toBe(originalNew);expect(field(parent,"Program name").value).toBe(newer.name);expect(host.run).not.toHaveBeenCalled();expect(host.stop).not.toHaveBeenCalled();expect(host.giveHeldToAgent).not.toHaveBeenCalled();expect(htmlWrites).toBe(0);expect(active).toBe(field(parent,"Saved program or draft"));});
it("actual edit and Save program leave already-active runner commands unchanged until explicit Run",()=>{const saved=oldProgram(),runner=new ProgramRunner(saved),bytes=JSON.stringify(saved),{parent,host}=fixture([saved]);change(field(parent,"Turn side"),"right");expect(JSON.stringify(saved)).toBe(bytes);click(button(parent,"Save program"));expect(host.programs[0]).not.toBe(saved);expect(runner.next()).toEqual({op:"turn",side:"left"});expect(host.run).not.toHaveBeenCalled();click(button(parent,"▶ Run"));expect(host.run).toHaveBeenCalledWith(host.programs[0]);expect(host.programs[0].blocks).toEqual([{type:"command",cmd:{op:"turn",side:"right"}}]);});
it("invalid selection keeps exact private edits through close/reopen and leaves authoritative objects untouched",()=>{const previous=oldProgram(),next={...oldProgram(),name:"Next"},{parent,host,ui}=fixture([previous,next]),bytes=JSON.stringify(host.programs);change(field(parent,"Chat command"),"$bad");change(field(parent,"Saved program or draft"),"saved:0");expect(field(parent,"Chat command").value).toBe("$bad");expect(JSON.stringify(host.programs)).toBe(bytes);expect(host.save).not.toHaveBeenCalled();expect(host.run).not.toHaveBeenCalled();expect(all(parent).some(c=>c.textContent.includes("invalid uncommitted edits"))).toBe(true);ui.hide();ui.show();expect(field(parent,"Chat command").value).toBe("$bad");change(field(parent,"Chat command"),"fixed");change(field(parent,"Saved program or draft"),"saved:0");expect(host.programs[1].trigger).toEqual({type:"chat",command:"fixed"});expect(field(parent,"Program name").value).toBe(previous.name);});
it("switch resets nested palette destination and drag selection; new blocks belong only to newly selected program",()=>{const previous=oldProgram(),next={...oldProgram(),name:"Next"},{parent,host}=fixture([previous,next]);click(all(parent).find(c=>c.dataset.palette==="repeat")!);change(field(parent,"Saved program or draft"),"saved:0");click(all(parent).find(c=>c.dataset.palette==="place")!);change(field(parent,"Saved program or draft"),"saved:1");expect(host.programs[0].blocks.map(b=>b.type)).toEqual(["command","command"]);expect(host.programs[1].blocks.map(b=>b.type)).toEqual(["command","repeat"]);});

it("typed metadata input is already part of private checkpoint before blur and never changes owned AST",()=>{const previous=oldProgram(),{parent,host,ui}=fixture([previous]);input(field(parent,"Program name"),"Typing before autosave");input(field(parent,"Chat command"),"typed");const stage=ui.prepareProgramSnapshot();expect(stage.ok).toBe(true);if(!stage.ok)return;expect(stage.programs[0].name).toBe("Typing before autosave");expect(stage.programs[0].trigger).toEqual({type:"chat",command:"typed"});expect(host.programs[0]).toBe(previous);expect(previous.name).toBe("Old finite program");});
it("invalid typed input refuses selection without requiring blur and repaired input settles status before next touch",()=>{const previous=oldProgram(),next={...oldProgram(),name:"Next"},{parent,host}=fixture([previous,next]);input(field(parent,"Chat command"),"$bad");change(field(parent,"Saved program or draft"),"saved:0");expect(field(parent,"Chat command").value).toBe("$bad");expect(field(parent,"Program name").value).toBe("Next");expect(host.save).not.toHaveBeenCalled();input(field(parent,"Chat command"),"");expect(all(parent).find(c=>c.className==="cb-working-status")!.textContent).not.toContain("invalid");click(all(parent).find(c=>c.dataset.palette==="turn")!);expect(all(parent).filter(c=>c.attributes["aria-label"]==="Turn side")).toHaveLength(2);});


it("both source drafts and invalid names survive a checkpoint and cold UI without compilation or execution",()=>{
 const {parent,host,ui}=fixture([oldProgram()]);open(parent);
 input(field(parent,"Source code"),'<script>bad()</script>\r\nagent.unsupported(\u0000);');input(field(parent,"New program name"),'n'.repeat(81));
 change(field(parent,"Code language"),"python");input(field(parent,"Source code"),"import missing\n\tbroken(");input(field(parent,"New program name"),"Python repair");
 const stage=ui.prepareProgramSnapshot();expect(stage.ok).toBe(true);if(!stage.ok)return;
 expect(stage.codeWorkspace?.language).toBe("python");expect(stage.codeWorkspace?.drafts.javascript.name).toHaveLength(81);expect(host.run).not.toHaveBeenCalled();expect(host.programs).toEqual([oldProgram()]);
 const cold=fixture(host.programs,stage.codeWorkspace);open(cold.parent);expect(field(cold.parent,"Code language").value).toBe("python");expect(field(cold.parent,"Source code").value).toBe("import missing\n\tbroken(");
 change(field(cold.parent,"Code language"),"javascript");expect(field(cold.parent,"Source code").value).toBe('<script>bad()</script>\r\nagent.unsupported(\u0000);');expect(field(cold.parent,"New program name").value).toHaveLength(81);expect(htmlWrites).toBe(0);expect(cold.host.run).not.toHaveBeenCalled();
});
it("successful draft acknowledgment preserves newer input, oversize falls back without truncation, and repair becomes saveable",()=>{
 const {parent,ui}=fixture();open(parent);input(field(parent,"Source code"),"first saved(");const stage=ui.prepareProgramSnapshot();expect(stage.ok).toBe(true);if(!stage.ok)return;
 input(field(parent,"Source code"),"newer typed(");stage.accept();expect(field(parent,"Source code").value).toBe("newer typed(");
 input(field(parent,"Source code"),'x'.repeat(65537));const fallback=ui.prepareProgramSnapshot();expect(fallback.ok).toBe(true);if(!fallback.ok)return;
 expect(fallback.codeWorkspace?.drafts.javascript.source).toBe("first saved(");expect(fallback.warning).toContain("storage limits");expect(field(parent,"Source code").value).toHaveLength(65537);expect(ui.uncommittedProgramIssue()).toContain("Shorten or copy");
 input(field(parent,"Source code"),"repaired draft(");const fixed=ui.prepareProgramSnapshot();expect(fixed.ok).toBe(true);if(fixed.ok){expect(fixed.warning).toBe("");expect(fixed.codeWorkspace?.drafts.javascript.source).toBe("repaired draft(");}
});
it("an untouched default workspace stays absent but explicit language selection is a cold-restorable edit",()=>{
 const {parent,ui}=fixture();let stage=ui.prepareProgramSnapshot();expect(stage.ok&&stage.codeWorkspace).toBeUndefined();open(parent);change(field(parent,"Code language"),"python");stage=ui.prepareProgramSnapshot();expect(stage.ok&&stage.codeWorkspace?.language).toBe("python");
});
