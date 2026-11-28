import { afterEach, expect, it, vi } from "vitest";
import { KeyboardMouseInput } from "../src/devices/keyboard-mouse";
afterEach(()=>vi.unstubAllGlobals());
function setup(){
 const win=new EventTarget(),doc=new EventTarget(),canvas=new EventTarget();vi.stubGlobal("window",win);vi.stubGlobal("document",doc);
 const input=new KeyboardMouseInput(canvas as unknown as HTMLElement);
 const send=(target:EventTarget,type:string,values:Record<string,unknown>)=>{const e=new Event(type,{cancelable:true});for(const[k,v]of Object.entries(values))Object.defineProperty(e,k,{value:v});target.dispatchEvent(e);};
 return{input,wheel:(deltaY:number)=>send(canvas,"wheel",{deltaY}),digit:(code:string)=>send(win,"keydown",{code})};
}
it("later absolute hotbar selection supersedes earlier wheel movement pending in the same frame",()=>{
 const s=setup();try{s.wheel(-1);s.digit("Digit2");expect(s.input.poll()).toMatchObject({hotbarSlot:1,hotbarScroll:0});}finally{s.input.dispose();}
});
it("a wheel event after the digit selection still applies after that absolute choice",()=>{
 const s=setup();try{s.digit("Digit2");s.wheel(1);expect(s.input.poll()).toMatchObject({hotbarSlot:1,hotbarScroll:1});}finally{s.input.dispose();}
});
it("the latest digit also overrides wheel input left after a previous frame already scrolled",()=>{
 const s=setup();try{s.wheel(1);expect(s.input.poll()).toMatchObject({hotbarSlot:null,hotbarScroll:1});s.wheel(-1);s.digit("Digit2");expect(s.input.poll()).toMatchObject({hotbarSlot:1,hotbarScroll:0});expect(s.input.poll()).toMatchObject({hotbarSlot:null,hotbarScroll:0});}finally{s.input.dispose();}
});
it("wheel accumulation without digits and ignored invalid digit keys preserve relative intent",()=>{
 const s=setup();try{s.wheel(1);s.wheel(-1);expect(s.input.poll()).toMatchObject({hotbarSlot:null,hotbarScroll:0});s.wheel(1);s.digit("Digit0");expect(s.input.poll()).toMatchObject({hotbarSlot:null,hotbarScroll:1});}finally{s.input.dispose();}
});
