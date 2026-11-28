import { afterEach, expect, it, vi } from 'vitest';
import { Game } from '../src/application/game';
import { Inventory, blockId } from '@craft/engine';
const ctor=Game as unknown as {activeWriter:unknown;handoffBusy:boolean};
const old=ctor.activeWriter;
afterEach(()=>{ctor.activeWriter=old;ctor.handoffBusy=false;});
function context(){
 let same=true;const cell={id:blockId('lab_table')},world={captureCell:vi.fn(()=>cell),cellUnchanged:vi.fn(()=>same),blockSourceLeaseBusy:false};
 const shown=vi.fn((...args:unknown[])=>{ const accepted=args[6]; if(typeof accepted==='function')accepted(); return true; }),g={world,mode:'survival',inventory:new Inventory(),dead:false,paused:false,stopped:false,ownershipBusy:false,nonInventoryTransferBusy:false,actionsNeedRecovery:false,heldPhotoBusy:false,heldPhotoRecovery:false,cameras:{busy:false},prepared:false,portalTransfer:false,furnaces:new Map(),suspendInput:vi.fn(),inventoryScreen:{show:shown,resumePending:()=>false},labStationCurrent:null as null|(()=>boolean)};
 ctor.activeWriter=g;const p=Game.prototype as unknown as {openInventory(kind:string,at?:{x:number;y:number;z:number}):void;canCombineLabExperiment():boolean};
 const open=()=>p.openInventory.call(g,'lab_table',{x:1,y:80,z:1});const allowed=()=>p.canCombineLabExperiment.call(g);return{g,world,shown,open,allowed,stale:()=>{same=false;}};
}
it('actual Game open binds physical source cell, world, inventory and mode, rejects same-ID stale identity',()=>{const f=context();f.open();expect(f.shown).toHaveBeenCalledOnce();expect(f.allowed()).toBe(true);const mode=f.g.mode;f.g.mode='creative';expect(f.allowed()).toBe(false);f.g.mode=mode;expect(f.allowed()).toBe(true);f.stale();expect(f.allowed()).toBe(false);expect(f.world.cellUnchanged).toHaveBeenCalled();});
it('actual Game guard rejects inactive writer, death, recovery, other-owner busy and borrowed world',()=>{const f=context();f.open();for(const key of ['dead','paused','stopped','actionsNeedRecovery','nonInventoryTransferBusy','heldPhotoBusy'] as const){f.g[key]=true;expect(f.allowed()).toBe(false);f.g[key]=false;}ctor.activeWriter={};expect(f.allowed()).toBe(false);ctor.activeWriter=f.g;f.g.world={...f.world};expect(f.allowed()).toBe(false);});
it('actual Game cannot open Lab through a kind-only call with no physical station source',()=>{const f=context(),p=Game.prototype as unknown as {openInventory(kind:string):void};p.openInventory.call(f.g,'lab_table');expect(f.shown).not.toHaveBeenCalled();expect(f.allowed()).toBe(false);});
