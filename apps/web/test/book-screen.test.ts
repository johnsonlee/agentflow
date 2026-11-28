import {it,expect,vi,afterEach} from 'vitest';
import {BookScreen,type BookScreenServices} from '../src/ui/bookScreen';
import {itemId} from '@craft/engine';
const selection=vi.hoisted(()=>({pending:null as null|Promise<any>}));
vi.mock('../src/ui/bookPhotoPicker',()=>({prepareBookPhoto:()=>selection.pending}));
type EditorDirection='forward'|'backward'|'none';
type CellDocument={activeElement:NodeCell|null};
class NodeCell{
 hidden=false;children:NodeCell[]=[];parent:NodeCell|null=null;className='';textContent='';disabled=false;maxLength=0;src='';alt='';attrs:Record<string,string>={};
 scrollTop=0;scrollLeft=0;selectionStart:number|null;selectionEnd:number|null;selectionDirection:EditorDirection|null;
 readonly tagName:string;private textValue='';lastFocusOptions:{preventScroll?:boolean}|null=null;listeners:Record<string,Function[]>={};
 constructor(tag='div',private readonly owner:CellDocument={activeElement:null}){this.tagName=tag.toUpperCase();const editor=this.tagName==='INPUT'||this.tagName==='TEXTAREA';this.selectionStart=editor?0:null;this.selectionEnd=editor?0:null;this.selectionDirection=editor?'none':null;}
 get value():string{return this.textValue;}
 set value(value:string){if(value===this.textValue)return;this.textValue=value;if(this.selectionStart!==null){this.selectionStart=value.length;this.selectionEnd=value.length;this.selectionDirection='none';}}
 contains(node:NodeCell|null):boolean{return node!==null&&(this===node||this.children.some(child=>child.contains(node)));}
 private detach(node:NodeCell):void{if(node.parent)node.parent.children=node.parent.children.filter(child=>child!==node);node.parent=null;}
 append(...nodes:NodeCell[]):void{for(const node of nodes){this.detach(node);node.parent=this;this.children.push(node);}}
 appendChild(node:NodeCell):NodeCell{this.append(node);return node;}
 prepend(node:NodeCell):void{this.detach(node);node.parent=this;this.children.unshift(node);}
 replaceChildren(...nodes:NodeCell[]):void{if(this.children.some(child=>child.contains(this.owner.activeElement)))this.owner.activeElement=null;for(const child of this.children)child.parent=null;this.children=[];this.append(...nodes);}
 setAttribute(name:string,value:string):void{if(name==='class')this.className=value;else this.attrs[name]=value;}
 getAttribute(name:string):string|null{if(name==='class')return this.className||null;return Object.prototype.hasOwnProperty.call(this.attrs,name)?this.attrs[name]:null;}
 private matches(selector:string):boolean{
  const attribute=/^\[([\w-]+)(?:=["']([^"']*)["'])?\]$/.exec(selector);
  if(attribute){const value=this.getAttribute(attribute[1]);return value!==null&&(attribute[2]===undefined||value===attribute[2]);}
  const element=/^([a-z][\w-]*)?(?:\.([\w-]+))?$/i.exec(selector);
  if(!element||!element[0])throw Error('Unsupported test DOM selector: '+selector);
  return(!element[1]||this.tagName===element[1].toUpperCase())&&(!element[2]||this.className.split(/\s+/).includes(element[2]));
 }
 querySelectorAll(selector:string):NodeCell[]{const selectors=selector.split(',').map(part=>part.trim()),found:NodeCell[]=[];const walk=(node:NodeCell)=>{for(const child of node.children){if(selectors.some(part=>child.matches(part)))found.push(child);walk(child);}};walk(this);return found;}
 querySelector(selector:string):NodeCell|null{return this.querySelectorAll(selector)[0]??null;}
 setSelectionRange(start:number,end:number,direction:EditorDirection='none'):void{if(this.selectionStart===null)throw new DOMException('Not a text editor','InvalidStateError');const last=Math.min(end>>>0,this.value.length);this.selectionStart=Math.min(start>>>0,last);this.selectionEnd=last;this.selectionDirection=direction;}
 // No layout engine: track focus/options and scroll state without claiming native scroll/viewport behavior.
 focus(options:{preventScroll?:boolean}={}):void{if(this.disabled)return;this.owner.activeElement=this;this.lastFocusOptions={...options};}
 addEventListener(k:string,f:Function){(this.listeners[k]??=[]).push(f);}click(){if(!this.disabled)for(const f of this.listeners.click??[])f({});}
}

