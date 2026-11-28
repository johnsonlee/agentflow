import{test}from'@playwright/test';import{placedCameraRoute}from'./placed-camera';test.use({hasTouch:true,isMobile:true});
test('mobile placed Camera real touch placement joystick tracking JPEG Portfolio cold persistence',async({page},info)=>{test.setTimeout(300000);await placedCameraRoute(page,info,true,false);});
test('mobile placed Camera countdown SaveQuit cold idle without late photo',async({page},info)=>{test.setTimeout(300000);await placedCameraRoute(page,info,true,true);});
