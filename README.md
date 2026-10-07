# K2 — Atlas interactivo

Atlas geográfico 3D en español sobre el React, TypeScript y Three.js existente en `inventos-codex`, en la rama `feat/k2-atlas`. El laboratorio anterior se conserva en **/laboratorio/**, con su código y pruebas ([guía anterior](docs/VECTOR-LAB.md)). La entrega se aloja en GPT Sites, con acceso privado del propietario. La identidad está en [.openai/hosting.json](.openai/hosting.json).

## Ejecutar

Node.js ≥24 y pnpm 11.19.0, según el lockfile original:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abrir http://localhost:5173/ para el atlas y http://localhost:5173/laboratorio/ para el laboratorio conservado.

```sh
pnpm check
pnpm test
pnpm exec playwright test -c playwright.k2.config.ts
pnpm build
pnpm preview --port 4173
```

`dist/` es estático. No requiere API, cuenta cartográfica, CDN ni conexión externa para dibujar el terreno. WebGL2 es necesario para la escena; fichas y referencias HTML funcionan sin él. No abrir `index.html` directamente. No existe un script de lint.

## Explorar

Arrastrar para orbitar; rueda o pinza para ampliar; botón derecho o dos dedos para desplazar. También hay botones +/− y reset. Con la región 3D enfocada: flechas para orbitar, Shift + flechas para desplazar, +/− para zoom y Home para encuadrar. Escape cierra fichas y ventanas.

- Abruzzi: azul continuo; Česen: ámbar discontinuo. Un único tramo blanco une Hombro, Bottleneck, travesía y cumbre.
- Campamentos Abruzzi: cotas de una expedición de 2023; Česen: referencias independientes de 1996. Se declara la incertidumbre.
- Etiquetas, campamentos y máscara de 8 000 m son independientes. Se resuelven oclusión y solapamientos de etiquetas.
- Las fichas permiten enfocar y consultar fuentes sin perder rutas ni capas. La lista HTML funciona aunque falle la escena.
- Vistas general, Abruzzi, Hombro, Bottleneck, cumbre, norte y este. Movimiento reducido; sin autorrotación.
- Calidad Auto / Alta / Media / Baja y luz día / tarde. La cámara comprueba terreno y malla de hielo durante el desplazamiento.

## Qué representa

**Reconstrucción de curvas de 150 m, no DEM medido de 22,7 m.** Se interpolan contornos numéricos de un modelo publicado del K2, con escala impresa 1:58 100. La fuente no incluye raster original, resolución, época ni geoide verificables. Los servidores de descarga de DEM no estaban habilitados en el entorno; se continuó con esta alternativa explícita.

Recorte de 11,6 × 11,6 km; escala horizontal/vertical 1:1; X este, Y arriba, Z sur; `y = altitud del modelo − 4500 m`. La máscara extrema usa `y ≥ 3500`. Se conserva el relieve de las curvas y se reconstruye solo el pequeño casquete sobre 8 400 m hasta la cota convencional de 8 611 m. El serac es una malla conceptual con voladizo, sin representar hielo actual. Rutas y materiales son interpretaciones orientativas, sin GPX ni fotografía satelital.

[Fuentes, licencia y precisión](docs/k2/SOURCES.md). [Verificación y medidas](docs/k2/VALIDATION.md).

## Regenerar assets

Los assets y las curvas están versionados; regenerar es opcional.

```sh
python -m venv .venv-k2
.venv-k2/bin/pip install -r scripts/k2/requirements.txt
.venv-k2/bin/python scripts/k2/prepare-terrain.py
.venv-k2/bin/python scripts/k2/prepare-atlas.py
```

Opcionalmente, extraer las mismas curvas del PDF fijado, con verificación SHA-256:

```sh
.venv-k2/bin/python scripts/k2/extract-contours.py --download
# Alternativa: --pdf /ruta/K2.pdf
```

El extractor no copia la imagen de portada. La geometría se prepara fuera del navegador: GLB de 32 768 / 131 072 / 524 288 triángulos. El básico carga primero; los demás según calidad/distancia y se conservan. Solo hay una malla de terreno visible, sin uniones entre parches.

## Organización y diagnóstico

- `src/k2/`: escena, cámara, coordenadas, materiales, calidad, UI y muestreo.
- `data/k2/`: curvas fuente y referencias/semillas separadas del render.
- `public/k2/`: GLB, alturas de colisión, metadatos, rutas/fichas y detalle de roca.
- `scripts/k2/`: extracción, preparación y medición de 3 escenarios de 30 segundos.
- `tests/unit/k2-geography.test.ts`: coordenadas, altitudes, anclajes, oclusión, cámara y presupuesto.
- `tests/k2/`: navegador, accesibilidad, móvil, recursos, errores y laboratorio.
- `evidence/k2/`: capturas reales, resultados y medidas.

El render se detiene cuando la vista se estabiliza y al ocultar la pestaña. Auto usa capacidades, tiempos suavizados, espera de 8 s entre cambios y de 60 s para recuperar calidad tras una degradación; limita a Baja equipos con menos de 4 núcleos o 4 GB declarados. Baja utiliza albedo preparado e iluminación difusa; Media/Alta añaden material PBR y detalle triplanar. Diagnóstico visible solo con `?diagnostics=1`; `?no-webgl=1` reproduce el fallback de QA. `window.__K2` permite consultas y comandos acotados para las pruebas, sin credenciales ni servicios externos.

Con `pnpm preview --port 4173` activo, ejecutar `node scripts/k2/smoke-production.mjs` para verificar el build y `node scripts/k2/measure.mjs` para repetir las medidas. Ejecutar la medición sin otros navegadores ni procesos pesados. Chromium local / SwiftShader es una medición cloud; no equivale a un teléfono real.
