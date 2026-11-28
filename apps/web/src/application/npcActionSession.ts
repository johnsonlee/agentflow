import {planNpcPhase,readNpcActions,type NpcActions,type NpcLocalCommand,type NpcStep,type NpcTrigger} from '@craft/engine';
export interface NpcCommandOutcome{ok:boolean;message:string}
export interface NpcActionReceipt{phase:NpcTrigger;index:number;kind:'command'|'url';status:'applied'|'refused'|'cancelled'|'navigation-requested';message:string;before?:unknown;after?:unknown}
export interface NpcSessionHost{current():boolean;dispatch(command:NpcLocalCommand):NpcCommandOutcome;snapshot():unknown;changed():void}
/** One local reader interaction. Import/editor/forced hide never create or finish a phase. */
export class NpcActionSession{
 readonly actions:NpcActions;
 readonly receipts:NpcActionReceipt[]=[];
 state:'ready'|'running'|'link'|'closed'|'cancelled'='ready';
 message='';
 private steps:readonly NpcStep[]=[];private at=0;private phase:NpcTrigger='enter';
 private entered=false;private exiting=false;private epoch=0;
 private deferred=new Set<ReturnType<typeof setTimeout>>();
 private defer(fn:()=>void):void{const id=setTimeout(()=>{this.deferred.delete(id);fn();},0);this.deferred.add(id);}
 constructor(raw:NpcActions,private readonly host:NpcSessionHost){const r=readNpcActions(raw);if(r.kind!=='valid')throw Error('Invalid NPC actions');this.actions=r.data;const list=this.actions.version===1?this.actions.buttons:this.actions.actions;for(const a of list)Object.freeze(a);Object.freeze(list);Object.freeze(this.actions);}
 get pending():Extract<NpcStep['action'],{kind:'url'}>|null{const a=this.steps[this.at]?.action;return this.state==='link'&&a?.kind==='url'?a:null;}
 get pendingIndex():number|null{return this.state==='link'?this.steps[this.at]?.index??null:null;}
 private valid():boolean{try{return this.host.current();}catch{return false;}}
 private changed():void{try{this.host.changed();}catch{this.epoch++;this.state="cancelled";this.message="NPC UI could not be updated; remaining actions cancelled.";}}
 private note(r:NpcActionReceipt):void{this.receipts.push(r);if(this.receipts.length>64)this.receipts.shift();}
 start(trigger:NpcTrigger,index?:number):boolean{
  if(this.state!=='ready'||!this.valid()||trigger==='enter'&&this.entered||trigger==='exit'&&this.exiting)return false;
  if(trigger==='enter')this.entered=true;if(trigger==='exit')this.exiting=true;
  const plan=planNpcPhase(this.actions,trigger,index);this.phase=trigger;
  if(!plan.ok){this.message=plan.message;if(this.exiting)this.state='closed';this.changed();return false;}
  this.steps=Object.freeze(plan.steps.map(step=>{Object.freeze(step.action);if(step.command)Object.freeze(step.command);return Object.freeze(step);}));this.at=0;this.state='running';this.message='';this.pump();return true;
 }
 private pump():void{
  const epoch=this.epoch;
  while(this.state==='running'&&this.at<this.steps.length){
   if(!this.valid()){this.cancel('This NPC interaction is no longer current.');return;}
   const step=this.steps[this.at];
   if(step.action.kind==='url'){this.state='link';this.message='Open this link explicitly, or skip the remaining actions.';this.changed();return;}
   let before:unknown,result:NpcCommandOutcome,after:unknown;
   let observationFailed=false;
   try{before=this.host.snapshot();if(!this.valid())throw Error('Stale NPC interaction');result=this.host.dispatch(step.command!);try{after=this.host.snapshot();}catch{observationFailed=true;}}
   catch{result={ok:false,message:'NPC command could not finish safely.'};}
   if(!result||typeof result.ok!=='boolean'||typeof result.message!=='string')result={ok:false,message:'Invalid typed NPC command result.'};
   this.note({phase:this.phase,index:step.index,kind:'command',status:result.ok?'applied':'refused',message:result.message,before,after});
   this.at++;this.message=result.message;
   if(observationFailed){this.cancel('Command result recorded; state observation failed. Remaining actions cancelled.');return;}
   if(epoch!==this.epoch||!this.valid()){this.cancel('NPC actions cancelled after the recorded command.');return;}
   if(!result.ok){this.state=this.exiting?'closed':'ready';this.changed();return;}
  }
  if(this.state==='running')this.state=this.exiting?'closed':'ready';
  this.changed();
 }
 /** Called by a NEW guarded semantic anchor activation. No window.open/fetch or remote-success claim. */
 confirmLink(index:number):boolean{
  if(this.state!=='link'||this.pendingIndex!==index||!this.valid())return false;
  const epoch=this.epoch;this.note({phase:this.phase,index,kind:'url',status:'navigation-requested',message:'Explicit link activation requested.'});
  this.at++;this.state='running';
  // Continue in a later task, after native anchor default activation; a microtask could revoke href too early.
  this.defer(()=>{if(epoch===this.epoch&&this.state==='running'){if(this.valid())this.pump();else this.cancel('Stale link continuation.');}});
  return true;
 }
 /** Legacy and v2 button URLs retain one guarded native activation, never a second confirmation click. */
 activateButtonLink(index:number):boolean{
  if(this.state!=='ready'||!this.valid())return false;
  const plan=planNpcPhase(this.actions,'button',index);
  if(!plan.ok||plan.steps.length!==1||plan.steps[0].action.kind!=='url')return false;
  this.note({phase:'button',index,kind:'url',status:'navigation-requested',message:'Explicit button link activation requested.'});
  const epoch=this.epoch;this.defer(()=>{if(epoch===this.epoch&&this.valid())this.changed();});return true;
 }
 skipLink():void{
  if(this.state!=='link')return;
  this.note({phase:this.phase,index:this.pendingIndex!,kind:'url',status:'cancelled',message:'Remaining phase skipped by user.'});
  this.at=this.steps.length;this.state=this.exiting?'closed':'ready';this.message='Remaining actions skipped.';this.changed();
 }
 requestClose():void{
  if(this.exiting||this.state==='closed'||this.state==='cancelled')return;
  if(this.state==='running'){this.cancel('Closed during a command. No further actions ran.');return;}
  if(this.state==='link')this.skipLink();
  if(this.state==='ready')this.start('exit');
 }
 cancel(message='NPC actions cancelled.'):void{if(this.state==='cancelled')return;this.epoch++;for(const id of this.deferred)clearTimeout(id);this.deferred.clear();this.state='cancelled';this.message=message;this.changed();}
}
