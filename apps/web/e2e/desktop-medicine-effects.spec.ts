import {test} from '@playwright/test';
import {medicineEffectsRoute} from './medicine-effects';
test('PC: selective medicines, actual effect sources, view changes and cold global status ownership',async({page},info)=>{test.setTimeout(360000);await medicineEffectsRoute(page,info,false);});
