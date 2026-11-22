import {test}from'@playwright/test';import{metalNuggetsRoute}from'./metal-nuggets';
test('mobile: finite ordinary Nuggets, worn Furnace recycling, native reducer and exact corrupt-owner backup',async({page},info)=>{test.setTimeout(480000);await metalNuggetsRoute(page,info,true);});
