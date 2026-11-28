import {test} from '@playwright/test';
import {hudSecondaryTouchRoute} from './hud-secondary-touch';
for(const viewport of[{width:390,height:844},{width:915,height:412}])test(`mobile ${viewport.width}x${viewport.height}: all five secondary-touch HUD actions and native keyboard activation`,async({page},info)=>{
 test.setTimeout(180000);await hudSecondaryTouchRoute(page,info,viewport);
});
