import{test}from'@playwright/test';import{agentTillSeedRoute}from'./agent-till-seed';
test('mobile: portrait landscape six-direction Till editor and finite farming row, cold AST source owners',async({page},info)=>{test.setTimeout(960000);for(const v of[{width:390,height:844},{width:915,height:412}])await agentTillSeedRoute(page,info,true,v);});
