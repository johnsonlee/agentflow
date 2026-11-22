import {expect,it} from 'vitest';
import {World} from '../src/world/world';
import {Inventory} from '../src/ownership/inventory';
import {blockId,AIR} from '../src/catalog/blocks';
import {tryUsePortalIgnition} from '../src/simulation/portals';
import {PortalContact} from '../src/simulation/portal-contact';
function source(){const w=new World(7),bag=new Inventory();for(let x=0;x<4;x++)for(let y=80;y<85;y++)w.setBlock(x,y,1,x===0||x===3||y===80||y===84?blockId('obsidian'):AIR);bag.slots[0]={id:838,count:1};expect(tryUsePortalIgnition(w,bag,'survival',{x:1,y:80,z:1,normal:{x:0,y:1,z:0}}).ok).toBe(true);return w;}
const inside={x:1.5,y:81,z:1.5},outside={x:5.5,y:81,z:5.5};
it('requires actual source contact and dwell, emits once until a known exit and never mutates or loads',()=>{
 const w=source(),c=new PortalContact(),edits=w.exportEdits(),chunks=w.loadedChunkCount();expect(c.update(w,outside,1)).toBeNull();for(let n=0;n<3;n++)expect(c.update(w,inside,1)).toBeNull();const t=c.update(w,inside,1);expect(t?.frame).toEqual(w.portals.exportState().records[0]);expect(t?.unchanged()).toBe(true);expect(Object.isFrozen(t?.frame)).toBe(true);for(let n=0;n<10;n++)expect(c.update(w,inside,1)).toBeNull();c.update(w,outside,.1);for(let n=0;n<3;n++)expect(c.update(w,inside,1)).toBeNull();expect(c.update(w,inside,1)).not.toBeNull();expect(w.exportEdits()).toEqual(edits);expect(w.loadedChunkCount()).toBe(chunks);
});
it('physical source ABA and portal owner restore cannot revive issued tickets',()=>{
 const w=source(),c=new PortalContact();for(let n=0;n<3;n++)c.update(w,inside,1);const t=c.update(w,inside,1)!;expect(t).not.toBeNull();const edits=w.exportEdits(),portals=w.portals.exportState();w.portals.clear();w.portals.restore(portals,edits);expect(t.unchanged()).toBe(false);
});
it('unloaded or reserved source suspends dwell without generation, while ineligible play resets dwell',()=>{
 const w=source(),c=new PortalContact();c.update(w,inside,1);c.update(w,inside,1);const lease=w.reserveBlockBatch([[1,81,1,AIR]])!;expect(lease).not.toBeNull();expect(c.update(w,inside,1)).toBeNull();lease.release();expect(c.update(w,inside,1)).toBeNull();expect(c.update(w,inside,1)).not.toBeNull();
 const other=new PortalContact();other.update(w,inside,1);other.update(w,inside,1,false);for(let n=0;n<3;n++)expect(other.update(w,inside,1)).toBeNull();expect(other.update(w,inside,1)).not.toBeNull();
 const fresh=new PortalContact();fresh.update(w,inside,1);w.unloadChunk(0,0);const chunks=w.loadedChunkCount();for(let n=0;n<5;n++)expect(fresh.update(w,inside,1)).toBeNull();expect(w.loadedChunkCount()).toBe(chunks);
});

it('refuses finite out-of-world positions before grid iteration or generating cells',()=>{
 const w=source(),c=new PortalContact(),before=w.loadedChunkCount();for(const feet of [{x:1e100,y:81,z:0},{x:0,y:1e100,z:0},{x:0,y:81,z:-1e100},{x:0,y:-1,z:0},{x:NaN,y:81,z:0}])expect(c.update(w,feet,1)).toBeNull();expect(w.loadedChunkCount()).toBe(before);
});
it('an issued ticket cannot replace its source authority guard after the physical portal is removed',()=>{
 const w=source(),c=new PortalContact();for(let n=0;n<3;n++)c.update(w,inside,1);const ticket=c.update(w,inside,1)!;expect(ticket).not.toBeNull();w.setBlock(1,81,1,AIR);expect(ticket.unchanged()).toBe(false);expect(Reflect.set(ticket,'unchanged',()=>true)).toBe(false);expect(ticket.unchanged()).toBe(false);expect(Object.isFrozen(ticket)).toBe(true);
});
