import{test}from'@playwright/test';import{wheatBoneMealRoute}from'./wheat-bone-meal';
test('mobile player Wheat Meal finite growth harvest cold owners bothviews',async({page},info)=>wheatBoneMealRoute(page,info,true,false));
test('mobile player Wheat Meal mature and denied refusal unchanged owners bothviews',async({page},info)=>wheatBoneMealRoute(page,info,true,true));
