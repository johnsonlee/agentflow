import{it,expect}from'vitest';
import{serializeSave,parseSave,wheatAge}from'@craft/engine';
import{wheatBoneMealFixture}from'../e2e/wheat-bone-meal-fixture';
for(const refusal of[false,true])it(`Wheat UI fixture strict roundtrip/unique edits ${refusal}`,()=>{const s=wheatBoneMealFixture(refusal);expect(new Set(s.edits.map(e=>e.slice(0,3).join(','))).size).toBe(s.edits.length);const raw=serializeSave(s),cold=parseSave(raw);expect(cold.inventory).toEqual(s.inventory);expect(cold.agent).toEqual(s.agent);expect(cold.worldDrops).toEqual(s.worldDrops);expect(wheatAge(cold.edits.find(e=>e[0]===8&&e[1]===80&&e[2]===10)![3])).toBe(refusal?7:0);expect(serializeSave(parseSave(serializeSave(cold)))).toBe(serializeSave(cold));});
