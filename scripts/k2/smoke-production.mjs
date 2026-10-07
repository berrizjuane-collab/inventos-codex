import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const base=process.env.K2_BASE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.waitForFunction(()=>window.__K2);
  await page.screenshot({path:'evidence/k2/production-general.png'});
  await page.getByRole('button',{name:'Puntos de interés',exact:true}).click();
  await page.getByRole('button',{name:/Bottleneck reconstruido/}).click();
  await page.locator('#quality').selectOption('medium');
  await page.waitForFunction(()=>window.__K2.info().loadedLevels.includes('medium'));
  if(await page.evaluate(()=>window.__K2.info().selected)!=='bottleneck')throw Error('Selection lost on quality change');
  await page.locator('#quality').selectOption('low');
  await page.getByRole('button',{name:'Enfocar este punto'}).click();
  await page.getByRole('button',{name:'Cerrar ficha del punto'}).click();
  await page.screenshot({path:'evidence/k2/production-bottleneck.png'});
  await page.evaluate(()=>window.__K2.view('general'));
  const layouts=[];
  for(const [width,height] of [[1440,900],[1280,720],[390,844]]) {
    await page.setViewportSize({width,height});
    if(width===390) {
      await page.getByRole('button',{name:'Rutas y capas'}).click();
      await page.locator('#quality').scrollIntoViewIfNeeded();
    }
    const layout=await page.evaluate(()=>{
      const a=document.querySelector('.mountain-identity').getBoundingClientRect();
      const b=document.querySelector('.explore-panel').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
        identityBottom:a.bottom,panelTop:b.top,panelBottom:b.bottom};
    });
    if(layout.overflow||layout.identityBottom>layout.panelTop)throw Error('Layout overlap: '+JSON.stringify(layout));
    layouts.push(layout);await page.screenshot({path:'evidence/k2/production-'+width+'.png'});
    if(width===390)await page.getByRole('button',{name:'Rutas y capas'}).click();
  }
  await page.goto(base+'/laboratorio/');await page.waitForSelector('canvas');
  if(await page.title()!=='Campo · Laboratorio vectorial')throw Error('Legacy title');
  if(errors.length)throw Error(JSON.stringify(errors));
  await writeFile('evidence/k2/production-smoke.json',JSON.stringify({date:new Date().toISOString(),base,
    layouts,selectionSurvivesQuality:true,legacyProduction:true,errors},null,2));
  console.log('Production smoke passed: three layouts, selection/quality, legacy; no browser errors.');
} finally {await browser.close();}
