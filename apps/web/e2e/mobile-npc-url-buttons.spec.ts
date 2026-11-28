import{test}from'@playwright/test';
import{npcUrlButtonsRoute,npcUrlRecoveryRoute}from'./npc-url-buttons';
test('mobile: portrait landscape real NPC six URLs, explicit popups and cold owners',async({page},info)=>{for(const v of[{width:390,height:844},{width:915,height:412}])await npcUrlButtonsRoute(page,info,true,v);});
for(const kind of ['modern','legacy','inactive']as const)test(`mobile: portrait landscape ${kind} NPC action original backup`,async({page},info)=>{for(const v of[{width:390,height:844},{width:915,height:412}])await npcUrlRecoveryRoute(page,info,true,v,kind);});
