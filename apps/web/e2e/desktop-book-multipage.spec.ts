import {test} from '@playwright/test';
import {bookMultipageRoute} from './book-multipage';
test('desktop: three-page Book edits, enabled navigation, signing and cold readonly pages',async({page},info)=>{test.setTimeout(240000);await bookMultipageRoute(page,info,false);});
