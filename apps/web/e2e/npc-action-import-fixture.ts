import{inspectWorldSaveImport,type SaveData,type WorldSaveImport}from'@craft/engine';
/** Test-only complete-export defaults, matching agentDropAllFixture/Game.captureSaveData.
 * Existing values (including invalid/unknown ones) are never repaired or overwritten.
 * Only controlled pre-start DTOs are accepted here; this is not a general untrusted-object API.
 */
const defaults={
 fluids:{version:1 as const,contactSeconds:0},inventoryPending:[],playerState:{health:20},
 snowballProjectiles:{version:1 as const,nextKey:1,records:[]},worldDrops:{nextKey:1,records:[]},
 leashes:{version:1 as const,nextKey:1,records:[]},balloons:{version:1 as const,nextKey:1,records:[]},
 hunger:{food:20,saturation:5,exhaustion:0,timer:0},chalkboards:[],programs:[],chests:[],brewingStands:[],furnaces:[],redstone:[],
 farming:{version:1 as const,tick:0,accumulator:0,cursor:0},caneGrowth:{version:1 as const,tick:0,accumulator:0,cursor:0},
}satisfies Partial<SaveData>;
export function completeNpcActionImportFixture(input:SaveData):SaveData{
 const data=structuredClone(input);
 for(const[key,value]of Object.entries(defaults))if(!Object.hasOwn(data,key))Object.assign(data,{[key]:structuredClone(value)});
 const rules=data.gamerules;
 if(rules&&typeof rules==='object'&&!Array.isArray(rules)&&!Object.hasOwn(rules,'keepInventory'))Object.assign(rules,{keepInventory:false});
 return data;
}
/** Validate both the completed original DTO and EXACT bytes that will reach the import UI.
 * The first check prevents serializeSave from hiding a provided invalid/unknown field.
 * Caller persists serialized bytes before this preflight, preserving any actual refusal input.
 */
export function inspectNpcActionImportFixture(completed:SaveData,raw:string):WorldSaveImport{
 inspectWorldSaveImport(new TextEncoder().encode(JSON.stringify(completed)));
 return inspectWorldSaveImport(new TextEncoder().encode(raw));
}
