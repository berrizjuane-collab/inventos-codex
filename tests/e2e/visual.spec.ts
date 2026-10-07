import fs from 'node:fs/promises';
import { test, expect, type Page, type TestInfo, type CDPSession } from '@playwright/test';
import { defaultConfig, generateSeeds } from '../../src/experiment/defaults';
import type { ExperimentConfigV1 } from '../../src/experiment/types';

/** Run separately and serially: pnpm exec playwright test tests/e2e/visual.spec.ts --workers=1 */
const sizes = [
  { width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 },
] as const;
type ScenarioId = 'initial' | 'helix-editor-inspector' | 'lines' | 'magnitude-slice'
  | 'divergence-positive' | 'divergence-negative' | 'divergence-zero' | 'curl'
  | 'invalid-expression' | 'partial-field' | 'maximum-density' | 'menu-help-focus' | 'reduced-motion-zoom200';
const scenarios: { id: ScenarioId; name: string }[] = [
  { id: 'initial', name: 'Pantalla inicial' },
  { id: 'helix-editor-inspector', name: 'Editor, parámetro helicoidal e inspector' },
  { id: 'lines', name: 'Líneas de corriente y sentido' },
  { id: 'magnitude-slice', name: 'Magnitud en corte perpendicular' },
  { id: 'divergence-positive', name: 'Divergencia positiva' },
  { id: 'divergence-negative', name: 'Divergencia negativa' },
  { id: 'divergence-zero', name: 'Divergencia nula' },
  { id: 'curl', name: 'Rotacional con doble punta' },
  { id: 'invalid-expression', name: 'Borrador inválido y error accesible' },
  { id: 'partial-field', name: 'Campo parcialmente definido, huecos y signos' },
  { id: 'maximum-density', name: 'Densidad máxima y saturación' },
  { id: 'menu-help-focus', name: 'Archivos, ayuda y foco de teclado' },
  { id: 'reduced-motion-zoom200', name: 'Movimiento reducido y distribución equivalente a zoom 200 %' },
];

interface Diagnostics {
  revision?: number; busy?: boolean; stats?: { valid: number; invalid: number; partial: boolean; linesMs: number };
  config?: ExperimentConfigV1; selected?: unknown; scene?: unknown;
}
async function diagnostics(page: Page): Promise<Diagnostics | null> {
  return page.evaluate(() => {
    const read = (window as unknown as { __campoDiagnostics?: () => unknown }).__campoDiagnostics;
    return read ? read() as Diagnostics : null;
  });
}
async function ready(page: Page, config?: ExperimentConfigV1) {
  await expect(page.locator('.scene-host canvas')).toBeVisible();
  await expect.poll(async () => {
    const result = await diagnostics(page);
    if (!result?.revision || result.busy || !result.stats || !result.config) return false;
    if (!config) return true;
    return result.config.fieldId === config.fieldId
      && result.config.components.join('|') === config.components.join('|')
      && result.config.resolution === config.resolution
      && JSON.stringify(result.config.parameters) === JSON.stringify(config.parameters)
      && result.config.layers.lines === config.layers.lines
      && result.config.layers.cut === config.layers.cut
      && result.config.layers.scalar === config.layers.scalar
      && (!config.layers.cut || JSON.stringify(result.config.slice) === JSON.stringify(config.slice));
  }, { timeout: 15_000, message: 'La revisión aplicada debe corresponder al escenario y haber terminado sus workers.' }).toBe(true);
  await expect(page.getByRole('status')).not.toContainText('Calculando');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}
