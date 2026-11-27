import {test} from '@playwright/test';import {npcActionsRoute} from './npc-actions';
test('desktop NPC ordered command phases explicit links and cold ownership',async({page},info)=>{test.setTimeout(240000);await npcActionsRoute(page,info,false,false);});
test('desktop NPC unsupported phase and lifecycle cancel do not run exit',async({page},info)=>{test.setTimeout(180000);await npcActionsRoute(page,info,false,true);});
