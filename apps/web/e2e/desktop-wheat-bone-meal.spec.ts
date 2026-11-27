import{test}from'@playwright/test';import{wheatBoneMealRoute}from'./wheat-bone-meal';
test('desktop player Wheat Meal finite growth harvest cold owners',async({page},info)=>wheatBoneMealRoute(page,info,false,false));
test('desktop player Wheat Meal mature and denied refusal unchanged owners',async({page},info)=>wheatBoneMealRoute(page,info,false,true));
