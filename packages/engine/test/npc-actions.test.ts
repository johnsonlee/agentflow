import { Inventory } from "../src/ownership/inventory";
import { expect, it } from "vitest";
import { copyNpcActions, diagnoseRawNpcActions, readNpcActionField, readNpcActions, validNpcUrl, type NpcActionsV1 } from "../src/education/npc-actions";
import { createMob } from "../src/simulation/entities";
import { mobSnapshot, restoreMobSnapshot, sanitizeMobState } from "../src/persistence/mob-save";
import { parseSave, serializeSave, type SaveData } from "../src/persistence/save";
import { sanitizeNpcs } from "../src/persistence/savecheck";
import { captureDimensionWorld, replaceDimensionWorld } from "../src/persistence/dimension-world";
import { readDimensionArchive } from "../src/persistence/dimension-save";
const actions = (): NpcActionsV1 => ({version:1,buttons:[{kind:"url",label:"Lesson",url:"https://example.org/lesson?q=A%20B#one"}]});
const npc = () => createMob(1,"npc",{x:2,y:80,z:2},{name:"Guide",dialogue:"Read",npcActions:actions()});
const world = () => ({seed:7,generatorVersion:1 as const,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},edits:[] as Array<[number,number,number,number]>});
const legacy = () => ({x:2,y:80,z:2,yaw:0,name:"Guide",dialogue:"Read",npcActions:actions()});
const saved = (): SaveData => ({version:1,name:"NPC URL",mode:"creative",timeOfDay:0,inventory:new Inventory().toJSON(),...world(),npcs:[legacy()],mobs:{nextId:2,records:[mobSnapshot(npc())]}});
it("distinguishes absent fields from invalid present undefined/null and keeps every copy detached",()=>{
 expect(readNpcActionField({})).toEqual({kind:"absent"});expect(readNpcActionField({npcActions:undefined}).kind).toBe("invalid");expect(readNpcActionField({npcActions:null}).kind).toBe("invalid");
 const owner={npcActions:actions()},copy=copyNpcActions(owner)!;requireV1(copy).buttons[0].label="Other";expect(owner.npcActions.buttons[0].label).toBe("Lesson");
 expect(readNpcActions({version:1,buttons:[]})).toEqual({kind:"valid",data:{version:1,buttons:[]}});
 const six=actions();six.buttons=Array.from({length:6},(_,i)=>({kind:"url",label:`Link${i}`,url:`https://example.org/${i}`}));expect(readNpcActions(six)).toEqual({kind:"valid",data:six});six.buttons.push(six.buttons[0]);expect(readNpcActions(six).kind).toBe("invalid");
});
it.each(["javascript:alert(1)","data:text/html,hello","file:///tmp/x","blob:https://example.org/x","/relative","//example.org","http:example.org","https://user:pass@example.org","https://user@example.org"," https://example.org","https://example.org/a b","https://example.org/a\nb","https://example.org/\\evil","https://", "https://example.org/"+"a".repeat(2048)])("refuses unsafe/nonstandalone/ambiguous URL %s",url=>expect(validNpcUrl(url)).toBe(false));
it("preserves exact allowed URL bytes independently of standard browser serialization",()=>{const url="HTTP://Example.Org:80/a%2fb?q=a%20b#X";expect(validNpcUrl(url)).toBe(true);expect(readNpcActions({version:1,buttons:[{kind:"url",label:"😀".repeat(12),url}]})).toEqual({kind:"valid",data:{version:1,buttons:[{kind:"url",label:"😀".repeat(12),url}]}});});
it.each([{version:2,buttons:[]},{version:1,buttons:[{kind:"command",label:"Run",url:"https://example.org"}]},{version:1,buttons:[{kind:"url",label:" ",url:"https://example.org"}]},{version:1,buttons:[{kind:"url",label:"a".repeat(13),url:"https://example.org"}]},{version:1,buttons:[{kind:"url",label:"A",url:"https://example.org",auto:true}]},{version:1,buttons:[],auto:true}])("rejects unknown shape or unsupported semantics %#",raw=>expect(readNpcActions(raw).kind).toBe("invalid"));
it("never invokes envelope/row/array accessors and refuses sparse/hidden/extended data",()=>{
 let calls=0;const a=actions();Object.defineProperty(a.buttons[0],"url",{get(){calls++;return"https://example.org";},enumerable:true});expect(readNpcActions(a).kind).toBe("invalid");
 const envelope={get version(){calls++;return 1;},buttons:[]};expect(readNpcActions(envelope).kind).toBe("invalid");
 const row=actions();Object.defineProperty(row.buttons,"0",{get(){calls++;return{};},enumerable:true});expect(readNpcActions(row).kind).toBe("invalid");
 const sparse={version:1,buttons:Array(1)};expect(readNpcActions(sparse).kind).toBe("invalid");const hidden=actions();Object.defineProperty(hidden.buttons[0],"label",{value:"Lesson",enumerable:false});expect(readNpcActions(hidden).kind).toBe("invalid");
 const extra=actions();Object.defineProperty(extra.buttons,"extra",{value:1});expect(readNpcActions(extra).kind).toBe("invalid");expect(readNpcActionField({get npcActions(){calls++;return actions();}}).kind).toBe("invalid");expect(calls).toBe(0);
});
it("clones NPC actions at create, snapshot and restore and rejects non-NPC ownership",()=>{
 const input=actions(),m=createMob(1,"npc",{x:2,y:80,z:2},{npcActions:input});input.buttons[0].label="Changed";expect(requireV1(m.npcActions!).buttons[0].label).toBe("Lesson");const snap=mobSnapshot(m);requireV1(snap.npcActions!).buttons[0].label="Snap";expect(requireV1(m.npcActions!).buttons[0].label).toBe("Lesson");const r=restoreMobSnapshot(snap);requireV1(r.npcActions!).buttons.reverse();expect(requireV1(snap.npcActions!).buttons[0].label).toBe("Snap");
 expect(()=>createMob(2,"pig",{x:0,y:80,z:0},{npcActions:actions()})).toThrow();const pig=mobSnapshot(createMob(2,"pig",{x:0,y:80,z:0}));expect(sanitizeMobState({nextId:3,records:[{...pig,npcActions:actions()}]}).invalid).toBe(1);
 requireV1(m.npcActions!).buttons[0].url="javascript:bad";expect(()=>mobSnapshot(m)).toThrow();
});
it("roundtrips modern and legacy action owners with no URL normalization or alias",()=>{const s=saved();const raw=serializeSave(s),p=parseSave(raw);expect(sanitizeNpcs(p.npcs)).toEqual(s.npcs);expect(sanitizeMobState(p.mobs).data).toEqual(s.mobs);expect(p.npcActionsInvalid).toBeUndefined();const only={...s};delete only.mobs;expect(sanitizeNpcs(parseSave(serializeSave(only)).npcs)).toEqual(s.npcs);});
it.each([null,undefined,{version:1,buttons:[{kind:"url",label:"Bad",url:"javascript:bad"}]}])("diagnoses malformed modern/legacy actions before permissive sanitation %#",bad=>{
 for(const key of ["npcs","mobs"]){const s=saved();if(key==="npcs")(s.npcs![0]as unknown as{npcActions:unknown}).npcActions=bad;else(s.mobs!.records[0]as unknown as{npcActions:unknown}).npcActions=bad;expect(diagnoseRawNpcActions(s)).toBe(true);expect(()=>serializeSave(s)).toThrow();
 // Undefined is not JSON data; null/malformed are genuine cold input. Never trust serialized diagnostics.
 if(bad!==undefined){const text=JSON.stringify(s),p=parseSave(text);expect(p.npcActionsInvalid).toBe(true);expect(()=>serializeSave(p)).toThrow();expect(text).toBe(JSON.stringify(s));}
 }
});
it("preserves valid active/inactive realms, refuses malformed inactive actions before replacement",()=>{const s=saved(),physical=captureDimensionWorld(s);const dims={version:1,active:"overworld",inactive:{nether:physical},links:[]};expect(readDimensionArchive(dims,s)).toEqual({kind:"valid",data:dims});const moved=replaceDimensionWorld(s,physical);expect(moved.npcs).toEqual(s.npcs);requireV1(moved.npcs![0].npcActions!).buttons[0].label="Detached";expect(requireV1(s.npcs![0].npcActions!).buttons[0].label).toBe("Lesson");(physical.npcs![0]as unknown as{npcActions:unknown}).npcActions=null;expect(readDimensionArchive(dims,s).kind).toBe("invalid");expect(()=>replaceDimensionWorld(s,physical)).toThrow();});
it("does not trust a caller supplied derived diagnostic and never serializes one",()=>{const s=saved();expect(parseSave(JSON.stringify({...s,npcActionsInvalid:true})).npcActionsInvalid).toBeUndefined();expect(JSON.parse(serializeSave(s))).not.toHaveProperty("npcActionsInvalid");});

