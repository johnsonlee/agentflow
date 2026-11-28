import {test} from '@playwright/test';
import {caneSugarRoute} from './cane-sugar';
test('mobile: natural Cane to existing Sugar, finite crafting and cold pending owners',async({page},info)=>{test.setTimeout(240000);await caneSugarRoute(page,info,true);});
