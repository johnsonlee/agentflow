import {test} from '@playwright/test';
import {labProductOwnedUseRoute} from './lab-product-owned-use';
test('mobile: portrait and landscape finite owned lab products and exact cold checkpoint',async({page},info)=>{
 test.setTimeout(480000);await labProductOwnedUseRoute(page,info,true,{width:390,height:844});await labProductOwnedUseRoute(page,info,true,{width:915,height:412});
});