it.each(["https://example.org/a\u0085b","https://example.org/a\u009fb","https://example.org/a\u00a0b"])("rejects Unicode control/whitespace URL %#",url=>expect(validNpcUrl(url)).toBe(false));
it("diagnoses actions stranded in malformed legacy/modern containers and malformed legacy record",()=>{
 for(const raw of [{npcs:{npcActions:actions()}},{mobs:{records:{kind:"npc",npcActions:actions()}}},{mobs:{npcActions:actions()}},{npcs:[{...legacy(),name:null}]},{npcs:[{...legacy(),y:1001}]}]){expect(diagnoseRawNpcActions(raw)).toBe(true);expect(parseSave(JSON.stringify({...saved(),mobs:undefined,...raw})).npcActionsInvalid).toBe(true);}
 expect(diagnoseRawNpcActions({npcs:{legacy:"ignored"}})).toBe(false);expect(diagnoseRawNpcActions({mobs:{records:{legacy:"ignored"}}})).toBe(false);
 expect(readNpcActions({version:1,buttons:[{kind:"url",label:"A\u0085B",url:"https://example.org"}]}).kind).toBe("invalid");
});

it.each([1001,1024,-101])("preserves validated modern NPCactions at y%s with its exact legacy mirror",y=>{const s=saved();s.mobs!.records[0].position.y=y;s.npcs![0].y=y;expect(diagnoseRawNpcActions(s)).toBe(false);const raw=serializeSave(s);expect(sanitizeMobState(parseSave(raw).mobs).data.records[0].npcActions).toEqual(actions());const physical=captureDimensionWorld(s);expect(readDimensionArchive({version:1,active:"overworld",inactive:{nether:physical},links:[]},s).kind).toBe("valid");});

