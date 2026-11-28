import{test}from'@playwright/test';import{bookPhotosRoute}from'./book-photos';
test('desktop book images sign survive Portfolio deletion and cold save',async({page},info)=>{test.setTimeout(180000);await bookPhotosRoute(page,info,false,false);});
test('desktop empty photo picker retains book text on explicit close',async({page},info)=>{test.setTimeout(90000);await bookPhotosRoute(page,info,false,true);});
