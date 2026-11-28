import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock('../src/ui/icons', () => ({ blockIcon: () => 'test-icon' }));
import { InventoryScreen } from '../src/ui/hud';
import { Game } from '../src/application/game';
import { Inventory, World, blockId, LAB_REACTIONS, stackId, reserveInventoryMutation, serializeSave, parseSave, type ItemStack, type SaveData } from '@craft/engine';
import type { TextureAtlas } from '@craft/textures';
class Cell extends EventTarget{
 parentElement:Cell|null=null;children:Cell[]=[];className='';textContent='';hidden=false;dataset:Record<string,string>={};attributes:Record<string,string>={};style={};scrollTop=0;classList={add(..._x:string[]){},remove(..._x:string[]){},toggle(_x:string,_on?:boolean){}};
 append(...cells:Cell[]){for(const c of cells)c.parentElement=this;this.children.push(...cells);}appendChild(c:Cell){c.parentElement=this;this.children.push(c);return c;}replaceChildren(...cells:Cell[]){for(const c of cells)c.parentElement=this;this.children=cells;}setAttribute(k:string,v:string){this.attributes[k]=v;}querySelector(){return null;}
}
const all=(r:Cell):Cell[]=>[r,...r.children.flatMap(all)];
beforeEach(()=>vi.stubGlobal('document',{createElement:()=>new Cell()}));afterEach(()=>vi.unstubAllGlobals());

