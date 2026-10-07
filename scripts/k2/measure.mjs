import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.K2_BASE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(base);await page.waitForFunction(()=>window.__K2);
await page.locator('#quality').selectOption('low');
const environment=await page.evaluate(()=>{
  const gl=document.querySelector('canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,
    gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
    viewport:[innerWidth,innerHeight],devicePixelRatio,physicalPhone:false};
});
const initialNetwork=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize})));
const results=[];
for(const scenario of ['general-orbit','bottleneck','all-layers']){
  await page.evaluate(s=>window.__K2.view(s==='bottleneck'?'bottleneck':'general'),scenario);
  if(scenario==='all-layers'){
    const cesen=page.getByRole('button',{name:'Česen / Basque',exact:false});if(await cesen.getAttribute('aria-pressed')==='false')await cesen.click();
    const zone=page.getByRole('switch',{name:'Zona de la muerte'});if(await zone.getAttribute('aria-checked')==='false')await zone.click();
  }
  await page.waitForTimeout(1200);
  const result=await page.evaluate(async scenario=>{
    const api=window.__K2;
    api.clearMetrics();
    const samples=[],start=performance.now();let previous=null,angle=0;
    await new Promise(resolve=>{
      const tick=time=>{
        if(previous!==null){const dt=time-previous;samples.push(dt);
          const next=scenario==='bottleneck'?.12*Math.sin((time-start)/2400):angle+.19*dt/1000;
          api.orbit(next-angle);angle=next;}
        previous=time;
        if(time-start>=30000)resolve();else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sorted=[...samples].sort((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)];
    return {scenario,durationMs:performance.now()-start,samples:samples.length,
      medianFrameMs:q(.5),p95FrameMs:q(.95),minFrameMs:sorted[0],maxFrameMs:sorted.at(-1),
      medianEquivalentFPS:1000/q(.5),info:api.info()};
  },scenario);
  results.push(result);console.log(JSON.stringify(result));
}
await page.waitForTimeout(500);
const idleStart=await page.evaluate(()=>window.__K2.info().frames);await page.waitForTimeout(1000);
const idleEnd=await page.evaluate(()=>window.__K2.info().frames);
const artifact={date:new Date().toISOString(),base,environment,initialNetwork,initialTransferBytes:initialNetwork.reduce((n,r)=>n+r.transferSize,0),
  results,idleFramesDuringOneSecond:idleEnd-idleStart,errors,
  limits:'Headless Chromium on a 3-core Linux cloud container, ANGLE SwiftShader CPU rendering. These are not phone measurements or hardware GPU guarantees.'};
await mkdir('evidence/k2',{recursive:true});await writeFile('evidence/k2/performance.json',JSON.stringify(artifact,null,2));
console.log(JSON.stringify({complete:true,idleFrames:idleEnd-idleStart,errors}));
await browser.close();