function setup(){const dom:CellDocument&{createElement(tag:string):NodeCell}={activeElement:null,createElement:tag=>new NodeCell(tag,dom)};vi.stubGlobal('document',dom);const root=new NodeCell('div',dom),commit=vi.fn<BookScreenServices['commit']>(()=>({ok:true}));let screen:BookScreen;screen=new BookScreen(root as unknown as HTMLElement,()=>{if(screen.userClose())screen.hide();},{photos:()=>[{id:'one',dataUrl:'data:image/jpeg;base64,/9j/2Q==',caption:'Capture',takenAt:'2026-01-01T00:00:00Z'}],current:()=>true,commit});screen.show({id:itemId('book_and_quill'),count:1});const nodes=()=>{const out:NodeCell[]=[];const walk=(n:NodeCell)=>{out.push(n);n.children.forEach(walk);};walk(root);return out;};const find=(text:string)=>nodes().find(n=>n.textContent===text)!;return{screen,commit,find,nodes,dom};}
afterEach(()=>{selection.pending=null;vi.unstubAllGlobals();});
it('explicit Done preserves healthy legacy edits while lifecycle hide never commits',()=>{const {screen,commit,find,nodes}=setup(),text=nodes().find(n=>n.attrs['aria-label']==='Book page')!;text.value='Typed note';text.listeners.input[0]();find('Done').click();expect(commit).toHaveBeenCalledWith({pages:['Typed note']},undefined);expect(screen.open).toBe(false);screen.show({id:itemId('book_and_quill'),count:1});screen.hide();expect(commit).toHaveBeenCalledOnce();});
it('quota/serialization refusal keeps visible detached draft and original owner',()=>{const {screen,commit,find}=setup();commit.mockReturnValue({ok:false,error:'quota'} as any);find('Done').click();expect(screen.open).toBe(true);expect(find('quota')).toBeDefined();});
it('sign locks every photo and exposes no editor or insert action in written book',()=>{const {screen,find,nodes}=setup();screen.show({id:itemId('written_book'),count:1,book:{pages:['Text'],title:'Signed',author:'Player',photoPages:{version:1,entries:[{page:0,dataUrl:'data:image/jpeg;base64,/9j/2Q==',caption:'Owned',takenAt:'2026-01-01T00:00:00Z',sourcePhotoId:'old',width:480,height:360}]}}});expect(find('Signed')).toBeDefined();expect(nodes().some(n=>n.attrs['aria-label']==='Book page')).toBe(false);expect(nodes().some(n=>n.textContent==='Insert photo')).toBe(false);expect(nodes().some(n=>n.alt==='Owned')).toBe(true);});
it('deferred selection is canceled by lifecycle hide and cannot mutate/commit a new owner',async()=>{const {screen,commit,find}=setup();let resolve!:(v:any)=>void;selection.pending=new Promise(r=>resolve=r);find('Insert photo').click();find('Capture').click();screen.hide();screen.show({id:itemId('book_and_quill'),count:1});resolve({page:0,dataUrl:'data:image/jpeg;base64,/9j/2Q==',caption:'stale',takenAt:'2026-01-01T00:00:00Z',sourcePhotoId:'one',width:480,height:360});await Promise.resolve();await Promise.resolve();await Promise.resolve();find('Done').click();expect(commit).toHaveBeenCalledWith({pages:['']},undefined);});
it('explicit close cancels unfinished selection but commits already typed text',()=>{const {screen,commit,find,nodes}=setup();const text=nodes().find(n=>n.attrs['aria-label']==='Book page')!;text.value='Keep text';text.listeners.input[0]();selection.pending=new Promise(()=>{});find('Insert photo').click();find('Capture').click();expect(screen.userClose()).toBe(true);expect(commit).toHaveBeenCalledWith({pages:['Keep text']},undefined);});
it('a stale/refused editor can explicitly discard without attempting another owner mutation',()=>{const {screen,commit,find}=setup();commit.mockReturnValue({ok:false,error:'owner changed'} as any);find('Done').click();expect(screen.open).toBe(true);find('Discard changes').click();expect(screen.open).toBe(false);expect(commit).toHaveBeenCalledOnce();});
it('refused close preserves detached text, caption and active caret for continued editing',()=>{
 const s=setup(),source={id:itemId('book_and_quill'),count:1,book:{pages:['Original'],photoPages:{version:1 as const,entries:[{page:0,dataUrl:'data:image/jpeg;base64,/9j/2Q==',caption:'Original caption',takenAt:'2026-01-01T00:00:00Z',sourcePhotoId:'one',width:480,height:360}]}}},original=JSON.stringify(source);
 s.screen.show(source);const text=s.nodes().find(node=>node.getAttribute('aria-label')==='Book page')!,caption=s.nodes().find(node=>node.getAttribute('aria-label')==='Photo caption')!;
 text.value='Unsaved field note';text.listeners.input[0]();caption.value='Photo caption draft';caption.listeners.input[0]();caption.focus();caption.setSelectionRange(6,13,'backward');
 s.commit.mockReturnValueOnce({ok:false,error:'quota'});expect(s.screen.userClose()).toBe(false);
 const current=s.nodes().find(node=>node.getAttribute('aria-label')==='Photo caption')!;expect(current).not.toBe(caption);expect(s.dom.activeElement).toBe(current);expect([current.selectionStart,current.selectionEnd,current.selectionDirection]).toEqual([6,13,'backward']);expect(current.value).toBe('Photo caption draft');expect(s.nodes().find(node=>node.getAttribute('aria-label')==='Book page')!.value).toBe('Unsaved field note');expect(JSON.stringify(source)).toBe(original);
 current.value=current.value.slice(0,current.selectionStart!)+'notes'+current.value.slice(current.selectionEnd!);current.listeners.input[0]();expect(s.screen.userClose()).toBe(true);expect(s.commit).toHaveBeenLastCalledWith(expect.objectContaining({pages:['Unsaved field note'],photoPages:expect.objectContaining({entries:[expect.objectContaining({caption:'Photo notes draft'})]})}),undefined);expect(JSON.stringify(source)).toBe(original);
});