const item=(name:string,count=1)=>({id:stackId(name),count});
type State={grid:(ItemStack|null)[];cursor:ItemStack|null;labOutcome:string;render():void};
function fixture(ingredients:(ItemStack|null)[]=[item('oxygen')], cursor:ItemStack|null=null, kind:'lab_table'|'compound_creator'='lab_table'){
  const parent=new Cell(),bag=new Inventory();let enabled=true,station=true,hook:()=>void=()=>{};
  const ui=new InventoryScreen(parent as unknown as HTMLElement,{} as TextureAtlas,()=>{},undefined,()=>enabled,()=> 'Recovery',()=>{hook();return station;});
  ui.show(bag,'survival',kind);const state=ui as unknown as State;state.grid=[...ingredients,...new Array(9-ingredients.length).fill(null)];state.cursor=cursor;state.render();
  const button=()=>all(parent).find(c=>c.dataset.chemAction==='combine')!;
  const click=(b=button())=>b.dispatchEvent(new Event('click'));
  return{parent,bag,ui,state,button,click,setEnabled:(v:boolean)=>{enabled=v;},setStation:(v:boolean)=>{station=v;},setHook:(v:()=>void)=>{hook=v;}};
}
for(const r of LAB_REACTIONS)it(`real Lab Combine commits one ${r.product} only on explicit action`,()=>{
 const f=fixture(r.ingredients.map(([n,c])=>item(n,c))),before=f.ui.pendingItems(),button=f.button();expect(button).toBeDefined();expect(all(f.parent).filter(c=>Object.hasOwn(c.dataset,'chemResult'))).toHaveLength(0);expect(f.ui.pendingItems()).toEqual(before);
 f.click(button);expect(f.ui.pendingItems()).toEqual([item(r.product)]);expect(f.state.grid).toEqual(new Array(9).fill(null));f.click(button);expect(f.ui.pendingItems()).toEqual([item(r.product)]);expect(f.bag.toJSON().slots.every(s=>s===null)).toBe(true);
});
it('nonviable ordinary batch yields one Garbage on compatible cursor, no preview debit or repeat',()=>{
 const f=fixture([item('oxygen',2)],item('garbage',63)),old=f.button();expect(f.ui.pendingItems()).toEqual([item('oxygen',2),item('garbage',63)]);f.click(old);expect(f.ui.pendingItems()).toEqual([item('garbage',64)]);f.click(old);f.click();expect(f.ui.pendingItems()).toEqual([item('garbage',64)]);
});
for(const reason of ['capacity','recovery','station','busy','stale','frozen','frozen-status','frozen-session','changed','throwing','reentrant'] as const)it(`real current-screen ${reason} refusal preserves experiment owners`,()=>{
 const f=fixture(),old=f.button();if(reason==='capacity')f.state.cursor=item('garbage',64);if(reason==='recovery')f.setEnabled(false);if(reason==='station')f.setStation(false);if(reason==='stale')f.state.render();if(reason==='frozen')Object.freeze(f.state.grid);if(reason==='frozen-status')Object.defineProperty(f.ui,'labOutcome',{writable:false});if(reason==='frozen-session')Object.defineProperty(f.ui,'labSession',{writable:false});
 let nested=false;if(reason==='changed')f.setHook(()=>{f.state.grid[0]=item('hydrogen');});if(reason==='throwing')f.setHook(()=>{throw Error('foreign callback');});if(reason==='reentrant')f.setHook(()=>{nested=true;f.click(old);f.setStation(false);});
 const lease=reason==='busy'?reserveInventoryMutation(f.bag):null,before=f.ui.pendingItems();f.click(old);lease?.cancel();expect(f.ui.pendingItems()).toEqual(reason==='changed'?[item('hydrogen')]:before);expect(f.ui.pendingItems().some(s=>s.id===stackId('garbage')&&reason!=='capacity')).toBe(false);if(reason==='reentrant')expect(nested).toBe(true);expect(f.bag.busy).toBe(false);
});
it('stale modal from a closed station cannot consume a subsequent open batch',()=>{const f=fixture(),old=f.button();expect(f.ui.hide()).toBe(true);f.ui.show(f.bag,'survival','lab_table');f.state.grid[0]=item('hydrogen');f.state.render();f.click(old);expect(f.ui.pendingItems()).toEqual([item('hydrogen')]);});
it('Compound Creator retains its exact preview and output-click path, no Combine',()=>{const f=fixture([item('hydrogen',2),item('oxygen')],null,'compound_creator');expect(f.button()).toBeUndefined();const result=all(f.parent).find(c=>Object.hasOwn(c.dataset,'chemResult'))!;result.dispatchEvent(new Event('click'));expect(f.ui.pendingItems()).toEqual([item('water_compound')]);});
it('full-bag Close refuses then Save/cold/pending recovery retains one Garbage and unrelated owners',()=>{
 const f=fixture();for(let i=0;i<36;i++)f.bag.setSlot(i,item('cobblestone',64));f.click();expect(f.ui.hide()).toBe(false);expect(f.ui.pendingItems()).toEqual([item('garbage')]);
 const raw:SaveData={version:1,name:'Lab pending',seed:1,generatorVersion:3,mode:'survival',timeOfDay:.2,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},inventory:f.bag.toJSON(),inventoryPending:f.ui.pendingItems(),edits:[]};const cold=parseSave(serializeSave(raw));expect(cold.inventoryPending).toEqual([item('garbage')]);const bag=Inventory.fromJSON(cold.inventory);bag.setSlot(0,null);const parent=new Cell(),screen=new InventoryScreen(parent as unknown as HTMLElement,{} as TextureAtlas,()=>{});expect(screen.restorePending(bag,'survival',cold.inventoryPending!)).toBe(true);expect(screen.hide()).toBe(true);expect(bag.slots[0]).toEqual(item('garbage'));expect(bag.slots.slice(1)).toEqual(f.bag.slots.slice(1));
});
it('death freeze refuses a retained Combine, and transferred pending owners are cleared once',()=>{const f=fixture(),old=f.button(),before=f.ui.pendingItems();f.ui.freezeForDeath();f.click(old);expect(f.ui.pendingItems()).toEqual(before);f.ui.clearTransferredPending();f.click(old);expect(f.ui.pendingItems()).toEqual([]);});

/** Actual Game.openInventory + real InventoryScreen/full-bag return and real World
 * cell revision integration. This is CPU component coverage, not browser input. */