it.each(['legacy-arraylike','modern-arraylike','array-envelope','symbol-entry'])('refuses explicit new actions stranded in malformed %s container',kind=>{const s=saved();delete s.mobs;if(kind==='legacy-arraylike')(s as unknown as{npcs:unknown}).npcs={0:legacy(),length:1};if(kind==='modern-arraylike'){delete s.npcs;(s as unknown as{mobs:unknown}).mobs={nextId:2,records:{0:mobSnapshot(npc()),length:1}};}if(kind==='array-envelope'){s.npcs=[];Object.defineProperty(s.npcs,'npcActions',{value:actions(),enumerable:true});}if(kind==='symbol-entry'){s.npcs=[];Object.defineProperty(s.npcs,Symbol('extra'),{value:legacy(),enumerable:true});}expect(diagnoseRawNpcActions(s)).toBe(true);expect(()=>serializeSave(s)).toThrow();if(kind.endsWith('arraylike')){const raw=JSON.stringify(s);expect(parseSave(raw).npcActionsInvalid).toBe(true);}});

function requireV1(value: {version:number}): import("../src/education/npc-actions").NpcActionsV1 { if(value.version!==1)throw Error("Expected unchanged v1 NPC actions"); return value as import("../src/education/npc-actions").NpcActionsV1; }
