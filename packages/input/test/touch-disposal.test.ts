import { afterEach, expect, it, vi } from "vitest";
import { TouchControls } from "../src/devices/touch";
class Element extends EventTarget {
 style: Record<string,string>={}; className="";textContent="";children:Element[]=[];parent:Element|null=null;
 classList={add:vi.fn(),remove:vi.fn()};appendChild(e:Element){this.children.push(e);e.parent=this;return e;}
 append(...es:Element[]){for(const e of es)this.appendChild(e);}
 releasePointerCapture=vi.fn();
 setAttribute(){} setPointerCapture(){} getBoundingClientRect(){return {left:0,top:0};}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}
}
function pointer(type:string,id:number){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,pointerType:"touch",button:0,clientX:20,clientY:20});return e;}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it("disposes an initialized touch hold timer, owned listeners and DOM idempotently",()=>{
 vi.useFakeTimers();vi.stubGlobal("document",{createElement:()=>new Element()});const area=new Element(),host=new Element();const touch=new TouchControls(area as unknown as HTMLElement,host as unknown as HTMLElement) as TouchControls&{dispose():void};
 area.dispatchEvent(pointer("pointerdown",1));expect(vi.getTimerCount()).toBe(1);
 const jump=(touch.root as unknown as Element).children[1].children[2];jump.dispatchEvent(pointer("pointerdown",3));expect(touch.poll().jump).toBe(true);
 touch.dispose();touch.dispose();expect(vi.getTimerCount()).toBe(0);expect(host.children).toEqual([]);expect(area.releasePointerCapture).toHaveBeenCalledWith(1);expect(touch.enabled).toBe(false);
 area.dispatchEvent(pointer("pointerdown",2));vi.advanceTimersByTime(1000);expect(vi.getTimerCount()).toBe(0);expect(touch.poll()).toMatchObject({breaking:false,using:false,place:false,jump:false,forward:0,strafe:0});
});

it("disabled preparation controls do not capture or queue touch input; ordinary taps still work",()=>{
 vi.useFakeTimers();vi.stubGlobal("document",{createElement:()=>new Element()});const area=new Element(),host=new Element();const touch=new TouchControls(area as unknown as HTMLElement,host as unknown as HTMLElement);
 touch.enabled=false;const ignored=pointer("pointerdown",1);area.dispatchEvent(ignored);expect(ignored.defaultPrevented).toBe(false);expect(vi.getTimerCount()).toBe(0);expect(touch.poll().place).toBe(false);
 touch.enabled=true;area.dispatchEvent(pointer("pointerdown",2));area.dispatchEvent(pointer("pointerup",2));expect(touch.poll().place).toBe(true);expect(vi.getTimerCount()).toBe(0);touch.dispose();
});