async function importExperiment(page: Page, config: ExperimentConfigV1) {
  await page.getByRole('button', { name: 'Archivos y exportación', exact: true }).click();
  await page.getByLabel('Archivo de configuración', { exact: true }).setInputFiles({
    name: 'escenario-visual.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.locator('.files-dialog')).not.toBeVisible();
  await ready(page, config);
}
async function openControls(page: Page) {
  if (!await page.getByLabel('Controles del experimento', { exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click();
  }
  await expect(page.getByLabel('Controles del experimento', { exact: true })).toBeVisible();
}
async function closeControls(page: Page) {
  const close = page.getByRole('button', { name: 'Cerrar controles', exact: true });
  if (await close.isVisible()) await close.click();
}
function preset(id: ExperimentConfigV1['fieldId']): ExperimentConfigV1 {
  const config = defaultConfig(); config.graphics.pixelRatio = 1;
  if (id === 'helix') {
    config.fieldId = id; config.components = ['-y', 'x', 'a'];
    config.parameters = { a: { value: 1, min: -3, max: 3, step: .1 } };
  } else if (id === 'outward' || id === 'inward') {
    config.fieldId = id; config.components = id === 'outward' ? ['x', 'y', 'z'] : ['-x', '-y', '-z'];
  }
  return config;
}
function perpendicular(config: ExperimentConfigV1) {
  config.layers.cut = true;
  config.camera = { position: [0, 0, 20], target: [0, 0, 0], zoom: 1 };
  config.layers.seeds = false;
}
async function configure(page: Page, id: ScenarioId) {
  if (id === 'initial' || id === 'menu-help-focus' || id === 'reduced-motion-zoom200') return;
  const config = preset(id === 'lines' || id === 'magnitude-slice' || id === 'helix-editor-inspector' ? 'helix'
    : id === 'divergence-positive' ? 'outward' : id === 'divergence-negative' ? 'inward' : 'rotation');
  if (id === 'lines') {
    config.layers.lines = true; config.layers.arrows = false;
    config.seeds = generateSeeds(config.domain, 16);
  } else if (id === 'magnitude-slice') {
    perpendicular(config); config.layers.scalar = 'magnitude';
  } else if (id.startsWith('divergence-')) {
    perpendicular(config); config.layers.scalar = 'divergence';
  } else if (id === 'curl') {
    config.layers.vectors = 'curl'; config.layers.seeds = false;
  } else if (id === 'partial-field') {
    config.fieldId = 'custom'; config.components = ['1/x', 'sqrt(y)', '0'];
    perpendicular(config); config.layers.scalar = 'magnitude'; config.scales.magnitude = 3;
  } else if (id === 'maximum-density') {
    config.resolution = 21; config.layers.seeds = false;
  } else if (id === 'helix-editor-inspector') {
    config.inspected = [1.125, -.375, .5];
  }
  await importExperiment(page, config);
  if(config.layers.cut){await openControls(page);await page.getByText('Cortes y análisis',{exact:true}).click();await page.getByRole('button',{name:'Vista perpendicular al corte'}).click();await closeControls(page);await ready(page)}
  if (id === 'helix-editor-inspector') {
    await openControls(page);
    await page.getByLabel('Valor de a', { exact: true }).fill('1.25');
    config.parameters.a!.value = 1.25;
    await ready(page, config);
    await closeControls(page);
    await page.getByRole('button', { name: 'Abrir inspector', exact: true }).click();
    await expect(page.getByLabel('Inspector puntual', { exact: true })).toContainText('Resultado en');
    await expect(page.getByLabel('Inspector puntual', { exact: true })).toContainText('1,25');
  } else if (id === 'invalid-expression') {
    await openControls(page);
    await page.getByLabel('Componente P', { exact: true }).fill('sin(');
    await expect(page.getByLabel('Componente P', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Aplicar', exact: true })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Cambios sin aplicar');
    await expect(page.locator('.stage h2')).toHaveText('Rotacional');
  } else {
    await closeControls(page);
  }
  if (id === 'lines') {
    const text = await page.locator('.legend-stats').innerText();
    const count = text.match(/([\d.]+)\s+vértices/);
    expect(count, 'La leyenda debe publicar el número de vértices.').not.toBeNull();
    expect(Number(count![1].replaceAll('.', ''))).toBeGreaterThan(0);
  }
  if (id === 'partial-field') expect((await diagnostics(page))?.stats?.invalid).toBeGreaterThan(0);
  if (id === 'maximum-density') await expect(page.locator('.scene-badge')).toContainText('21³');
}
async function menuAndFocus(page: Page) {
  const files = page.getByRole('button', { name: 'Archivos y exportación', exact: true });
  await files.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Guardar y recuperar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar configuración JSON', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(files).toBeFocused();
  const help = page.getByRole('button', { name: 'Ayuda', exact: true });
  await help.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Explorar un campo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar ayuda', exact: true }).focus();
}
async function geometry(page: Page, testInfo: TestInfo) {
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const b = node.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom };
    };
    const visible = (selector: string) => {
      const node = document.querySelector(selector);
      return node instanceof HTMLElement && node.getBoundingClientRect().width > 0 && getComputedStyle(node).display !== 'none';
    };
    return {
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      stage: rect('.stage'), scene: rect('.scene-area'), legend: rect('.legend'),
      overlay: Boolean(document.querySelector('dialog[open]')) || visible('.sidebar.open') || visible('.inspector'),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
  await testInfo.attach('layout-and-diagnostics', { body: JSON.stringify({ bounds, diagnostics: await diagnostics(page) }, null, 2), contentType: 'application/json' });
  expect(bounds.documentWidth, 'La página completa no debe tener desplazamiento horizontal.').toBeLessThanOrEqual(bounds.width + 1);
  // Drawers and modal dialogs intentionally cover the stage; inspect their screenshot separately.
  if (!bounds.overlay) {
    expect(bounds.stage).not.toBeNull(); expect(bounds.scene).not.toBeNull(); expect(bounds.legend).not.toBeNull();
    expect(bounds.scene!.height).toBeGreaterThan(0);
    expect(bounds.legend!.x).toBeGreaterThanOrEqual(bounds.stage!.x - 1);
    expect(bounds.legend!.right).toBeLessThanOrEqual(bounds.stage!.right + 1);
    expect(bounds.legend!.y).toBeGreaterThanOrEqual(bounds.stage!.y - 1);
    expect(bounds.legend!.bottom).toBeLessThanOrEqual(Math.min(bounds.stage!.bottom, bounds.height) + 1);
  }
  return bounds;
}

for (const size of sizes) {
  test.describe(`Revisión visual ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });
    for (const scenario of scenarios) {
      test(`${scenario.id}: ${scenario.name}`, async ({ page, context }, testInfo) => {
        let zoomSession:CDPSession|undefined;
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        if (scenario.id === 'reduced-motion-zoom200') {
          await page.emulateMedia({ reducedMotion: 'reduce' });
          const cdp = await context.newCDPSession(page);zoomSession=cdp;
          // Layout-equivalent simulation, not a claim that Chromium's native browser zoom changed.
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: Math.floor(size.width / 2), height: Math.floor(size.height / 2),
            deviceScaleFactor: 2, mobile: false, screenWidth: size.width, screenHeight: size.height,
          });
          await testInfo.attach('zoom-scope', { body: 'Emulación CDP: área CSS al 50 %, DPR 2. Zoom nativo del navegador pendiente de comprobación humana.', contentType: 'text/plain' });
        }
        await page.goto('/laboratorio/'); await ready(page); await configure(page, scenario.id);
        if (scenario.id === 'menu-help-focus') await menuAndFocus(page);
        if (scenario.id === 'reduced-motion-zoom200') {
          await openControls(page);
          await page.getByLabel('Componente P', { exact: true }).focus();
          expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
          expect(await page.evaluate(() => innerWidth)).toBe(Math.floor(size.width / 2));
        }
        await page.evaluate(() => document.fonts.ready);
        const bounds = await geometry(page, testInfo);
        for(const button of await page.locator('.view-group button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(40);
        const path = `evidence/captures/final-${scenario.id}-${size.width}x${size.height}.png`;
        if(zoomSession){await page.addStyleTag({content:'input{caret-color:transparent}'});const shot=await zoomSession.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});await fs.writeFile(path,Buffer.from(shot.data,'base64'));expect(await page.evaluate(()=>innerWidth)).toBe(Math.floor(size.width/2));expect(await page.evaluate(()=>devicePixelRatio)).toBe(2)}else await page.screenshot({ path, animations: 'disabled', caret: 'hide', scale: 'device' });
        await testInfo.attach('representative-capture', { path, contentType: 'image/png' });
        await testInfo.attach('capture-state', { body: JSON.stringify({ scenario: scenario.id, size, path, cssViewport: { width: bounds.width, height: bounds.height }, simulation: scenario.id === 'reduced-motion-zoom200' }, null, 2), contentType: 'application/json' });
        if (scenario.id === 'menu-help-focus') {
          await page.keyboard.press('Escape');
          await expect(page.getByRole('button', { name: 'Ayuda', exact: true })).toBeFocused();
        }
        expect(errors, 'Errores JavaScript durante el escenario.').toEqual([]);
      });
    }
  });
}
