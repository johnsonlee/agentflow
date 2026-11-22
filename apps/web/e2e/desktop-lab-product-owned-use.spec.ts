import {test} from '@playwright/test';
import {labProductOwnedUseRoute} from './lab-product-owned-use';
test('desktop: finite owned lab products, no-op, Creative and exact cold checkpoint',async({page},info)=>{
 test.setTimeout(240000);await labProductOwnedUseRoute(page,info,false,{width:1280,height:720});
});
