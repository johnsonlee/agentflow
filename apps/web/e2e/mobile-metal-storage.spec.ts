import {test} from '@playwright/test';
import {metalStorageRoute} from './metal-storage';
test('mobile: finite ordinary metal storage craft, place, harvest, reducer and cold distinct owners',async({page},info)=>{test.setTimeout(480000);await metalStorageRoute(page,info,true);});
