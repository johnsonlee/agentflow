import {test} from '@playwright/test';
import {brewingStationRoute} from './brewing-station';
test('Mobile: tap craft, place and brew three bottles with pause, cold restore and exact item owners',async({page},info)=>{test.setTimeout(300000);await brewingStationRoute(page,info,true);});
