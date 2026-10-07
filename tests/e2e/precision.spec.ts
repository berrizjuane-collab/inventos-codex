import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import {defaultConfig} from '../../src/experiment/defaults';
import type {ExperimentConfigV1} from '../../src/experiment/types';

async function ready(page:Page){await expect.poll(()=>page.evaluate(()=>{const d=(window as any).__campoDiagnostics?.();return !!d?.stats&&!d.busy})).toBe(true);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))}
async function load(page:Page,config:ExperimentConfigV1){await page.getByRole('button',{name:'Archivos y exportación'}).click();await page.getByLabel('Archivo de configuración').setInputFiles({name:'precision.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(page.locator('.files-dialog')).not.toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).__campoDiagnostics().config.domain)).toEqual(config.domain);await ready(page);await page.getByRole('button',{name:'Restablecer cámara'}).click();await ready(page)}

test('Precisión gráfica: caja de 0,001 cerca de 10 000, selección mundial y exportación',async({page})=>{
 await page.goto('/laboratorio/');await ready(page);
 // Keep the canvas size equal: domain strings legitimately wrap differently in the legend.
 const fixedLayout=await page.addStyleTag({content:'.legend{display:none!important}'});
 const c=defaultConfig();c.fieldId='uniform';c.components=['1','0','0'];c.resolution=21;c.layers.axes=false;c.layers.seeds=false;c.seeds=[];c.scales.directionOnly=true;c.inspected=[0,0,0];
 const lower=9999.999,upper=10000,width=upper-lower,mid=(lower+upper)/2;
 c.domain=[[-width/2,-width/2,-width/2],[width/2,width/2,width/2]];c.slice.position=0;c.inspected=[10,10,10];await load(page,c);
 await page.evaluate(()=>{const canvas=document.querySelector('.scene-host canvas') as HTMLCanvasElement;const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d')!;ctx.drawImage(canvas,0,0);(window as any).__precisionReference=ctx.getImageData(0,0,copy.width,copy.height).data});
 c.domain=[[lower,lower,lower],[upper,upper,upper]];c.slice.position=mid;c.inspected=[0,0,0];await load(page,c);
 // Selection lies outside the box during comparison, so coordinate labels cannot affect pixels.
 const comparison=await page.evaluate(()=>{const canvas=document.querySelector('.scene-host canvas') as HTMLCanvasElement;const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d')!;ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data,reference=(window as any).__precisionReference as Uint8ClampedArray;if(pixels.length!==reference.length)throw new Error(`Canvas dimensions changed: ${pixels.length} vs ${reference.length}`);let foreground=0,error=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]>20||reference[i]>20){foreground++;error+=Math.abs(pixels[i]-reference[i])}}return {width:canvas.width,height:canvas.height,foreground,meanForegroundDifference:error/foreground}});
 expect(comparison.foreground).toBeGreaterThan(500);expect(comparison.meanForegroundDifference).toBeLessThan(3);
 await fixedLayout.evaluate(element=>element.parentNode?.removeChild(element));c.layers.cut=true;c.layers.scalar='magnitude';c.inspected=[mid,mid,mid];await load(page,c);await page.getByText('Cortes y análisis',{exact:true}).click();await page.getByRole('button',{name:'Vista perpendicular al corte'}).click();await ready(page);
 const canvas=page.locator('.scene-host canvas');const bounds=(await canvas.boundingBox())!;await canvas.click({position:{x:bounds.width*.45,y:bounds.height*.55}});await ready(page);await expect.poll(()=>page.evaluate(()=>(window as any).__campoDiagnostics().selected?.point[2])).toBe(mid);
 const state=await page.evaluate(()=>(window as any).__campoDiagnostics());expect(state.config.inspected.every((v:number)=>v>=9999.999&&v<=10000)).toBe(true);expect(state.config.inspected[2]).toBe(mid);expect(Math.abs(state.config.inspected[0]-mid)).toBeGreaterThan(width*.01);expect(Math.abs(state.config.inspected[1]-mid)).toBeGreaterThan(width*.01);await expect(page.getByLabel('Inspector puntual')).toBeVisible();expect(state.selected.evaluation.vector).toEqual([1,0,0]);expect(state.selected.derivative.divergence).toBe(0);
 await page.screenshot({path:'evidence/captures/final-narrow-offset-domain.png'});
 await page.getByRole('button',{name:'Archivos y exportación'}).click();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'PNG · 1600 × 1000'}).click();await(await downloading).saveAs('evidence/exports/narrow-offset-1600.png');await ready(page);
 await page.getByRole('button',{name:'Archivos y exportación'}).click();const saving=page.waitForEvent('download');await page.getByRole('button',{name:'Guardar configuración JSON'}).click();const downloaded=await saving;const json=JSON.parse(await fs.readFile((await downloaded.path())!,'utf8'));expect(json.domain).toEqual(c.domain);expect(json.camera).toEqual(state.config.camera);expect(json.inspected).toEqual(state.config.inspected);
 await fs.writeFile('evidence/graphics-precision.json',JSON.stringify({comparison,domain:c.domain,state,json},null,2));
});
