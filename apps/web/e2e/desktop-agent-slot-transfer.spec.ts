import{test}from'@playwright/test';import{transferRoute}from'./agent-slot-transfer';
test('desktop: Blocks JS Python finite metadata transfer and realJSONimport',async({page},info)=>{test.setTimeout(360000);await transferRoute(page,info,false,false);});
test('desktop: full incompatible insufficient invalidrefusal andcoldJSONimport',async({page},info)=>{test.setTimeout(360000);await transferRoute(page,info,false,true);});
