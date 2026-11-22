import {test} from '@playwright/test';
import {medicineEffectsRoute} from './medicine-effects';
test('Mobile: held medicines, accessible effects and cold container/status ownership',async({page},info)=>{test.setTimeout(360000);await medicineEffectsRoute(page,info,true);});
