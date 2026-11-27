import {readNpcActionField,readNpcActions,npcActionRows,compileNpcCommand,NPC_MAX_BUTTONS,type NpcActions,type NpcTrigger,type Mob} from '@craft/engine';
import type {NpcActionSession} from '../application/npcActionSession';
function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text=''):HTMLElementTagNameMap[K]{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;}
export interface NpcEdit{name:string;dialogue:string;npcActions?:NpcActions}
type Row={kind:'url'|'command';trigger:NpcTrigger;label:string;url:string;command:string};
/** Local Creative authoring is app policy, not native World Builder authorization. */
export class NpcDialog{
 readonly root=el('div','screen npc-screen');private panel=el('div','panel npc-panel');
 private generation=0;private listeners:Array<()=>void>=[];private refresh:()=>void=()=>{};
 constructor(container:HTMLElement,private onClose:()=>void,private onSave:(mob:Mob,draft:NpcEdit)=>boolean){this.root.hidden=true;this.root.append(this.panel);container.append(this.root);}
 get open():boolean{return !this.root.hidden;}
 private listen(target:HTMLElement,type:string,fn:EventListener,scope=this.listeners):void{target.addEventListener(type,fn);scope.push(()=>target.removeEventListener(type,fn));}
 updateActions():void{this.refresh();}
 show(mob:Mob,editable:boolean,current:()=>boolean=()=>false,runtime?:NpcActionSession):void{
  this.hide();const generation=this.generation,actions=readNpcActionField(mob);
  const active=()=>generation===this.generation&&this.open&&current();
  const original=actions.kind==='valid'?JSON.stringify(actions.data):'';
  const same=()=>{try{if(!active())return false;const now=readNpcActionField(mob);return active()&&now.kind==='valid'&&JSON.stringify(now.data)===original;}catch{return false;}};
  const status=el('p','npc-error');status.setAttribute('role','status');
  const parts:HTMLElement[]=[el('h2','',mob.name??'NPC'),el('p','npc-text',mob.dialogue??'')];
  const rows=(actions.kind==='valid'?npcActionRows(actions.data):[]);
  const guardedLink=(label:string,url:string,activate:()=>boolean,scope=this.listeners,available:()=>boolean=()=>true)=>{
   const link=el('a','npc-url',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.title=`${url} (opens in a new tab)`;
   let pointer:{id:number;type:string}|null=null;
   const guard=(event:Event)=>{
    try{
     if(same()){
      if(!available()){pointer=null;event.preventDefault();status.textContent='Another NPC phase is in progress.';return;}
      const p=event as PointerEvent;
      if(event.type==='pointerdown'){pointer=typeof p.pointerId==='number'&&p.pointerId>=0&&!!p.pointerType?{id:p.pointerId,type:p.pointerType}:null;return;}
      if(event.type==='pointercancel'){pointer=null;return;}
      if(event.type==='click'||event.type==='auxclick'){
       const pointing=typeof p.pointerType==='string'?!!p.pointerType:(p.detail??0)>0;
       if(pointing&&(!pointer||typeof p.pointerId==='number'&&pointer.id!==p.pointerId||typeof p.pointerType==='string'&&pointer.type!==p.pointerType)){event.preventDefault();return;}
       pointer=null;if(!activate()){event.preventDefault();status.textContent='This NPC action is unavailable.';}return;
      }
      return;
     }
    }catch{/* No stale/invalid default external navigation. */}
    pointer=null;event.preventDefault();link.removeAttribute('href');status.textContent='This NPC interaction is no longer active. Close and talk again.';
   };
   for(const name of['pointerdown','pointercancel','click','auxclick','mousedown','keydown','contextmenu'])this.listen(link,name,guard,scope);
   return link;
  };
  const commandButton=(button:HTMLButtonElement,activate:()=>void)=>{
   let pointer:{id:number;type:string}|null=null;
   this.listen(button,'pointerdown',e=>{const p=e as PointerEvent;pointer=typeof p.pointerId==='number'&&p.pointerId>=0&&!!p.pointerType?{id:p.pointerId,type:p.pointerType}:null;});
   this.listen(button,'pointercancel',()=>{pointer=null;});
   this.listen(button,'click',e=>{const p=e as PointerEvent,pointing=typeof p.pointerType==='string'?!!p.pointerType:(p.detail??0)>0;
    if(pointing&&(!pointer||typeof p.pointerId==='number'&&pointer.id!==p.pointerId||typeof p.pointerType==='string'&&pointer.type!==p.pointerType)){e.preventDefault();return;}
    pointer=null;if(same())activate();else e.preventDefault();
   });
  };
  if(actions.kind==='invalid')parts.push(el('p','npc-error','NPC actions need repair. Export the original world backup.'));
  else{
   const buttons=el('div','npc-links'),waiting=el('div','npc-pending-action'),pendingListeners:Array<()=>void>=[];
   const clearPending=()=>{for(const f of pendingListeners)f();pendingListeners.length=0;for(const a of waiting.querySelectorAll('a'))a.removeAttribute('href');};this.listeners.push(clearPending);
   rows.forEach((action,index)=>{
    if(action.trigger!=='button')return;
    if(action.kind==='url')buttons.append(guardedLink(action.label,action.url,()=>runtime?runtime.activateButtonLink(index):true,this.listeners,()=>!runtime||runtime.state==='ready'));
    else{const b=el('button','mc-button',action.label);b.disabled=!runtime;commandButton(b,()=>{runtime?.start('button',index);});buttons.append(b);}
   });
   this.refresh=()=>{
    if(!runtime)return;try{if(!active())return;}catch{return;}
    status.textContent=runtime?.message??'';clearPending();waiting.replaceChildren();
    for(const b of buttons.querySelectorAll('button'))b.disabled=!runtime||runtime.state!=='ready';
    const pending=runtime?.pending,index=runtime?.pendingIndex;
    if(pending&&index!==null&&index!==undefined){
     const skip=el('button','mc-button','Skip remaining actions');this.listen(skip,'click',()=>{if(same())runtime!.skipLink();},pendingListeners);
     waiting.append(el('p','hint',`External link: ${pending.url}`),guardedLink(`Open link: ${pending.label}`,pending.url,()=>runtime!.confirmLink(index),pendingListeners,()=>runtime!.state==='link'&&runtime!.pendingIndex===index),skip);
    }
   };
   parts.push(buttons,waiting,el('p','hint','Links open only when clicked. Automatic link actions wait for your choice.'));
   if(editable){
    const name=el('input','mc-input');name.value=mob.name??'';name.setAttribute('aria-label','NPC name');
    const dialogue=el('textarea','mc-input npc-edit');dialogue.value=mob.dialogue??'';dialogue.setAttribute('aria-label','NPC dialogue');
    const field=(label:string,input:HTMLElement)=>{const f=el('label','field');f.append(el('span','',label),input);return f;};
    let draftRows:Row[]=rows.map(a=>({kind:a.kind,trigger:a.trigger,label:a.label,url:a.kind==='url'?a.url:'',command:a.kind==='command'?a.command:''}));
    let promote=actions.kind==='valid'&&actions.data.version===2;
    const editor=el('div','npc-action-editor'),addURL=el('button','mc-button','Add URL'),addCommand=el('button','mc-button','Add command');
    const editListeners:Array<()=>void>=[];const clearEdit=()=>{for(const f of editListeners)f();editListeners.length=0;};this.listeners.push(clearEdit);const listenEdit=(node:HTMLElement,type:string,fn:EventListener)=>this.listen(node,type,fn,editListeners);
    const render=()=>{
     clearEdit();editor.replaceChildren();draftRows.forEach((row,index)=>{
      const prefix=row.kind==='url'?'URL button':'Command action',group=el('fieldset','npc-action-row');group.append(el('legend','',`${prefix} ${index+1}`));
      const caption=el('input','mc-input');caption.value=row.label;caption.setAttribute('aria-label',`${prefix} ${index+1} label`);
      const payload=el('input','mc-input');payload.value=row.kind==='url'?row.url:row.command;payload.type=row.kind==='url'?'url':'text';payload.placeholder=row.kind==='url'?'https://…':'/give camera 1';payload.setAttribute('aria-label',`${prefix} ${index+1} ${row.kind==='url'?'address':'command'}`);
      const trigger=el('select','mc-input');trigger.setAttribute('aria-label',`${prefix} ${index+1} trigger`);
      for(const v of['button','enter','exit']as const){const o=el('option','',v==='button'?'Button':v==='enter'?'On conversation enter':'On explicit close');o.value=v;trigger.append(o);}trigger.value=row.trigger;
      listenEdit(caption,'input',()=>{row.label=caption.value;});listenEdit(payload,'input',()=>{if(row.kind==='url')row.url=payload.value;else row.command=payload.value;});listenEdit(trigger,'change',()=>{row.trigger=trigger.value as NpcTrigger;promote=true;});
      const controls=el('div','npc-action-controls');
      for(const[text,offset]of[['Move up',-1],['Move down',1]]as const){const b=el('button','mc-button',text);b.setAttribute('aria-label',`${text} ${prefix} ${index+1}`);b.disabled=index+offset<0||index+offset>=draftRows.length;listenEdit(b,'click',()=>{if(!active())return;[draftRows[index],draftRows[index+offset]]=[draftRows[index+offset],draftRows[index]];render();});controls.append(b);}
      const remove=el('button','mc-button','Remove');remove.setAttribute('aria-label',`Remove ${prefix} ${index+1}`);listenEdit(remove,'click',()=>{if(active()){draftRows.splice(index,1);render();}});controls.append(remove);
      group.append(field('Button label (1–12 characters)',caption),field(row.kind==='url'?'Web address':'Local command',payload),field('When',trigger),controls);editor.append(group);
     });addURL.disabled=addCommand.disabled=draftRows.length>=NPC_MAX_BUTTONS;
    };
    for(const[kind,add]of[['url',addURL],['command',addCommand]]as const)this.listen(add,'click',()=>{if(!active()||draftRows.length>=NPC_MAX_BUTTONS)return;if(kind==='command')promote=true;draftRows.push({kind,trigger:'button',label:'',url:'',command:''});render();});render();
    const save=el('button','mc-button primary','Save');this.listen(save,'click',()=>{
     if(!active()){status.textContent='This NPC interaction is no longer active. Close and talk again.';return;}
     if(draftRows.some(r=>r.kind==='command'&&!compileNpcCommand(r.command).ok)){status.textContent='Unsupported NPC command. Use the listed local forms; no command was run.';return;}
     const raw=promote?{version:2,actions:draftRows.map(r=>r.kind==='url'?{kind:r.kind,trigger:r.trigger,label:r.label.trim(),url:r.url.trim()}:{kind:r.kind,trigger:r.trigger,label:r.label.trim(),command:r.command})}:{version:1,buttons:draftRows.map(r=>({kind:'url',label:r.label.trim(),url:r.url.trim()}))};
     const parsed=readNpcActions(raw);if(parsed.kind!=='valid'||name.value.trim().length>64||dialogue.value.length>2000){status.textContent='Use valid labels, local commands and absolute http:// or https:// addresses without spaces or sign-in credentials. Nothing was saved.';return;}
     const nonempty=parsed.data.version===1?parsed.data.buttons.length:parsed.data.actions.length;
     if(this.onSave(mob,{name:name.value.trim()||'NPC',dialogue:dialogue.value,...(nonempty?{npcActions:parsed.data}:{})}))this.onClose();else status.textContent='The NPC could not be updated. Close and talk again.';
    });
    parts.push(field('Name',name),field('Dialogue',dialogue),el('h3','','Ordered NPC actions'),editor,addURL,addCommand,el('p','hint','Local Creative authoring, not native World Builder authority. Six entries; one command each. Supported: /give item count, /time set value, /gamerule rule true|false, /effect @s …, /seed, /help. Enter/close links require a click.'),save);
   }
  }
  const close=el('button','mc-button','Close');this.listen(close,'click',()=>{if(generation===this.generation&&this.open)this.onClose();});parts.push(status,close);
  this.panel.replaceChildren(...parts);this.root.hidden=false;this.panel.scrollTop=0;
  this.panel.onkeydown=e=>{e.stopPropagation();if(e.code==='Escape'&&generation===this.generation&&this.open){e.preventDefault();this.onClose();}};
  this.refresh();
 }
 hide():void{this.generation++;this.root.hidden=true;this.refresh=()=>{};for(const f of this.listeners)f();this.listeners=[];for(const a of this.panel.querySelectorAll('a'))a.removeAttribute('href');this.panel.replaceChildren();this.panel.onkeydown=null;}
}
