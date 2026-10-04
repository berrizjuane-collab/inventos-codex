import { test, expect } from '@playwright/test';
import fs from 'node:fs';
test('H1: composición, cámara y muestras',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('.scene-host canvas')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 for(const [width,height] of [[1440,900],[1280,720]]){await page.setViewportSize({width,height});await page.waitForTimeout(300);await expect(page.locator('.stage h2')).toHaveText('Rotacional');const boxes=await page.evaluate(()=>{const names=['.topbar','.sidebar','.scene-area','.legend'];return names.map(s=>{const r=document.querySelector(s)!.getBoundingClientRect();return{selector:s,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})});expect(boxes[1].width).toBe(320);expect(boxes[2].bottom).toBeLessThanOrEqual(boxes[3].y);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`evidence/captures/h1-${width}x${height}.png`});}
 await page.getByRole('button',{name:'XY',exact:true}).click();const canvas=page.locator('.scene-host canvas');await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('+');await page.keyboard.press('Home');await page.getByRole('button',{name:'Abrir inspector'}).click();await expect(page.getByLabel('Inspector puntual')).toContainText('(0; 1; 0)');
 const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2');if(!gl)return{webgl2:false};const ext=gl.getExtension('WEBGL_debug_renderer_info');return{webgl2:true,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),browser:navigator.userAgent}});
 fs.writeFileSync('evidence/h1-browser.json',JSON.stringify({gpu,errors},null,2));expect(errors).toEqual([]);
});
