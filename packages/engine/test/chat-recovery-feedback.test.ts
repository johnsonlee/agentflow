import {CameraStore}from "../src/education/placed-camera";
import { PlayerStatusOwner } from "../src/simulation/status-effects";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Game } from "../../../apps/web/src/application/game";
import { ChatInput } from "../../../apps/web/src/ui/hud";
class Cell {
 children: Cell[]=[]; hidden=false; value=""; style={}; className=""; textContent="";
 listeners=new Map<string, ((e:{preventDefault():void})=>void)[]>();
 appendChild(e:Cell){this.children.push(e);return e;} append(...e:Cell[]){this.children.push(...e);}
 setAttribute(){} focus(){} blur(){}
 addEventListener(name:string,fn:(e:{preventDefault():void})=>void){this.listeners.set(name,[...(this.listeners.get(name)??[]),fn]);}
 submit(){for(const fn of this.listeners.get("submit")??[])fn({preventDefault(){}});}
}
beforeEach(()=>vi.stubGlobal("document",{createElement:()=>new Cell()}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each([["player status","Damaged player status. Export a backup before using commands"],["saved items","Saved items need repair. Export a backup before using commands"]])("actual ChatInput submit publishes %s refusal once and preserves owners",(section,expected)=>{
 const g=Object.assign(Object.create(Game.prototype), { cameras:new CameraStore(), statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] });Object.assign(g,{recoverySections:[section],hud:{setCameraAction:vi.fn(),message:vi.fn()},inventory:{slots:[{id:829,count:1}]},body:{position:{x:1,y:32,z:1}}});
 const before=JSON.stringify([g.inventory,g.body]);const close=vi.fn();const chat=new ChatInput(new Cell() as unknown as HTMLElement,text=>g.runChat(text),close);
 chat.show("  /tp 0 100 0  ");(chat.root as unknown as Cell).submit();expect(chat.open).toBe(false);expect(close).toHaveBeenCalledOnce();expect(JSON.stringify([g.inventory,g.body])).toBe(before);
 expect(g.hud.message).toHaveBeenCalledOnce();expect(g.hud.message).toHaveBeenCalledWith(expected);
});
it("actual ordinary ChatInput submit still publishes once",()=>{
 const g=Object.assign(Object.create(Game.prototype), { cameras:new CameraStore(), statusOwner: new PlayerStatusOwner(), statusVisualSeconds: 0, brewingStands: new Map(), brewingIssues: [], chests:new Map(),chestIssues:[] });Object.assign(g,{recoverySections:[],dead:false,leashes:{busy:false},balloons:{busy:false},hud:{setCameraAction:vi.fn(),message:vi.fn()}});
 const chat=new ChatInput(new Cell() as unknown as HTMLElement,text=>g.runChat(text),()=>{});chat.show(" hello ");(chat.root as unknown as Cell).submit();expect(g.hud.message).toHaveBeenCalledOnce();expect(g.hud.message).toHaveBeenCalledWith("<Player> hello");
});
