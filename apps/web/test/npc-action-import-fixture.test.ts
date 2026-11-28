import{it,expect}from'vitest';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{Inventory,blockId,parseSave,serializeSave,inspectWorldSaveImport,type SaveData}from'@craft/engine';
import{completeNpcActionImportFixture,inspectNpcActionImportFixture}from'../e2e/npc-action-import-fixture';
const captured=readFileSync(new URL('./fixtures/npc-actions-incomplete.json',import.meta.url),'utf8');
const fixture=():SaveData=>JSON.parse(captured)as SaveData;
const bytes=(raw:string)=>new TextEncoder().encode(raw);
const prepared=(input=fixture())=>{const complete=completeNpcActionImportFixture(input),raw=serializeSave(complete);return{complete,raw,inspection:inspectNpcActionImportFixture(complete,raw)};};
function actions(data:SaveData){return{modern:data.mobs!.records[0].npcActions!,legacy:data.npcs![0].npcActions!};}
function both(data:SaveData,config:unknown){Reflect.set(data.mobs!.records[0],'npcActions',structuredClone(config));Reflect.set(data.npcs![0],'npcActions',structuredClone(config));}
it('retains the exact actual13215B incomplete failure and strict rejection, not a V2 acceptance claim',()=>{
 expect(Buffer.byteLength(captured)).toBe(13215);expect(createHash('sha256').update(captured).digest('hex')).toBe('5632c396ef7ef381e910d055762ba761c7a2f54a025c2ecd3de7bb7b38b8a7f6');expect(()=>inspectWorldSaveImport(bytes(captured))).toThrow(/export fields/);
 const v1=fixture();both(v1,{version:1,buttons:[{kind:'url',label:'Lesson',url:'https://npc-actions.invalid/enter'}]});expect(()=>inspectWorldSaveImport(bytes(JSON.stringify(v1)))).toThrow(/export fields/);
});
it('completes only missing fields and explicit legacy keepInventory false; exact modern/legacyV2 and existing owners survive actual strict import',()=>{
 const input=fixture(),before=JSON.stringify(input),originalActions=JSON.stringify(actions(input)),p=prepared(input);expect(JSON.stringify(input)).toBe(before);expect(p.inspection.raw).toBe(p.raw);expect(p.inspection.mode).toBe('survival');expect(p.complete.gamerules).toEqual({...input.gamerules,keepInventory:false});
 for(const key of Object.keys(input)){if(key!=='gamerules')expect(Reflect.get(p.complete,key),key).toEqual(Reflect.get(input,key));}
 expect(JSON.stringify(actions(p.complete))).toBe(originalActions);const parsed=parseSave(p.raw);expect(JSON.stringify(actions(parsed))).toBe(originalActions);expect(parsed.inventory).toEqual(input.inventory);expect(parsed.agent).toEqual(input.agent);expect(parsed.edits).toEqual(input.edits);expect(parsed.mode).toBe(input.mode);
 expect(inspectWorldSaveImport(bytes(p.raw)).raw).toBe(p.raw);
});
it('keeps a complete valid V1 mirror valid too without version upgrading action data',()=>{const input=fixture();both(input,{version:1,buttons:[{kind:'url',label:'Lesson',url:'https://npc-actions.invalid/lesson'}]});const p=prepared(input);expect(actions(parseSave(p.raw))).toEqual(actions(input));});
it('clones default sections for each controlled fixture rather than sharing hidden owner arrays',()=>{const a=completeNpcActionImportFixture(fixture()),b=completeNpcActionImportFixture(fixture());expect(a.worldDrops).not.toBe(b.worldDrops);expect(a.worldDrops!.records).not.toBe(b.worldDrops!.records);expect(a.farming).not.toBe(b.farming);expect(a.inventoryPending).not.toBe(b.inventoryPending);expect(a.gamerules).not.toBe(b.gamerules);});
it('preserves explicitly supplied keepInventory true and does not replace it with false',()=>{const data=fixture();data.gamerules!.keepInventory=true;const p=prepared(data);expect(p.complete.gamerules!.keepInventory).toBe(true);expect(parseSave(p.raw).gamerules!.keepInventory).toBe(true);});
for(const invalid of[undefined,null,'false',1])it('does not repair a provided invalid keepInventory '+String(invalid),()=>{
 const data=fixture();Reflect.set(data.gamerules!,'keepInventory',invalid);const complete=completeNpcActionImportFixture(data);expect(Object.hasOwn(complete.gamerules!,'keepInventory')).toBe(true);expect(Reflect.get(complete.gamerules!,'keepInventory')).toBe(invalid);expect(()=>inspectNpcActionImportFixture(complete,serializeSave(complete))).toThrow();
});
it('preserves provided unknown root ownership and refuses it through actual strict import',()=>{const data=fixture();Reflect.set(data,'foreignOwner',{count:1});const complete=completeNpcActionImportFixture(data);expect(Reflect.get(complete,'foreignOwner')).toEqual({count:1});const normalized=serializeSave(complete);expect(JSON.parse(normalized).foreignOwner).toEqual({count:1});expect(()=>inspectWorldSaveImport(bytes(normalized))).toThrow(/export fields/);expect(()=>inspectNpcActionImportFixture(complete,normalized)).toThrow(/export fields/);});
it('refuses provided damaged owner/default sections rather than overwriting them',()=>{
 for(const [key,value]of[['farming',null],['worldDrops',{nextKey:0,records:[]}],['inventoryPending',[{id:-1,count:1}]]]as const){const data=fixture();Reflect.set(data,key,value);const complete=completeNpcActionImportFixture(data);expect(Reflect.get(complete,key)).toEqual(value);expect(()=>inspectNpcActionImportFixture(complete,serializeSave(complete))).toThrow();}
});
it('preserves and rejects divergent NPC caches after envelope completion',()=>{const data=fixture(),modern=actions(data).modern;if(modern.version!==2)throw Error('CapturedV2required');const changed=structuredClone(modern);changed.actions[0]={kind:'command',trigger:'enter',label:'Other',command:'/give gold_ingot 1'};Reflect.set(data.mobs!.records[0],'npcActions',changed);const complete=completeNpcActionImportFixture(data);expect(actions(complete).modern).toEqual(changed);expect(()=>inspectNpcActionImportFixture(complete,serializeSave(complete))).toThrow(/conflicting NPC/);});
it('preserves and rejects jointly malformed V2 command fields',()=>{const data=fixture(),config=structuredClone(actions(data).modern);if(config.version!==2)throw Error('CapturedV2required');Reflect.set(config.actions[0],'command',{malformed:true});both(data,config);const complete=completeNpcActionImportFixture(data);expect(actions(complete).modern).toEqual(config);expect(()=>inspectNpcActionImportFixture(complete,serializeSave(complete))).toThrow();});
it('valid full bag and unsupported runtime-command refusal data import intact; no command execution is claimed',()=>{
 for(const unsupported of[false,true]){const data=fixture(),bag=new Inventory();for(let i=0;i<bag.slots.length;i++)bag.slots[i]={id:blockId('stone'),count:64};data.inventory=bag.toJSON();both(data,{version:2,actions:unsupported?[{kind:'command',trigger:'enter',label:'Unsupported',command:'/native_unsupported'}]:[{kind:'command',trigger:'enter',label:'Capacity',command:'/give book_and_quill 1'}]});const p=prepared(data),parsed=parseSave(p.raw);expect(parsed.inventory).toEqual(data.inventory);expect(actions(parsed)).toEqual(actions(data));expect(parsed.mode).toBe('survival');}
});
it('validates exact submitted serialized bytes independently of the completed DTO',()=>{const p=prepared();const damaged=JSON.parse(p.raw);damaged.gamerules.keepInventory='false';expect(()=>inspectNpcActionImportFixture(p.complete,JSON.stringify(damaged))).toThrow(/game rules/);});
