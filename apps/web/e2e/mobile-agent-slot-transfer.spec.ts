import{test}from'@playwright/test';import{transferRoute}from'./agent-slot-transfer';
test.use({hasTouch:true,isMobile:true});
test('mobile: Blocks JS Python finite metadata transfer and realJSONimport',async({page},info)=>{test.setTimeout(360000);await transferRoute(page,info,true,false);});
test('mobile: full incompatible insufficient invalidrefusal andcoldJSONimport',async({page},info)=>{test.setTimeout(360000);await transferRoute(page,info,true,true);});
