import{Inventory,createAgent,blockId,stackId,type SaveData}from'@craft/engine';
const stone=stackId('stone');
/** Preowned controlled fixture, only before Continue; not natural acquisition. */
export function agentTransferFixture(refusal:boolean):SaveData{
 const bag=new Inventory(),agent=createAgent(8,80,8,3);agent.selected=9;agent.slots[4]={id:stone,count:5};agent.slots[8]={id:stackId('iron_pickaxe'),count:1,damage:37};agent.slots[26]={id:stackId('written_book'),count:1,book:{pages:['Exact transfer page'],title:'Owner',author:'Learner'}};
 if(refusal){agent.slots[0]={id:stone,count:64};agent.slots[1]={id:blockId('dirt'),count:1};}
 const edits:SaveData['edits']=[];for(let x=3;x<15;x++)for(let z=3;z<15;z++){edits.push([x,79,z,blockId('stone')]);for(let y=80;y<=84;y++)edits.push([x,y,z,0]);}
 return{version:1,name:'Controlled Agent transfer cargo',seed:7,generatorVersion:3,mode:'survival',timeOfDay:.25,player:{position:{x:10.5,y:80,z:12.5},yaw:0,pitch:0,flying:false},inventory:bag.toJSON(),agent,programs:[],edits,mobs:{nextId:1,records:[]},gamerules:{doMobSpawning:false,doDaylightCycle:false}};
}
