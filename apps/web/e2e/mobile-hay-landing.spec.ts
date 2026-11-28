import{test}from'@playwright/test';import{hayLandingRoute}from'./hay-landing';
test('mobile: observed Stone and three Hay-axis gravity landings preserve armor and cold health with relative .2 damage',async({page},info)=>{test.setTimeout(480000);await hayLandingRoute(page,info,true);});
