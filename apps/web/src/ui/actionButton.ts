/** One native button action, including Chromium's otherwise click-less secondary touch.
 * Pointer cancellation/dragging and synthesized duplicate clicks never activate twice. */
export function bindActionButton(button:HTMLButtonElement,activate:()=>void,alive:()=>boolean=()=>true):()=>void{
 let secondary:number|null=null,suppressed:number|null=null,disposed=false;
 const listeners:Array<[string,EventListener]>=[];
 const on=(type:string,fn:EventListener)=>{listeners.push([type,fn]);button.addEventListener(type,fn);};
 const available=()=>!disposed&&alive()&&!button.disabled&&!button.hidden;
 const inside=(e:PointerEvent)=>{const r=button.getBoundingClientRect();return Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)&&e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom;};
 on('pointerdown',event=>{const e=event as PointerEvent;e.stopPropagation();if(e.pointerId===suppressed)suppressed=null;if(!available()){secondary=null;return;}if(e.pointerType==='touch'&&e.isPrimary===false&&secondary===null&&inside(e)){secondary=e.pointerId;suppressed=e.pointerId;}});
 on('pointermove',event=>{const e=event as PointerEvent;if(e.pointerId===secondary&&(!available()||!inside(e)))secondary=null;});
 for(const type of['pointercancel','lostpointercapture'])on(type,event=>{if((event as PointerEvent).pointerId===secondary)secondary=null;});
 on('pointerup',event=>{const e=event as PointerEvent;if(e.pointerType!=='touch'||e.pointerId!==secondary)return;e.stopPropagation();secondary=null;if(available()&&inside(e))activate();});
 for(const type of['keydown','keyup'])on(type,event=>{const e=event as KeyboardEvent;if(e.code==='Space'||e.code==='Enter'||e.code==='NumpadEnter')e.stopPropagation();});
 on('click',event=>{const e=event as PointerEvent;e.stopPropagation();if(e.pointerType==='touch'&&e.pointerId===suppressed||!available())return;activate();});
 return()=>{disposed=true;secondary=null;suppressed=null;for(const[type,fn]of listeners)button.removeEventListener(type,fn);listeners.length=0;};
}
