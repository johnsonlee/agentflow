import {test} from '@playwright/test';
import {bookMultipageRoute} from './book-multipage';
test('mobile: landscape and portrait three-page Book navigation, signing and cold readonly pages',async({page},info)=>{test.setTimeout(240000);await bookMultipageRoute(page,info,true);});
