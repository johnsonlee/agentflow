import{test}from'@playwright/test';import{bookPhotosRoute}from'./book-photos';
test('mobile book images sign survive Portfolio deletion and cold save',async({page},info)=>{test.setTimeout(240000);await bookPhotosRoute(page,info,true,false);});
test('mobile empty photo picker retains book text on explicit close',async({page},info)=>{test.setTimeout(150000);await bookPhotosRoute(page,info,true,true);});
