import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

async function settled(page:Page,field:string){await expect.poll(()=>page.evaluate(field=>{const d=(window as any).__campoDiagnostics?.();return d?.config.fieldId===field&&!d.busy&&d.scene.lineVertices>0&&d.stats.linesMs>0},field)).toBe(true)}

test('Estado pendiente y líneas se conservan con respuestas de campo y líneas retrasadas',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).__workerDelay={field:0,lines:0};(window as any).__workerTrace=[];
  const Native=Worker;
  window.Worker=class extends Native{
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);let listener:((event:MessageEvent)=>void)|null=null;Object.defineProperty(this,'onmessage',{get:()=>listener,set:(next:typeof listener)=>{listener=next}});this.addEventListener('message',event=>{const message=event as MessageEvent;const kind=message.data?.type==='result'?'field':message.data?.type==='lines'?'lines':null;const delay=kind?(window as any).__workerDelay[kind]:0;const deliver=()=>{(window as any).__workerTrace.push({type:message.data.type,revision:message.data.revision,id:message.data.id,delay});listener?.(message)};if(delay)setTimeout(deliver,delay);else deliver()})}
  };
 });
 await page.goto('/');await expect(page.locator('.scene-host canvas')).toBeVisible();await page.getByText('Líneas de corriente',{exact:true}).click();await page.getByLabel('Mostrar líneas',{exact:true}).check();await settled(page,'rotation');
 // Delaying field publication must retain the previous applied field while blocking exports.
 await page.evaluate(()=>{(window as any).__workerDelay.field=900});await page.getByLabel('Campo del catálogo').selectOption('helix');await expect.poll(()=>page.evaluate(()=>(window as any).__campoDiagnostics().busy)).toBe(true);await page.getByRole('button',{name:'Archivos y exportación'}).click();await expect(page.getByRole('button',{name:'Guardar configuración JSON'})).toBeDisabled();await expect(page.getByRole('button',{name:'PNG · 1600 × 1000'})).toBeDisabled();await page.getByRole('button',{name:'Cerrar archivos'}).click();await settled(page,'helix');
 // Delaying lines independently must keep the new applied field and report pending geometry.
 await page.evaluate(()=>{(window as any).__workerDelay={field:0,lines:900}});await page.getByLabel('Campo del catálogo').selectOption('outward');await expect.poll(()=>page.evaluate(()=>(window as any).__campoDiagnostics().config.fieldId)).toBe('outward');await expect.poll(()=>page.evaluate(()=>(window as any).__campoDiagnostics().busy)).toBe(true);await page.getByRole('button',{name:'Archivos y exportación'}).click();await expect(page.getByRole('button',{name:'Guardar configuración JSON'})).toBeDisabled();await page.getByRole('button',{name:'Cerrar archivos'}).click();await settled(page,'outward');
 // A delayed obsolete line reply cannot replace the final catalogue selection.
 await page.getByLabel('Campo del catálogo').selectOption('helix');await expect.poll(()=>page.evaluate(()=>(window as any).__campoDiagnostics().config.fieldId)).toBe('helix');await page.waitForTimeout(450);await page.getByLabel('Campo del catálogo').selectOption('rotation');await settled(page,'rotation');await page.waitForTimeout(1000);const final=await page.evaluate(()=>(window as any).__campoDiagnostics());expect(final.config.fieldId).toBe('rotation');expect(final.scene.lineVertices).toBeGreaterThan(0);expect(final.busy).toBe(false);
 await fs.writeFile('evidence/async-state.json',JSON.stringify({final,trace:await page.evaluate(()=>(window as any).__workerTrace)},null,2));
});
