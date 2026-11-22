import {expect,it} from 'vitest';
import {World} from '../src/world/world';
import {Inventory} from '../src/ownership/inventory';
import {blockId,AIR} from '../src/catalog/blocks';
import {createAgent} from '../src/automation/agent';
import {tryUsePortalIgnition} from '../src/simulation/portals';
import {captureDimensionWorld} from '../src/persistence/dimension-world';
import {parseSave,serializeSave,type SaveData} from '../src/persistence/save';
import {createPortalRouteSave} from '../src/persistence/portal-route';
function side(dimension:'overworld'|'nether',x:number){const w=new World(7,1,dimension),bag=new Inventory();for(let u=0;u<4;u++)for(let v=0;v<5;v++)w.setBlock(x+u,80+v,1,u===0||u===3||v===0||v===4?blockId('obsidian'):AIR);bag.slots[0]={id:838,count:1};expect(tryUsePortalIgnition(w,bag,'survival',{x:x+1,y:80,z:1,normal:{x:0,y:1,z:0}}).ok).toBe(true);
 const s:SaveData={version:1,name:'two realms',seed:7,generatorVersion:1,mode:'survival',timeOfDay:.2,player:{position:{x:x+1.5,y:81,z:1.5},yaw:.4,pitch:.1,flying:false},inventory:bag.toJSON(),edits:w.exportEdits(),portals:w.portals.exportState()};return {s,portal:w.portals.exportState().records[0]};}
const arrival={x:33.5,y:81,z:2.5},agentArrival={x:34,y:81,z:2};
it('stages a detached two-world route with one global player/Agent bag and symmetric return link',()=>{
 const a=side('overworld',0),b=side('nether',32);a.s.agent=createAgent(3,81,3);a.s.agent.slots[0]={id:842,count:7};a.s.inventory.slots[1]={id:842,count:3};a.s.playerStatus={poison:{remaining:3,elapsed:.4}};const before=structuredClone(a.s),target=captureDimensionWorld(b.s);
 const next=createPortalRouteSave(a.s,'overworld',a.portal,target,b.portal,arrival,agentArrival)!;expect(next).not.toBeNull();expect(a.s).toEqual(before);expect(next.dimensions?.active).toBe('nether');expect(next.dimensions?.inactive.overworld?.edits).toEqual(a.s.edits);expect(next.edits).toEqual(b.s.edits);expect(next.inventory).toEqual(a.s.inventory);expect(next.agent?.slots).toEqual(a.s.agent.slots);expect(next.agent).toMatchObject(agentArrival);expect(next.dimensions?.inactive.overworld).not.toHaveProperty('inventory');expect(next.dimensions?.inactive.overworld).not.toHaveProperty('agent');expect(next.dimensions?.links).toHaveLength(1);expect(next.player.position).toEqual(arrival);
 const loaded=parseSave(serializeSave(next));expect(loaded.dimensionsInvalid).toBeUndefined();const back=createPortalRouteSave(loaded,'nether',b.portal,loaded.dimensions!.inactive.overworld!,a.portal,{x:1.5,y:81,z:2.5},{x:2,y:81,z:2})!;expect(back).not.toBeNull();expect(back.dimensions?.active).toBe('overworld');expect(back.dimensions?.links).toHaveLength(1);expect(back.inventory).toEqual(a.s.inventory);expect(back.agent?.slots).toEqual(a.s.agent.slots);next.inventory.slots[1]!.count=1;expect(a.s.inventory.slots[1]?.count).toBe(3);
});
it('refuses realm mismatch, missing physical endpoint, invalid arrival and damaged existing archive without mutation',()=>{
 const a=side('overworld',0),b=side('nether',32),target=captureDimensionWorld(b.s),before=structuredClone(a.s);
 expect(createPortalRouteSave(a.s,'nether',a.portal,target,b.portal,arrival,agentArrival)).toBeNull();expect(createPortalRouteSave(a.s,'overworld',{...a.portal,x:99},target,b.portal,arrival,agentArrival)).toBeNull();expect(createPortalRouteSave(a.s,'overworld',a.portal,target,b.portal,{...arrival,y:NaN},agentArrival)).toBeNull();expect(a.s).toEqual(before);
 a.s.dimensionsInvalid=true;expect(createPortalRouteSave(a.s,'overworld',a.portal,target,b.portal,arrival,agentArrival)).toBeNull();
});

it('refuses dropping existing inactive owners or rewriting existing nonair edits during detached preparation',()=>{
 const a=side('overworld',0),b=side('nether',32);a.s.farming={version:1,tick:17,accumulator:.4,cursor:0};
 const next=createPortalRouteSave(a.s,'overworld',a.portal,captureDimensionWorld(b.s),b.portal,arrival,agentArrival)!;expect(next).not.toBeNull();
 const target=structuredClone(next.dimensions!.inactive.overworld!);delete target.farming;
 expect(createPortalRouteSave(next,'nether',b.portal,target,a.portal,{x:1.5,y:81,z:2.5},{x:2,y:81,z:2})).toBeNull();
 const modified=structuredClone(next.dimensions!.inactive.overworld!);modified.edits[0][3]=blockId('stone');
 expect(createPortalRouteSave(next,'nether',b.portal,modified,a.portal,{x:1.5,y:81,z:2.5},{x:2,y:81,z:2})).toBeNull();expect(next.dimensions!.inactive.overworld!.farming).toEqual(a.s.farming);
});

it('does not authorize arbitrary Lava replacement when no retained pre-existing Water can cool it',()=>{
 const a=side('overworld',0),b=side('nether',32);a.s.edits.push([80,90,80,blockId('lava')]);const next=createPortalRouteSave(a.s,'overworld',a.portal,captureDimensionWorld(b.s),b.portal,arrival,agentArrival)!;expect(next).not.toBeNull();
 const target=structuredClone(next.dimensions!.inactive.overworld!);target.edits.find(e=>e[0]===80&&e[1]===90&&e[2]===80)![3]=blockId('obsidian');expect(createPortalRouteSave(next,'nether',b.portal,target,a.portal,{x:1.5,y:81,z:2.5},{x:2,y:81,z:2})).toBeNull();
});