function gameWithLab(){
 const f=fixture(),world=new World(7,3);world.setBlock(0,80,0,blockId('lab_table'));world.setBlock(2,80,0,blockId('lab_table'));
 const g={world,mode:'survival',inventory:f.bag,dead:false,paused:false,stopped:false,ownershipBusy:false,nonInventoryTransferBusy:false,actionsNeedRecovery:false,heldPhotoBusy:false,heldPhotoRecovery:false,cameras:{busy:false},prepared:false,portalTransfer:false,furnaces:new Map(),suspendInput:vi.fn(),inventoryScreen:f.ui,labStationCurrent:null as null|(()=>boolean)};
 const p=Game.prototype as unknown as {openInventory(kind:string,at?:{x:number;y:number;z:number}):void};
 // Initial fixture's pending owner returns before the first actual Game open.
 p.openInventory.call(g,'lab_table',{x:0,y:80,z:0});
 return{...f,g,world,open:(kind:string,x=2)=>p.openInventory.call(g,kind,kind==='lab_table'?{x,y:80,z:0}:undefined)};
}
for(const kind of ['lab_table','compound_creator'])it(`Game refused Lab→${kind} modal switch retains original binding and full pending owners`,()=>{
 const f=gameWithLab();for(let i=0;i<36;i++)f.bag.setSlot(i,item('cobblestone',64));f.state.grid[0]=item('oxygen');f.state.render();const pending=f.ui.pendingItems(),bag=f.bag.toJSON(),binding=f.g.labStationCurrent;expect(binding?.()).toBe(true);
 f.open(kind);expect(f.g.labStationCurrent).toBe(binding);expect(f.ui.pendingItems()).toEqual(pending);expect(f.bag.toJSON()).toEqual(bag);expect(f.ui.open).toBe(true);
 f.world.setBlock(0,80,0,blockId('air'));expect(f.g.labStationCurrent?.()).toBe(false); // Must not borrow the other intact Lab.
});
it('accepted Lab→Lab binds its NEW physical source before first new render, not cached original source',()=>{
 const f=gameWithLab();f.world.setBlock(0,80,0,blockId('air'));expect(f.g.labStationCurrent?.()).toBe(false);
 const render=f.state.render.bind(f.ui),seen:boolean[]=[];f.state.render=()=>{seen.push(f.g.labStationCurrent?.()===true);render();};f.open('lab_table');expect(seen).toEqual([true]);expect(f.g.labStationCurrent?.()).toBe(true);
 f.world.setBlock(2,80,0,blockId('air'));expect(f.g.labStationCurrent?.()).toBe(false);
});
it('accepted Lab→CompoundCreator clears Lab binding before first new render and retains creator behavior',()=>{
 const f=gameWithLab(),render=f.state.render.bind(f.ui),seen:unknown[]=[];f.state.render=()=>{seen.push(f.g.labStationCurrent);render();};f.open('compound_creator');expect(seen).toEqual([null]);expect(f.g.labStationCurrent).toBeNull();expect(f.button()).toBeUndefined();
});
it('unsupported mode refuses show before any existing pending owner or session is changed',()=>{const f=fixture(),before=f.ui.pendingItems();expect(f.ui.show(f.bag,'unsupported' as 'survival','lab_table')).toBe(false);expect(f.ui.pendingItems()).toEqual(before);f.click();expect(f.ui.pendingItems()).toEqual([item('garbage')]);});

it('a new Lab input invalidates the previous completion witness until the next explicit Combine',()=>{const f=fixture();f.click();const tap=(key:string,value:string)=>all(f.parent).find(c=>c.dataset[key]===value)!.dispatchEvent(new Event('click'));tap('slot','0');f.bag.setSlot(1,item('oxygen'));f.state.render();tap('slot','1');tap('chemInput','0');expect(f.state.labOutcome).toBe('');expect(all(f.parent).find(c=>c.dataset.labOutcome==='ready')).toBeDefined();expect(f.ui.pendingItems()).toEqual([item('oxygen')]);f.click();expect(f.ui.pendingItems()).toEqual([item('garbage')]);expect(f.bag.slots[0]).toEqual(item('garbage'));});
