import {test} from '@playwright/test';
import {caneSupportRoute} from './cane-support';
test('desktop: real Bucket water removal passively releases Cane into persistent full-bag ground owners',async({page},info)=>{test.setTimeout(240000);await caneSupportRoute(page,info,false);});
