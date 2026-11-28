import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock('../src/ui/icons',()=>({blockIcon:()=> 'test-icon'}));
import {InventoryScreen} from '../src/ui/hud';
import {Inventory,stackId,type ItemStack} from '@craft/engine';
import type {TextureAtlas} from '@craft/textures';
class Cell extends EventTarget{
 parentElement:Cell|null=null;children:Cell[]=[];className='';textContent='';hidden=false;dataset:Record<string,string>={};attributes:Record<string,string>={};style={};scrollTop=0;classList={add(..._x:string[]){},remove(..._x:string[]){},toggle(_x:string,_on?:boolean){}};
 append(...cells:Cell[]){for(const c of cells)c.parentElement=this;this.children.push(...cells);}appendChild(c:Cell){c.parentElement=this;this.children.push(c);return c;}replaceChildren(...cells:Cell[]){for(const old of this.children)old.parentElement=null;this.children=[];this.append(...cells);}setAttribute(k:string,v:string){this.attributes[k]=v;}querySelector(){return null;}
}
const all=(r:Cell):Cell[]=>[r,...r.children.flatMap(all)];
beforeEach(()=>vi.stubGlobal('document',{createElement:()=>new Cell()}));afterEach(()=>vi.unstubAllGlobals());
const item=(name:string,count=1):ItemStack=>({id:stackId(name),count});
type State={grid:(ItemStack|null)[];cursor:ItemStack|null;render():void};
function fixture(cursor:ItemStack|null=null){
 const parent=new Cell(),bag=new Inventory();for(let i=0;i<36;i++)bag.setSlot(i,item('stone',64));
 const ui=new InventoryScreen(parent as unknown as HTMLElement,{}as TextureAtlas,()=>{});ui.show(bag,'survival','crafting_table');const state=ui as unknown as State;
 state.grid=['aluminium_oxide','red_stained_glass','boron_trioxide','aluminium_oxide','red_stained_glass','boron_trioxide','aluminium_oxide','red_stained_glass','boron_trioxide'].map(n=>item(n,2));state.cursor=cursor;state.render();
 const result=()=>all(parent).find(c=>Object.hasOwn(c.dataset,'craftResult'))!;return{ui,state,bag,result};
}
it('real crafting-result callback respects cursor capacity and keeps a full unrelated bag unchanged',()=>{
 const f=fixture(item('hardened_red_stained_glass',62)),grid=structuredClone(f.state.grid),bag=f.bag.toJSON();
 f.result().dispatchEvent(new Event('click'));expect(f.state.grid).toEqual(grid);expect(f.state.cursor).toEqual(item('hardened_red_stained_glass',62));expect(f.bag.toJSON()).toEqual(bag);
 f.state.cursor=item('hardened_red_stained_glass',61);f.state.render();f.result().dispatchEvent(new Event('click'));
 expect(f.state.cursor).toEqual(item('hardened_red_stained_glass',64));expect(f.state.grid.every(s=>s?.count===1)).toBe(true);expect(f.bag.toJSON()).toEqual(bag);
});
it('a retained result callback rechecks current ingredients instead of taking an obsolete color preview',()=>{
 const f=fixture(),old=f.result();f.state.grid[1]=item('blue_stained_glass',2);const changed=structuredClone(f.state.grid);f.state.render();old.dispatchEvent(new Event('click'));
 expect(f.state.cursor).toBeNull();expect(f.state.grid).toEqual(changed);
});
