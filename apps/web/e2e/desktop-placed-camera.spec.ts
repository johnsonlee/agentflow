import{test}from'@playwright/test';import{placedCameraRoute}from'./placed-camera';
test('desktop placed Camera real placement activation movement JPEG Portfolio cold persistence',async({page},info)=>{test.setTimeout(180000);await placedCameraRoute(page,info,false,false);});
test('desktop placed Camera countdown SaveQuit cold idle without late photo',async({page},info)=>{test.setTimeout(180000);await placedCameraRoute(page,info,false,true);});
