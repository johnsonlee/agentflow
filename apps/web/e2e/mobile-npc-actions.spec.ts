import {test} from '@playwright/test';import {npcActionsRoute} from './npc-actions';
test('mobile NPC ordered command phases explicit links and cold ownership',async({page},info)=>{test.setTimeout(360000);await npcActionsRoute(page,info,true,false);});
test('mobile NPC unsupported phase and lifecycle cancel do not run exit',async({page},info)=>{test.setTimeout(300000);await npcActionsRoute(page,info,true,true);});
