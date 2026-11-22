import {test} from '@playwright/test';
import {caneSugarRoute} from './cane-sugar';
test('desktop: natural Cane to existing Sugar, finite crafting and cold pending owners',async({page},info)=>{test.setTimeout(240000);await caneSugarRoute(page,info,false);});
