import{test}from'@playwright/test';import{composterOwnedUseRoute,composterCorruptBackupRoute}from'./composter-owned-use';
test('desktop: finite U craft and organic Composter Meal, cold owners and actual Cane White use',async({page},info)=>{test.setTimeout(480000);await composterOwnedUseRoute(page,info,false,{width:1280,height:720});});
test('desktop: damaged Composter metadata freezes sibling and downloads original backup',async({page},info)=>{test.setTimeout(120000);await composterCorruptBackupRoute(page,info,false,{width:1280,height:720});});
