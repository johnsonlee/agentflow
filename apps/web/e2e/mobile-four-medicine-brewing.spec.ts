import {test} from '@playwright/test';
import {fourMedicineBrewingRoute} from './four-medicine-brewing';
test.describe.configure({retries:0});
test('mobile: four actual three-bottle medicine recipes and selective use of brewed products',async({page},info)=>{test.setTimeout(600000);await fourMedicineBrewingRoute(page,info,true);});
