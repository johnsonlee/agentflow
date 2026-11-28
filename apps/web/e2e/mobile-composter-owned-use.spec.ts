import{test}from'@playwright/test';import{composterOwnedUseRoute,composterCorruptBackupRoute}from'./composter-owned-use';
test('mobile: portrait landscape finite Composter Meal and cold owners',async({page},info)=>{test.setTimeout(960000);for(const v of[{width:390,height:844},{width:915,height:412}])await composterOwnedUseRoute(page,info,true,v);});
test('mobile: portrait landscape damaged Composter original backup',async({page},info)=>{test.setTimeout(240000);for(const v of[{width:390,height:844},{width:915,height:412}])await composterCorruptBackupRoute(page,info,true,v);});
