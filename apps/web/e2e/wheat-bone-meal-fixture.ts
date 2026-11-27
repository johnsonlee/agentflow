import{Inventory,BONE_MEAL_ITEM_ID,blockId,farmlandId,wheatId,type SaveData}from'@craft/engine';
import{agentDropAllFixture}from'./agent-drop-all-fixture';
/** Disclosed preowned UI-import fixture; no natural acquisition/native calibration claim. */
export function wheatBoneMealFixture(refusal=false):SaveData{
 const raw=agentDropAllFixture(),bag=new Inventory();bag.slots[0]={id:BONE_MEAL_ITEM_ID,count:8};bag.slots[1]={id:blockId('gold_block'),count:3};raw.inventory=bag.toJSON();raw.name='Player Wheat Meal controlled policy';raw.agent={...raw.agent!,x:18,z:18};
 const cells=new Map(raw.edits.map(e=>[e.slice(0,3).join(','),e]));for(const e of[[8,79,10,farmlandId(7)],[8,80,10,wheatId(refusal?7:0)],[10,79,10,farmlandId(7)],[10,80,10,wheatId(0)],[10,78,10,blockId('deny')],[7,79,10,blockId('water')]]as SaveData['edits'])cells.set(e.slice(0,3).join(','),e);raw.edits=[...cells.values()];return raw;
}
