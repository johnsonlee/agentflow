import{test}from'@playwright/test';
import{npcUrlButtonsRoute,npcUrlRecoveryRoute}from'./npc-url-buttons';
test('desktop: real NPC six URL editor, ordered reader anchors and exact cold owners',async({page},info)=>{await npcUrlButtonsRoute(page,info,false,{width:1280,height:720});});
for(const kind of ['modern','legacy','inactive']as const)test(`desktop: ${kind} malformed NPC actions retain exact original backup`,async({page},info)=>{await npcUrlRecoveryRoute(page,info,false,{width:1280,height:720},kind);});
