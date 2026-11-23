import{test}from'@playwright/test';import{dropAllRoute}from'./agent-drop-all';
test.use({hasTouch:true,isMobile:true});
test('mobile: dropAll Blocks JS Python physical pickup ownership real controls cold UI import',async({page},info)=>{test.setTimeout(480000);await dropAllRoute(page,info,true,false);});
test('mobile: dropAll grammar arity direction recursive AST refusal ownership real controls cold UI import',async({page},info)=>{test.setTimeout(480000);await dropAllRoute(page,info,true,true);});
