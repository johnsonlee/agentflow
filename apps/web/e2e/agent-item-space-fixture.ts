import{Inventory,createAgent,blockId,stackId,type SaveData}from'@craft/engine';
/** Disclosed preowned clear pad/cargo, installed only before Continue. Not natural acquisition. */
export function agentItemSpaceFixture():SaveData{
 const bag=new Inventory();bag.slots[0]={id:stackId('diamond_sword'),count:1,damage:3};bag.slots[8]={id:blockId('oak_planks'),count:7};
 const agent=createAgent(8,80,8,3);for(let n=0;n<27;n++)agent.slots[n]={id:blockId('stone'),count:n+1};agent.slots[0]=null;agent.slots[2]=null;agent.slots[4]={id:blockId('stone'),count:5};agent.slots[10]={id:stackId('snowball'),count:12};agent.slots[11]=null;agent.slots[8]={id:stackId('iron_pickaxe'),count:1,damage:37};agent.slots[26]={id:stackId('written_book'),count:1,book:{title:'Owner',author:'Learner',pages:['Exact item-space cargo']}};agent.selected=9;
 const edits:SaveData['edits']=[];for(let x=0;x<=20;x++)for(let z=-5;z<=20;z++){edits.push([x,79,z,blockId('stone')]);for(let y=80;y<=84;y++)edits.push([x,y,z,0]);}
 return{version:1,name:'Controlled app-policy Agent item space',seed:7,generatorVersion:3,mode:'survival',timeOfDay:.25,player:{position:{x:10.5,y:80,z:12.5},yaw:0,pitch:0,flying:false},inventory:bag.toJSON(),agent,programs:[],edits,mobs:{nextId:1,records:[]},gamerules:{doMobSpawning:false,doDaylightCycle:false}};
}
