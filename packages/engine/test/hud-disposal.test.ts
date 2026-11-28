import {afterEach,expect,it,vi} from "vitest";
import { Hud, type HudCallbacks } from "../../../apps/web/src/ui/hud";
import type {TextureAtlas} from "@craft/textures";
class Element extends EventTarget{
 className="";textContent="";hidden=false;dataset={};children:Element[]=[];parent:Element|null=null;classList={add:vi.fn(),remove:vi.fn()};
 get firstChild(){return this.children[0]??null;}setAttribute(){}appendChild(e:Element){this.children.push(e);e.parent=this;return e;}append(...es:Element[]){for(const e of es)this.appendChild(e);}prepend(...es:Element[]){for(const e of es.reverse()){this.children.unshift(e);e.parent=this;}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}
}
function create(){vi.useFakeTimers();vi.stubGlobal("document",{createElement:()=>new Element()});const host=new Element();const callbacks:HudCallbacks={onSelectSlot:vi.fn(),onOpenInventory:vi.fn(),onPause:vi.fn(),onChat:vi.fn(),onCamera:vi.fn(),onPortfolio:vi.fn(),onCodeBuilder:vi.fn(),onShakeGlow:vi.fn(),onLightSparkler:vi.fn(),onSwapOffhand:vi.fn()};return {host,hud:new Hud(host as unknown as HTMLElement,{} as TextureAtlas,callbacks,false) as Hud&{dispose():void}};}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it("real Hud messages release all owned fade/removal timers and root on idempotent disposal",()=>{const {hud,host}=create();hud.message("first");hud.message("second");expect(vi.getTimerCount()).toBe(4);hud.dispose();hud.dispose();expect(vi.getTimerCount()).toBe(0);expect(host.children).toEqual([]);hud.message("retired");expect(vi.getTimerCount()).toBe(0);vi.advanceTimersByTime(8000);expect(host.children).toEqual([]);});
it("ordinary messages retain their fade then removal behavior and release completed timers",()=>{const {hud}=create();hud.message("visible");const log=(hud.root as unknown as Element).children.find(e=>e.className==="chat-log")!;const line=log.children[0];expect(vi.getTimerCount()).toBe(2);vi.advanceTimersByTime(6000);expect(line.classList.add).toHaveBeenCalledWith("fade");expect(log.children).toHaveLength(1);expect(vi.getTimerCount()).toBe(1);vi.advanceTimersByTime(1000);expect(log.children).toEqual([]);expect(vi.getTimerCount()).toBe(0);});
