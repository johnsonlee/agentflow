import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Hud,type HudCallbacks} from '../src/ui/hud';
import type {TextureAtlas} from '@craft/textures';
class Cell extends EventTarget{
 children:Cell[]=[];className='';textContent='';hidden=false;dataset:Record<string,string>={};attributes:Record<string,string>={};style:Record<string,string>={};
 append(...cells:Cell[]){this.children.push(...cells);}appendChild(c:Cell){this.children.push(c);return c;}prepend(...cells:Cell[]){this.children.unshift(...cells);}setAttribute(k:string,v:string){this.attributes[k]=v;}
}
const descendants=(root:Cell):Cell[]=>[root,...root.children.flatMap(descendants)];
beforeEach(()=>vi.stubGlobal('document',{createElement:()=>new Cell()}));afterEach(()=>vi.unstubAllGlobals());
function hud(touch=false){const parent=new Cell(),callbacks:HudCallbacks={onSelectSlot:vi.fn(),onOpenInventory:vi.fn(),onPause:vi.fn(),onChat:vi.fn(),onCamera:vi.fn(),onPortfolio:vi.fn(),onCodeBuilder:vi.fn(),onShakeGlow:vi.fn(),onLightSparkler:vi.fn(),onSwapOffhand:vi.fn()},h=new Hud(parent as unknown as HTMLElement,{} as TextureAtlas,callbacks,touch);const children=descendants(parent);return {h,callbacks,status:children.find(c=>c.className==='player-status')!,cue:children.find(c=>c.className==='nausea-vignette')!,crosshair:children.find(c=>c.className==='crosshair')!,children};}
it('real HUD retains exactPoison-only label/data identity and clears every label and cue on cure',()=>{
 const {h,status,cue}=hud();h.setPlayerStatus({poison:{remaining:2.2,elapsed:0}});expect(status.textContent).toBe('Poison · 3s');expect(status.dataset.effect).toBe('poison');expect(status.hidden).toBe(false);expect(cue.hidden).toBe(true);h.setPlayerStatus({});expect(status.textContent).toBe('');expect(status.dataset.effect).toBe('');expect(status.hidden).toBe(true);expect(cue.hidden).toBe(true);
});
it('real HUD shows all4 timers/levels together with static ariahidden nausea cue and unchanged crosshair',()=>{
 const {h,status,cue,crosshair}=hud(true),before={...crosshair.style};h.setPlayerStatus({poison:{remaining:4.1,elapsed:0},weakness:{remaining:19.1,amplifier:1},blindness:{remaining:9.1,amplifier:0},nausea:{remaining:2.1,amplifier:2}});expect(status.textContent).toBe('Poison · 5s | Weakness 2 · 20s | Blindness 1 · 10s | Nausea 3 · 3s');expect(status.dataset.effect).toBe('poison weakness blindness nausea');expect(status.attributes.role).toBe('status');expect(cue.attributes['aria-hidden']).toBe('true');expect(cue.hidden).toBe(false);expect(crosshair.style).toEqual(before);h.setPlayerStatus({weakness:{remaining:1,amplifier:0}});expect(cue.hidden).toBe(true);expect(status.textContent).toBe('Weakness 1 · 1s');
});
it('actual touch/hotbar DOM event dispatch still reaches existing callbacks while nausea is shown',()=>{
 const {h,callbacks,children}=hud(true);h.setPlayerStatus({nausea:{remaining:30,amplifier:0}});children.find(c=>c.dataset.slot==='3')!.dispatchEvent(new Event('pointerdown'));children.find(c=>c.attributes['aria-label']==='Pause')!.dispatchEvent(new Event('pointerdown'));children.find(c=>c.attributes['aria-label']==='Open inventory')!.dispatchEvent(new Event('click'));expect(callbacks.onSelectSlot).toHaveBeenCalledWith(3);expect(callbacks.onPause).toHaveBeenCalledOnce();expect(callbacks.onOpenInventory).toHaveBeenCalledOnce();
});

it('malformed recovery status is hidden without evaluating effect field getters or mutating its descriptors',()=>{
 const {h,status,cue}=hud();let reads=0;const raw=Object.defineProperty({},'nausea',{get(){reads++;throw Error('must not run');},enumerable:true}),descriptor=Object.getOwnPropertyDescriptor(raw,'nausea');expect(()=>h.setPlayerStatus(raw)).not.toThrow();expect(reads).toBe(0);expect(Object.getOwnPropertyDescriptor(raw,'nausea')).toEqual(descriptor);expect(status.hidden).toBe(true);expect(cue.hidden).toBe(true);h.setPlayerStatus({blindness:{remaining:Infinity,amplifier:0}});expect(status.hidden).toBe(true);
});
