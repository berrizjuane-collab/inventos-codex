import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
test('Todos los controles desplegados son alcanzables por teclado',async({page})=>{
 await page.goto('/laboratorio/');await expect(page.locator('.scene-host canvas')).toBeVisible();await page.getByLabel('Campo del catálogo').selectOption('helix');await expect(page.getByLabel('Valor de a',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Abrir inspector'}).click();await expect(page.getByLabel('Inspector puntual')).toContainText('Resultado en');
 const expected=await page.evaluate(()=>{document.querySelectorAll('details').forEach(d=>d.open=true);return [...document.querySelectorAll<HTMLElement>('button,input,select,summary,canvas,[tabindex]')].filter(e=>e.tabIndex>=0&&!e.matches(':disabled')&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).map((e,i)=>{e.dataset.keyboardId=String(i);return {id:String(i),tag:e.tagName,label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,100)||e.getAttribute('id')}})});
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();await fs.writeFile('evidence/accessibility-expanded.json',JSON.stringify(audit,null,2));expect(audit.violations).toEqual([]);
 await page.getByRole('button',{name:'Archivos y exportación'}).focus();await page.keyboard.press('Tab');const reached=new Set<string>();for(let i=0;i<expected.length+5;i++){const focus=await page.evaluate(()=>{const e=document.activeElement as HTMLElement;return {id:e.dataset?.keyboardId,outline:getComputedStyle(e).outlineStyle}});if(focus.id){reached.add(focus.id);expect(focus.outline,JSON.stringify(focus)).not.toBe('none')}await page.keyboard.press('Tab')}
 await fs.writeFile('evidence/keyboard.json',JSON.stringify({expected,reached:[...reached],allReachable:expected.every(e=>reached.has(e.id))},null,2));expect(expected.filter(e=>!reached.has(e.id))).toEqual([]);
});
