import{test}from'@playwright/test';import{woodSlabOwnedUseRoute,woodSlabCorruptBackupRoute}from'./wood-slab-owned-use';
test('desktop: finite Table slab craft, lower upper last-unit merges, double harvest and two cold restores',async({page},info)=>{test.setTimeout(360000);await woodSlabOwnedUseRoute(page,info,false,{width:1280,height:720});});
test('desktop: hidden Slab bag freezes sibling and preserves original backup',async({page},info)=>{test.setTimeout(120000);await woodSlabCorruptBackupRoute(page,info,false,{width:1280,height:720});});
