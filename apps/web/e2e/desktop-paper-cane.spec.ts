import{test}from '@playwright/test';import{paperCaneRoute}from './paper-cane';
test.describe.configure({retries:0});
test('desktop: natural v3 Cane to Paper Book signed cold owners',async({page},info)=>{test.setTimeout(360000);await paperCaneRoute(page,info,false);});
