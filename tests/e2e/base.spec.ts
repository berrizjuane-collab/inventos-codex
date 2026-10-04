import { test, expect } from '@playwright/test';
test('sirve la aplicación en español',async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:'Campo',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang','es');});
