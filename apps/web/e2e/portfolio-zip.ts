import{expect,type Page,type TestInfo,type Locator}from'@playwright/test';
import fs from'node:fs/promises';
import{execFileSync}from'node:child_process';
import{serializeSave}from'@craft/engine';
import{heldCameraFixture}from'./held-camera-fixture';
import{waitForTerrain}from'./helpers';
/** Controlled preowned Camera fixture imported through UI; not natural acquisition/native ZIP calibration. */
export async function portfolioZipRoute(page:Page,info:TestInfo,touch:boolean,empty:boolean){
 const revision=process.env.TESTED_SOURCE_SHA;if(!revision||!/^[a-f0-9]{40}$/.test(revision)||process.env.TESTED_RUNTIME_REVISION!==revision)throw Error('Actual selected-source binding required');
 for(const viewport of touch?[{width:390,height:844},{width:915,height:412}]:[{width:1280,height:720}]){
  await page.setViewportSize(viewport);const tag=`${empty?'empty':'valid'}-${viewport.width}x${viewport.height}`,out=(n:string)=>info.outputPath(tag+'-'+n),press=(l:Locator)=>touch?l.tap():l.click(),rows:unknown[]=[];let completed=false;
  const read=()=>page.evaluate(()=>{const g=window.__craft.game;if(!g)return null;return{inventory:g.inventory.toJSON(),agent:structuredClone(g.agent),pending:(g as unknown as{inventoryScreen:{pendingItems():unknown[]}}).inventoryScreen.pendingItems(),edits:g.world.exportEdits(),cameras:g.cameras.records,photos:structuredClone(g.portfolio.photos),photoRaw:localStorage.getItem('craft.portfolio.v1'),save:localStorage.getItem('craft.save.v1'),journal:localStorage.getItem('craft.camera.capture.v1'),errors:[...g.loadErrors],saveError:g.saveError};});
  const phase=async(label:string)=>{const state=await read();rows.push({label,at:new Date().toISOString(),state});await page.screenshot({path:out(label+'.png')});return state;};
  const exportZIP=async(label:string)=>{const before=(await phase(label+'-before'))!;expect(before.journal).toBeNull();const download=page.waitForEvent('download');await press(page.getByRole('button',{name:'Export Portfolio',exact:true}));const d=await download;expect(d.suggestedFilename()).toBe('portfolio.zip');const file=out(label+'.zip');await d.saveAs(file);const extracted=JSON.parse(execFileSync('python3',['-c',`import sys,zipfile,json,base64,hashlib,io
def dimensions(b):
 assert b[:2]==bytes([255,216]) and b[-2:]==bytes([255,217])
 i=2
 while i<len(b):
  assert b[i]==255
  while b[i]==255:i+=1
  marker=b[i];i+=1
  if marker in [216,217] or 208<=marker<=215:continue
  n=int.from_bytes(b[i:i+2],'big');assert n>=2
  if marker in [192,193,194]:return int.from_bytes(b[i+5:i+7],'big'),int.from_bytes(b[i+3:i+5],'big')
  i+=n
 raise ValueError('No JPEG dimensions')
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 m=json.loads(z.read('captions.json'))
 rows=[]
 for n in z.namelist():
  if n.endswith('.jpg'):
   b=z.read(n);width,height=dimensions(b)
   rows.append({'name':n,'sha256':hashlib.sha256(b).hexdigest(),'base64':base64.b64encode(b).decode(),'width':width,'height':height})
 print(json.dumps({'names':z.namelist(),'manifest':m,'images':rows}))`,file],{encoding:'utf8'}));await fs.writeFile(out(label+'-extracted.json'),JSON.stringify(extracted,null,2));const photos=[...before.photos].reverse();expect(extracted.images).toHaveLength(photos.length);for(let i=0;i<photos.length;i++){expect(extracted.images[i].base64).toBe(photos[i].dataUrl.split(',')[1]);expect(extracted.manifest.photos[i].caption).toBe(photos[i].caption);expect(extracted.manifest.photos[i].id).toBe(photos[i].id);expect(extracted.manifest.photos[i].width).toBe(extracted.images[i].width);expect(extracted.manifest.photos[i].height).toBe(extracted.images[i].height);}const after=(await phase(label+'-after'))!;for(const k of['inventory','agent','pending','edits','cameras','photos','photoRaw','save','journal']as const)expect(after[k]).toEqual(before[k]);expect(after.errors).toEqual([]);expect(after.saveError).toBe('');};
  try{
   await page.goto('/');const raw=serializeSave(heldCameraFixture(false));await fs.writeFile(out('disclosed-fixture.json'),raw);await press(page.getByRole('button',{name:'Import world / backup',exact:true}));const chooser=page.waitForEvent('filechooser');await press(page.getByRole('button',{name:'Choose world backup',exact:true}));await(await chooser).setFiles({name:'portfolio-controlled.json',mimeType:'application/json',buffer:Buffer.from(raw)});const existing=await page.evaluate(()=>localStorage.getItem('craft.save.v1'));await press(page.getByRole('button',{name:existing===null?'Import world':'Replace current world',exact:true}));await press(page.getByRole('button',{name:/^Continue “/}));await waitForTerrain(page);
   if(!empty){for(const slot of[0,2]){if(touch)await press(page.locator(`.hotbar [data-slot="${slot}"]`));else await page.keyboard.press(`Digit${slot+1}`);const n=(await read())!.photos.length;await press(page.getByRole('button',{name:'Take held photo',exact:true}));await expect.poll(async()=>(await read())!.photos.length).toBe(n+1);}}
   await press(page.getByRole('button',{name:'Portfolio',exact:true}));await expect(page.locator('.portfolio-screen')).toBeVisible();const exportButton=page.getByRole('button',{name:'Export Portfolio',exact:true});const b=await exportButton.boundingBox();expect(b!.height).toBeGreaterThanOrEqual(44);expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(viewport.width);
   if(empty){expect((await read())!.photos).toEqual([]);await expect(exportButton).toBeDisabled();let downloads=0;const onDownload=()=>downloads++;page.on('download',onDownload);await phase('empty-disabled-no-download');await page.waitForTimeout(120);expect(downloads).toBe(0);page.off('download',onDownload);}else{const captions=page.getByRole('textbox',{name:'Photo caption',exact:true});for(let i=0;i<await captions.count();i++){await captions.nth(i).fill(`世界 한글 🐏 ${tag} ${i}`);await captions.nth(i).press('Tab');}await exportZIP('live');await press(page.getByRole('button',{name:'Close portfolio',exact:true}));if(touch)await press(page.getByRole('button',{name:'Pause',exact:true}));else await page.keyboard.press('Escape');await press(page.getByRole('button',{name:'Save & Quit to Title',exact:true}));await page.reload();await press(page.getByRole('button',{name:/^Continue “/}));await waitForTerrain(page);await press(page.getByRole('button',{name:'Portfolio',exact:true}));await exportZIP('cold');}
   await phase('complete');completed=true;
  }finally{await fs.writeFile(out('ledger.json'),JSON.stringify({revision,viewport,touch,empty,completed,fixtureIsControlled:true,nativeArchiveLayoutCalibrated:false,legacyConversionBrowserCovered:false,rows},null,2));}
 }
}
