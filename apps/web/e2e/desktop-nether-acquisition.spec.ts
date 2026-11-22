import {test} from '@playwright/test';
import {naturalNetherAcquisitionRoute} from './natural-nether-acquisition';
test.describe.configure({retries:0});
test('desktop: actual natural Nether acquisition to Brewing Stand and three Awkward bottles',async({page},info)=>{test.setTimeout(900_000);await naturalNetherAcquisitionRoute(page,info,false);});
