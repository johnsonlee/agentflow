import{test}from'@playwright/test';import{portfolioZipRoute}from'./portfolio-zip';
test('mobile Portfolio ZIP Unicode JPG CRC ownership and cold persistence',async({page},info)=>{test.setTimeout(180000);await portfolioZipRoute(page,info,true,false);});
test('mobile empty Portfolio refuses ZIP without download',async({page},info)=>{test.setTimeout(90000);await portfolioZipRoute(page,info,true,true);});
