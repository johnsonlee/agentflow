import{test}from'@playwright/test';import{itemCountRoute}from'./agent-item-count';
test.use({hasTouch:true,isMobile:true});
test('mobile: item count Blocks Slot Equals bothbranches empty JS Python freshcount metadata cold JSONimport',async({page},info)=>{test.setTimeout(420000);await itemCountRoute(page,info,true,false);});
test('mobile: item count invalidnumeric sourcegrammar repairedAST branchrefusal cold JSONimport',async({page},info)=>{test.setTimeout(420000);await itemCountRoute(page,info,true,true);});
