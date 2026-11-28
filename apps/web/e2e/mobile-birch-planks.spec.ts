import {test}from '@playwright/test';
import {birchRoute}from './birch-planks';
test.describe.configure({retries:0});
test('mobile: actual Birch crafting harvest Agent fuel reducer and cold owners',async({page},info)=>{test.setTimeout(300000);await birchRoute(page,info,true);});
