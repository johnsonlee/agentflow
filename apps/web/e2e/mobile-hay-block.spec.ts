import{test}from'@playwright/test';import{hayBlockRoute}from'./hay-block';
test('mobile: actual27Wheat harvest, finite3Hay craft, three hitface axes and cold canonical roundtrip',async({page},info)=>{test.setTimeout(600000);await hayBlockRoute(page,info,true);});
