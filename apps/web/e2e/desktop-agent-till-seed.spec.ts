import{test}from'@playwright/test';import{agentTillSeedRoute}from'./agent-till-seed';
test('desktop: six-direction Till UI and JS Python finite farming row, last Seed and cold AST inert drafts',async({page},info)=>{test.setTimeout(480000);await agentTillSeedRoute(page,info,false,{width:1280,height:720});});
