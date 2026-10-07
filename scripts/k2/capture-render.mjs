import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.K2_BASE_URL||'http://127.0.0.1:5173';
const output='evidence/k2/polish';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[],assets=[],states=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  page.on('request',r=>{if(r.url().includes('/k2/'))assets.push(r.url().split('/k2/')[1]);});
  await page.goto(base);await page.waitForFunction(()=>window.__K2?.info().frames>0);
  const capture=async name=>{
    await page.waitForTimeout(700);
    await page.screenshot({path:output+'/'+name+'.png'});
    states.push({name,info:await page.evaluate(()=>window.__K2.info())});
  };
  await capture('general');
  await page.locator('#quality').selectOption('medium');
  await page.waitForFunction(()=>window.__K2.info().geometryProfile==='medium');
  await capture('general-medium');
  await page.evaluate(()=>window.__K2.view('bottleneck'));
  await page.locator('#quality').selectOption('high');
  await page.waitForFunction(()=>window.__K2.info().geometryProfile==='high');
  await capture('bottleneck');
  await page.getByRole('button',{name:'Cambiar a luz de tarde'}).click();
  await capture('evening');
  await page.getByRole('button',{name:'Cambiar a luz de día'}).click();
  await page.locator('#quality').selectOption('medium');
  for(const view of ['north','east']) {
    await page.evaluate(v=>window.__K2.view(v),view);await capture(view);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Rutas y capas'}).click();
  await page.locator('#quality').selectOption('low');
  await page.getByRole('button',{name:'Rutas y capas'}).click();
  await page.evaluate(()=>window.__K2.view('general'));await capture('mobile');
  await writeFile(output+'/render-check.json',JSON.stringify({date:new Date().toISOString(),base,errors,assets,states},null,2));
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log('Captured all profiles, terrain orientations, close-up, light presets and mobile. No browser errors.');
} finally {await browser.close();}
