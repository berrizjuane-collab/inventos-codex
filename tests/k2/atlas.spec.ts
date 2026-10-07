import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function ready(page:import('@playwright/test').Page){
  await page.goto('/');await page.waitForFunction(()=>!!(window as any).__K2);
  await expect(page.locator('.scene-error')).toHaveCount(0);
}
const info=(page:import('@playwright/test').Page)=>page.evaluate(()=>(window as any).__K2.info());
test('initial load, routes, layers and HTML point details preserve terrain and selection',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const assets:string[]=[];page.on('request',r=>{if(r.url().includes('/k2/')&&r.url().endsWith('.glb'))assets.push(r.url());});
  await ready(page);await expect(page.getByRole('heading',{name:'K2 Atlas interactivo'})).toBeVisible();
  await page.locator('#quality').selectOption('low');const before=await info(page);
  await page.getByRole('button',{name:'Česen / Basque',exact:false}).click();
  await page.getByRole('switch',{name:'Zona de la muerte'}).click();await page.getByRole('switch',{name:'Etiquetas',exact:true}).click();
  await page.getByRole('switch',{name:'Mostrar rutas'}).click();
  expect((await info(page)).layers).toMatchObject({routes:false,cesen:true,death:true,labels:false});
  await page.getByRole('button',{name:'Puntos de interés',exact:true}).click();
  await page.getByRole('button',{name:/Bottleneck reconstruido/}).click();
  await expect(page.locator('.point-card')).toContainText('8 200');
  await expect(page.locator('.point-card')).toContainText('Posición reconstruida');
  const after=await info(page);expect(after.terrainBuilds).toBe(before.terrainBuilds);expect(assets).toHaveLength(1);
  expect(after.selected).toBe('bottleneck');expect(errors).toEqual([]);
});
test('desktop and mobile layout, modal keyboard, touch-sized controls and screenshots',async({page})=>{
  await ready(page);await page.screenshot({path:'evidence/k2/general.png'});
  const overlap=await page.evaluate(()=>{
    const a=document.querySelector('.mountain-identity')!.getBoundingClientRect(),b=document.querySelector('.explore-panel')!.getBoundingClientRect();
    return a.bottom>b.top;
  });expect(overlap).toBe(false);
  await page.getByRole('button',{name:'Česen / Basque',exact:false}).click();
  await page.getByRole('switch',{name:'Zona de la muerte'}).click();await page.screenshot({path:'evidence/k2/routes.png'});
  await page.getByRole('button',{name:'Fuentes',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('no una medición de esa resolución');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'Rutas y capas'})).toBeVisible();
  await page.getByRole('button',{name:'Rutas y capas'}).click();await expect(page.getByRole('switch',{name:'Campamentos'})).toBeVisible();
  await page.getByRole('switch',{name:'Campamentos'}).click();expect((await info(page)).layers.camps).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'evidence/k2/mobile-panel.png'});
  await page.getByRole('button',{name:'Rutas y capas'}).click();await page.screenshot({path:'evidence/k2/mobile.png'});
  const sizes=await page.locator('.header-actions button,.zoom-controls button,.mobile-panel-button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
  expect(sizes.every(h=>h>=44)).toBe(true);
});
test('presets, opposite faces, zoom and surface clearance; reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page);
  for(const view of ['north','east','shoulder','bottleneck','summit','general']){
    await page.evaluate(v=>(window as any).__K2.view(v),view);
    const state=await info(page);expect(state.transition).toBe(false);expect(state.camera.distance).toBeGreaterThanOrEqual(500);
    expect(state.camera.distance).toBeLessThanOrEqual(14501);
    if(state.camera.clearance!==null)expect(state.camera.clearance).toBeGreaterThanOrEqual(114);
    if(['north','east','bottleneck'].includes(view))await page.screenshot({path:'evidence/k2/'+view+'.png'});
  }
  for(let i=0;i<25;i++)await page.getByRole('button',{name:'Acercar',exact:true}).click();
  const close=await info(page);expect(close.camera.distance).toBeGreaterThanOrEqual(499);
  if(close.camera.clearance!==null)expect(close.camera.clearance).toBeGreaterThanOrEqual(114);
  const canvas=page.getByRole('region',{name:/Vista tridimensional/});await canvas.focus();
  await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');
  expect((await info(page)).camera.position).not.toEqual(close.camera.position);
});
test('20 interaction cycles and quality changes retain stable resource counts',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page);await page.locator('#quality').selectOption('medium');
  await page.waitForFunction(()=>(window as any).__K2.info().loadedLevels.includes('medium'));
  await page.evaluate(()=>(window as any).__K2.view('bottleneck'));
  await page.locator('#quality').selectOption('high');await page.waitForFunction(()=>(window as any).__K2.info().loadedLevels.includes('high'));
  await page.locator('#quality').selectOption('low');await page.getByRole('button',{name:'Restablecer vista general'}).click();
  await page.waitForTimeout(500);const before=await info(page);const snapshots:unknown[]=[];
  for(let i=0;i<20;i++){
    await page.getByRole('switch',{name:'Mostrar rutas'}).click();
    await page.evaluate(i=>{(window as any).__K2.view(i%2?'general':'bottleneck');(window as any).__K2.focus(i%2?'camp1':'serac');},i);
    await page.locator('#quality').selectOption(i%2?'medium':'low');
    snapshots.push(await info(page));
  }
  await page.locator('#quality').selectOption('low');await page.getByRole('button',{name:'Restablecer vista general'}).click();await page.waitForTimeout(500);
  const after=await info(page);expect(after.terrainBuilds).toBe(3);expect(after.geometries).toBe(before.geometries);
  expect(after.textures).toBe(before.textures);expect(after.programs).toBeLessThanOrEqual(before.programs+1);
  await import('node:fs/promises').then(fs=>fs.writeFile('evidence/k2/resource-cycles.json',JSON.stringify({before,after,snapshots},null,2)));
});
test('WebGL fallback, actual asset error, retry and context restoration',async({page})=>{
  await page.goto('/?no-webgl=1');await expect(page.locator('.scene-error')).toBeVisible();
  await page.getByRole('button',{name:'Puntos de interés',exact:true}).click();await expect(page.getByRole('button',{name:/Cumbre \/ Summit/})).toBeVisible();
  await page.getByRole('button',{name:'Cerrar ventana'}).click();
  await page.route('**/k2/heights.bin',r=>r.abort());await page.goto('/');await expect(page.locator('.scene-error')).toBeVisible();
  await page.unroute('**/k2/heights.bin');await page.getByRole('button',{name:'Reintentar'}).click();await page.waitForFunction(()=>!!(window as any).__K2);
  await page.evaluate(()=>{
    const canvas=document.querySelector('canvas')!,gl=canvas.getContext('webgl2')!,ext=gl.getExtension('WEBGL_lose_context')!;
    (window as any).__restoreContext=()=>ext.restoreContext();ext.loseContext();
  });
  await expect(page.locator('.scene-error')).toContainText('Se perdió el contexto');
  await page.evaluate(()=>(window as any).__restoreContext());await expect(page.locator('.scene-error')).toHaveCount(0);
});
test('accessible HTML controls and dialogs',async({page})=>{
  await ready(page);
  let result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.getByRole('button',{name:'Puntos de interés',exact:true}).click();
  result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});
test('existing vector laboratory remains available',async({page})=>{
  await page.goto('/laboratorio/');await expect(page).toHaveTitle('Campo · Laboratorio vectorial');
  await expect(page.getByText('Laboratorio de campos vectoriales',{exact:false}).first()).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
});
test('touch orbit and pinch, and manual input interrupts a camera transition',async({page})=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  const session=await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const before=await info(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:420}]});
  for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120+i*8,y:420+i*2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(600);const orbit=await info(page);expect(orbit.camera.position).not.toEqual(before.camera.position);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:110,y:430},{x:180,y:430}]});
  for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110-i*3,y:430},{x:180+i*3,y:430}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(600);const pinch=await info(page);expect(pinch.camera.distance).toBeLessThan(orbit.camera.distance);
  await page.evaluate(()=>(window as any).__K2.view('bottleneck'));
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:430}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y:440}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(250);expect((await info(page)).transition).toBe(false);
});
